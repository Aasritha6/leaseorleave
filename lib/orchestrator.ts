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

  // --- 3b. Square Yards cross-check. ---
  if (queryAddress) {
    try {
      const outcome = await tryRunBestAction("squareyards", "search listings", { query: queryAddress, limit: 5 });
      if (!outcome.ran) {
        pushAndEmit(
          card({ title: "Square Yards cross-check", source: "unavailable", status: "skipped", summary: outcome.reason })
        );
      } else if (outcome.result.status === "completed") {
        const listings =
          (outcome.result.data as { listings?: { name: string; url: string }[] } | null)?.listings ?? [];
        pushAndEmit(
          card({
            title: "Square Yards cross-check",
            source: "wire",
            status: listings.length > 0 ? "flagged" : "ok",
            summary:
              listings.length > 0
                ? `${listings.length} listing(s) found on Square Yards for this location.`
                : "No matching listings found on Square Yards for this area.",
            links: listings.slice(0, 5).map((s) => ({ label: s.name, url: s.url })),
            raw: outcome.result.data,
          })
        );
      } else {
        pushAndEmit(
          card({ title: "Square Yards cross-check", source: "wire", status: "failed", summary: outcome.result.error?.message ?? "unknown error" })
        );
      }
    } catch (err) {
      pushAndEmit(card({ title: "Square Yards cross-check", source: "wire", status: "failed", summary: (err as Error).message }));
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

  // --- 5. LinkedIn / Truecaller-style checks: explicitly reported as
  //        unavailable rather than faked. See README for why. ---
  pushAndEmit(
    card({
      title: "Broker professional identity (LinkedIn)",
      source: "unavailable",
      status: "skipped",
      summary:
        "Wire's LinkedIn action requires YOUR OWN connected LinkedIn account (auth_mode: required) and looks up a profile by URL — it can't anonymously search for a stranger's profile by name at scale. We're not faking this check.",
    })
  );
  pushAndEmit(
    card({
      title: "Phone spam-report lookup (Truecaller-style)",
      source: "unavailable",
      status: "skipped",
      summary:
        "We could not confirm a Truecaller or equivalent phone-reputation action in Wire's public catalog. The Reddit search above is the real substitute we run instead.",
    })
  );

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
