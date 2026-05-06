# WEBSITE_PRD.md — Haz Capital Management Dashboard

## Project Overview

Build a Next.js 14 website for Haz Capital Management — an autonomous AI hedge fund. The website is a private dashboard showing live portfolio performance, agent activity, and investment reasoning. It must look and feel like a premium institutional financial product, not a generic SaaS template or AI-generated website.

These are Harry's ideas and preferences but Claude has full creative and technical control. Where decisions aren't specified, make the boldest, most impressive design choice. Avoid generic AI aesthetics — no purple gradients, no floating brain icons, no clichéd fintech stock photo vibes.

---

## Repository Structure

Build inside the existing ai-stock-agent repo under a new `dashboard/` folder. This keeps the website co-located with the Python pipeline data it reads.

```
ai-stock-agent/
├── dashboard/          ← Next.js app lives here
│   ├── app/
│   ├── components/
│   ├── public/
│   ├── package.json
│   └── ...
├── agents/             ← existing Python agents
├── data/               ← JSON files the website reads
└── ...
```

---

## Deployment

Connect to Vercel from day one. The Vercel account is already set up at vercel.com/haz-capital (GitHub account: harrywalker1000-web). After setting up the Next.js project, initialise Vercel deployment and connect it to the GitHub repo so every push auto-deploys.

---

## Mock Data Strategy

The Python pipeline may not have run yet or positions may be empty. Every page must implement a mock data fallback — when real JSON files don't exist or are empty, display realistic placeholder data (sample positions, sample P&L, sample agent reports) so every page looks fully designed and functional. When real data exists, it automatically takes priority. Never show a blank or broken page.

---

## Authentication

Middleware-level password protection on all pages. `SITE_PASSWORD` is already set in `.env` — use `process.env.SITE_PASSWORD` without ever hardcoding or logging it. On first visit show a full-screen password prompt styled to match the site aesthetic (not a browser default). On success set a cookie valid for 7 days. After 7 days prompt again.

**Reminder:** Add `SITE_PASSWORD` to Vercel environment variables manually.

---

## Global Design System

**Aesthetic:** Palantir institutional meets Nexo fintech. Dark, serious, premium. Think Bloomberg Terminal meets modern fintech app. Not crypto-bro, not generic SaaS blue.

**Referenced inspiration:**
- Palantir investor relations site (dark, data-focused, serious typography)
- Nexo homepage (dark background, glowing colour gradients)

**Colour palette:**
- Background: `#080C10` or similar near-black
- Surface cards: glassmorphism — `rgba(255,255,255,0.04)` with `1px solid rgba(255,255,255,0.08)` border and `backdrop-filter: blur(12px)`
- Primary accent: Electric blue `#0EA5E9` / cold cyan `#06B6D4` — whichever feels more premium and institutional
- Text primary: `#E8EDF2`
- Text secondary: `#6B7280`
- Profit/positive: `#10B981`
- Loss/negative: `#EF4444`
- Warning/neutral: `#F59E0B`

**Typography:** Space Grotesk as primary — feels technical and modern. Contrasting display font (e.g. Syne or DM Serif Display) for hero headlines only.

**Animations:** Framer Motion throughout. Subtle, purposeful, precise — never playful or bouncy. Every clickable element has a hover state. Buttons scale slightly on hover (1.02–1.05). Cards lift with subtle shadow on hover. Page transitions smooth. Numbers animate on load with count-up effect.

**Navbar:** Sticky, present on all pages. Frosted glass background. Left: HCM logo — smart professional monogram + wordmark "Haz Capital Management". Right: navigation links — Home, Dashboard, Daily Reports, Meet the Team, About. Mobile: hamburger menu.

**Cards:** Glassmorphism throughout — dark frosted glass, subtle borders, consistent border radius. Everything feels like one cohesive product.

**Image generation:** Google Gemini API available via `GOOGLE_API_KEY` in `.env`. Use for agent avatars and visual assets where it improves quality.

---

## Pages

### Page 1 — Home (`/`)

**Purpose:** Pure aesthetic first impression. No data, no charts.

