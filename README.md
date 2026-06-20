# LeaseOrLeave

A rental-fraud shield for Indian flat-hunters. Paste a listing URL, a broker's
phone number, or an address + rent — it runs real checks against Reddit scam
reports, Airbnb cross-listings, and the open web, then asks Gemini to weigh the
evidence into a verdict, before you send a token deposit.

**The only LLM used anywhere in this app is Gemini**, via `@google/genai`. No
other model provider is called at any point in the pipeline.

---

## What's actually real here (read this before you demo)

The original pitch deck for this idea assumed Wire (Anakin's pre-built action
layer) had dedicated functions like `nobroker.search_listings` and
`magicbricks.search`. **We checked the live Wire catalog and the screenshots you
sent — those don't exist.** Wire's Real-Estate category covers Zillow, Square
Yards, Spotahome, and ~25 other international sites, but not NoBroker or
MagicBricks. Rather than hardcode fake action IDs that would silently do
nothing (or pretend to), here's what this build actually does:

| Check | How it really works | Status |
|---|---|---|
| Read the listing itself (NoBroker, MagicBricks, Facebook, anywhere) | Anakin's generic **URL Scraper** (`POST /v1/url-scraper`) fetches the page and AI-extracts price/contact/photos. Works on *any* URL because it's not site-specific. | ✅ Real |
| Reddit scam-report search | Wire's Reddit catalog action, looked up dynamically via `GET /v1/wire/search?catalog=reddit` (see "Why dynamic discovery" below). | ✅ Real |
| Airbnb cross-check (is this "long-term rental" actually a short-stay listing?) | Wire's Airbnb catalog action, same dynamic lookup. | ✅ Real |
| Cross-platform / duplicate-listing check | Anakin's **Search API** (`POST /v1/search`) — a general web search for the phone number/address, not a dedicated "MagicBricks search". This is the honest substitute for what the pitch deck called "cross-platform verification". | ✅ Real, but weaker than a true multi-platform index |
| "Reverse image search" on stolen photos | There is no confirmed reverse-image-search action in Anakin's catalog. Instead, **when** we find a second candidate listing via the web search above, we download both photo sets and ask **Gemini's vision input** directly: "are these the same property?" This only fires if a candidate exists — it can't scan the whole internet for a photo. | ✅ Real, narrower scope than the pitch claimed |
| Broker LinkedIn check | Wire does have a LinkedIn action, but it requires **your own connected LinkedIn account** (`auth_mode: required`) and looks up a profile by URL — it cannot anonymously search for a stranger by name. | ⛔ Not buildable as described — reported to the user as unavailable, not faked |
| Truecaller / phone-reputation lookup | No such action found anywhere in Anakin's public catalog. | ⛔ Not buildable as described — reported to the user as unavailable, not faked |

The app surfaces this honesty in the product itself: every evidence card has a
`source` (`wire` / `scraper` / `search` / `gemini` / `unavailable`) and a
`status` (`ok` / `flagged` / `failed` / `skipped`). Checks we can't run show up
as "Not available" with the real reason, instead of disappearing or being
faked. **Do not delete those cards before your demo** — judges asking "how do
you know this is real and not just a slide" is exactly the question this
answers.

### Why dynamic discovery instead of hardcoded action IDs (`lib/wire.ts`)

Wire's catalog is something like 155 sites / 920 actions, and it changes. Rather
than guess `action_id` strings like `reddit.search_posts` (which might not be
the real ID, or might require auth, or might not exist on your account's plan),
`lib/wire.ts` calls `GET /v1/wire/search?catalog=reddit&q=search+posts` at
request time, takes whatever action Wire actually confirms exists, and only
then calls it. If your Anakin account has access to more catalogs than we could
see in your screenshots (e.g. if you have a paid tier with NoBroker access),
this will pick it up automatically — you don't need to change any code,
because nothing here is hardcoded to a guessed ID. If it can't find a match, it
returns `{ ran: false, reason: "..." }` and the orchestrator reports that
honestly as a skipped check.

**Before your demo**, it's worth running this once to see exactly what your
account can do:

```bash
curl "https://api.anakin.io/v1/wire/search?catalog=reddit" -H "X-API-Key: $ANAKIN_API_KEY"
curl "https://api.anakin.io/v1/wire/search?catalog=airbnb" -H "X-API-Key: $ANAKIN_API_KEY"
```

---

## Stack

- **Next.js 16** (App Router, Turbopack) + **TypeScript**, **Tailwind v4**
- **Gemini** (`@google/genai`) — input parsing, verdict synthesis (structured
  JSON via `responseSchema`), and vision-based photo comparison
- **Anakin** — URL Scraper (generic page scraping + AI JSON extraction), Search
  API (web search), and Wire (pre-built Reddit/Airbnb actions)
- Server-Sent Events for the "evidence cards stream in as each check finishes"
  UX from the original pitch deck

## Setup

```bash
npm install
cp .env.example .env.local
# fill in GEMINI_API_KEY (https://aistudio.google.com/apikey)
# and ANAKIN_API_KEY (https://anakin.io/signup?redirect=/wire)
npm run dev
```

Then open http://localhost:3000.

> This was built and build/type/lint-checked in a sandboxed environment without
> outbound access to `generativelanguage.googleapis.com` or `api.anakin.io`, so
> the live API calls have **not** been runtime-tested end to end. The code is
> written directly against the documented request/response shapes (verified
> against the installed `@google/genai` v2.9.0 type definitions and Anakin's
> public API docs as of June 2026) — but run it yourself with real keys before
> your demo, and watch the terminal for errors on the first call to each
> integration.

## Project structure

```
app/
  page.tsx              # input form + streaming evidence UI + verdict stamp
  api/verify/route.ts    # SSE endpoint, calls lib/orchestrator
lib/
  types.ts               # shared types, incl. the honest EvidenceSource union
  gemini.ts               # the only LLM calls in the app
  anakin.ts               # URL Scraper + Search API (real endpoints)
  wire.ts                 # Reddit/Airbnb actions via dynamic discovery
  orchestrator.ts          # runs every check, never fakes a skipped one
```

## Known gaps / where to spend your remaining hackathon time

1. **No NoBroker/MagicBricks-specific structured data.** The URL Scraper gets
   you raw page content + best-effort AI-extracted JSON, which is noisier than
   a dedicated API would be. If Anakin ships build requests for these sites
   (there's a "Request a site" flow in their dashboard), swap `urlScrape()`
   calls for the new Wire action once it exists — the dynamic-discovery design
   means you mostly won't need to change calling code.
2. **Photo duplication check is narrow.** It only compares the input listing
   against whatever single candidate the web search happens to surface — it's
   not scanning the whole web for stolen photos. Framing this honestly in your
   demo ("we compare against the most likely duplicate we found" rather than
   "we reverse-image-search the internet") will hold up better under questions.
3. **Identities/auth for LinkedIn.** If you want the LinkedIn check to work for
   real, you'd need the user to connect their own LinkedIn via Wire's Identities
   flow (`/v1/wire/login`, `GET /v1/wire/identities`) — out of scope for a demo,
   but worth a sentence in your pitch ("requires the renter to connect their own
   account, like a 2FA app would") rather than pretending it's automatic.
4. **Rate limits / credits.** Each Wire call costs credits and the free tier is
   limited (publicly listed as 500 credits with no card at signup, but verify
   current limits at anakin.io/pricing before your demo — don't burn your quota
   testing the night before).
