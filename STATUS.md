# AI Stock Agent — Build Status

**Project:** AI Hedge Fund Agent System
**Owner:** Harry Walker
**PRD:** See `PRD.md` for full specification
**Last updated:** 2026-03-28 (session 3 — Agents 8-11 complete; next: portfolio_manager.py + main.py)
**Python:** 3.11.9 (venv at `venv/` — use `venv/bin/python` for all commands)
**Run any agent:** `cd` to project root, then `venv/bin/python -m agents.<agent_name>`

---

## Build Progress

| Step | Item | Status | Notes |
|------|------|--------|-------|
| 1 | `requirements.txt` + venv install | ✅ Complete | 18 packages, Python 3.11 venv |
| 2 | `utils/logger.py` + `utils/data_fetcher.py` | ✅ Complete | Shared utilities for all agents |
| 3 | Agent 1 — Macro Agent | ✅ Complete | Tested, live data confirmed |
| 4 | Agent 2 — Sector Agent | ✅ Complete | Tested, live data confirmed |
| 5 | Agent 3 — Institutional Agent | ✅ Complete | Tested, live data confirmed |
| 6 | Agent 4 — News Agent | ✅ Complete | Tested, live data confirmed |
| 7 | Agent 5 — Candidate Generator | ✅ Complete | Tested, live data confirmed |
| 8 | Agent 6 — Fundamental Analyst | ✅ Complete | Tested, 3-source cross-reference confirmed |
| 9 | Agent 7 — Quant Agent | ✅ Complete | Tested, live data confirmed |
| 10 | Agent 8 — Sentiment Agent | ✅ Complete | Tested, live data confirmed |
| 11 | Agent 9 — Memory Agent | ✅ Complete | Tested, SQLite + JSON mirrors confirmed |
| 12 | Agent 10 — Investment Committee | ✅ Complete | Tested live, 4 enters on 8 candidates |
| 13 | Agent 11 — Trade Executor | ✅ Complete | Paper-only mode, stop-loss check, CSV log |
| 14 | `main.py` — Full pipeline integration | ❌ Not started | |
| 15 | `dashboard/app.py` — Streamlit UI | ❌ Not started | |
| 16 | `.github/workflows/daily_run.yml` — Scheduling | ❌ Not started | |

---

## What Has Been Built

### `requirements.txt`
All 18 Python dependencies from PRD section 10. Key packages:
- `crewai>=0.11.0` — multi-agent orchestration (installed as 1.12.2)
- `openai>=1.0.0` — GPT-4o-mini API (installed as 2.30.0)
- `yfinance`, `ta` — market data and technical indicators
- `finnhub-python`, `alpha-vantage`, `newsapi-python`, `fredapi`, `praw` — data APIs
- `alpaca-trade-api` — brokerage API for trade execution
- `streamlit`, `plotly` — dashboard
- `python-dotenv` — API key management

**Important:** The project root has a `venv/` folder using Python 3.11.9. There is also an empty `.venv/` folder (ignore it). Always use `venv/bin/python` and `venv/bin/pip`.

---

### `utils/logger.py`
- Call `get_logger(__name__)` from any module
- Logs to console (INFO+) and to `logs/YYYY-MM-DD.log` (DEBUG+)
- Log directory created automatically on first use

### `utils/data_fetcher.py`
Shared data fetching library. All agents import from here — no agent makes raw API calls directly.

