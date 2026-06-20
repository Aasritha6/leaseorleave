"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { EvidenceCard, ParsedInput, StreamEvent, Verdict } from "@/lib/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function sourceLabel(s: EvidenceCard["source"]) {
  switch (s) {
    case "wire":    return "Wire";
    case "scraper": return "Scraper";
    case "search":  return "Web Search";
    case "gemini":  return "Gemini Vision";
    default:        return "Unavailable";
  }
}

function statusLabel(s: EvidenceCard["status"]) {
  switch (s) {
    case "flagged": return "Flagged ▲";
    case "ok":      return "Clear ✓";
    case "failed":  return "Failed";
    case "skipped": return "Not available";
    default:        return "Pending";
  }
}

function verdictConfig(v: Verdict["verdict"]) {
  switch (v) {
    case "HIGH_RISK":   return { cls: "high-risk",    label: "⚠ HIGH RISK — DO NOT PAY",           color: "var(--risk)" };
    case "MEDIUM_RISK": return { cls: "medium-risk",  label: "⚡ MEDIUM RISK — Proceed Carefully",  color: "var(--caution)" };
    case "LOW_RISK":    return { cls: "low-risk",      label: "✓ LOW RISK",                          color: "var(--safe)" };
    default:            return { cls: "inconclusive",  label: "? INCONCLUSIVE",                      color: "var(--steel)" };
  }
}

function riskBarColor(score: number) {
  if (score >= 70) return "linear-gradient(90deg,#f56565,#fc8181)";
  if (score >= 40) return "linear-gradient(90deg,#f6ad55,#fbd38d)";
  return "linear-gradient(90deg,#68d391,#9ae6b4)";
}

const PLACEHOLDER_CHECKS = [
  "Scraping listing page…",
  "Checking 99acres…",
  "Checking Housing.com…",
  "Checking Airbnb…",
  "Checking Square Yards…",
  "Running web search…",
  "Truecaller lookup…",
  "Gemini synthesising verdict…",
];

