// Shared types for the LeaseOrLeave verification pipeline.

/** What the user pasted in. */
export type InputKind = "url" | "phone" | "address";

export interface ParsedInput {
  kind: InputKind;
  /** Original text the user pasted. */
  raw: string;
  url?: string;
  phone?: string;
  address?: string;
  rent?: number;
  city?: string;
}

/**
 * One row in the "Checking N sources..." progress list.
 *
 * `source` is honest about provenance:
 *  - "wire"    -> a confirmed Anakin Wire pre-built action (Reddit, Airbnb, etc.)
 *  - "scraper" -> Anakin's generic URL Scraper hitting the listing URL itself
 *                 (used for NoBroker/MagicBricks/Facebook/anything — there is no
 *                 dedicated Wire action for these sites, see README)
 *  - "search"  -> Anakin's generic web Search API (cross-referencing text on the
 *                 open web — the realistic stand-in for "cross-platform check")
 *  - "gemini"  -> Gemini doing reasoning/vision on data already collected
 *  - "unavailable" -> a check the original pitch assumed exists but we could not
 *                      confirm in Wire's public catalog; reported, not faked
 */
export type EvidenceSource = "wire" | "scraper" | "search" | "gemini" | "unavailable";

export type EvidenceStatus = "pending" | "running" | "ok" | "flagged" | "failed" | "skipped";

export interface EvidenceCard {
  id: string;
  title: string;
  source: EvidenceSource;
  status: EvidenceStatus;
  /** One-paragraph plain-English finding. */
  summary: string;
  /** Optional supporting links (e.g. the Reddit thread, the duplicate listing). */
  links?: { label: string; url: string }[];
  /** Raw data kept for the Gemini verdict step / debugging — not shown verbatim in UI. */
  raw?: unknown;
}

export type RiskVerdict = "LOW_RISK" | "MEDIUM_RISK" | "HIGH_RISK" | "INCONCLUSIVE";

export interface Verdict {
  verdict: RiskVerdict;
  confidence: number; // 0-100, Gemini's self-reported confidence
  risk_score: number; // 0-100
  summary: string;
  red_flags: string[];
  green_flags: string[];
  recommended_action: string;
}

/** Server -> client streaming events over SSE. */
export type StreamEvent =
  | { type: "parsed"; data: ParsedInput }
  | { type: "evidence"; data: EvidenceCard }
  | { type: "verdict"; data: Verdict }
  | { type: "error"; data: { message: string } }
  | { type: "done" };