Functions available:
- `fetch_price_history(ticker, period, interval)` → DataFrame (yfinance)
- `fetch_price_history_multi(tickers, period, interval)` → DataFrame multi-ticker (yfinance)
- `fetch_ticker_info(ticker)` → dict of fundamentals/metadata (yfinance)
- `fetch_financials(ticker)` → {income_stmt, balance_sheet, cash_flow} (yfinance)
- `fetch_analyst_recommendations(ticker)` → DataFrame (yfinance)
- `fetch_earnings_calendar(ticker)` → DataFrame (yfinance)
- `fetch_fred_series(series_id, limit)` → pd.Series (FRED API)
- `fetch_fred_latest(series_id)` → float (FRED API)
- `fetch_finnhub_company_news(ticker, days_back)` → list of articles
- `fetch_finnhub_market_news(category)` → list of articles
- `fetch_finnhub_analyst_ratings(ticker)` → dict of buy/hold/sell counts
- `fetch_finnhub_price_target(ticker)` → **BLOCKED on free tier (403)** — do not use
- `fetch_finnhub_insider_transactions(ticker)` → dict
- `fetch_finnhub_earnings_calendar(from_date, to_date)` → dict
- `fetch_finnhub_basic_financials(ticker)` → dict
- `fetch_news_headlines(query, days_back, page_size)` → list of articles (NewsAPI)
- `fetch_news_top_headlines(category)` → list (NewsAPI)
- `fetch_sec_company_submissions(cik)` → dict (SEC EDGAR, free)
- `fetch_sec_company_facts(cik)` → dict (SEC EDGAR XBRL data, free)
- `search_sec_cik(company_name)` → CIK string or None
- `fetch_alpha_vantage_overview(ticker)` → dict
- `fetch_alpha_vantage_earnings(ticker)` → dict
- `fetch_reddit_mentions(ticker, subreddits, days_back)` → dict (PRAW — optional)

**Known issue in data_fetcher.py:** `fetch_finnhub_price_target` returns 403 on free Finnhub tier. The Institutional Agent was updated to use `fetch_ticker_info` (yfinance) for price targets instead. Do not attempt to use `fetch_finnhub_price_target` in any new agent.

---

### `agents/macro_agent.py` — Agent 1 ✅
**Phase:** 1 (runs in parallel with Agents 2, 3, 4)
**Run:** `venv/bin/python -m agents.macro_agent`
**Output:** `data/reports/macro_report.json`

**What it does:**
- Fetches live macro data: Fed Funds Rate, CPI, PCE, GDP, yield curve (FRED), VIX, DXY, TLT, HYG (yfinance), macro/geopolitical headlines (Finnhub + NewsAPI)
- Pre-computes multi-source confidence in Python before the LLM: checks if FRED, yfinance market signals, and news headlines all agree on market regime
- Sends structured data to GPT-4o-mini for regime classification
- Classifies market as RISK-ON / RISK-OFF / NEUTRAL with explicit reasoning

**Output JSON fields:**
```
regime, interest_rate_direction, inflation_trend, favoured_themes, avoid_themes,
geopolitical_risks, macro_summary, signal_confidence (level/sources/agreements/conflicts),
confidence (0-100), raw_data, generated_at
```

**Tested output (2026-03-27):** RISK-OFF, confidence 90%, 3-source agreement (FRED + yfinance + NewsAPI all confirm). VIX 31, rising CPI, Iran war geopolitical risk.

---

### `agents/sector_agent.py` — Agent 2 ✅
**Phase:** 1 (parallel)
**Run:** `venv/bin/python -m agents.sector_agent`
**Output:** `data/reports/sector_report.json`

**What it does:**
- Fetches 6-month price history for all 11 sector ETFs + 6 thematic ETFs + SPY benchmark (yfinance)
- Calculates 1W/1M/3M/6M returns, relative strength vs SPY, momentum acceleration (is 1M RS better than 3M RS?), volume ratios
- Fetches sector-specific news per ETF group from NewsAPI (e.g. energy news for XLE, healthcare for XLV)
- Pre-computes per-ETF confidence: price momentum + volume confirmation + news direction agreement
- Flags sectors where price and news conflict (e.g. price rising but negative sector news)
- Sends full data to GPT-4o-mini for ranking; only medium/high-confidence sectors can appear in `top_sectors`

**ETFs tracked:**
- Sectors: XLK, XLF, XLE, XLP, XLV, XLI, XLU, XLRE, XLY, XLB, XLC
- Thematic: ARKK, BOTZ, ICLN, ITA, NLR, XBI

**Tested output (2026-03-27):** Top sectors: XLE (Energy), XLU (Utilities), XLB (Materials), XLP (Consumer Staples). Avoid: XLY, XLF, XLK. Energy was dominant — +12.5% 1M, +39.6% 3M, +17.7% RS vs SPY.

---

### `agents/institutional_agent.py` — Agent 3 ✅
**Phase:** 1 (parallel)
**Run:** `venv/bin/python -m agents.institutional_agent`
**Output:** `data/reports/institutional_report.json`

