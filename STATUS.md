# AI Stock Agent — Build Status

**Project:** AI Hedge Fund Agent System
**Owner:** Harry Walker
**PRD:** See `PRD.md` for full specification
**Last updated:** 2026-03-30 (session 6 — FMP integration; SQLite crash fix; dashboard data pipeline; sync_reports step in CI)
**Python:** 3.11.9 (venv at `venv/` — use `venv/bin/python` for all commands)
**Run any agent:** `cd` to project root, then `venv/bin/python -m agents.<agent_name>`
**Full pipeline:** `SKIP_PHASE_A=true venv/bin/python main.py`

---

## Session 6 — What Was Done (2026-03-30)

### FMP (Financial Modeling Prep) integration
- **`utils/data_fetcher.py`**: 6 new FMP helper functions — `fetch_fmp_income_statement`, `fetch_fmp_key_metrics`, `fetch_fmp_analyst_estimates`, `fetch_fmp_price_targets`, `fetch_fmp_upgrades_downgrades`, `fetch_fmp_institutional_holders`
- **`agents/fundamental_analyst.py`**: FMP added as a 4th data source alongside yfinance / Alpha Vantage / SEC EDGAR. `_fetch_fmp_metrics()` pulls income statement + key metrics + forward estimates. Cross-reference logic supplements missing ROIC/EV/EBITDA/margins from FMP when yfinance is null. FMP forward estimates used when Yahoo Finance estimates unavailable.
- **`agents/sentiment_agent.py`**: `_fetch_fmp_analyst_signals()` fetches recent analyst price targets + upgrade/downgrade counts. Upgrade momentum and avg FMP target injected into LLM prompt. Raw FMP data attached to output JSON.
- **`agents/institutional_agent.py`**: `_fetch_fmp_holders_for_tickers()` fetches current-quarter institutional ownership (no 45-day 13F lag). FMP data included in LLM prompt alongside 13F and insider data.

### SQLite crash fix (memory_agent.py)
- `.swarm/` directory not created in GitHub Actions (gitignored) → `sqlite3.OperationalError: unable to open database file` at pipeline end
- Fix: `SWARM_DB.parent.mkdir(parents=True, exist_ok=True)` at module load
- Fix: `_ensure_schema()` initialises all required tables on a fresh DB (CREATE TABLE IF NOT EXISTS) — needed whenever `.swarm/memory.db` doesn't exist

### Dashboard data pipeline wired
- **`scripts/sync_reports.py`**: copies 10 agent report JSON files + decision_log from `data/reports/` → `dashboard/data/reports/` — added in this session
- **`.github/workflows/daily_run.yml`**: added `python scripts/sync_reports.py` step after pipeline succeeds; `dashboard/data/reports/` now committed back to repo so Vercel picks up fresh data on every run
- **FMP_API_KEY** added as GitHub Actions secret

### Known improvements to make
- Institutional Agent should also track SEC 13D/13G activist filings (fast, same-day, real institutional conviction signal)
- Phase A should add News Agent in Lite mode (cheap, catches breaking catalysts on held positions)
- Conviction scores still too round (multiples of 5) — needs raw composite score as anchor
- No unit tests

---

## Build Progress

