// Real Anakin.io endpoints (verified against https://anakin.io/docs/api-reference,
// June 2026). Auth is a single `X-API-Key` header on every call.
//
// Used for:
//  - urlScrape(): generic page fetch + optional AI JSON extraction. This is how we
//    read NoBroker / MagicBricks / Facebook / any listing URL — there is no
//    dedicated Wire action for those sites (see README "What's real" section), so
//    we fall back to scraping the URL itself rather than inventing one.
//  - webSearch(): AI-summarized web search, used as the realistic stand-in for
//    "cross-platform check" (searching the open web for the phone number, the
//    address, or a distinctive phrase from the description) instead of pretending
//    we can call magicbricks.search() or a reverse-image-search action that we
//    could not confirm exists.

const ANAKIN_BASE = "https://api.anakin.io/v1";

function apiKey(): string {
  const key = process.env.ANAKIN_API_KEY;
  if (!key) {
    throw new Error(
      "ANAKIN_API_KEY is not set. Get one at https://anakin.io/signup?redirect=/dashboard and add it to .env.local"
    );
  }
  return key;
}

async function anakinFetch(path: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(`${ANAKIN_BASE}${path}`, {
    ...init,
    headers: {
      "X-API-Key": apiKey(),
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anakin ${path} -> ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ScrapeResult {
  status: "completed" | "failed";
  url: string;
  markdown?: string;
  cleanedHtml?: string;
  generatedJson?: Record<string, unknown>;
  error?: string;
}

/**
 * POST /v1/url-scraper then poll GET /v1/url-scraper/{id} until completed/failed.
 * `generateJson: true` asks Anakin's own extraction model to pull structured
 * fields (price, locality, contact, photos) out of the page — useful because
 * listing markup varies wildly between NoBroker, MagicBricks, Facebook, etc.
 */
export async function urlScrape(
  url: string,
  opts: { useBrowser?: boolean; country?: string; timeoutMs?: number } = {}
): Promise<ScrapeResult> {
  const submit = (await anakinFetch("/url-scraper", {
    method: "POST",
    body: JSON.stringify({
      url,
      country: opts.country ?? "in", // route via Indian proxies for Indian listing sites
      useBrowser: opts.useBrowser ?? true, // NoBroker/MagicBricks are JS-heavy SPAs
      generateJson: true,
    }),
  })) as { jobId: string; status: string };

  const deadline = Date.now() + (opts.timeoutMs ?? 45_000);
  while (Date.now() < deadline) {
    const job = (await anakinFetch(`/url-scraper/${submit.jobId}`, { method: "GET" })) as {
      status: "pending" | "processing" | "completed" | "failed";
      url: string;
      markdown?: string;
      cleanedHtml?: string;
      generatedJson?: Record<string, unknown>;
      error?: string;
    };
    if (job.status === "completed" || job.status === "failed") {
      return {
        status: job.status,
        url: job.url,
        markdown: job.markdown,
        cleanedHtml: job.cleanedHtml,
        generatedJson: job.generatedJson,
        error: job.error,
      };
    }
    await sleep(1500);
  }
  return { status: "failed", url, error: "Timed out waiting for Anakin URL Scraper job" };
}

export interface WebSearchResult {
  url: string;
  title: string;
  snippet: string;
  date?: string;
}

/** POST /v1/search — synchronous, AI-summarized web search with citations. */
export async function webSearch(prompt: string, limit = 5): Promise<WebSearchResult[]> {
  const res = (await anakinFetch("/search", {
    method: "POST",
    body: JSON.stringify({ prompt, limit }),
  })) as { results: WebSearchResult[] };
  return res.results ?? [];
}