**What it does:**
- Fetches latest 13F-HR filings from SEC EDGAR for 8 major funds (Berkshire, Bridgewater, ARK, Pershing Square, Tiger Global, Appaloosa, Third Point, Greenlight)
- Fetches analyst consensus and price targets from yfinance `.info` (NOT Finnhub — free tier blocks price targets)
- Fetches buy/hold/sell breakdowns from Finnhub `recommendation_trends` (this IS free)
- Fetches insider transactions from Finnhub for 30 tickers
- Pre-computes per-ticker confidence: 13F alone = low, + analyst = medium, + insider = high
- Flags conflicts between analyst bullish signal and net insider selling
- LLM instructed: single-source signals (13F alone) must not appear in `top_institutional_signals`

**Tracked funds (CIK numbers hardcoded):**
Berkshire (0001067983), Bridgewater (0001350694), ARK (0001697748), Pershing Square (0001336528), Tiger Global (0001167483), Appaloosa (0001006438), Third Point (0001040621), Greenlight (0001079114)

**Known limitation:** SEC 13F company names are full legal names (e.g. "APPLE INC"), not tickers. The 13F→ticker matching uses simple string search which is imperfect. A full solution would require a CUSIP→ticker lookup table. This is a known approximation.

**Tested output (2026-03-27):** 6 funds with 13F data, 47 analyst records, 283 insider transactions. Top analyst signals: ORCL (+77% upside), MSFT (+65%), META (+65%), NVDA (+60%), AVGO (+56%). Note: these large upsides reflect analyst targets set before recent market selloff — targets haven't been revised down yet.

---

### `agents/news_agent.py` — Agent 4 ✅
**Phase:** 1 (parallel)
**Run:** `venv/bin/python -m agents.news_agent`
**Output:** `data/reports/news_report.json`

**What it does:**
- Scans Finnhub + NewsAPI for company-specific catalysts across 44 tickers
- Classifies each headline by catalyst type (FDA/regulatory, earnings, M&A, contract, management_change, analyst_action, short_interest, regulatory_risk, corporate_action)
- Scores freshness: today=3, yesterday=2, 2-5 days=1, stale=0
- **Cross-source deduplication with confidence tracking:** if the same (ticker, catalyst_type) appears in both Finnhub AND NewsAPI independently, that's 2-source confirmation → medium confidence. Single source = low.
- Fetches upcoming earnings calendar (Finnhub + yfinance)
- Reddit integration: **OPTIONAL** — checks `REDDIT_CLIENT_ID` env var. If set to `skip_for_now` (or empty), skips Reddit gracefully without crashing. When Reddit is enabled, scans r/stocks, r/investing, r/wallstreetbets for mention volume per ticker.

**Reddit status:** Currently `REDDIT_CLIENT_ID=skip_for_now` in `.env`. To enable, replace with actual credentials from Reddit app settings.

**Tested output (2026-03-27):** 52 company catalysts found. Fresh signals: JNJ FDA approval for Darzalex self-administered cancer injectable (today, medium confidence — 2 sources), TSLA Tesla/SpaceX merger speculation (today, low confidence — 1 source).

---

## Architectural Decisions Made During Build

### 1. Multi-Source Confidence Scoring (applied to all 4 built agents)
Every agent pre-computes signal confidence in Python before calling the LLM:
- **1 source = low confidence** — included in output but flagged
- **2 sources = medium confidence**
- **3+ sources = high confidence**
- Any source conflict → flagged, confidence capped at medium

The Python layer is objective (counts sources, detects numeric conflicts). The LLM layer explains conflicts in plain language. The Investment Committee (Agent 10) will read each agent's `signal_confidence` fields to apply appropriate weighting.

**Rule: single-source low-confidence signals must never be the sole reason a stock makes the final top 3.**

### 6. Portfolio Review Mode (added session 3)
Agents 5, 6, and 7 all accept a `mode` parameter:
- `mode="new_opportunities"` (default) — normal Phase B pipeline
- `mode="portfolio_review"` — Phase A pipeline (reviewing held positions)

**Agent 5 (Candidate Generator):** In `portfolio_review` mode, accepts `held_tickers: list[str]` and bypasses all scoring, universe filter, freshness penalty, and threshold logic. Held tickers are passed directly as candidates.

