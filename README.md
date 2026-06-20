# LeaseOrLeave

> **AI-Powered Rental Fraud Shield for India**
> *Protecting flat-hunters from token-deposit scams — before a single rupee changes hands.*

---

## 🏠 Project Title

**LeaseOrLeave: Real-Time Rental Fraud Detection for Indian Renters**

Built for the **Anakin AI Hackathon 2026** · Powered exclusively by **Gemini AI + Anakin Wire**

---

## 🎯 The Problem

India's rental market serves **30+ million urban renters** with **5+ million new searches every month** — and it is one of the most fraud-prone sectors in the country.

| Pain Point | Why It Hurts |
|---|---|
| **Token Deposit Scams** | Scammers post fake listings, demand ₹5,000–₹50,000 via UPI to "hold" the property. The flat doesn't exist. The money is gone. |
| **Cloned Listings** | A real NoBroker/MagicBricks listing is copied verbatim — same photos, same description — and reposted with a different phone number by a scammer posing as the owner. |
| **Broker Identity Fraud** | Anyone can claim to be a "verified broker." No central registry. One scammer, five numbers, three names, zero accountability. |
| **Pressure Tactics** | *"5 other people are viewing this today. Pay the token now or lose it."* Urgency bypasses rational thinking. |
| **Fragmented Information** | You see one listing on one platform. The scammer's history, cloned listings, and red flags are scattered across Reddit, consumer forums, and other portals — invisible to you. |

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

**LeaseOrLeave** is an AI-powered rental fraud shield. Paste any listing URL, broker phone number, or address — and within 60 seconds get a structured verdict backed by real evidence from multiple independent sources.

```
User pastes listing URL / phone number / address
         ↓
Parallel verification across 5 real sources
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
│  Step 2–5: Parallel checks (emit evidence cards via SSE)    │
│  ┌────────────────┐  ┌─────────────────┐  ┌─────────────┐  │
│  │ Anakin          │  │ Anakin Wire     │  │ Anakin Wire │  │
│  │ Universal       │  │ → Reddit        │  │ → Airbnb    │  │
│  │ Scraper         │  │ Scam reports    │  │ Cross-check │  │
│  │ (any listing    │  │ (community      │  │ (short-stay │  │
│  │  URL — NoBroker,│  │  forum search)  │  │  vs long-   │  │
│  │  MagicBricks,   │  │                 │  │  term?)     │  │
│  │  Facebook...)   │  └─────────────────┘  └─────────────┘  │
│  └────────────────┘                                         │
│  ┌─────────────────────┐  ┌──────────────────────────────┐  │
│  │ Anakin Wire          │  │ Anakin Search API            │  │
│  │ → Square Yards       │  │ Open-web cross-reference     │  │
│  │ India cross-listing  │  │ (phone + address mentions,   │  │
│  │ check (squareyards   │  │  scam complaints, consumer   │  │
│  │  .com Wire action)   │  │  forums)                     │  │
│  └─────────────────────┘  └──────────────────────────────┘  │
│                                                             │
│  Step 6: Gemini Vision — photo duplication check            │
│          (only if two candidate photo sets exist)           │
│                                                             │
│  Step 7: Gemini synthesizes all evidence → Verdict JSON     │
└─────────────────────────────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
┌──────────────┐ ┌────────────┐ ┌──────────────────┐
│ Gemini AI    │ │ Anakin     │ │ Anakin Wire      │
│ (Google AI   │ │ Universal  │ │ Pre-built        │
│  Studio)     │ │ Scraper    │ │ Actions:         │
│              │ │ + Search   │ │ Reddit / Airbnb  │
│ • Input      │ │ API        │ │ / Square Yards   │
│   parsing    │ │            │ │ (dynamic         │
│ • Verdict    │ │ Markdown   │ │  discovery —     │
│   synthesis  │ │ output,    │ │  no hardcoded    │
│ • Photo      │ │ India      │ │  action IDs)     │
│   comparison │ │ proxies,   │ │                  │
│              │ │ browser    │ │                  │
│ ONLY LLM     │ │ rendering  │ │                  │
│ IN THE APP   │ │ ON         │ │                  │
└──────────────┘ └────────────┘ └──────────────────┘
```

---

## 🔑 Key Features

