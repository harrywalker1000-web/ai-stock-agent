# AI Stock Agent — Build Status

**Project:** AI Hedge Fund Agent System
**Owner:** Harry Walker
**PRD:** See `PRD.md` for full specification
**Last updated:** 2026-03-28 (session 4 — forward-looking mandate implemented; first end-to-end pipeline run; GitHub Actions scheduled; all 11 agents live)
**Python:** 3.11.9 (venv at `venv/` — use `venv/bin/python` for all commands)
**Run any agent:** `cd` to project root, then `venv/bin/python -m agents.<agent_name>`
**Full pipeline:** `SKIP_PHASE_A=true venv/bin/python main.py`

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
| 16 | `dashboard/app.py` — Streamlit UI | ❌ Not started | User brainstorming first |

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

### HIGH PRIORITY — fix before or soon after Monday's first live run

1. **Decision rationale is too thin** — the Committee output says "dislocation vs peer valuation" without numbers. The dashboard must show actual figures: P/E vs peer median P/E, % below SMA200, exact mean_reversion_score, etc. The data exists in the JSON reports but isn't surfaced in the Committee's narrative. When the dashboard is built, every decision must have a full data card with real numbers. The Committee's `investment_thesis` text should also cite the key number (e.g. "trading at P/E 14x vs sector median 22x — 36% discount").

2. **Conviction scores are too round** — everything comes out as multiples of 5 (60, 65, 70, 75). Real financial models don't round like this. The LLM needs to be told explicitly to output non-rounded convictions that reflect the actual score spread (e.g. if composite is 67.3, conviction should reflect that). The Committee prompt should use the raw composite score as a floor/anchor for conviction, not as decorative context.

3. **Candidate pool too small** — the pipeline is only reaching ~8–10 stocks for deep analysis. The target is minimum 50 stocks scored by all agents (Fundamental, Quant, Sentiment). Phase 1 agents (Institutional, News, Sector) are generating too few signals due to API rate limits (NewsAPI, Finnhub free tier hit during testing). In production daily runs this will be better (fresh quota), but the dislocation screen and universe expansion should push the candidate pool higher. The 50-stock minimum needs enforcing in code.

4. **No unit tests** — `tests/` directory is empty. Before going live, at minimum the critical calculation paths (mean_reversion_score, composite scoring, stop-loss logic) need test coverage.

### MEDIUM PRIORITY

5. **NewsAPI free tier (100 requests/day)** — hits limit if the pipeline is run multiple times in a day during development. In production (once daily) this is fine. Upgrade to paid tier if running >1x per day during dev.

6. **Finnhub rate limits** — same issue. 60 calls/minute on free tier. The pipeline spreads calls with `time.sleep(0.3–0.5)` in most agents but a burst of 44-ticker news scans can still hit limits.

7. **Quant Agent files >500 lines** — CLAUDE.md asks files under 500 lines. After session 4 additions the quant agent is ~800 lines. Acceptable for now; refactor when convenient.

8. **Dashboard not started** — user is brainstorming UI before implementation. Key data to surface: full agent score breakdown per ticker, actual numbers behind every decision, P&L tracking vs SPY, Committee rationale with citations.

---

## GitHub
- **Repo:** `https://github.com/harrywalker1000-web/ai-stock-agent` (private)
- **Branch:** `main`
- **Last commit:** `9d99390` — forward-looking mandate (session 4)
- **Actions secrets configured:** OPENAI_API_KEY, ALPACA_API_KEY, ALPACA_SECRET_KEY, ALPACA_BASE_URL, ALPHA_VANTAGE_API_KEY, FINNHUB_API_KEY, NEWS_API_KEY, FRED_API_KEY
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
│   ├── fundamental_analyst.py    ✅ Agent 6 — dislocation_opportunity, price_vs_intrinsic_value
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
├── dashboard/                    ❌ Not started (user brainstorming)
├── tests/                        ❌ Not started
└── .github/workflows/
    └── daily_run.yml             ✅ 9:15am EST Mon–Fri
```