**Layout:** Single full-screen, no scroll needed.

**Hero visual:** Dark cinematic. Central hero combining AI/robotics with financial markets. Could be abstract 3D robot interacting with floating market data, circuit patterns forming a globe, geometric AI entity surrounded by ticker symbols. Claude decides what looks most impressive. Use CSS/Three.js or Gemini image generation.

**Background:** Subtle animated gradient orbs or particle network — slow, atmospheric.

**Headline:** Spirit of "AI that sees the market before you do" — smart, confident, institutional. Large display typography.

**Sub-headline:** One brief line, e.g. "A fully autonomous AI hedge fund. 11 agents. One portfolio."

**CTA buttons:** Two — "View Portfolio" (→ Dashboard) and "Meet the Team". Buttons scale + subtle glow on hover.

No footer, no scroll.

---

### Page 2 — Dashboard (`/dashboard`)

**Purpose:** Command centre. Everything about the portfolio at a glance.

**Top stats bar (full width, immediately visible):**
- Total P&L % — hero number, largest and most prominent
- Total P&L absolute
- Daily P&L % and absolute
- Total portfolio value
- Number of active positions
- % capital deployed vs cash remaining
- Pipeline run status — green tick (ran successfully today), red (failed), grey (not yet run)

**Main layout:**
- Top right: Portfolio value line graph over time. Clean glowing accent line. Time selectors: 1W, 1M, 3M, All.
- Centre/left: Active positions table. Columns: ticker, company name, long/short badge, entry price, current price, P&L%, P&L absolute, % of portfolio, sector. Each row clickable → navigates to `/position/[ticker]`.
- Analytics section (right sidebar or below):
  - Sector allocation donut chart
  - Long vs short breakdown
  - Large/mid/small cap split
  - Win rate over time
  - Best and worst performing positions
  - Agent accuracy scores — creative visualisation

Design notes: Numbers animate on load. Profit green, loss red. Glassmorphism cards throughout.

**Data source:** `/data/reports/pipeline_result.json` and `/data/memory/positions_log.json` via Next.js API routes. Mock data fallback.

---

### Page 3 — Individual Position (`/position/[ticker]`)

**Purpose:** Full deep-dive into one holding.

**Top section:**
- Company name, ticker, sector badge, long/short badge
- Key stats: entry price, current price, P&L%, P&L absolute, position size, % of portfolio, entry date

**Price chart (full width, prominent):**
- Interactive candlestick or line chart
- Dotted horizontal line at entry price with label
- Analyst consensus price target as shaded zone
- Key support/resistance levels as horizontal lines
- Volume bars below
- Time period selector

**Thesis section:**
- Original entry thesis — full text from Investment Committee
- Fund mandate checklist (asset class, listing, sector, market cap, liquidity, geography, setup type) — visual checkboxes/badges
- Setup checklist: growth drivers, market analysis, earnings quality, catalysts & risks, valuation methodology, expected return
- Agent scores: each of the 11 agents with individual score and one-line reasoning
- Conflicts highlighted prominently (e.g. "FUNDAMENTAL: BULLISH ←→ QUANT: BEARISH")

**Daily re-evaluation timeline:**
- Every morning this position was reviewed
- Date, decision (hold/increase/decrease/exit), one-line rationale
- Expandable to show full that-day reasoning

**Market context:**
- Recent relevant news headlines
- Analyst quotes and ratings
- Institutional holdings data

**Data source:** `positions_log.json`, agent report JSONs. Mock data fallback.

---

### Page 4 — Daily Reports (`/reports`)

**Purpose:** Archive of every morning's pipeline run and Investment Committee narrative.

**Report generation requirement:** Update `agents/investment_committee.py` to generate a ~250-word narrative report each morning, saved to `data/reports/daily_report_YYYY-MM-DD.json`. Covers: decisions made, reasoning, notable positions, overall portfolio sentiment and market view.

**Page layout:** Cards, calendar view, or creative format consistent with dark aesthetic.