// ── Typewriter hook ───────────────────────────────────────────────────────────
function useTypewriter(text: string, speed = 38) {
  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    setDisplayed("");
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);
  return displayed;
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Home() {
  const [input, setInput]       = useState("");
  const [running, setRunning]   = useState(false);
  const [parsed, setParsed]     = useState<ParsedInput | null>(null);
  const [cards, setCards]       = useState<EvidenceCard[]>([]);
  const [verdict, setVerdict]   = useState<Verdict | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [done, setDone]         = useState(false);
  const [currentCheck, setCurrentCheck] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const progress = done ? 100 : Math.min(Math.round((cards.length / 8) * 88), 88);

  // Cycle through skeleton check names while running
  useEffect(() => {
    if (running) {
      timerRef.current = setInterval(() => {
        setCurrentCheck((c) => (c + 1) % PLACEHOLDER_CHECKS.length);
      }, 1800);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [running]);

  const runCheck = useCallback(async () => {
    if (!input.trim() || running) return;
    setRunning(true);
    setCards([]);
    setVerdict(null);
    setError(null);
    setParsed(null);
    setDone(false);
    setCurrentCheck(0);

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
          if (event.type === "parsed")   setParsed(event.data);
          if (event.type === "evidence") setCards((prev) => [...prev, event.data]);
          if (event.type === "verdict")  setVerdict(event.data);
          if (event.type === "error")    setError(event.data.message);
          if (event.type === "done")     setDone(true);
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
  const tagline = useTypewriter("Verify before you pay.", 55);

  return (
    <>
      <div className="scan-overlay" aria-hidden="true" />

      {/* Floating orbs */}
      <div className="orb" style={{ width: 320, height: 320, top: -80, left: "50%", marginLeft: -160, background: "radial-gradient(circle, rgba(102,126,234,0.18) 0%, transparent 70%)" }} aria-hidden="true" />
      <div className="orb" style={{ width: 220, height: 220, bottom: "20%", right: "5%", background: "radial-gradient(circle, rgba(118,75,162,0.12) 0%, transparent 70%)", animationDelay: "3s" }} aria-hidden="true" />

      <main style={{ minHeight: "100vh", padding: "0 1rem", fontFamily: "var(--font-body)" }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>

          {/* ── Hero ─────────────────────────────────────────────────── */}
          <header style={{ paddingTop: "3.8rem", paddingBottom: "2.4rem", textAlign: "center" }}>
            {/* Shield logo */}
            <div className="hero-in" style={{ display: "flex", justifyContent: "center", marginBottom: "1.2rem" }}>
              <div style={{
                width: 56, height: 56, borderRadius: 16,
                background: "linear-gradient(135deg, #667eea, #764ba2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 28, boxShadow: "0 8px 36px rgba(102,126,234,0.45)",
                transition: "transform 0.3s",
              }}>
                🛡
              </div>
            </div>

            <p className="hero-in" style={{ fontSize: "0.62rem", letterSpacing: "0.32em", textTransform: "uppercase", color: "var(--ink-muted)", fontFamily: "var(--font-data)", marginBottom: "0.55rem" }}>
              Rental Fraud Shield · Powered by Gemini AI
            </p>

            <h1 className="hero-in" style={{
              fontSize: "clamp(2.1rem, 5.5vw, 3rem)", fontWeight: 800,
              background: "linear-gradient(135deg, #e8edf2 0%, #7f8fa6 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
              letterSpacing: "-0.025em", lineHeight: 1.12,
            }}>
              LeaseOrLeave
            </h1>

            <p className="hero-in-delay" style={{ marginTop: "0.9rem", color: "var(--ink-soft)", fontSize: "0.95rem", lineHeight: 1.65, maxWidth: 460, marginLeft: "auto", marginRight: "auto", minHeight: "1.6rem" }}>
              {tagline}<span className="cursor-blink" />
            </p>

            {/* Stat chips */}
            <div className="hero-in-delay2" style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", justifyContent: "center", marginTop: "1.2rem" }}>
              <span className="stat-chip">📊 30M+ urban renters</span>
              <span className="stat-chip">⚠️ 2,000+ scams/month</span>
              <span className="stat-chip">💸 ₹15–50K avg token loss</span>
            </div>
          </header>

          {/* ── Input card ───────────────────────────────────────────── */}
          <div className="input-area" style={{ padding: "1.3rem" }}>
            <label htmlFor="listing-input" style={{ display: "block", fontSize: "0.65rem", fontFamily: "var(--font-data)", letterSpacing: "0.13em", textTransform: "uppercase", color: "var(--ink-muted)", marginBottom: "0.6rem" }}>
              Listing URL / Broker Phone / Address + Rent
            </label>
            <textarea
              id="listing-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) runCheck(); }}
              placeholder={"https://www.nobroker.in/property/…\n+91 98765 43210\n2BHK, HSR Layout, Bangalore — ₹18,000/month"}
              rows={4}
              style={{ width: "100%", background: "transparent", border: "none", outline: "none", resize: "none", fontSize: "0.9rem", color: "var(--ink)", fontFamily: "var(--font-body)", lineHeight: 1.65 }}
            />
            <div style={{ marginTop: "0.9rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
              <span style={{ fontSize: "0.68rem", color: "var(--ink-muted)", fontFamily: "var(--font-data)" }}>
                {parsed ? `Interpreted as: ${parsed.kind}${parsed.city ? ` · ${parsed.city}` : ""}` : "Ctrl+Enter to run"}
              </span>
              <button id="run-check-btn" className="btn-primary" onClick={runCheck} disabled={running || !input.trim()}>
                {running ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="radar-ring" style={{ width: 16, height: 16, borderWidth: 2 }} />
                    Checking…
                  </span>
                ) : "🛡 Run Fraud Check"}
              </button>
            </div>
          </div>

          {/* ── Error ────────────────────────────────────────────────── */}
          {error && (
            <div className="glass-card card-failed" style={{ padding: "1rem", marginTop: "1rem" }}>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--caution)" }}><strong>Error:</strong> {error}</p>
            </div>
          )}

          {/* ── Scanning progress ─────────────────────────────────────── */}
          {running && (
            <div style={{ marginTop: "1.3rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="radar-ring" />
                  <span style={{ fontSize: "0.72rem", fontFamily: "var(--font-data)", color: "var(--steel)", letterSpacing: "0.05em" }}>
                    {PLACEHOLDER_CHECKS[currentCheck]}
                  </span>
                </span>
                <span style={{ fontSize: "0.68rem", fontFamily: "var(--font-data)", color: "var(--ink-muted)" }}>{progress}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {/* ── Skeleton cards while loading ──────────────────────────── */}
          {running && cards.length === 0 && (
            <div style={{ marginTop: "1.5rem", display: "flex", flexDirection: "column", gap: "0.65rem" }}>
              {[0, 1, 2].map((i) => (
                <div key={i} className="glass-card" style={{ padding: "1rem", opacity: 0.6 - i * 0.12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.6rem" }}>
                    <div className="shimmer" style={{ width: "45%", height: 14 }} />
                    <div className="shimmer" style={{ width: "18%", height: 14 }} />
                  </div>
                  <div className="shimmer" style={{ width: "100%", height: 12, marginBottom: 6 }} />
                  <div className="shimmer" style={{ width: "70%", height: 12 }} />
                </div>
              ))}
            </div>
          )}

          {/* ── Verdict ──────────────────────────────────────────────── */}
          {verdict && (
            <section id="verdict-section" className="glass-card fade-up" style={{ marginTop: "2rem", padding: "1.5rem" }}>
              {/* Stamp */}
              <div style={{ marginBottom: "1.3rem" }}>
                <div className={`verdict-stamp ${verdictConfig(verdict.verdict).cls}`}>
                  {verdictConfig(verdict.verdict).label}
                </div>
              </div>

              {/* Risk score bar */}
              <div style={{ marginBottom: "1rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.35rem" }}>
                  <span style={{ fontSize: "0.66rem", fontFamily: "var(--font-data)", color: "var(--ink-muted)", minWidth: 76 }}>Risk Score</span>
                  <div className="risk-bar-track">
                    <div className="risk-bar-fill" style={{ width: `${verdict.risk_score}%`, background: riskBarColor(verdict.risk_score) }} />
                  </div>
                  <span style={{ fontSize: "0.8rem", fontFamily: "var(--font-data)", color: "var(--ink)", minWidth: 36, textAlign: "right" }}>
                    {verdict.risk_score}<span style={{ fontSize: "0.6rem", color: "var(--ink-muted)" }}>/100</span>
                  </span>
                </div>
                <p style={{ fontSize: "0.62rem", fontFamily: "var(--font-data)", color: "var(--ink-muted)" }}>
                  Confidence: {verdict.confidence}%
                </p>
              </div>

              {/* Summary */}
              <p style={{ fontSize: "0.88rem", lineHeight: 1.7, color: "var(--ink-soft)", marginBottom: "1rem" }}>
                {verdict.summary}
              </p>

              {/* Red flags */}
              {verdict.red_flags.length > 0 && (
                <div style={{ marginBottom: "0.8rem" }}>
                  <p style={{ fontSize: "0.62rem", fontFamily: "var(--font-data)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--risk)", marginBottom: "0.45rem" }}>
                    Red Flags ({verdict.red_flags.length})
                  </p>
                  <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "0.38rem" }}>
                    {verdict.red_flags.map((f, i) => (
                      <li key={i} style={{ fontSize: "0.84rem", color: "var(--ink)", paddingLeft: "1.1rem", position: "relative" }}>
                        <span style={{ position: "absolute", left: 0, color: "var(--risk)" }}>▸</span>{f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Green flags */}
              {verdict.green_flags.length > 0 && (
                <div style={{ marginBottom: "0.8rem" }}>
                  <p style={{ fontSize: "0.62rem", fontFamily: "var(--font-data)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--safe)", marginBottom: "0.45rem" }}>
                    Green Flags ({verdict.green_flags.length})
                  </p>
                  <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "0.38rem" }}>
                    {verdict.green_flags.map((f, i) => (
                      <li key={i} style={{ fontSize: "0.84rem", color: "var(--ink)", paddingLeft: "1.1rem", position: "relative" }}>
                        <span style={{ position: "absolute", left: 0, color: "var(--safe)" }}>▸</span>{f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recommended action */}
              <div style={{ marginTop: "1.1rem", padding: "0.9rem 1rem", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <p style={{ margin: 0, fontSize: "0.87rem", fontWeight: 600, color: "var(--ink)" }}>
                  💡 {verdict.recommended_action}
                </p>
              </div>
            </section>
          )}

          {/* ── Evidence cards ────────────────────────────────────────── */}
          {cards.length > 0 && (
            <section style={{ marginTop: "1.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                <p style={{ margin: 0, fontSize: "0.62rem", fontFamily: "var(--font-data)", letterSpacing: "0.13em", textTransform: "uppercase", color: "var(--ink-muted)" }}>
                  Evidence ({cards.length})
                </p>
                {running && <span className="radar-ring" style={{ width: 16, height: 16, borderWidth: 2 }} />}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                {cards.map((c, idx) => (
                  <EvidenceCardRow key={c.id} card={c} index={idx} />
                ))}
              </div>
            </section>
          )}

          {/* ── Footer ───────────────────────────────────────────────── */}
          {hasResults && done && (
            <footer style={{ marginTop: "2.5rem", paddingTop: "1.5rem", paddingBottom: "3rem", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <p style={{ fontSize: "0.62rem", fontFamily: "var(--font-data)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-muted)", marginBottom: "0.65rem" }}>
                What&apos;s being checked — all real, nothing faked
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: "0.5rem" }}>
                {[
                  { label: "URL Scrape",         note: "Any listing URL",       cls: "source-scraper" },
                  { label: "Wire → 99acres",      note: "India listings",        cls: "source-wire" },
                  { label: "Wire → Housing.com",  note: "India listings",        cls: "source-wire" },
                  { label: "Wire → Airbnb",       note: "Short-stay check",      cls: "source-wire" },
                  { label: "Wire → Square Yards", note: "India cross-check",     cls: "source-wire" },
                  { label: "Web Search",          note: "Open-web references",   cls: "source-search" },
                  { label: "Truecaller Scrape",   note: "Phone spam lookup",     cls: "source-scraper" },
                  { label: "Gemini Vision",       note: "Photo duplication",     cls: "source-gemini" },
                ].map((item) => (
                  <div key={item.label} style={{ padding: "0.5rem 0.75rem", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 8 }}>
                    <span className={`source-badge ${item.cls}`}>{item.label}</span>
                    <p style={{ margin: "0.3rem 0 0", fontSize: "0.7rem", color: "var(--ink-muted)" }}>{item.note}</p>
                  </div>
                ))}
              </div>
            </footer>
          )}

          {/* Empty state */}
          {!hasResults && !running && (
            <div style={{ marginTop: "2rem", textAlign: "center", paddingBottom: "4rem" }}>
              <p style={{ fontSize: "0.78rem", color: "var(--ink-muted)", lineHeight: 1.7 }}>
                No data is stored. Every check runs fresh — Anakin Wire (99acres, Housing.com, Airbnb, Square Yards), Universal Scraper, and Gemini 2.5 Flash.
              </p>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

// ── Evidence card row ─────────────────────────────────────────────────────────

function EvidenceCardRow({ card, index }: { card: EvidenceCard; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const delay = Math.min(index * 0.06, 0.3);

  const cardCls = [
    "glass-card card-enter",
    card.status === "flagged" ? "card-flagged"
    : card.status === "ok"    ? "card-ok"
    : card.status === "failed" ? "card-failed"
    : "card-skipped",
  ].join(" ");

  return (
    <div
      className={cardCls}
      style={{ padding: "0.95rem 1rem", animationDelay: `${delay}s`, cursor: card.links?.length ? "pointer" : "default" }}
      onClick={() => card.links?.length && setExpanded((v) => !v)}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.6rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: "0.85rem", fontWeight: 600, color: "var(--ink)", flex: "0 0 auto" }}>
            {card.title}
          </p>
          <span className={`source-badge source-${card.source}`}>{sourceLabel(card.source)}</span>
        </div>
        <span className={`status-badge status-${card.status}`} style={{ flexShrink: 0 }}>
          {statusLabel(card.status)}
        </span>
      </div>

      <p style={{ margin: "0.5rem 0 0", fontSize: "0.82rem", lineHeight: 1.62, color: "var(--ink-soft)" }}>
        {card.summary}
      </p>

      {card.links && card.links.length > 0 && (
        <ul style={{ marginTop: "0.6rem", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.28rem" }}>
          {(expanded ? card.links : card.links.slice(0, 2)).map((l, i) => (
            <li key={i}>
              <a
                href={l.url} target="_blank" rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{ fontSize: "0.74rem", color: "var(--steel)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, borderBottom: "1px solid transparent", transition: "border-color 0.15s" }}
                onMouseEnter={(e) => ((e.target as HTMLElement).style.borderBottomColor = "var(--steel)")}
                onMouseLeave={(e) => ((e.target as HTMLElement).style.borderBottomColor = "transparent")}
              >
                ↗ {l.label.length > 68 ? l.label.slice(0, 68) + "…" : l.label}
              </a>
            </li>
          ))}
          {!expanded && card.links.length > 2 && (
            <li style={{ fontSize: "0.7rem", color: "var(--ink-muted)", cursor: "pointer" }}
              onClick={(e) => { e.stopPropagation(); setExpanded(true); }}>
              + {card.links.length - 2} more
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
