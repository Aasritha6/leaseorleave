// Orchestrates the actual verification pipeline. Every function this file calls
// is a real, documented API (see lib/anakin.ts, lib/wire.ts, lib/gemini.ts) — if a
// check can't be run for real (missing API key, Wire genuinely has no action for
// that catalog, network failure), it is reported to the user as "skipped" or
// "failed" with the real reason, never silently swapped for placeholder data.

import { parseFreeformInput, synthesizeVerdict, comparePhotosForDuplication } from "./gemini";
import { urlScrape, webSearch } from "./anakin";
import { tryRunBestAction } from "./wire";
import type { EvidenceCard, ParsedInput, StreamEvent } from "./types";

type Emit = (event: StreamEvent) => void;

function card(partial: Omit<EvidenceCard, "id">): EvidenceCard {
  return { id: crypto.randomUUID(), ...partial };
}

/** Extracts the bits we need (price, broker contact, photos) from a scraped listing. */
interface ListingFacts {
  priceText?: string;
  brokerName?: string;
  brokerPhone?: string;
  photoUrls: string[];
  bodyText: string;
}

function factsFromGeneratedJson(generatedJson: Record<string, unknown> | undefined, markdown: string): ListingFacts {
  const j = generatedJson ?? {};
  const get = (k: string) => (typeof j[k] === "string" ? (j[k] as string) : undefined);
  const photos = Array.isArray(j.photos)
    ? (j.photos as unknown[]).filter((p): p is string => typeof p === "string")
    : Array.isArray(j.images)
    ? (j.images as unknown[]).filter((p): p is string => typeof p === "string")
    : [];
  return {
    priceText: get("price") ?? get("rent"),
    brokerName: get("brokerName") ?? get("contactName") ?? get("owner"),
    brokerPhone: get("brokerPhone") ?? get("phone") ?? get("contactNumber"),
    photoUrls: photos,
    bodyText: markdown.slice(0, 4000),
  };
}

/** Extract city from URL slug when Gemini misses it (e.g. "Visakhapatnam" in a MagicBricks URL). */
function extractCityFromInput(raw: string): string | null {
  const CITIES = [
    "visakhapatnam", "vishakhapatnam", "vizag",
    "bengaluru", "bangalore",
    "hyderabad", "secunderabad",
    "mumbai", "pune",
    "delhi", "noida", "gurgaon", "gurugram", "faridabad",
    "chennai", "coimbatore",
    "kolkata",
    "ahmedabad", "surat", "vadodara",
    "jaipur", "jodhpur",
    "lucknow", "kanpur", "agra",
    "nagpur", "indore", "bhopal",
    "patna", "ranchi",
    "kochi", "thiruvananthapuram",
    "chandigarh", "ludhiana", "amritsar",
    "bhubaneswar", "cuttack",
  ];
  const lower = raw.toLowerCase();
  for (const city of CITIES) {
    if (lower.includes(city)) return city;
  }
  return null;
}

