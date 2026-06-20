# LeaseOrLeave

> **AI-Powered Rental Fraud Shield for India**
> *Protecting flat-hunters from token-deposit scams — before a single rupee changes hands.*

---

**LeaseOrLeave: Real-Time Rental Fraud Detection for Indian Renters**

Built for the **Anakin AI Hackathon 2026** · Powered exclusively by **Gemini AI + Anakin Universal Scraper + Anakin Search API**

---

## 🎯 The Problem

India's rental market serves **30+ million urban renters** with **5+ million new searches every month** — and it is one of the most fraud-prone sectors in the country.

| Pain Point | Why It Hurts |
|---|---|
| **Token Deposit Scams** | Scammers post fake listings, demand ₹5,000–₹50,000 via UPI to "hold" the property. The flat doesn't exist. The money is gone. |
| **Cloned Listings** | A real NoBroker/MagicBricks listing is copied verbatim — same photos, same description — and reposted with a different phone number by a scammer posing as the owner. |
| **Broker Identity Fraud** | Anyone can claim to be a "verified broker." No central registry. One scammer, five numbers, three names, zero accountability. |
| **Pressure Tactics** | *"5 other people are viewing this today. Pay the token now or lose it."* Urgency bypasses rational thinking. |
| **Fragmented Information** | You see one listing on one platform. The scammer's history, cloned listings, and red flags are scattered across other portals and consumer forums — invisible to you. |

### The Financial & Emotional Damage

- 💸 Average token scam loss: **₹15,000–₹50,000**
- 🕐 Time wasted per scam encounter: **3–5 days**
- 📊 Estimated metro scams: **2,000+ reported monthly** (actual 5–10× higher — most go unreported)
- 🏚️ Emotional toll: housing insecurity, trust erosion, stress during relocation

### Why Existing Solutions Fail

| Existing Approach | Why It Doesn't Work |
|---|---|
| Platform "Verified" badges | Easily faked. Scammers buy verified accounts. |
| User reviews | Scammers seed fake positive reviews. |
| Manual due diligence | 8 tabs, 2+ hours, most renters skip it entirely. |
| Police complaints | Post-facto. UPI money is unrecoverable. |

> **The core insight:** The scam works because information is fragmented. LeaseOrLeave aggregates and cross-references it in real time — making the scam visible *before* money changes hands.

---

## 💡 The Solution

**LeaseOrLeave** is an AI-powered rental fraud shield. Paste any listing URL, broker phone number, or address — and within 15 seconds get a structured verdict backed by real evidence from 7 independent data sources.

```
User pastes listing URL / phone number / address
         ↓
Parallel verification across 7 real sources concurrently
         ↓
Gemini synthesizes evidence → Structured verdict
         ↓
Evidence cards stream to screen in real time
         ↓
HIGH RISK ⚠ / MEDIUM RISK ⚡ / LOW RISK ✓ / INCONCLUSIVE ?
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        USER BROWSER                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Next.js 16 Frontend (App Router)                    │   │
│  │  • Input: URL / Phone / Address+Rent                 │   │
│  │  • SSE stream → Evidence cards animate in live       │   │
│  │  • Verdict stamp + Risk score bar                    │   │
│  └────────────────────┬─────────────────────────────────┘   │
└───────────────────────│─────────────────────────────────────┘
                        │ POST /api/verify (SSE)
┌───────────────────────▼─────────────────────────────────────┐
│                   NEXT.JS API ROUTE                         │
│              app/api/verify/route.ts                        │
│         ReadableStream → text/event-stream                  │
└───────────────────────┬─────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────┐
│                  ORCHESTRATOR (lib/orchestrator.ts)         │
│                                                             │
│  Step 1: Gemini parses free-form input → ParsedInput        │
│                                                             │
│  Step 2–8: Parallel checks (Promise.allSettled) via SSE     │
│  ┌────────────────┐  ┌─────────────────┐  ┌─────────────┐   │
│  │ Anakin         │  │ Anakin Search   │  │ Anakin Search│   │
│  │ Universal      │  │ API             │  │ API          │   │
│  │ Scraper        │  │ → Open web      │  │ → 99acres    │   │
│  │ (Scrapes the   │  │ scam/fraud      │  │ (site: search)│   │
│  │  original URL) │  │ complaints      │  │              │   │
│  └────────────────┘  └─────────────────┘  └─────────────┘   │
│  ┌─────────────────────┐  ┌──────────────────────────────┐  │
│  │ Anakin Search API   │  │ Anakin Search API            │  │
│  │ → MagicBricks       │  │ → NoBroker, Housing, Square  │  │
│  │ (site: search)      │  │   Yards (site: searches)     │  │
│  └─────────────────────┘  └──────────────────────────────┘  │
│  ┌─────────────────────┐                                    │
│  │ Anakin Universal    │                                    │
│  │ Scraper             │                                    │
│  │ → Truecaller Search │                                    │
│  └─────────────────────┘                                    │
│                                                             │
│  Step 9: Gemini Vision — photo duplication check            │
│          (only if two candidate photo sets exist)           │
│                                                             │
│  Step 10: Gemini synthesizes all evidence → Verdict JSON    │
└─────────────────────────────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
┌──────────────┐ ┌────────────┐ ┌──────────────────┐
│ Gemini AI    │ │ Anakin     │ │ Anakin Search    │
│ (Google AI   │ │ Universal  │ │ API              │
│  Studio)     │ │ Scraper    │ │                  │
│              │ │            │ │ Used for Google  │
│ • Input      │ │ Markdown   │ │ site: searches   │
│   parsing    │ │ output,    │ │ to bypass portal │
│ • Verdict    │ │ India      │ │ bot protections  │
│   synthesis  │ │ proxies,   │ │ safely.          │
│ • Photo      │ │ browser    │ │                  │
│   comparison │ │ rendering  │ │                  │
│              │ │ ON         │ │                  │
│ ONLY LLM     │ │            │ │                  │
│ IN THE APP   │ │            │ │                  │
└──────────────┘ └────────────┘ └──────────────────┘
```

