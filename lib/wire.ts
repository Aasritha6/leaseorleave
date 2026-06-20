// Wire (Anakin's pre-built action layer, https://anakin.io/products/wire).
// Endpoints verified against https://anakin.io/docs/api-reference/wire, June 2026.
//
// IMPORTANT — why this file calls /v1/wire/search at runtime instead of hardcoding
// action IDs like "nobroker.search_listings" or "magicbricks.search":
//
// The Wire catalog (155 sites / 920 actions as of writing) does NOT publicly list
// NoBroker or MagicBricks under its Real-Estate category — we checked the catalog
// screenshots and the live site. The only confirmed-real, India-relevant Wire
// actions for this use case are on Reddit (scam-report search) and Airbnb
// (short-term-rental cross-check). Rather than guessing action IDs that might not
// exist (which would silently fail or, worse, look like it worked), this client
// asks Wire's own search endpoint "what can you actually do for catalog=X" and
// only calls an action if Wire confirms it exists. If your Anakin account has
// access to a different/larger catalog than what we could see publicly, this will
// pick it up automatically — nothing here needs to be hardcoded.

const WIRE_BASE = "https://api.anakin.io/v1/wire";

function apiKey(): string {
  const key = process.env.ANAKIN_API_KEY;
  if (!key) {
    throw new Error(
      "ANAKIN_API_KEY is not set. Get one at https://anakin.io/signup?redirect=/wire and add it to .env.local"
    );
  }
  return key;
}

async function wireFetch(path: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${WIRE_BASE}${path}`, {
    ...init,
    headers: {
      "X-API-Key": apiKey(),
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Wire ${path} -> ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface WireAction {
  action_id: string;
  catalog_slug: string;
  catalog_name: string;
  name: string;
  description: string;
  auth_mode: "none" | "optional" | "required";
  connected: boolean;
  params: { properties?: Record<string, unknown>; required?: string[] };
  credits: number;
}

/** GET /v1/wire/search — find the best-matching action for a catalog + free-text query. */
export async function findAction(opts: {
  catalog?: string;
  q?: string;
  excludeAuthRequired?: boolean;
}): Promise<WireAction[]> {
  const params = new URLSearchParams();
  if (opts.catalog) params.set("catalog", opts.catalog);
  if (opts.q) params.set("q", opts.q);
  if (opts.excludeAuthRequired) params.set("auth", "false");
  const res = (await wireFetch(`/search?${params.toString()}`)) as { results: WireAction[] };
  return res.results ?? [];
}

export interface WireJobResult {
  status: "completed" | "failed";
  data?: unknown;
  error?: { code: string; message: string };
  credits_used?: number;
}

/** POST /v1/wire/task then poll GET /v1/wire/jobs/{id}. */
export async function runAction(
  action_id: string,
  params: Record<string, unknown>,
  opts: { credential_id?: string; timeoutMs?: number } = {}
): Promise<WireJobResult> {
  const submit = (await wireFetch("/task", {
    method: "POST",
    body: JSON.stringify({
      action_id,
      ...(opts.credential_id ? { credential_id: opts.credential_id } : {}),
      params,
    }),
  })) as { job_id: string };

  const deadline = Date.now() + (opts.timeoutMs ?? 30_000);
  while (Date.now() < deadline) {
    const job = (await wireFetch(`/jobs/${submit.job_id}`)) as {
      status: "processing" | "completed" | "failed";
      data?: unknown;
      error?: { code: string; message: string };
      credits_used?: number;
    };
    if (job.status === "completed" || job.status === "failed") {
      return { status: job.status, data: job.data, error: job.error, credits_used: job.credits_used };
    }
    await sleep(1200);
  }
  return { status: "failed", error: { code: "TIMEOUT", message: "Timed out polling Wire job" } };
}

/**
 * Convenience wrapper: look up the best action for a catalog + intent, skip
 * cleanly (rather than fake a result) if Wire doesn't actually have one.
 */
export async function tryRunBestAction(
  catalog: string,
  intent: string,
  params: Record<string, unknown>
): Promise<{ ran: false; reason: string } | { ran: true; action: WireAction; result: WireJobResult }> {
  const candidates = await findAction({ catalog, q: intent, excludeAuthRequired: true });
  const best = candidates[0];
  if (!best) {
    return { ran: false, reason: `No Wire action found for catalog="${catalog}" intent="${intent}"` };
  }
  const result = await runAction(best.action_id, params);
  return { ran: true, action: best, result };
}