**Agent 6 (Fundamental Analyst):** In `portfolio_review` mode, loads `data/memory/positions_log.json` for each held ticker to retrieve entry price, direction, entry thesis, and original signals. Adds a thesis comparison section to the LLM prompt, requesting `thesis_intact` (bool) and `thesis_drift_notes`. Computes and attaches `entry_price`, `current_price`, and `pnl_pct` to each result.

**Agent 7 (Quant Agent):** Same pattern — loads position context, adds entry conditions to prompt, requests `entry_vs_today` field (improved/deteriorated/unchanged). Computes and attaches `entry_price`, `current_price`, and `pnl_pct`.

**`data/memory/positions_log.json`:** Format: `{ticker: {entry_price, direction, entry_date, entry_thesis, signals[]}}`. Written by Trade Executor when a position is opened. Empty `{}` initially.

### 7. Investment Committee — Phase A behaviour
In portfolio_review mode, the Committee produces a `position_decisions[]` array (not a "top 3 picks" list). Each entry contains `ticker`, `action` (hold/increase/decrease/exit), `rationale`, `new_size_pct` (if changing), and optional `stop_loss`. Stop-losses are optional — Committee sets them at its discretion, typically encouraged when next review is >24 hours away. When set, the Executor treats them as hard auto-execute triggers.

### 8. Trade Executor — Phase A + Phase B execution paths
The Executor handles both:
- **Phase A exits/increases/decreases:** Updates `positions_log.json`, records rationale in memory
- **Phase B new entries:** Creates new entry in `positions_log.json` with full thesis
No hard 20% drawdown halt. Every decision gets a stored rationale. Soft 20% position cap — may exceed with written justification.

### 2. Finnhub Free Tier Limitations
The following Finnhub endpoints return 403 on the free tier and must NOT be used:
- `price_target` — replaced with `yfinance.Ticker.info` fields (`targetMeanPrice`, `targetHighPrice`, etc.)

The following ARE available on the free tier:
- `company_news`, `general_news`, `recommendation_trends`, `insider_transactions`, `earnings_calendar`, `company_basic_financials`

### 3. yfinance MultiIndex Columns
yfinance >=0.2.x returns MultiIndex DataFrame columns even for single-ticker downloads. When accessing `.iloc[-1]` on these, use `.squeeze()` first and `.item()` to extract scalars:
```python
closes = df["Close"].squeeze().dropna()
val = float(closes.iloc[-1].item() if hasattr(closes.iloc[-1], 'item') else closes.iloc[-1])
```
This pattern is already applied in `macro_agent.py` and `sector_agent.py`.

### 4. Agent Entry Points
All agents expose a `run()` function returning the full output dict. They also save their output to `data/reports/<agent_name>_report.json`. Each agent can be run standalone via `venv/bin/python -m agents.<name>` for testing.

### 5. Inter-Agent Communication
Agents communicate by reading each other's JSON report files from `data/reports/`. This is simpler and more debuggable than a message bus for this use case. The path `data/reports/` is created automatically by each agent if it doesn't exist.

---

## Next Step: Step 14 — `portfolio_manager.py` + `main.py`

**Files to create:**
- `agents/portfolio_manager.py` — orchestrates Phase A → Phase B each morning
- `main.py` — daily entry point that runs the full pipeline

**portfolio_manager.py must:**
1. Read open positions from Alpaca (or positions_log.json in paper mode)
2. Run Phase A (portfolio review) with Lite mode by default — passes held tickers to analyst team
3. Pass Phase A results to Committee → Executor for hold/increase/decrease/exit
4. Then run Phase B (new opportunity research) — full Phase 1+2+3 pipeline
5. Pass Phase B results to Committee → Executor for new entries
6. Call memory_agent.run() at end for daily consolidation

**main.py must:**
- Single entry point: `python main.py`
- Orchestrate full pipeline via portfolio_manager
- Log total runtime and estimated API cost
- Handle exceptions gracefully (one phase failing should not kill the other)

---

## Pending Agent Specs (Future Steps)

### Agent 6 — Fundamental Analyst — ✅ BUILT
3-source cross-reference (yfinance + Alpha Vantage + SEC EDGAR) complete. EDGAR acts as ground truth for revenue/EPS with an 80% sanity check to discard wrong XBRL concept matches. See [agents/fundamental_analyst.py](agents/fundamental_analyst.py).