---

## 🔑 Key Features

### 1. 🛡 Real-Time Fraud Verdict
Paste anything — a URL, a phone number, an address + rent — and get a structured verdict in under 15 seconds (thanks to parallel processing):

- **HIGH RISK ⚠** — Strong evidence of fraud. Do not pay.
- **MEDIUM RISK ⚡** — Suspicious signals. Proceed with extreme caution.
- **LOW RISK ✓** — No red flags found across all sources checked.
- **INCONCLUSIVE ?** — Not enough data. Report explains what's missing and why.

### 2. 🔍 7-Source Parallel Verification

We bypass the heavy bot protections (Cloudflare/Akamai) used by Indian portals by leveraging Anakin Search API for targeted Google `site:` searches instead of headless browsers. This makes the app **extremely fast and reliable**.

| Check | How | Real? |
|---|---|---|
| **Read the listing page** | Anakin Universal Scraper — works on any URL (NoBroker, MagicBricks, Facebook) | ✅ Real |
| **99acres cross-check** | Anakin Search API → `site:99acres.com` search to match phone numbers to active 99acres properties. | ✅ Real |
| **MagicBricks cross-check** | Anakin Search API → `site:magicbricks.com` search to verify contact and property details. | ✅ Real |
| **Square Yards (India)** | Anakin Search API → `site:squareyards.com` cross-reference. | ✅ Real |
| **NoBroker cross-check** | Anakin Search API → `site:nobroker.in` cross-reference. | ✅ Real |
| **Housing.com cross-check**| Anakin Search API → `site:housing.com` cross-reference. | ✅ Real |
| **Open-web cross-reference**| Anakin Search API — searches the web for the phone number and address alongside scam complaint keywords. | ✅ Real |
| **Truecaller phone lookup** | Anakin Universal Scraper → Scrapes the public Truecaller search page for spam flags. | ✅ Real |

### 3. 📡 Live SSE Streaming
Evidence cards stream to the frontend one by one as each check completes — not a blank loading screen. Users see real-time progress and can act on early results immediately.

### 4. 🎨 Premium Dark UI
Dark glassmorphism design with:
- Status-colored card glows (🔴 flagged / 🟢 clear / 🟡 failed)
- Shimmer skeleton loaders while parallel checks run
- Animated verdict stamp with pulse effect for HIGH RISK
- Risk score bar with smooth animation
- Source badges showing exactly which tool produced each result

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 16.2 (App Router, Turbopack) |
| **Language** | TypeScript (strict mode) |
| **LLM** | Google Gemini 2.5 Flash via `@google/genai` — **only LLM used** |
| **Web Scraping** | Anakin Universal Scraper (`POST /v1/url-scraper`) |
| **Web Search** | Anakin Search API (`POST /v1/search`) |
| **Streaming** | Server-Sent Events (SSE) — `text/event-stream` |
| **Styling** | Vanilla CSS with custom design tokens, glassmorphism |
| **Fonts** | Inter + IBM Plex Mono + Courier Prime (Google Fonts) |
| **Deployment** | Vercel (Edge Network) |

### API Architecture

```
POST /api/verify   → SSE stream: parsed → evidence[] → verdict → done
                     Calls: Gemini (parse) + Anakin Scraper 
                          + Anakin Search + Gemini (verdict)
```
---

## 🏆 What Makes This Genuinely Different

| Feature | NoBroker / 99acres / MagicBricks | LeaseOrLeave |
|---|---|---|
| Fraud detection | ❌ | ✅ Real-time, multi-source |
| Cross-platform check | ❌ | ✅ Checks 5 major Indian portals concurrently |
| Bot-bypass searches | ❌ | ✅ Uses Google `site:` searches to bypass Akamai/Cloudflare blocking |
| Photo duplication check | ❌ | ✅ Gemini Vision |
| AI verdict with evidence | ❌ | ✅ Gemini 2.5 Flash |
| Honest about limitations | ❌ | ✅ Unavailable checks shown, not faked |
| Works on any listing URL | Partial | ✅ Any URL — Anakin Universal Scraper |
| Real-time streaming results | ❌ | ✅ SSE — cards appear as checks complete |

---

## 📊 Market Impact

- 🏙️ **30M+** urban renters in India
- ⚠️ **2,000+** token scams reported monthly in metros (actual number 5–10× higher)
- 💸 **₹3–10 crore** in fraud prevented monthly at scale
- 📉 **₹15,000–₹50,000** average loss per victim — prevented per check

---

## ✅ Honesty by Design

LeaseOrLeave is built on a principle: **if a check can't be run for real, it is reported as unavailable — never faked.**

Every evidence card carries a `source` label:

| Badge | Meaning |
|---|---|
| `SCRAPER` | Anakin Universal Scraper fetched the page directly |
| `SEARCH` | Anakin Search API queried the open web or ran a `site:` search |
| `GEMINI VISION` | Gemini compared two photo sets directly |

This matters for judges: *"How do we know it's not just a slide?"* — every card in the UI is the answer.

---

## 👨‍💻 Local Setup

1. Clone the repository
2. `npm install`
3. Create a `.env.local` file with:
   ```env
   GEMINI_API_KEY=your_key_here
   ANAKIN_API_KEY=your_key_here
   ```
4. `npm run dev`

---

## Links
Live app: https://leaseorleave.vercel.app/
Github: https://github.com/Aasritha6/leaseorleave

---

*Made for the Anakin AI Hackathon 2026. Because finding a home shouldn't be a gamble.*