### 1. 🛡 Real-Time Fraud Verdict
Paste anything — a URL, a phone number, an address + rent — and get a structured verdict in under 60 seconds:

- **HIGH RISK ⚠** — Strong evidence of fraud. Do not pay.
- **MEDIUM RISK ⚡** — Suspicious signals. Proceed with extreme caution.
- **LOW RISK ✓** — No red flags found across all sources checked.
- **INCONCLUSIVE ?** — Not enough data. Report explains what's missing and why.

### 2. 🔍 5-Source Parallel Verification

| Check | How | Real? |
|---|---|---|
| **Read the listing page** | Anakin Universal Scraper — works on any URL (NoBroker, MagicBricks, Facebook, WhatsApp links) | ✅ Real |
| **Community scam reports** | Anakin Wire → Reddit — searches community forums for the phone number / address alongside scam keywords | ✅ Real |
| **Airbnb cross-check** | Anakin Wire → Airbnb — detects if the "long-term rental" is actually listed as a short-stay to harvest token deposits | ✅ Real |
| **Square Yards (India)** | Anakin Wire → squareyards.com — cross-references the property on India's major listing platform for contact mismatches | ✅ Real |
| **Open-web cross-reference** | Anakin Search API — searches the web for the phone number and address for scam complaints and duplicate listings | ✅ Real |
| **Photo duplication** | Gemini Vision — compares photo sets from two candidate listings; flags cloned photos | ✅ Real (when two listings found) |
| **LinkedIn broker identity** | Wire requires user's own connected account — reported as unavailable, **not faked** | ⛔ Honest |
| **Truecaller phone lookup** | No confirmed Wire action in catalog — reported as unavailable, **not faked** | ⛔ Honest |

### 3. 📡 Live SSE Streaming
Evidence cards stream to the frontend one by one as each check completes — not a blank loading screen. Users see real-time progress and can act on early results immediately.

### 4. 🎨 Premium Dark UI
Dark glassmorphism design with:
- Status-colored card glows (🔴 flagged / 🟢 clear / 🟡 failed)
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
| **Wire Actions** | Anakin Wire (Reddit, Airbnb, Square Yards) via dynamic discovery |
| **Streaming** | Server-Sent Events (SSE) — `text/event-stream` |
| **Styling** | Vanilla CSS with custom design tokens, glassmorphism |
| **Fonts** | Inter + IBM Plex Mono + Courier Prime (Google Fonts) |
| **Deployment** | Vercel (Edge Network) |

### API Architecture

```
POST /api/verify   → SSE stream: parsed → evidence[] → verdict → done
                     Calls: Gemini (parse) + Anakin Scraper + Wire
                          + Anakin Search + Gemini (verdict)
```

---

## 🎭 The 3-Minute Demo Script

> **Scenario:** You're moving to Hyderabad. You find a 2BHK in Hitech City for ₹12,000/month. Market rate: ₹20,000. The broker is pushing hard for a ₹25,000 token today.

1. Paste the NoBroker URL into LeaseOrLeave
2. **Instant verdict streams:** `⚠ HIGH RISK — DO NOT PAY`
3. Evidence cards appear one by one:
   - 📸 *"Listing page scraped — contact number extracted: +91-98XXX"*
   - 🚨 *"Community reports: 3 posts found mentioning this number alongside scam keywords"*
   - 🏠 *"Square Yards: same area listed with different broker name — contact mismatch"*
   - 🌐 *"Open web: consumer complaint found on MouthShut.com"*
4. Gemini synthesizes: *"4 critical red flags. Rent 40% below market — classic bait pricing. Do not pay."*

**Judge reaction:** *"I would use this tomorrow."*

---

## 🏆 What Makes This Genuinely Different

| Feature | NoBroker / 99acres / MagicBricks | LeaseOrLeave |
|---|---|---|
| Fraud detection | ❌ | ✅ Real-time, multi-source |
| Cross-platform check | ❌ | ✅ Reddit + Airbnb + Square Yards |
| Community scam reports | ❌ | ✅ Wire → Reddit |
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
| `WIRE` | A confirmed Anakin Wire pre-built action was found and run |
| `SCRAPER` | Anakin Universal Scraper fetched the page directly |
| `WEB SEARCH` | Anakin Search API queried the open web |
| `GEMINI VISION` | Gemini compared two photo sets directly |
| `UNAVAILABLE` | The check could not be run — real reason shown |

