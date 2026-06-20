"use client";

import { useState, useCallback } from "react";
import type { EvidenceCard, ParsedInput, StreamEvent, Verdict } from "@/lib/types";

// ── helpers ──────────────────────────────────────────────────────────────────

function sourceLabel(s: EvidenceCard["source"]) {
  switch (s) {
    case "wire":    return "Wire";
    case "scraper": return "Scraper";
    case "search":  return "Web search";
    case "gemini":  return "Gemini vision";
    default:        return "Unavailable";
  }
}

function statusLabel(s: EvidenceCard["status"]) {
  switch (s) {
    case "flagged": return "Flagged";
    case "ok":      return "Clear";
    case "failed":  return "Failed";
    case "skipped": return "Not available";
    case "running": return "Running…";
    default:        return "Pending";
  }
}

function verdictConfig(v: Verdict["verdict"]) {
  switch (v) {
    case "HIGH_RISK":   return { cls: "high-risk",   label: "⚠ High Risk — Do Not Pay",           emoji: "🚨" };
    case "MEDIUM_RISK": return { cls: "medium-risk", label: "⚡ Medium Risk — Proceed Carefully",   emoji: "⚠️" };
    case "LOW_RISK":    return { cls: "low-risk",    label: "✓ Low Risk",                           emoji: "✅" };
    default:            return { cls: "inconclusive", label: "? Inconclusive — Need More Evidence", emoji: "🔍" };
  }
}

function riskBarColor(score: number) {
  if (score >= 70) return "linear-gradient(90deg, #f56565, #fc8181)";
  if (score >= 40) return "linear-gradient(90deg, #f6ad55, #fbd38d)";
  return "linear-gradient(90deg, #68d391, #9ae6b4)";
}

// Total real checks that will be emitted (not counting unavailable ones that always appear)
const TOTAL_CHECKS = 7;

// ── main page ──────────────────────────────────────────────────────────────────