**Each report entry shows:**
- Date
- Macro regime badge (RISK-ON / RISK-OFF / NEUTRAL)
- Quick stats: X new positions, Y exits, Z holds, daily P&L
- 1–2 sentence summary

**On click:** Expands (accordion, modal, or slide panel) to show:
- Full ~250-word narrative
- Each agent's key finding (one line per agent)
- All decisions with full rationale

**Data source:** `data/reports/daily_report_*.json`. Mock data fallback.

---

### Page 5 — Meet the Team (`/team`)

**Purpose:** Visual pipeline diagram + agent detail + chat interface.

**Top section — Animated pipeline diagram:**

Top-to-bottom flow:
- Level 1: Phase 1 agents side by side — Macro Analyst, Sector Analyst, Institutional Tracker, News & Catalyst Agent
- Level 2: Candidate Generator (centre, funnel shape suggesting filtering)
- Level 3: Phase 3 analysts side by side — Fundamental Analyst, Quant & Technical Analyst, Sentiment Agent
- Level 4: Investment Committee
- Level 5: Portfolio Manager + Trade Executor side by side

Animated connecting arrows between levels — subtly pulsing or flowing.

**Each agent node:**
- Unique robot/character avatar generated by Gemini (each reflects their role)
- Agent name and role title
- Small chat bubble icon (bottom right of node) — clicking opens chat panel on right side
- Clicking node scrolls down to that agent's detail card

**Chat panel:**
Slides in from right side. Agent name and avatar at top. Chat interface below. Powered by OpenAI API via `/api/chat`. System prompt contains that agent's latest report data and a personality prompt specific to that agent. Feedback toggle — off by default, toggle on writes to `.swarm/memory.db` user_feedback namespace. Clear label: "Notify Agent — when on, your message will be considered in tomorrow's run."

**Bottom section — Agent detail cards:**
One card per agent. Cards flip on click. Front: avatar, name, role, personality one-liner. Back: signal accuracy %, currently focused on, current market view, recent activity summary.

**Data source:** Agent report JSONs. Mock data fallback.

---

### Page 6 — About (`/about`)

**Purpose:** Professional explanation of the project.

**Sections:**
- What this is — brief professional description of Haz Capital Management
- How it was built — Harry Walker + Claude Code + AI agents. Framed as a feature, not a disclaimer.
- The philosophy — forward-looking mandate, multi-agent debate, learns from mistakes, never forces bad trades
- Tech stack — visual display: Python, GPT-4o-mini, yfinance, SEC EDGAR, Alpaca, Next.js, Vercel, GitHub Actions
- GitHub link — clean button (make repo public when ready)

**Tone:** Professional, confident. Think fund factsheet meets technical writeup.

**Design:** Same dark aesthetic. More breathing room — this page is meant to be read.

---

## Technical Requirements

**API routes:**
- `/api/portfolio` — reads `positions_log.json` and `pipeline_result.json`
- `/api/reports` — reads daily report JSON files
- `/api/agents` — reads agent report JSONs for team page stats
- `/api/chat` — handles chat, calls OpenAI API with agent context and personality prompt

**Environment variables needed in Vercel (add manually):**
- `OPENAI_API_KEY`
- `GOOGLE_API_KEY`
- `SITE_PASSWORD`

**Performance:** Static generation where possible, client-side fetching for live data.

**Mobile:** Fully responsive. Primary use is desktop but mobile must work.

---

## Build Order

1. **Project setup** — initialise Next.js 14 in `dashboard/`, install dependencies (Tailwind, Framer Motion, Recharts), set up design system, build navbar, implement password middleware
2. **Connect to Vercel** — initialise deployment, connect GitHub repo, confirm auto-deploy works
3. **Home page** — fully complete
4. **Dashboard page** — fully complete with mock data
5. **Individual position page** — fully complete with mock data
6. **Daily Reports page** + update Investment Committee agent to generate narrative reports
7. **Meet the Team page** — generate all 11 agent avatars via Gemini, build pipeline diagram, build chat interface
8. **About page**
9. **Final polish** — cross-page consistency check, animations, mobile responsiveness
10. **Git commit and push everything**