This matters for judges: *"How do we know it's not just a slide?"* — every card in the UI is the answer.

---

## 🚀 Setup & Local Development

```bash
git clone https://github.com/Aasritha6/leaseorleave
cd leaseorleave

cp .env.example .env.local
# Add your keys:
# GEMINI_API_KEY=   → https://aistudio.google.com/apikey
# ANAKIN_API_KEY=   → https://anakin.io/signup?redirect=/wire

npm install
npm run dev
```

Open **http://localhost:3000**

### Before your demo — verify what Wire actions your account can run:

```bash
curl "https://api.anakin.io/v1/wire/search?catalog=reddit" \
  -H "X-API-Key: $ANAKIN_API_KEY"

curl "https://api.anakin.io/v1/wire/search?catalog=squareyards" \
  -H "X-API-Key: $ANAKIN_API_KEY"

curl "https://api.anakin.io/v1/wire/search?catalog=airbnb" \
  -H "X-API-Key: $ANAKIN_API_KEY"
```

---

## 📁 Project Structure

```
leaseorleave/
├── app/
│   ├── page.tsx              # Premium dark UI — input + streaming evidence + verdict
│   ├── layout.tsx            # Fonts, SEO metadata, Open Graph
│   ├── globals.css           # Design system — glassmorphism, animations, tokens
│   └── api/verify/route.ts   # SSE endpoint → calls orchestrator
├── lib/
│   ├── orchestrator.ts       # Full pipeline — 7 steps, never fakes a skipped check
│   ├── gemini.ts             # All LLM calls — parse, verdict, photo compare
│   ├── anakin.ts             # Universal Scraper + Search API
│   ├── wire.ts               # Dynamic Wire action discovery (Reddit/Airbnb/Square Yards)
│   └── types.ts              # Shared types — EvidenceSource, Verdict, StreamEvent
├── .env.example              # Key names + docs on where to get them
└── README.md
```

---

## 🔮 Future Roadmap

- 📱 **WhatsApp bot** — send a listing link, get a fraud verdict reply
- 🔔 **Phone number watchlist** — community-reported scammer numbers database
- 📸 **Full reverse image search** — when Anakin adds a Wire action for it
- 🌆 **Multi-city expansion** — Mumbai, Hyderabad, Pune, Chennai
- 📊 **Scam pattern analytics** — which areas, price ranges, and listing types get targeted most
- 🤝 **Platform partnerships** — integrate directly into NoBroker/MagicBricks listing pages

---

## 🏆 Hackathon Alignment

LeaseOrLeave directly addresses the core judging themes:

| Criteria | How LeaseOrLeave Delivers |
|---|---|
| **Idea Utility & Novelty** | No existing tool does real-time cross-platform rental fraud detection. The problem is massive, underserved, and deeply personal. |
| **Real-World Financial Impact** | Quantifiable: ₹15K–₹50K prevented per scam. At 2,000 scams/month in metros — ₹3–10 crore in fraud prevented monthly at scale. |
| **Technical Execution** | Parallel async pipeline across 5 real sources, SSE streaming for live UX, dynamic Wire action discovery (no hardcoded IDs), Gemini Vision for photo comparison. |
| **Honest Engineering** | Checks that can't be run are reported honestly, not faked. This is a feature — it's what makes the verdict trustworthy. |
| **Emotional Resonance** | Housing is primal. Everyone has a scam story or knows someone who does. The demo triggers immediate personal connection. |
| **Tool Synergy** | Gemini (only LLM) + Anakin Universal Scraper + Anakin Wire (Reddit/Airbnb/Square Yards) + Anakin Search — every tool in the stack is doing real work. |

---

## 👥 Target Users

- 🏠 **First-time flat-hunters** moving to a new city — most vulnerable to urgency scams
- 💼 **Migrant professionals** relocating for jobs — time pressure makes them easy targets
- 🌍 **NRIs renting remotely** — can't physically verify, completely dependent on digital trust
- 👨‍👩‍👧 **Families** moving into the rental market for the first time

---

*Built with Gemini AI + Anakin Wire · No fake checks · No placeholder data · Every verdict is real.*