| Step | Item | Status | Notes |
|------|------|--------|-------|
| 1 | `requirements.txt` + venv install | ✅ Complete | 18 packages, Python 3.11 venv |
| 2 | `utils/logger.py` + `utils/data_fetcher.py` | ✅ Complete | Shared utilities for all agents |
| 3 | Agent 1 — Macro Agent | ✅ Complete | Tested live |
| 4 | Agent 2 — Sector Agent | ✅ Complete | Tested live |
| 5 | Agent 3 — Institutional Agent | ✅ Complete | Tested live |
| 6 | Agent 4 — News Agent | ✅ Complete | Tested live |
| 7 | Agent 5 — Candidate Generator | ✅ Complete | Dislocation screen added (session 4) |
| 8 | Agent 6 — Fundamental Analyst | ✅ Complete | `price_vs_intrinsic_value`, `dislocation_opportunity` added (session 4) |
| 9 | Agent 7 — Quant Agent | ✅ Complete | `mean_reversion_score`, `forward_bias`, `trade_type` added (session 4) |
| 10 | Agent 8 — Sentiment Agent | ✅ Complete | `contrarian_signal`, `sentiment_type` added (session 4) |
| 11 | Agent 9 — Memory Agent | ✅ Complete | SQLite + JSON mirrors confirmed |
| 12 | Agent 10 — Investment Committee | ✅ Complete | Scenario framework + self-challenge rule (session 4) |
| 13 | Agent 11 — Trade Executor | ✅ Complete | Paper-only, Alpaca connection verified |
| 14 | `main.py` + `portfolio_manager.py` | ✅ Complete | Full Phase A→B pipeline |
| 15 | `.github/workflows/daily_run.yml` | ✅ Complete | Fires 9:15am EST Mon–Fri; secrets configured |
| 16 | `dashboard/` — Next.js 14 website | ✅ Complete | 6 pages, auth, mock data fallback — live at dashboard-haz-capital.vercel.app |
| 17 | Institutional analyst framework | ✅ Complete | Full framework in fundamental_analyst.py; scoring/display split |

---

## Session 5 — What Was Done (2026-03-29)

### Dashboard website — fully built (Next.js 14)
- 6 pages: Home, Dashboard, Position (dynamic), Reports, Team, About
- Password auth via middleware cookie, mock data fallback on every API route
- Dashboard positions table: Ticker, Setup Type, Conviction, Expected ROI, P&L%, Entry Date
- Position page: full institutional analyst framework display — 14 sections including financial snapshot, peer comparables, valuation, market timing, analyst history, cap table, management, company overview, review timeline
- Build compiles clean: TypeScript + ESLint zero errors
- Vercel config added (`dashboard/vercel.json`). Deployment pending.

### Institutional Analyst Framework — data integrity split
- `fundamental_analyst.py` now runs TWO separate LLM calls per ticker:
  - **`_score_with_llm()`**: quantitative scoring only — all inputs verified live API data. Produces `fundamental_score`, `direction`, `dislocation_opportunity`. This is the ONLY output that influences Committee decisions.
  - **`_framework_with_llm()`**: display-only institutional framework — company info, management, market analysis use LLM training knowledge. Never influences scores or trades. Clearly labelled in `_data_sources` output field.
- `_fetch_peer_snapshot()` expanded: now fetches revenue, gross/operating/net margins, D/E ratio, revenue growth YoY per peer — all from yfinance (live data). Comparables table no longer uses LLM estimates.
- Added `t.revenue_estimate` and `t.earnings_estimate` to `_fetch_yf_metrics()` — real Yahoo Finance analyst consensus forward estimates now available as live data.
- `investment_committee.py`: after enter decisions, calls `memory.enrich_position_framework()` to store full analyst framework in `positions_log.json`.
- `memory_agent.py`: added `enrich_position_framework()` function.

---

## Session 4 — What Was Done (2026-03-28)

### Forward-Looking Mandate (all agents updated)

The system was backward-looking (pattern-following). Every agent and the Committee were updated to reason about where prices are **going**, not where they have been.

**Quant Agent:**
- Added `_compute_mean_reversion_score()`: scores 0–100 based on RSI oversold depth, % below SMA200, proximity to 52W low, selling volume exhaustion, Bollinger Band lower boundary, Stochastic oversold. High score = strong dislocation likely to bounce.
- Added `forward_bias` field: `mean_reversion_long` | `watch_for_reversal` | `momentum_continuation`
- Added `trade_type` field: `momentum` | `mean_reversion` | `dislocation`
- LLM prompt now asks: *"Where is this stock likely to be in 5–10 days?"* not *"Where has it been?"*