### `agents/memory_agent.py` — Agent 9 ✅
**Role:** Dual — library (functions called by other agents) + daily consolidation run.
**Library functions:**
- `store_decision(date, ticker, action, rationale, conviction, signals, agent_scores, size_pct, stop_loss)` → writes to `.swarm/memory.db` namespace `stock_agent_decisions`
- `store_trade_entry(ticker, ...)` → writes to `stock_agent_trades` + mirrors to `positions_log.json`
- `store_trade_exit(ticker, ...)` → writes to `stock_agent_outcomes` + removes from `positions_log.json` + updates `pattern_history.json`
- `get_ticker_history(ticker, days_back)` → retrieves prior decisions for Committee context
- `get_open_positions()` → reads `positions_log.json`
**`run()`:** Reads all Phase 3 reports, stores consolidated per-ticker daily records in `stock_agent_daily` namespace. Called at end of each daily pipeline.
**DB namespaces used:** `stock_agent_decisions`, `stock_agent_trades`, `stock_agent_outcomes`, `stock_agent_daily` — all separate from Claude-Flow's own namespaces.

### `agents/investment_committee.py` — Agent 10 ✅
**Role:** Final decision-maker. Reads all 8 agent outputs, weights them, debates, produces `position_decisions[]`.
**Flow:**
1. Python pre-scoring: weighted composite (F:35%/Q:35%/S:30%, adjusted for regime — RISK-OFF shifts to F:40%/Q:30%/S:30%)
2. Pre-filter: only debate candidates with composite ≥ 45 (top 20)
3. One LLM batch call with all qualifying candidates → structured JSON array of decisions
4. One LLM narrative call → `committee_narrative`
5. All non-skip decisions stored via `memory_agent.store_decision()`
**Output:** `committee_report.json` with `position_decisions[]`, `portfolio_allocation{}`, `scorecards[]`
**Key rules enforced:** No fixed quota, soft 20% cap, optional stop-losses, price targets = re-evaluation not auto-sell
**Live test (2026-03-28):** 8 candidates, 4 entered (NVDA 10%, META 10%, BA 10%, NVO 10%) in RISK-OFF regime

