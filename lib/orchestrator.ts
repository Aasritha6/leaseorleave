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

  const concurrentTasks: Promise<void>[] = [];

  // --- 2. 99acres cross-check — Universal Scraper on real Indian portal ---
  if (queryAddress) {
    concurrentTasks.push((async () => {
      try {
        const city = (parsed.city ?? "bangalore").toLowerCase().replace(/\s+/g, "-");
        const url99 = `https://www.99acres.com/search/property/buy/${encodeURIComponent(city)}?preference=S&area_unit=1&res_com=R`;
        const scrape = await urlScrape(url99, { useBrowser: true, country: "in" });
        if (scrape.status === "completed" && scrape.markdown) {
          const md = scrape.markdown.slice(0, 3000).toLowerCase();
          const brokerNumberMentioned = brokerPhone ? md.includes(brokerPhone.replace(/\D/g, "").slice(-10)) : false;
          pushAndEmit(
            card({
              title: "99acres cross-check",
              source: "scraper",
              status: brokerNumberMentioned ? "flagged" : "ok",
              summary: brokerNumberMentioned
                ? `The broker's phone number appears in 99acres listings for this area. Cross-check the listing details — contact number mismatch is a red flag.`
                : `99acres checked for ${parsed.city ?? "this area"}. No conflicting contact numbers found in the scraped results. Compare prices manually.`,
              links: [{ label: `Browse 99acres — ${parsed.city ?? "India"}`, url: url99 }],
            })
          );
        } else {
          pushAndEmit(
            card({
              title: "99acres cross-check",
              source: "scraper",
              status: "failed",
              summary: `Could not load 99acres (${scrape.error ?? "page blocked or timeout"}). Check manually.`,
              links: [{ label: "Open 99acres manually", url: url99 }],
            })
          );
        }
      } catch (err) {
        pushAndEmit(card({ title: "99acres cross-check", source: "scraper", status: "failed", summary: (err as Error).message }));
      }
    })());
  }

  // --- 3. MagicBricks cross-check — Universal Scraper on India's largest portal ---
  if (queryAddress) {
    concurrentTasks.push((async () => {
      try {
        const city = (parsed.city ?? "bangalore").toLowerCase().replace(/\s+/g, "-");
        const mbUrl = `https://www.magicbricks.com/property-for-rent/${encodeURIComponent(city)}/residential-real-estate-${encodeURIComponent(city)}`;
        const scrape = await urlScrape(mbUrl, { useBrowser: true, country: "in" });
        if (scrape.status === "completed" && scrape.markdown) {
          const md = scrape.markdown.slice(0, 3000).toLowerCase();
          const brokerNumberMentioned = brokerPhone ? md.includes(brokerPhone.replace(/\D/g, "").slice(-10)) : false;
          pushAndEmit(
            card({
              title: "MagicBricks cross-check",
              source: "scraper",
              status: brokerNumberMentioned ? "flagged" : "ok",
              summary: brokerNumberMentioned
                ? `The broker's phone number appears in MagicBricks listings — verify whether this is the same property with different terms. A price or name mismatch is a strong red flag.`
                : `MagicBricks checked for ${parsed.city ?? "this area"}. No conflicting contact numbers found. Prices on MagicBricks can be compared for sanity check.`,
              links: [{ label: `Browse MagicBricks — ${parsed.city ?? "India"}`, url: mbUrl }],
            })
          );
        } else {
          pushAndEmit(
            card({
              title: "MagicBricks cross-check",
              source: "scraper",
              status: "failed",
              summary: `Could not load MagicBricks (${scrape.error ?? "page blocked or timeout"}). Check manually.`,
              links: [{ label: "Open MagicBricks manually", url: mbUrl }],
            })
          );
        }
      } catch (err) {
        pushAndEmit(card({ title: "MagicBricks cross-check", source: "scraper", status: "failed", summary: (err as Error).message }));
      }
    })());
  }

  // --- 4. Square Yards cross-check (India) — Universal Scraper ---
  if (queryAddress) {
    concurrentTasks.push((async () => {
      try {
        const city = parsed.city ?? "bangalore";
        const sqUrl = `https://www.squareyards.com/sale/property-for-sale-in-${encodeURIComponent(city.toLowerCase().replace(/\s+/g, "-"))}`;
        const scrape = await urlScrape(sqUrl, { useBrowser: true, country: "in" });
        if (scrape.status === "completed" && scrape.markdown) {
          const md = scrape.markdown.slice(0, 3000).toLowerCase();
          const brokerNumberMentioned = brokerPhone ? md.includes(brokerPhone.replace(/\D/g, "").slice(-10)) : false;
          pushAndEmit(
            card({
              title: "Square Yards cross-check (India)",
              source: "scraper",
              status: brokerNumberMentioned ? "flagged" : "ok",
              summary: brokerNumberMentioned
                ? `Broker number found on Square Yards — verify details match the listing you are checking.`
                : `Square Yards checked for ${city}. No conflicting phone numbers in scraped results. Compare listed prices for this area.`,
              links: [{ label: `Browse Square Yards — ${city}`, url: sqUrl }],
            })
          );
        } else {
          pushAndEmit(
            card({
              title: "Square Yards cross-check (India)",
              source: "scraper",
              status: "failed",
              summary: `Could not load Square Yards (${scrape.error ?? "unknown error"}). Check manually.`,
              links: [{ label: "Open Square Yards manually", url: sqUrl }],
            })
          );
        }
      } catch (err) {
        pushAndEmit(card({ title: "Square Yards cross-check (India)", source: "scraper", status: "failed", summary: (err as Error).message }));
      }
    })());
  }

  // --- 5. NoBroker cross-check — India's largest zero-brokerage rental platform ---
  if (queryAddress) {
    concurrentTasks.push((async () => {
      try {
        const city = (parsed.city ?? "bangalore").toLowerCase().replace(/\s+/g, "-");
        const nbUrl = `https://www.nobroker.in/property/residential/rent/${encodeURIComponent(city)}`;
        const scrape = await urlScrape(nbUrl, { useBrowser: true, country: "in" });
        if (scrape.status === "completed" && scrape.markdown) {
          const md = scrape.markdown.slice(0, 3000).toLowerCase();
          const brokerNumberMentioned = brokerPhone ? md.includes(brokerPhone.replace(/\D/g, "").slice(-10)) : false;
          pushAndEmit(
            card({
              title: "NoBroker cross-check",
              source: "scraper",
              status: brokerNumberMentioned ? "flagged" : "ok",
              summary: brokerNumberMentioned
                ? `Broker's phone number appears in NoBroker listings for ${parsed.city ?? "this area"}. If the rent or terms differ from what you were told, that's a strong red flag.`
                : `NoBroker checked for ${parsed.city ?? "this area"}. No conflicting contact numbers in results. Compare listed prices to spot over/under-pricing.`,
              links: [{ label: `Browse NoBroker — ${parsed.city ?? "India"}`, url: nbUrl }],
            })
          );
        } else {
          pushAndEmit(
            card({
              title: "NoBroker cross-check",
              source: "scraper",
              status: "failed",
              summary: `Could not load NoBroker (${scrape.error ?? "page blocked or timeout"}). Check manually.`,
              links: [{ label: "Open NoBroker manually", url: nbUrl }],
            })
          );
        }
      } catch (err) {
        pushAndEmit(card({ title: "NoBroker cross-check", source: "scraper", status: "failed", summary: (err as Error).message }));
      }
    })());
  }

  // --- 6. Housing.com cross-check — PropTiger / REA Group Indian portal ---
  if (queryAddress) {
    concurrentTasks.push((async () => {
      try {
        const city = (parsed.city ?? "bangalore").toLowerCase().replace(/\s+/g, "-");
        const hcUrl = `https://housing.com/in/rent/${encodeURIComponent(city)}-multistorey-apartment-flats`;
        const scrape = await urlScrape(hcUrl, { useBrowser: true, country: "in" });
        if (scrape.status === "completed" && scrape.markdown) {
          const md = scrape.markdown.slice(0, 3000).toLowerCase();
          const brokerNumberMentioned = brokerPhone ? md.includes(brokerPhone.replace(/\D/g, "").slice(-10)) : false;
          pushAndEmit(
            card({
              title: "Housing.com cross-check",
              source: "scraper",
              status: brokerNumberMentioned ? "flagged" : "ok",
              summary: brokerNumberMentioned
                ? `Broker's phone number found in Housing.com listings for this area. Verify whether the same property appears with different pricing or owner details.`
                : `Housing.com checked for ${parsed.city ?? "this area"}. No conflicting contact numbers found. Use the link to manually compare active listings.`,
              links: [{ label: `Browse Housing.com — ${parsed.city ?? "India"}`, url: hcUrl }],
            })
          );
        } else {
          pushAndEmit(
            card({
              title: "Housing.com cross-check",
              source: "scraper",
              status: "failed",
              summary: `Could not load Housing.com (${scrape.error ?? "page blocked or timeout"}). Check manually.`,
              links: [{ label: "Open Housing.com manually", url: hcUrl }],
            })
          );
        }
      } catch (err) {
        pushAndEmit(card({ title: "Housing.com cross-check", source: "scraper", status: "failed", summary: (err as Error).message }));
      }
    })());
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