**Fundamental Agent:**
- Added `price_vs_intrinsic_value`: peer-relative % premium or discount (e.g. "-30% vs peer P/E median")
- Added `dislocation_opportunity`: true when price has disconnected from fundamental value vs peers AND business metrics are solid. Sector context mandatory — tech P/E vs industrial P/E benchmarked within sector only.

**Sentiment Agent:**
- Added `contrarian_signal`: true when analyst consensus still shows significant upside AND negative sentiment looks lagging rather than forward-looking
- Added `sentiment_type`: `leading` (pricing in future events) | `lagging` (reacting to past price moves). Lagging sentiment after a broad selloff has low predictive value — the system now distinguishes this.

**Candidate Generator:**
- Added `_fetch_dislocation_candidates()`: batches 1-month yfinance download for up to 150 S&P 500 members, surfaces any down >20% as `dislocation_screen` candidates (signal weight 1.5) even if they have zero Phase 1 signal coverage. These are mean-reversion candidates the old system would never have seen.

**Investment Committee:**
- Prompt rewritten with 4-scenario decision framework (Scenario A: momentum, B: dislocation long, C: dislocation short, D: skip). For each candidate the Committee must classify before deciding.
- Self-challenge rule: if all non-skip decisions are the same action type with similar conviction, the Committee must stop and re-examine `mean_reversion_score`, `dislocation_opportunity`, `contrarian_signal` before finalising.
- RISK-OFF no longer defaults to "short everything bearish." Committee must ask: *"Is this down because it deserves to be, or because everything is down?"*
- Forward-looking fields (mean_reversion_score, dislocation_opportunity, contrarian_signal) now passed in candidate blocks.

**Before/After comparison (same candidates, same data, same macro regime):**

| Before | After |
|---|---|
| MA enter_short, conviction 65 | UNH enter_long, conviction 70 |
| MS enter_short, conviction 65 | DG enter_long, conviction 70 |
| BA enter_short, conviction 60 | EL enter_long, conviction 75 |
| COIN enter_short, conviction 60 | CRM enter_long, conviction 70 |
| CRM enter_short, conviction 60 | MKC enter_long, conviction 70 |
| — | COIN enter_long, conviction 70 |

Dislocation screen found 7 S&P 500 stocks down >20% in last month — added DG, MKC, UNH to pipeline that were invisible to Phase 1 agents.

### Other fixes (session 4)
- Alpaca URL bug fixed: `.env` had `/v2` suffix causing double `/v2/v2/account` URL path. Removed the suffix.
- Alpaca paper account connection verified: $100,000 balance, orders accepted.
- Positions log cleared at session end — Monday's run starts clean.

---

## Known Issues & Pending Refinements

### HIGH PRIORITY

1. **Data sources for display fields** — the institutional analyst framework uses TWO LLM calls:
   - **Call 1 (scoring)** — uses ONLY live API data (yfinance/SEC EDGAR/Alpha Vantage). Produces `fundamental_score`, `direction`, `dislocation_opportunity`. **This is the only data that influences trades.**
   - **Call 2 (display)** — uses LLM training knowledge for narrative fields (company overview, management, market analysis, TAM, PEPs check). These are **display-only** and never feed into scoring or Committee decisions.
   - Fields that ARE live API in the display call: financial snapshot (historical), comparables table multiples (yfinance), ownership %, forward revenue/EPS (Yahoo Finance analyst consensus if available).
   - Fields that are LLM/stale: company HQ, management background, analyst target price, major holders by name, TAM figure, geography flag notes.
   - **TODO:** Eventually replace LLM narrative fields with verified data sources (SEC EDGAR filings for geography, OpenFIGI/Refinitiv for analyst targets, proxy filings for major holders).