### `agents/trade_executor.py` — Agent 11 ✅
**Role:** Translates Committee decisions into Alpaca paper trades.
**Safety rails:**
- Hardcoded paper URL (`https://paper-api.alpaca.markets`) — requires `ALLOW_LIVE_TRADING=true` in .env AND correct live URL to switch. Both must be set.
- Hard position cap at 30% (blocks Committee's requested size if exceeded)
- No trade in first/last 15 min of market session
- No retry on API errors — logs and alerts
- Stop-losses = hard auto-execute triggers (scanned before each run)
**Flow:** Stop-loss scan → Phase A exits/adjustments → Phase B new entries → refresh portfolio state
**Outputs:** `data/trades/trade_log.csv` (every trade, CSV appended), `data/reports/portfolio_state.json`
**Memory writes:** `store_trade_entry()` on new positions, `store_trade_exit()` on closes

### Architecture Decision: Portfolio Manager
Per PORTFOLIO_RULES.md (added this session): the Portfolio Manager is **not a 12th numbered agent**. It is an orchestration module (`agents/portfolio_manager.py`) that re-runs the existing analyst team on held positions each morning (Phase A), then passes results to the Investment Committee for hold/increase/decrease/exit decisions. See PORTFOLIO_RULES.md for full spec.

### Agent 9 — Memory Agent (Step 11)
The system uses `.swarm/memory.db` (SQLite) for persistent memory. This file was pre-created by the Ruflo/Claude-Flow setup. The Memory Agent must:
- Read/write to `.swarm/memory.db` using SQLAlchemy
- Track every recommendation, score, outcome, and trade
- Provide context to other agents (freshness penalties for Candidate Generator, pattern matching for Quant Agent, accuracy tracking for Committee)
- **The `.swarm/` directory must never be deleted or modified outside the Memory Agent**

### Agent 11 — Trade Executor (Step 13)
- **Paper trading only** until 20+ full daily runs are complete and Memory Agent has performance data
- Do NOT switch to live trading (`https://api.alpaca.markets`) without explicit user confirmation
- Position sizing per PORTFOLIO_RULES.md: soft 20% cap per position, target 10+ simultaneous positions, target 80%+ invested, never force trades to hit it
- No hard de-risking rules — Committee evaluates each position on its merits
- Every decision (enter/increase/decrease/hold/exit) must produce a written rationale stored in memory
- Hitting a price target = re-evaluation checkpoint, NOT automatic sell

---

## Environment Variables Required
All stored in `.env` (never committed to git):
```
OPENAI_API_KEY          — GPT-4o-mini (active)
ALPACA_API_KEY          — Paper trading (not yet tested)
ALPACA_SECRET_KEY       — Paper trading (not yet tested)
ALPACA_BASE_URL         — https://paper-api.alpaca.markets
ALPHA_VANTAGE_API_KEY   — Used by Fundamental Analyst (Agent 6)
FINNHUB_API_KEY         — Active, free tier
NEWS_API_KEY            — Active, free tier
FRED_API_KEY            — Active, free tier
REDDIT_CLIENT_ID        — Currently 'skip_for_now' — not yet configured
REDDIT_CLIENT_SECRET    — Currently placeholder
REDDIT_USER_AGENT       — ai-stock-agent/1.0
```

---

## File Structure (current state)
```
ai-stock-agent/
├── .env                          — API keys (never commit)
├── .swarm/memory.db              — Ruflo memory database (never modify directly)
├── .claude/, .claude-flow/       — Ruflo system files (never modify)
├── CLAUDE.md                     — Project build rules
├── PRD.md                        — Full product specification
├── PORTFOLIO_RULES.md            — Portfolio management philosophy (authoritative alongside PRD)
├── STATUS.md                     — This file
├── requirements.txt              — All 18 Python dependencies (+lxml, html5lib for universe builder)
├── venv/                         — Python 3.11 virtual environment
│
├── agents/
│   ├── __init__.py
│   ├── macro_agent.py            ✅ Agent 1 — complete
│   ├── sector_agent.py           ✅ Agent 2 — complete
│   ├── institutional_agent.py    ✅ Agent 3 — complete
│   ├── news_agent.py             ✅ Agent 4 — complete
│   ├── candidate_generator.py    ✅ Agent 5 — complete
│   ├── fundamental_analyst.py    ✅ Agent 6 — complete (3-source cross-ref)
│   ├── quant_agent.py            ✅ Agent 7 — complete (ta library + pattern learning)
│   ├── sentiment_agent.py        ✅ Agent 8 — complete (analyst consensus + news + Reddit optional)
│   ├── memory_agent.py           ✅ Agent 9 — complete (SQLite + JSON mirrors, library + run())
│   ├── investment_committee.py   ✅ Agent 10 — complete (weighted scorecard, LLM batch debate)
│   ├── trade_executor.py         ✅ Agent 11 — complete (paper-only, stop-loss check, CSV log)
│   └── portfolio_manager.py      ❌ Not yet built (Phase A → Phase B orchestration)
│
├── utils/
│   ├── __init__.py
│   ├── logger.py                 ✅ Complete
│   └── data_fetcher.py           ✅ Complete
│
├── scripts/
│   └── build_universe.py         ✅ Monthly universe refresh (run once, ~12 min)
│
├── data/
│   ├── universe.csv              ✅ 950 stocks (421 S&P 500 + 529 Russell 2000 additions)
│   ├── candidates/
│   │   └── candidates_YYYY-MM-DD.json  — Daily candidate snapshots (freshness source)
│   ├── memory/
│   │   ├── pattern_history.json  — Signal combo win-rates (Quant Agent reads; Memory Agent writes)
│   │   ├── positions_log.json    ✅ Open positions + entry thesis (Memory Agent writes; Agents 6-8 read)
│   │   └── decision_log.json     — Last 100 Committee decisions (dashboard reads)
│   ├── trades/
│   │   └── trade_log.csv         — Every trade ever executed (Trade Executor appends)
│   └── reports/
│       └── portfolio_state.json  — Current Alpaca portfolio snapshot (Trade Executor writes)
│       ├── macro_report.json
│       ├── sector_report.json
│       ├── institutional_report.json
│       ├── news_report.json
│       ├── candidates_report.json
│       ├── fundamental_report.json
│       └── quant_report.json
│
├── dashboard/                    ❌ Not yet built
├── tests/                        ❌ Not yet built
├── logs/                         — Auto-created on first run
└── .github/workflows/            ❌ Not yet built
```