export default function Home() {
  const [input, setInput]     = useState("");
  const [running, setRunning] = useState(false);
  const [parsed, setParsed]   = useState<ParsedInput | null>(null);
  const [cards, setCards]     = useState<EvidenceCard[]>([]);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [done, setDone]       = useState(false);

  const progress = done ? 100 : Math.min(Math.round((cards.length / TOTAL_CHECKS) * 90), 90);

  const runCheck = useCallback(async () => {
    if (!input.trim() || running) return;
    setRunning(true);
    setCards([]);
    setVerdict(null);
    setError(null);
    setParsed(null);
    setDone(false);

    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      if (!res.body) throw new Error("No response body from server.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const line = chunk.replace(/^data: /, "").trim();
          if (!line) continue;
          const event = JSON.parse(line) as StreamEvent;
          if (event.type === "parsed")  setParsed(event.data);
          if (event.type === "evidence") setCards((prev) => [...prev, event.data]);
          if (event.type === "verdict") setVerdict(event.data);
          if (event.type === "error")   setError(event.data.message);
          if (event.type === "done")    setDone(true);
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
      setDone(true);
    }
  }, [input, running]);

  const hasResults = cards.length > 0 || verdict !== null || error !== null;

  return (
    <>
      {/* Scan-line overlay */}
      <div className="scan-overlay" aria-hidden="true" />

      <main
        style={{
          minHeight: "100vh",
          padding: "0 1rem",
          fontFamily: "var(--font-body)",
        }}
      >
        <div style={{ maxWidth: 680, margin: "0 auto" }}>

          {/* ── Hero ────────────────────────────────────────────────── */}
          <header style={{ paddingTop: "4rem", paddingBottom: "2.5rem", textAlign: "center" }}>
            {/* Logo mark */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.2rem" }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  background: "linear-gradient(135deg, #667eea, #764ba2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 26,
                  boxShadow: "0 8px 32px rgba(102,126,234,0.4)",
                }}
              >
                🛡
              </div>
            </div>

            <p
              style={{
                fontSize: "0.65rem",
                letterSpacing: "0.3em",
                textTransform: "uppercase",
                color: "var(--ink-muted)",
                fontFamily: "var(--font-data)",
                marginBottom: "0.6rem",
              }}
            >
              Rental Fraud Shield · Powered by Gemini AI
            </p>

            <h1
              style={{
                margin: 0,
                fontSize: "clamp(2rem, 5vw, 2.8rem)",
                fontWeight: 800,
                background: "linear-gradient(135deg, #e8edf2 0%, #a0aec0 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                letterSpacing: "-0.02em",
                lineHeight: 1.15,
              }}
            >
              LeaseOrLeave
            </h1>

            <p
              style={{
                marginTop: "0.8rem",
                color: "var(--ink-soft)",
                fontSize: "0.95rem",
                lineHeight: 1.6,
                maxWidth: 480,
                marginLeft: "auto",
                marginRight: "auto",
              }}
            >
              Paste a listing URL, broker phone number, or address + rent.
              We run real checks before you send a single rupee as token deposit.
            </p>

            {/* Stat chips */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.5rem",
                justifyContent: "center",
                marginTop: "1.2rem",
              }}
            >
              <span className="stat-chip">📊 30M+ urban renters</span>
              <span className="stat-chip">⚠️ 2,000+ scams/month in metros</span>
              <span className="stat-chip">💸 ₹15–50K avg token loss</span>
            </div>
          </header>

          {/* ── Input card ──────────────────────────────────────────── */}
          <div className="input-area" style={{ padding: "1.25rem" }}>
            <label
              htmlFor="listing-input"
              style={{
                display: "block",
                fontSize: "0.7rem",
                fontFamily: "var(--font-data)",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--ink-muted)",
                marginBottom: "0.6rem",
              }}
            >
              Listing URL / Broker Phone / Address + Rent
            </label>
            <textarea
              id="listing-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) runCheck(); }}
              placeholder={`Examples:\nhttps://www.nobroker.in/property/…\n+91 98765 43210\n2BHK, HSR Layout, Bangalore — ₹18,000/month`}
              rows={4}
              style={{
                width: "100%",
                background: "transparent",
                border: "none",
                outline: "none",
                resize: "none",
                fontSize: "0.9rem",
                color: "var(--ink)",
                fontFamily: "var(--font-body)",
                lineHeight: 1.6,
              }}
            />

            <div
              style={{
                marginTop: "0.8rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "1rem",
              }}
            >
              <span
                style={{
                  fontSize: "0.7rem",
                  color: "var(--ink-muted)",
                  fontFamily: "var(--font-data)",
                }}
              >
                {parsed
                  ? `Interpreted as: ${parsed.kind}${parsed.city ? ` · ${parsed.city}` : ""}`
                  : "Ctrl+Enter to run"}
              </span>

              <button
                id="run-check-btn"
                className="btn-primary"
                onClick={runCheck}
                disabled={running || !input.trim()}
              >
                {running ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span className="scan-dot" />
                    <span className="scan-dot" />
                    <span className="scan-dot" />
                    &nbsp;Checking…
                  </span>
                ) : (
                  "🛡 Run Fraud Check"
                )}
              </button>
            </div>
          </div>

          {/* ── Error state ──────────────────────────────────────────── */}
          {error && (
            <div
              className="glass-card card-failed"
              style={{ padding: "1rem", marginTop: "1rem" }}
            >
              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--caution)" }}>
                <strong>Error:</strong> {error}
              </p>
            </div>
          )}

          {/* ── Progress bar ─────────────────────────────────────────── */}
          {running && (
            <div style={{ marginTop: "1.2rem" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "0.4rem",
                }}
              >
                <span
                  style={{
                    fontSize: "0.7rem",
                    fontFamily: "var(--font-data)",
                    color: "var(--steel)",
                    letterSpacing: "0.06em",
                  }}
                >
                  Checking {cards.length} of {TOTAL_CHECKS} sources…
                </span>
                <span
                  style={{
                    fontSize: "0.7rem",
                    fontFamily: "var(--font-data)",
                    color: "var(--ink-muted)",
                  }}
                >
                  {progress}%
                </span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {/* ── Verdict ──────────────────────────────────────────────── */}
          {verdict && (
            <section
              id="verdict-section"
              className="glass-card card-enter"
              style={{ marginTop: "2rem", padding: "1.5rem" }}
            >
              {/* Stamp */}
              <div style={{ marginBottom: "1.2rem" }}>
                <div className={`verdict-stamp ${verdictConfig(verdict.verdict).cls}`}>
                  {verdictConfig(verdict.verdict).label}
                </div>
              </div>

              {/* Confidence + Risk score */}
              <div style={{ marginBottom: "1rem" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    marginBottom: "0.4rem",
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.7rem",
                      fontFamily: "var(--font-data)",
                      color: "var(--ink-muted)",
                      minWidth: 90,
                    }}
                  >
                    Risk Score
                  </span>
                  <div className="risk-bar-track">
                    <div
                      className="risk-bar-fill"
                      style={{
                        width: `${verdict.risk_score}%`,
                        background: riskBarColor(verdict.risk_score),
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: "0.8rem",
                      fontFamily: "var(--font-data)",
                      color: "var(--ink)",
                      minWidth: 32,
                      textAlign: "right",
                    }}
                  >
                    {verdict.risk_score}/100
                  </span>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.65rem",
                    fontFamily: "var(--font-data)",
                    color: "var(--ink-muted)",
                  }}
                >
                  Confidence: {verdict.confidence}%
                </p>
              </div>

              {/* Summary */}
              <p
                style={{
                  fontSize: "0.9rem",
                  lineHeight: 1.65,
                  color: "var(--ink-soft)",
                  marginBottom: "1rem",
                }}
              >
                {verdict.summary}
              </p>

              {/* Red flags */}
              {verdict.red_flags.length > 0 && (
                <div style={{ marginBottom: "0.8rem" }}>
                  <p
                    style={{
                      fontSize: "0.65rem",
                      fontFamily: "var(--font-data)",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: "var(--risk)",
                      marginBottom: "0.4rem",
                    }}
                  >
                    Red Flags ({verdict.red_flags.length})
                  </p>
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                    {verdict.red_flags.map((f, i) => (
                      <li
                        key={i}
                        style={{
                          fontSize: "0.85rem",
                          color: "var(--ink)",
                          paddingLeft: "1.1rem",
                          position: "relative",
                        }}
                      >
                        <span
                          style={{
                            position: "absolute",
                            left: 0,
                            color: "var(--risk)",
                          }}
                        >
                          ▸
                        </span>
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Green flags */}
              {verdict.green_flags.length > 0 && (
                <div style={{ marginBottom: "0.8rem" }}>
                  <p
                    style={{
                      fontSize: "0.65rem",
                      fontFamily: "var(--font-data)",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: "var(--safe)",
                      marginBottom: "0.4rem",
                    }}
                  >
                    Green Flags ({verdict.green_flags.length})
                  </p>
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                    {verdict.green_flags.map((f, i) => (
                      <li
                        key={i}
                        style={{
                          fontSize: "0.85rem",
                          color: "var(--ink)",
                          paddingLeft: "1.1rem",
                          position: "relative",
                        }}
                      >
                        <span
                          style={{
                            position: "absolute",
                            left: 0,
                            color: "var(--safe)",
                          }}
                        >
                          ▸
                        </span>
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recommended action */}
              <div
                style={{
                  marginTop: "1rem",
                  padding: "0.85rem 1rem",
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    color: "var(--ink)",
                  }}
                >
                  💡 {verdict.recommended_action}
                </p>
              </div>
            </section>
          )}

          {/* ── Evidence cards ───────────────────────────────────────── */}
          {cards.length > 0 && (
            <section style={{ marginTop: "1.5rem" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "0.75rem",
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.65rem",
                    fontFamily: "var(--font-data)",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--ink-muted)",
                  }}
                >
                  Evidence ({cards.length})
                </p>
                {running && (
                  <span
                    style={{
                      display: "flex",
                      gap: 5,
                      alignItems: "center",
                    }}
                  >
                    <span className="scan-dot" style={{ width: 5, height: 5 }} />
                    <span className="scan-dot" style={{ width: 5, height: 5 }} />
                    <span className="scan-dot" style={{ width: 5, height: 5 }} />
                  </span>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                {cards.map((c) => (
                  <EvidenceCardRow key={c.id} card={c} />
                ))}
              </div>
            </section>
          )}

          {/* ── "What's real" footer ────────────────────────────────── */}
          {hasResults && done && (
            <footer
              style={{
                marginTop: "2.5rem",
                paddingTop: "1.5rem",
                paddingBottom: "3rem",
                borderTop: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <p
                style={{
                  fontSize: "0.65rem",
                  fontFamily: "var(--font-data)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--ink-muted)",
                  marginBottom: "0.6rem",
                }}
              >
                What&apos;s actually being checked
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                  gap: "0.5rem",
                }}
              >
                {[
                  { label: "URL scrape", note: "Any listing URL", cls: "source-scraper" },
                  { label: "Wire → Reddit", note: "Scam reports", cls: "source-wire" },
                  { label: "Wire → Airbnb", note: "Short-stay cross-check", cls: "source-wire" },
                  { label: "Wire → Square Yards", note: "India cross-listing", cls: "source-wire" },
                  { label: "Web search", note: "Open-web references", cls: "source-search" },
                  { label: "Gemini vision", note: "Photo duplication", cls: "source-gemini" },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      padding: "0.5rem 0.75rem",
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.05)",
                      borderRadius: 8,
                    }}
                  >
                    <span className={`source-badge ${item.cls}`}>{item.label}</span>
                    <p style={{ margin: "0.3rem 0 0", fontSize: "0.72rem", color: "var(--ink-muted)" }}>
                      {item.note}
                    </p>
                  </div>
                ))}
              </div>
              <p
                style={{
                  marginTop: "0.8rem",
                  fontSize: "0.72rem",
                  color: "var(--ink-muted)",
                  lineHeight: 1.6,
                }}
              >
                &quot;Not available&quot; cards are real — LinkedIn requires your own connected account; Truecaller has no confirmed Wire action. We report them honestly instead of faking the check.
              </p>
            </footer>
          )}

          {/* Initial empty state */}
          {!hasResults && !running && (
            <div style={{ marginTop: "2rem", textAlign: "center", paddingBottom: "4rem" }}>
              <p
                style={{
                  fontSize: "0.8rem",
                  color: "var(--ink-muted)",
                  lineHeight: 1.7,
                }}
              >
                No data is stored. Every check runs fresh from real APIs — Anakin Wire, Anakin Universal Scraper, and Gemini.
              </p>
            </div>
          )}

        </div>
      </main>
    </>
  );
}

// ── Evidence card component ───────────────────────────────────────────────────

function EvidenceCardRow({ card }: { card: EvidenceCard }) {
  const [expanded, setExpanded] = useState(false);

  const cardClass = `glass-card card-enter ${
    card.status === "flagged" ? "card-flagged"
    : card.status === "ok"    ? "card-ok"
    : card.status === "failed" ? "card-failed"
    : "card-skipped"
  }`;

  return (
    <div
      className={cardClass}
      style={{ padding: "0.9rem 1rem", cursor: card.links?.length ? "pointer" : "default" }}
      onClick={() => card.links?.length && setExpanded((v) => !v)}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.6rem", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", flex: 1, minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontSize: "0.85rem",
              fontWeight: 600,
              color: "var(--ink)",
              flex: "0 0 auto",
            }}
          >
            {card.title}
          </p>
          <span className={`source-badge source-${card.source}`}>{sourceLabel(card.source)}</span>
        </div>
        <span className={`status-badge status-${card.status}`} style={{ flexShrink: 0 }}>
          {statusLabel(card.status)}
        </span>
      </div>

      {/* Summary */}
      <p
        style={{
          margin: "0.5rem 0 0",
          fontSize: "0.82rem",
          lineHeight: 1.6,
          color: "var(--ink-soft)",
        }}
      >
        {card.summary}
      </p>

      {/* Links */}
      {card.links && card.links.length > 0 && (
        <ul
          style={{
            marginTop: "0.6rem",
            padding: 0,
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: "0.25rem",
          }}
        >
          {(expanded ? card.links : card.links.slice(0, 2)).map((l, i) => (
            <li key={i}>
              <a
                href={l.url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{
                  fontSize: "0.75rem",
                  color: "var(--steel)",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  borderBottom: "1px solid transparent",
                  transition: "border-color 0.15s",
                }}
                onMouseEnter={(e) =>
                  ((e.target as HTMLElement).style.borderBottomColor = "var(--steel)")
                }
                onMouseLeave={(e) =>
                  ((e.target as HTMLElement).style.borderBottomColor = "transparent")
                }
              >
                ↗ {l.label.length > 70 ? l.label.slice(0, 70) + "…" : l.label}
              </a>
            </li>
          ))}
          {!expanded && card.links.length > 2 && (
            <li
              style={{ fontSize: "0.72rem", color: "var(--ink-muted)", cursor: "pointer" }}
              onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
            >
              + {card.links.length - 2} more
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