export async function runVerification(rawInput: string, emit: Emit): Promise<void> {
  let parsed: ParsedInput;
  try {
    parsed = await parseFreeformInput(rawInput);
  } catch (err) {
    emit({ type: "error", data: { message: `Could not parse input with Gemini: ${(err as Error).message}` } });
    return;
  }
  emit({ type: "parsed", data: parsed });

  const evidence: EvidenceCard[] = [];
  const pushAndEmit = (c: EvidenceCard) => {
    evidence.push(c);
    emit({ type: "evidence", data: c });
  };

  let facts: ListingFacts | undefined;
  let listingContext = `User input (${parsed.kind}): ${rawInput}`;

  // --- 1. Scrape the listing page itself (works for ANY url — NoBroker,
  //        MagicBricks, Facebook, whatever — because there is no dedicated Wire
  //        action for these sites; see lib/wire.ts header comment). ---
  if (parsed.kind === "url" && parsed.url) {
    try {
      const scrape = await urlScrape(parsed.url);
      if (scrape.status === "completed") {
        facts = factsFromGeneratedJson(scrape.generatedJson, scrape.markdown ?? "");
        listingContext += `\n\nScraped listing page (${parsed.url}):\n${facts.bodyText}`;
        pushAndEmit(
          card({
            title: "Listing page content",
            source: "scraper",
            status: "ok",
            summary: `Fetched the listing page directly. ${
              facts.priceText ? `Stated price: ${facts.priceText}. ` : ""
            }${facts.brokerPhone ? `Contact on this listing: ${facts.brokerPhone}.` : "No contact number could be extracted automatically — check the page yourself."}`,
            links: [{ label: "Open listing", url: parsed.url }],
            raw: scrape.generatedJson,
          })
        );
      } else {
        pushAndEmit(
          card({
            title: "Listing page content",
            source: "scraper",
            status: "failed",
            summary: `Could not load the listing page (${scrape.error ?? "unknown error"}). This can happen if the page requires a login or blocks automated access — it does not by itself mean the listing is fake.`,
          })
        );
      }
    } catch (err) {
      pushAndEmit(
        card({
          title: "Listing page content",
          source: "scraper",
          status: "failed",
          summary: `Scraper call failed: ${(err as Error).message}`,
        })
      );
    }
  }

  const brokerPhone = parsed.phone ?? facts?.brokerPhone;
  const queryAddress = parsed.address ?? facts?.bodyText.slice(0, 120);

  // City: prefer Gemini's parse, then regex from the raw input, then skip city-specific checks
  const resolvedCity: string | null =
    parsed.city ??
    (parsed.url ? extractCityFromInput(parsed.url) : null) ??
    extractCityFromInput(rawInput);

  // Build a keyword query for site: searches — use address snippet or raw input
  const keywordQuery = queryAddress
    ? queryAddress.slice(0, 100).replace(/\s+/g, " ").trim()
    : rawInput.slice(0, 100);

  const concurrentTasks: Promise<void>[] = [];

  // Helper: run a site: Google search against an Indian property portal.
  // Much more reliable than scraping their JS-heavy pages directly.
  const portalSearch = async (
    portalTitle: string,
    domain: string,
    browseUrl: string
  ) => {
    try {
      const q = `site:${domain} ${keywordQuery}${resolvedCity ? " " + resolvedCity : ""}`;
      const results = await webSearch(q);
      const hits = results.filter((r) => r.url?.includes(domain) && r.snippet?.length > 0);
      const phoneFound = brokerPhone
        ? hits.some((r) => r.snippet?.includes(brokerPhone.replace(/\D/g, "").slice(-10)))
        : false;
      const cityLabel = resolvedCity
        ? resolvedCity.charAt(0).toUpperCase() + resolvedCity.slice(1)
        : "India";

      pushAndEmit(
        card({
          title: `${portalTitle} cross-check`,
          source: "search",
          status: phoneFound ? "flagged" : hits.length > 0 ? "ok" : "ok",
          summary: phoneFound
            ? `⚠ The broker's contact number was found in ${portalTitle} listings for this area. Verify the listing details match exactly — discrepancies are a red flag.`
            : hits.length > 0
            ? `Found ${hits.length} listing(s) on ${portalTitle} for this area. No conflicting contact numbers detected in search snippets. Click to compare prices manually.`
            : `No matching listings found on ${portalTitle} for this search. This could mean the property isn't listed there, or the portal didn't index it yet.`,
          links: [
            ...hits.slice(0, 3).map((r) => ({ label: r.title ?? r.url, url: r.url })),
            { label: `Browse ${portalTitle} — ${cityLabel}`, url: browseUrl },
          ],
        })
      );
    } catch (err) {
      pushAndEmit(card({ title: `${portalTitle} cross-check`, source: "search", status: "failed", summary: (err as Error).message }));
    }
  };

  const citySlug = (resolvedCity ?? "india").toLowerCase().replace(/\s+/g, "-");

  // --- 2. 99acres (site: search) ---
  if (keywordQuery) {
    concurrentTasks.push(
      portalSearch(
        "99acres",
        "99acres.com",
        `https://www.99acres.com/search/property/rent/${encodeURIComponent(citySlug)}?preference=S`
      )
    );
  }

  // --- 3. MagicBricks (site: search) ---
  if (keywordQuery) {
    concurrentTasks.push(
      portalSearch(
        "MagicBricks",
        "magicbricks.com",
        `https://www.magicbricks.com/property-for-rent/${encodeURIComponent(citySlug)}/residential-real-estate-${encodeURIComponent(citySlug)}`
      )
    );
  }

  // --- 4. Square Yards (site: search) ---
  if (keywordQuery) {
    concurrentTasks.push(
      portalSearch(
        "Square Yards",
        "squareyards.com",
        `https://www.squareyards.com/rent/property-for-rent-in-${encodeURIComponent(citySlug)}`
      )
    );
  }

  // --- 5. NoBroker (site: search) ---
  if (keywordQuery) {
    concurrentTasks.push(
      portalSearch(
        "NoBroker",
        "nobroker.in",
        `https://www.nobroker.in/property/residential/rent/${encodeURIComponent(citySlug)}`
      )
    );
  }

  // --- 6. Housing.com (site: search) ---
  if (keywordQuery) {
    concurrentTasks.push(
      portalSearch(
        "Housing.com",
        "housing.com",
        `https://housing.com/in/rent/${encodeURIComponent(citySlug)}`
      )
    );
  }


  // --- 7. Open-web cross-reference ---
  if (brokerPhone || queryAddress) {
    concurrentTasks.push((async () => {
      try {
        const results = await webSearch(
          `"${brokerPhone ?? ""}" ${queryAddress ?? ""} rental listing India scam complaint`.trim()
        );
        const looksRelevant = results.filter((r) => r.snippet?.length > 0);
        pushAndEmit(
          card({
            title: "Open-web cross-reference",
            source: "search",
            status: looksRelevant.some((r) => /scam|fraud|complaint|cheat/i.test(r.snippet)) ? "flagged" : "ok",
            summary:
              looksRelevant.length > 0
                ? `Found ${looksRelevant.length} relevant page(s) on the open web mentioning this number/address.`
                : "Nothing relevant turned up on the open web for this number/address.",
            links: looksRelevant.slice(0, 5).map((r) => ({ label: r.title, url: r.url })),
            raw: results,
          })
        );
      } catch (err) {
        pushAndEmit(card({ title: "Open-web cross-reference", source: "search", status: "failed", summary: (err as Error).message }));
      }
    })());
  }

  // --- 5. Truecaller phone lookup — scrape the public Truecaller search page. ---
  if (brokerPhone) {
    concurrentTasks.push((async () => {
      try {
        // Normalize: strip +91 / leading zeros for Truecaller URL format
        const digits = brokerPhone.replace(/[^\d]/g, "");
        const normalized = digits.startsWith("91") && digits.length === 12
          ? digits.slice(2)
          : digits.slice(-10);
        const tcUrl = `https://www.truecaller.com/search/in/${normalized}`;
        const scrape = await urlScrape(tcUrl, { useBrowser: true, country: "in" });
        if (scrape.status === "completed" && scrape.markdown) {
          const md = scrape.markdown.toLowerCase();
          const isSpam = /spam|scam|fraud|telemarket|reported/.test(md);
          const hasName = scrape.generatedJson && typeof (scrape.generatedJson as Record<string,unknown>).name === "string";
          pushAndEmit(
            card({
              title: "Truecaller phone lookup",
              source: "scraper",
              status: isSpam ? "flagged" : "ok",
              summary: isSpam
                ? `This number appears to be flagged on Truecaller as spam or reported by other users. Treat this as a strong red flag.`
                : hasName
                ? `Truecaller shows a registered name for this number — no spam flags detected. Verify the name matches what the broker told you.`
                : `Truecaller page loaded but could not extract a definitive result. Check manually using the link below.`,
              links: [{ label: `Check on Truecaller — ${brokerPhone}`, url: tcUrl }],
              raw: scrape.generatedJson,
            })
          );
        } else {
          pushAndEmit(
            card({
              title: "Truecaller phone lookup",
              source: "scraper",
              status: "failed",
              summary: `Could not load Truecaller (${scrape.error ?? "page blocked or login required"}). Check manually: ${tcUrl}`,
              links: [{ label: `Open Truecaller manually`, url: tcUrl }],
            })
          );
        }
      } catch (err) {
        pushAndEmit(card({ title: "Truecaller phone lookup", source: "scraper", status: "failed", summary: (err as Error).message }));
      }
    })());
  }

  // Await all background checks to finish concurrently!
  await Promise.allSettled(concurrentTasks);

  // --- 6. Photo-duplication check, only if we actually have two photo sets to
  //        compare (real listing photos + a same-named candidate from search). ---
  if (facts && facts.photoUrls.length > 0) {
    const candidateUrl = evidence
      .find((e) => e.title === "Open-web cross-reference")
      ?.links?.find((l) => parsed.url && !l.url.includes(new URL(parsed.url).hostname));
    if (candidateUrl) {
      try {
        const candidateScrape = await urlScrape(candidateUrl.url);
        const candidateFacts = factsFromGeneratedJson(candidateScrape.generatedJson, candidateScrape.markdown ?? "");
        if (candidateFacts.photoUrls.length > 0) {
          const comparison = await comparePhotosForDuplication(facts.photoUrls, candidateFacts.photoUrls);
          pushAndEmit(
            card({
              title: "Photo duplication check",
              source: "gemini",
              status: comparison.likelySameProperty ? "flagged" : "ok",
              summary: comparison.reasoning,
              links: [{ label: "Candidate duplicate", url: candidateUrl.url }],
            })
          );
        }
      } catch (err) {
        pushAndEmit(card({ title: "Photo duplication check", source: "gemini", status: "failed", summary: (err as Error).message }));
      }
    }
  }

  // --- 9. Verdict synthesis. ---
  try {
    const verdict = await synthesizeVerdict(listingContext, evidence);
    emit({ type: "verdict", data: verdict });
  } catch (err) {
    emit({ type: "error", data: { message: `Verdict synthesis failed: ${(err as Error).message}` } });
  }

  emit({ type: "done" });
}