2. **Analyst target prices** — `analyst_rating_history.avg_target_price` in the display framework is currently null (we don't have a live API for this). Yahoo Finance consensus EPS/Revenue ARE available via `t.revenue_estimate` / `t.earnings_estimate` and are used. Analyst price target requires a paid data source (Bloomberg, Refinitiv, or FactSet).

3. **Conviction scores are too round** — everything comes out as multiples of 5 (60, 65, 70, 75). The Committee prompt should use raw composite score as floor/anchor for conviction. Fix in next session.

4. **Candidate pool too small** — pipeline reaching ~8–10 stocks for deep analysis, target is 50+. Phase 1 API rate limits (NewsAPI, Finnhub free tier) constrain candidate generation. Better in production (once daily), but needs enforcing in code.

5. **No unit tests** — `tests/` directory is empty. Critical paths (mean_reversion_score, composite scoring, stop-loss logic) need coverage before live trading.

### MEDIUM PRIORITY

6. **NewsAPI / Finnhub free tier limits** — fine for once-daily production run. Hits limit if pipeline run multiple times per day during development.

7. **Quant Agent files >500 lines** — ~800 lines after session 4. Refactor when convenient.

8. **Vercel deployment pending** — `dashboard/vercel.json` configured. Still need to run `vercel --cwd dashboard` and add SITE_PASSWORD, OPENAI_API_KEY, GOOGLE_API_KEY to Vercel environment variables.

---

## Vercel (Dashboard)
- **Live URL:** `https://dashboard-haz-capital.vercel.app`
- **Project:** `haz-capital/dashboard`
- **Env vars set:** `SITE_PASSWORD`, `OPENAI_API_KEY`
- **Env vars pending:** `GOOGLE_API_KEY` (add manually — see command below)
- **⚠ Password issue:** SITE_PASSWORD on Vercel was set to a placeholder. Run this to fix:
  ```bash
  npx vercel env rm SITE_PASSWORD production --yes --cwd dashboard
  echo "YOUR_PASSWORD" | npx vercel env add SITE_PASSWORD production --cwd dashboard
  echo "YOUR_GOOGLE_API_KEY" | npx vercel env add GOOGLE_API_KEY production --cwd dashboard
  npx vercel --prod --cwd dashboard
  ```
- Note: `.vercel/` is gitignored. Project link persists in `dashboard/.vercel/project.json`.

---

## GitHub
- **Repo:** `https://github.com/harrywalker1000-web/ai-stock-agent` (private)
- **Branch:** `main`
- **Last commit:** `9d99390` — forward-looking mandate (session 4)
- **Actions secrets configured:** OPENAI_API_KEY, ALPACA_API_KEY, ALPACA_SECRET_KEY, ALPACA_BASE_URL, ALPHA_VANTAGE_API_KEY, FINNHUB_API_KEY, NEWS_API_KEY, FRED_API_KEY, FMP_API_KEY
- **Scheduled run:** `30 13 * * 1-5` (9:15am EST Mon–Fri) — next run: Monday 2026-03-31 at 9:15am EST
- **Manual trigger:** GitHub → Actions → "Daily Pipeline Run" → Run workflow → set `SKIP_PHASE_A=true` for first run

---

## Architectural Decisions

### Multi-Source Confidence Scoring
Every agent pre-computes signal confidence in Python before calling the LLM:
- 1 source = low | 2 = medium | 3+ = high
- Any source conflict → flagged, confidence capped at medium

### Forward-Looking Mandate (added session 4)
The system's primary goal is to identify where prices are going, not where they have been. See `PORTFOLIO_RULES.md` — Forward-Looking Mandate section for the full spec. Every agent now produces at least one forward-looking field.

### Portfolio Review Mode
Agents 5–8 accept `mode="portfolio_review"`. In this mode:
- Agent 5 bypasses all scoring and returns held tickers directly
- Agents 6, 7, 8 load entry thesis from `positions_log.json` and compare against today's data
- Committee produces hold/increase/decrease/exit decisions instead of enter/skip

### Alpaca Safety Rails
- Paper URL hardcoded in `trade_executor.py`
- Requires both `ALLOW_LIVE_TRADING=true` AND live URL set simultaneously to switch
- Hard 30% position cap in executor (above Committee's soft 20%)
- No trades in first/last 15 min of session
- Stop-losses are hard auto-execute triggers (scanned every run before new entries)

### Memory / Storage
- `.swarm/memory.db` — SQLite, namespaced `stock_agent_*` to avoid Claude-Flow conflicts
- `data/memory/positions_log.json` — open positions + entry thesis
- `data/memory/pattern_history.json` — signal combo win-rates (builds over time)
- `data/memory/decision_log.json` — last 100 Committee decisions (dashboard source)
- `data/trades/trade_log.csv` — every trade ever

### Inter-Agent Communication
Agents read each other's JSON files from `data/reports/`. No message bus. Simpler and fully debuggable.

---

## Environment Variables Required
```
OPENAI_API_KEY          — GPT-4o-mini
ALPACA_API_KEY          — Paper trading
ALPACA_SECRET_KEY       — Paper trading
ALPACA_BASE_URL         — https://paper-api.alpaca.markets  (no /v2 suffix)
ALPHA_VANTAGE_API_KEY   — Fundamental Analyst (25 calls/day free)
FINNHUB_API_KEY         — Free tier (rate limit: 60 calls/min)
NEWS_API_KEY            — Free tier (100 requests/day)
FRED_API_KEY            — Macro Agent
FMP_API_KEY             — Financial Modeling Prep (fundamental, sentiment, institutional)
REDDIT_CLIENT_ID        — Currently 'skip_for_now'
REDDIT_CLIENT_SECRET    — Currently placeholder
REDDIT_USER_AGENT       — ai-stock-agent/1.0
```

---

## File Structure
```
ai-stock-agent/
├── .env                          — API keys (never commit)
├── .swarm/memory.db              — SQLite memory DB (never modify directly)
├── CLAUDE.md                     — Project build rules
├── PRD.md                        — Full product spec (forward-looking mandate added session 4)
├── PORTFOLIO_RULES.md            — Portfolio philosophy (forward-looking mandate added session 4)
├── STATUS.md                     — This file
├── requirements.txt
├── main.py                       ✅ Daily entry point
├── venv/
│
├── agents/
│   ├── macro_agent.py            ✅ Agent 1
│   ├── sector_agent.py           ✅ Agent 2
│   ├── institutional_agent.py    ✅ Agent 3
│   ├── news_agent.py             ✅ Agent 4
│   ├── candidate_generator.py    ✅ Agent 5 — dislocation screen added
│   ├── fundamental_analyst.py    ✅ Agent 6 — scoring/display split; live comparables; Yahoo Finance fwd estimates
│   ├── quant_agent.py            ✅ Agent 7 — mean_reversion_score, forward_bias, trade_type
│   ├── sentiment_agent.py        ✅ Agent 8 — contrarian_signal, sentiment_type
│   ├── memory_agent.py           ✅ Agent 9
│   ├── investment_committee.py   ✅ Agent 10 — scenario framework, self-challenge rule
│   ├── trade_executor.py         ✅ Agent 11 — paper-only, Alpaca verified
│   └── portfolio_manager.py      ✅ Phase A→B orchestration
│
├── utils/
│   ├── logger.py                 ✅
│   └── data_fetcher.py           ✅
│
├── scripts/
│   └── build_universe.py         ✅ 950 stocks in universe.csv
│
├── data/
│   ├── universe.csv              ✅ 950 stocks
│   ├── candidates/               — Daily candidate snapshots
│   ├── memory/                   — positions_log, pattern_history, decision_log
│   ├── trades/                   — trade_log.csv
│   └── reports/                  — All agent JSON outputs
│
├── dashboard/                    ✅ Built (Next.js 14, 6 pages, auth, mock data fallback)
├── tests/                        ❌ Not started
└── .github/workflows/
    └── daily_run.yml             ✅ 9:15am EST Mon–Fri
```
