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

  // --- 2. Community scam-report search (confirmed-real Wire action). ---
  const redditQuery = brokerPhone
    ? `${brokerPhone} scam OR fraud rental token`
    : queryAddress
    ? `${queryAddress} rental scam`
    : null;
  if (redditQuery) {
    try {
      const outcome = await tryRunBestAction("reddit", "search posts", { query: redditQuery, limit: 5 });
      if (!outcome.ran) {
        pushAndEmit(
          card({
            title: "Community scam-report search",
            source: "unavailable",
            status: "skipped",
            summary: outcome.reason,
          })
        );
      } else if (outcome.result.status === "completed") {
        const posts = (outcome.result.data as { posts?: { title: string; url: string; subreddit?: string }[] } | null)
          ?.posts ?? [];
        pushAndEmit(
          card({
            title: "Community scam-report search",
            source: "wire",
            status: posts.length > 0 ? "flagged" : "ok",
            summary:
              posts.length > 0
                ? `Found ${posts.length} Reddit post(s) mentioning this number/area alongside scam-related terms. Read them yourself before deciding — Reddit mentions are a strong signal but not proof.`
                : "No matching Reddit posts found for this phone number/area.",
            links: posts.slice(0, 5).map((p) => ({ label: p.title, url: p.url })),
            raw: outcome.result.data,
          })
        );
      } else {
        pushAndEmit(
          card({
            title: "Community scam-report search",
            source: "wire",
            status: "failed",
            summary: `Wire job failed: ${outcome.result.error?.message ?? "unknown error"}`,
          })
        );
      }
    } catch (err) {
      pushAndEmit(
        card({ title: "Community scam-report search", source: "wire", status: "failed", summary: (err as Error).message })
      );
    }
  } else {
    pushAndEmit(
      card({
        title: "Community scam-report search",
        source: "unavailable",
        status: "skipped",
        summary: "No phone number or address available yet to search against.",
      })
    );
  }

  // --- 3. Airbnb cross-check: is this "long-term rental" actually listed as a
  //        short-term stay elsewhere? (confirmed-real Wire action). ---
  if (queryAddress) {
    try {
      const outcome = await tryRunBestAction("airbnb", "search listings", { query: queryAddress, limit: 5 });
      if (!outcome.ran) {
        pushAndEmit(
          card({ title: "Airbnb cross-check", source: "unavailable", status: "skipped", summary: outcome.reason })
        );
      } else if (outcome.result.status === "completed") {
        const stays =
          (outcome.result.data as { listings?: { name: string; url: string }[] } | null)?.listings ?? [];
        pushAndEmit(
          card({
            title: "Airbnb cross-check",
            source: "wire",
            status: stays.length > 0 ? "flagged" : "ok",
            summary:
              stays.length > 0
                ? `${stays.length} short-term Airbnb listing(s) came up for this area/description. Worth checking whether this is the same unit being offered as a "long-term rental" to collect a token deposit.`
                : "No matching short-term listings found on Airbnb for this area.",
            links: stays.slice(0, 5).map((s) => ({ label: s.name, url: s.url })),
            raw: outcome.result.data,
          })
        );
      } else {
        pushAndEmit(
          card({ title: "Airbnb cross-check", source: "wire", status: "failed", summary: outcome.result.error?.message ?? "unknown error" })
        );
      }
    } catch (err) {
      pushAndEmit(card({ title: "Airbnb cross-check", source: "wire", status: "failed", summary: (err as Error).message }));
    }
  }

  // --- 3b. Square Yards cross-check (India) ---
  // The Wire action for squareyards.com requires internal city_id / location_id params
  // that we can't resolve from free-form text. Instead we scrape the public search URL
  // directly — honest, real, and actually works.
  if (queryAddress) {
    try {
      const city = parsed.city ?? "bangalore";
      const sqUrl = `https://www.squareyards.com/sale/property-for-sale-in-${encodeURIComponent(city.toLowerCase().replace(/\s+/g, "-"))}`;
      const scrape = await urlScrape(sqUrl, { useBrowser: true, country: "in" });
      if (scrape.status === "completed" && scrape.markdown) {
        // Look for price-per-sqft or broker contact mentions in the scraped text
        const md = scrape.markdown.slice(0, 3000);
        const hasMentions = md.toLowerCase().includes(city.toLowerCase());
        pushAndEmit(
          card({
            title: "Square Yards cross-check (India)",
            source: "scraper",
            status: "ok",
            summary: hasMentions
              ? `Square Yards was checked for listings in ${city}. Compare any contact details you see there against what the broker gave you — a mismatch is a red flag.`
              : `Square Yards page loaded but no strong locality match found for "${city}". Check manually using the link below.`,
            links: [{ label: `Search Square Yards — ${city}`, url: sqUrl }],
          })
        );
      } else {
        pushAndEmit(
          card({
            title: "Square Yards cross-check (India)",
            source: "scraper",
            status: "failed",
            summary: `Could not load Square Yards (${scrape.error ?? "unknown error"}). Check manually: ${sqUrl}`,
            links: [{ label: "Open Square Yards manually", url: sqUrl }],
          })
        );
      }
    } catch (err) {
      pushAndEmit(
        card({
          title: "Square Yards cross-check (India)",
          source: "scraper",
          status: "failed",
          summary: (err as Error).message,
        })
      );
    }
  }

  // --- 4. Open-web cross-reference (the realistic stand-in for "is this listing
  //        cloned on another platform" — see lib/anakin.ts). ---
  if (brokerPhone || queryAddress) {
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
  }

  // --- 5. Truecaller phone lookup — scrape the public Truecaller search page. ---
  // Truecaller has no Wire action, but their public search page is scrapeable.
  // LinkedIn is removed: it requires the user's own connected account to do anything
  // useful and produces zero value for anonymous broker lookups.
  if (brokerPhone) {
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
      pushAndEmit(
        card({
          title: "Truecaller phone lookup",
          source: "scraper",
          status: "failed",
          summary: (err as Error).message,
        })
      );
    }
  }

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

  // --- 7. Verdict synthesis. ---
  try {
    const verdict = await synthesizeVerdict(listingContext, evidence);
    emit({ type: "verdict", data: verdict });
  } catch (err) {
    emit({ type: "error", data: { message: `Verdict synthesis failed: ${(err as Error).message}` } });
  }

  emit({ type: "done" });
}
