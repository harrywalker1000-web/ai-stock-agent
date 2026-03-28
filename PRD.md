# AI Hedge Fund Agent System — Product Requirements Document (PRD)

**Project Name:** AI-Stock-Agent  
**Owner:** Harry Walker  
**Version:** 1.0  
**Last Updated:** March 2026  
**Status:** Ready to build

---

## 1. Project Overview

This project is a fully autonomous, multi-agent AI investment research and trading system. It runs daily, analyses global financial markets using a coordinated team of 11 specialised AI agents, and automatically manages a live trading portfolio (starting at £50) via the Alpaca brokerage API. It also produces a Streamlit dashboard showing full investment memos, agent scores, and historical portfolio performance vs the S&P 500.

This is NOT a chatbot or a prompt-based stock picker. Every agent must gather real, live, up-to-date data from external APIs and data sources at runtime. No agent is permitted to rely solely on LLM training knowledge to make investment decisions. All analysis must be grounded in real financial data fetched fresh each time the system runs.

The system must be capable of identifying both long opportunities (stocks expected to rise) and short opportunities (stocks expected to fall), with full reasoning provided for each.

---

## 2. Core Objectives

1. Run automatically every weekday morning before market open (07:00 UTC)
2. Produce 3 fully reasoned investment opportunities (long or short) per day
3. Automatically execute trades via Alpaca API within the £50 portfolio
4. Learn from past decisions — track what worked, what failed, and why
5. Display everything on a Streamlit dashboard with full memos and performance tracking
6. Be cheap to run — target under $0.15 per daily run using GPT-4o-mini
7. Serve as an impressive, explainable portfolio project for finance interviews

---

## 3. Tech Stack

| Component | Tool | Notes |
|---|---|---|
| Language | Python 3.11 | Already installed |
| Agent Framework | CrewAI | Multi-agent orchestration |
| Orchestration Layer | Ruflo v3.5+ | Already installed and initialised |
| LLM | OpenAI GPT-4o-mini | Via API key in .env |
| Scheduler | GitHub Actions | Runs daily 07:00 UTC weekdays |
| Dashboard | Streamlit | Local + optionally deployed |
| Trading | Alpaca API | Paper trading first, then live |
| Memory | Ruflo HNSW + SQLite | Already initialised at .swarm/memory.db |
| Version Control | Git | Already initialised |
| Market Data | yfinance | Free, no API key needed |
| Financial Data | Alpha Vantage | Free tier, API key required |
| News & Sentiment | Finnhub | Free tier, API key required |
| News Supplementary | NewsAPI | Free tier, API key required |
| Reddit Sentiment | PRAW (Reddit API) | Free, API key required |
| Macro Data | FRED API | Free, API key required |
| Institutional Data | SEC EDGAR API | Free, no API key needed |
| Technical Analysis | ta (Python library) | Free |

---

## 4. Environment Variables Required

Store all of the following in the `.env` file. Never hardcode keys in source files.

```
OPENAI_API_KEY=your_key_here
ALPACA_API_KEY=your_key_here
ALPACA_SECRET_KEY=your_key_here
ALPACA_BASE_URL=https://paper-api.alpaca.markets  # switch to live when ready
ALPHA_VANTAGE_API_KEY=your_key_here
FINNHUB_API_KEY=your_key_here
NEWS_API_KEY=your_key_here
FRED_API_KEY=your_key_here
REDDIT_CLIENT_ID=your_key_here
REDDIT_CLIENT_SECRET=your_key_here
REDDIT_USER_AGENT=ai-stock-agent/1.0
```

---

## 5. Project Folder Structure

```
ai-stock-agent/
│
├── .claude/                  # Ruflo Claude Code config (do not modify)
├── .claude-flow/             # Ruflo runtime config (do not modify)
├── .swarm/                   # Ruflo memory database (do not modify)
├── .env                      # API keys (never commit to Git)
├── .mcp.json                 # MCP server config (do not modify)
├── CLAUDE.md                 # Ruflo guidance (do not modify)
├── PRD.md                    # This document
│
├── agents/
│   ├── __init__.py
│   ├── macro_agent.py        # Agent 1
│   ├── sector_agent.py       # Agent 2
│   ├── institutional_agent.py # Agent 3
│   ├── news_agent.py         # Agent 4
│   ├── candidate_generator.py # Agent 5
│   ├── fundamental_analyst.py # Agent 6
│   ├── quant_agent.py        # Agent 7
│   ├── sentiment_agent.py    # Agent 8
│   ├── memory_agent.py       # Agent 9
│   ├── committee_agent.py    # Agent 10
│   └── trade_executor.py     # Agent 11
│
├── data/
│   ├── candidates/           # Daily candidate lists (JSON)
│   ├── reports/              # Daily agent reports (JSON)
│   ├── trades/               # Trade log (CSV)
│   ├── performance/          # Historical performance vs S&P 500 (CSV)
│   └── memory/               # Supplementary memory files
│
├── dashboard/
│   ├── app.py                # Main Streamlit dashboard
│   ├── components/           # Dashboard UI components
│   └── assets/               # Static assets
│
├── utils/
│   ├── __init__.py
│   ├── data_fetcher.py       # Shared data fetching utilities
│   ├── memory_manager.py     # Ruflo memory read/write helpers
│   └── logger.py             # Logging setup
│
├── tests/
│   └── test_agents.py        # Unit tests per agent
│
├── main.py                   # Entry point — orchestrates full daily run
├── requirements.txt          # All Python dependencies
└── .github/
    └── workflows/
        └── daily_run.yml     # GitHub Actions scheduler
```

---

## 6. System Architecture & Agent Execution Flow

The system runs in 5 sequential phases. Within phases 1 and 3, agents run in parallel. Agents communicate via Ruflo's shared message bus — every agent's output is written to shared memory and readable by all subsequent agents.

```
PHASE 1 (Parallel) → PHASE 2 → PHASE 3 (Parallel) → PHASE 4 → PHASE 5
```

### Phase 1 — Context Gathering (all 4 run simultaneously)
- Macro Agent
- Sector Rotation Agent
- Institutional Tracker Agent
- News & Catalyst Agent

### Phase 2 — Candidate Generation
- Candidate Generator (reads all Phase 1 outputs, produces ~50 stock shortlist)

### Phase 3 — Deep Analysis (all 3 run simultaneously on the 50 candidates)
- Fundamental Analyst
- Quant Agent
- Sentiment Agent
- Memory Agent runs throughout all phases, feeding context into every agent

### Phase 4 — Decision
- Investment Committee (reads all Phase 3 outputs, debates, scores, selects top 3)

### Phase 5 — Action
- Trade Executor (places trades via Alpaca)
- Dashboard updated with today's memos and scores

---

## 7. Agent Specifications

### AGENT 1 — Macro Agent

**File:** `agents/macro_agent.py`  
**Phase:** 1 (runs in parallel with Agents 2, 3, 4)  
**Dependencies:** None — runs first with no inputs from other agents

**Role:**  
Sets the macroeconomic and geopolitical investment climate for the entire system. Every other agent reads this report before making decisions. The Macro Agent determines the market regime which influences how all downstream agents weight their signals.

**Responsibilities:**
- Fetch and analyse current interest rate environment (Fed Funds Rate, ECB rate, Bank of England rate)
- Assess inflation trajectory (CPI, PCE trends — rising, falling, stable)
- Evaluate GDP growth expectations (current quarter estimates vs prior)
- Interpret central bank language and forward guidance (hawkish vs dovish)
- Assess dollar strength (DXY index) and implications for different asset classes
- Analyse yield curve shape (normal, flat, inverted — inverted = recession warning)
- Monitor credit spreads (widening = risk-off, tightening = risk-on)
- Assess geopolitical risks: active conflicts, trade tariffs and sanctions, commodity supply disruptions caused by geopolitical events, election calendars and political risk, energy security concerns
- Map geopolitical events to market implications (e.g. Russia/Ukraine conflict → European energy prices → which energy stocks benefit)
- Classify overall market regime: RISK-ON, RISK-OFF, or NEUTRAL
- Identify which broad investment themes are currently favoured by the macro environment

**Output (JSON):**
```json
{
  "regime": "RISK-ON | RISK-OFF | NEUTRAL",
  "interest_rate_direction": "rising | falling | stable",
  "inflation_trend": "rising | falling | stable",
  "favoured_themes": ["AI infrastructure", "defence", "energy"],
  "avoid_themes": ["rate-sensitive real estate", "unprofitable growth"],
  "geopolitical_risks": ["US-China tariffs affecting semiconductors"],
  "macro_summary": "Full paragraph narrative for downstream agents",
  "confidence": 0-100
}
```

**Data Sources:**
- FRED API — Fed Funds Rate, CPI, PCE, GDP, yield curve data (all free)
- yfinance — DXY (dollar index), TLT (long bond), HYG (high yield credit spreads), VIX (fear index)
- Finnhub — macro news headlines
- NewsAPI — geopolitical news, central bank announcements

**Key Logic:**
- Never produce the same regime classification two days in a row without citing specific data changes
- Geopolitical assessment must map events to specific market implications — not just "tensions are rising" but "US tariffs on Chinese semiconductors benefit TSMC and Samsung, hurt fabless US chip designers dependent on TSMC"

---

### AGENT 2 — Sector Rotation Agent

**File:** `agents/sector_agent.py`  
**Phase:** 1 (runs in parallel with Agents 1, 3, 4)  
**Dependencies:** None — runs independently, but reads Macro Agent output if available via shared memory

**Role:**  
Identifies which industry sectors are gaining or losing momentum, informed by both price action and macro context. Tells the Candidate Generator where to focus its search.

**Responsibilities:**
- Fetch price performance of all 11 US sector ETFs over 1 week, 1 month, and 3 month periods
- Calculate relative strength of each sector vs the broader S&P 500
- Identify sectors with accelerating inflows vs outflows
- Cross-reference sector momentum with macro regime (e.g. if macro says rates falling, real estate and utilities should be re-rating — confirm or deny with actual ETF data)
- Identify emerging structural themes drawing capital regardless of macro (e.g. defence spending, nuclear energy, obesity drug market, AI infrastructure buildout, electrification)
- Flag sectors showing unusual volume or institutional accumulation patterns
- Rank all sectors from most to least favoured with explicit reasoning

**Sector ETFs to track:**
- XLK (Technology), XLF (Financials), XLE (Energy), XLP (Consumer Staples)
- XLV (Healthcare), XLI (Industrials), XLU (Utilities), XLRE (Real Estate)
- XLY (Consumer Discretionary), XLB (Materials), XLC (Communication Services)
- Also track thematic ETFs: ARKK, BOTZ, ICLN, ITA (defence), NLR (nuclear), XBI (biotech)

**Output (JSON):**
```json
{
  "top_sectors": ["XLK", "XLI", "XLE"],
  "avoid_sectors": ["XLRE", "XLU"],
  "emerging_themes": ["nuclear energy", "defence", "AI infrastructure"],
  "sector_rankings": [{"sector": "XLK", "score": 85, "reasoning": "..."}],
  "sector_summary": "Full paragraph narrative",
  "confidence": 0-100
}
```

**Data Sources:**
- yfinance — all sector ETF price and volume data (free)
- Finnhub — sector-level news flow (free tier)

---

### AGENT 3 — Institutional Tracker Agent

**File:** `agents/institutional_agent.py`  
**Phase:** 1 (runs in parallel with Agents 1, 2, 4)  
**Dependencies:** None

**Role:**  
Follows the smart money. Identifies what major institutional investors and analysts are buying, selling, and saying. The reasoning is simple — institutions have research teams, access to management, and proprietary data that retail does not. Following their positioning is a legitimate edge.

**Responsibilities:**
- Parse recent SEC 13F filings to identify new positions and increased holdings by major funds (BlackRock, Vanguard, Bridgewater, Pershing Square, ARK Invest, Tiger Global, etc.)
- Track analyst rating changes — upgrades, downgrades, initiations, price target increases/decreases
- Monitor insider transactions — CEO and director buying is a strong bullish signal, selling is contextual
- Track short interest changes as a proxy for institutional bearish positioning
- Flag stocks where multiple institutions are moving in the same direction simultaneously
- Flag stocks where a highly respected single institution has taken a significant new position

**Critical caveat the agent must always apply:**  
13F filings are quarterly and lag by up to 45 days. They show where institutions WERE, not necessarily where they ARE. The agent must weight this accordingly — recent analyst calls and insider transactions from the last 2 weeks carry more weight than 13F data when it comes to timing. 13F data is more useful for identifying structural long-term themes.

**Output (JSON):**
```json
{
  "institutional_buys": [
    {
      "ticker": "NVDA",
      "signal": "BlackRock increased position 40% in Q4 2025",
      "signal_type": "13F",
      "recency": "45 days ago",
      "weight": "medium"
    }
  ],
  "analyst_upgrades": [{"ticker": "AAPL", "from": "neutral", "to": "buy", "firm": "JPMorgan", "target": 240}],
  "insider_buys": [{"ticker": "PLTR", "insider": "CEO", "amount": "$2.1M", "date": "2026-03-20"}],
  "institutional_summary": "Full paragraph narrative",
  "confidence": 0-100
}
```

**Data Sources:**
- SEC EDGAR API — 13F filings (free, no key needed): `https://data.sec.gov/submissions/`
- Finnhub — insider transactions, analyst recommendations (free tier)
- Yahoo Finance via yfinance — analyst price targets, short interest data

---

### AGENT 4 — News & Catalyst Agent

**File:** `agents/news_agent.py`  
**Phase:** 1 (runs in parallel with Agents 1, 2, 3)  
**Dependencies:** None

**Role:**  
Scans the information environment for company-specific events and catalysts that could drive stock price movement. This is the agent that catches opportunities like the Novo Nordisk obesity drug story — something that would never surface from pure fundamental or quant analysis alone, but represents genuinely new information entering the market.

**Responsibilities:**
- Scan for earnings surprises (beats and misses) from the last 24-48 hours
- Identify upcoming earnings announcements in the next 5-10 trading days (pre-earnings positioning opportunity)
- Find FDA approvals, drug trial results, regulatory decisions
- Identify M&A rumours, confirmed deals, and failed deals
- Find contract wins, major partnership announcements, product launches
- Detect CEO changes, major executive departures, activist investor disclosures
- Monitor geopolitical events affecting specific companies (sanctions, trade policy changes)
- Track short squeeze candidates (high short interest + rising price + positive catalyst)
- Assess Reddit and social media for unusual retail attention on specific tickers

**Critical logic — freshness filter:**  
The agent must distinguish between FRESH catalysts (not yet priced in — opportunity) and STALE catalysts (already moved the stock — likely missed). A headline from this morning is very different from one from 3 weeks ago. Any catalyst older than 5 trading days must be flagged as potentially stale unless there is evidence the market has not yet fully reacted.

**Output (JSON):**
```json
{
  "fresh_catalysts": [
    {
      "ticker": "NVO",
      "catalyst": "FDA approval for new obesity drug formulation",
      "direction": "LONG",
      "freshness": "today",
      "priced_in_estimate": "partial",
      "source": "NewsAPI"
    }
  ],
  "upcoming_events": [{"ticker": "AAPL", "event": "earnings", "date": "2026-04-03"}],
  "stale_catalysts": [],
  "reddit_unusual": [{"ticker": "GME", "mention_spike": "3x normal volume", "sentiment": "bullish"}],
  "news_summary": "Full paragraph narrative",
  "confidence": 0-100
}
```

**Data Sources:**
- Finnhub — company news, earnings calendar (free tier)
- NewsAPI — broader financial and business news (free tier)
- yfinance — earnings calendar, company news
- PRAW (Reddit API) — r/stocks, r/investing, r/wallstreetbets mention tracking (free)

---

### AGENT 5 — Candidate Generator

**File:** `agents/candidate_generator.py`  
**Phase:** 2 (runs after all Phase 1 agents complete)  
**Dependencies:** Outputs from Agents 1, 2, 3, 4 + Memory Agent historical data

**Role:**  
Aggregates all Phase 1 intelligence and produces the shortlist of approximately 50 stocks that will proceed to deep analysis. This agent is NOT an analyst — it does not have opinions about individual stocks. It is a weighted voting system that surfaces stocks with the strongest multi-source signal convergence.

**Responsibilities:**
- Read all four Phase 1 agent outputs from shared Ruflo memory
- Apply a weighted scoring system to produce candidate scores:
  - Macro tailwind alignment: +1 point (does this stock benefit from current macro regime?)
  - Sector momentum: +1 point (is this stock in a top-ranked sector?)
  - Institutional signal: +2 points (weighted higher — smart money matters more)
  - Fresh catalyst: +2 points (weighted higher — new information is most actionable)
  - Analyst upgrade: +1 point
  - Insider buying: +1 point
- Any stock scoring 3+ points proceeds to Phase 3
- If fewer than 50 stocks score 3+, lower threshold to 2+ to fill the list
- If more than 60 stocks score 3+, take the top 50 by score

**Deduplication and freshness logic:**  
- Check Ruflo memory for stocks that appeared in the last 5 daily runs
- Apply a -1 point penalty for each recent appearance unless a new catalyst has emerged
- This prevents the system from recommending the same stocks every single day
- Stocks that appeared more than 5 days ago and were NOT traded reset their penalty

**Universe:**  
The agent screens against a pre-defined universe of approximately 1,500 US-listed stocks with market cap above $1B. This universe is stored in `data/universe.csv` and refreshed monthly. No penny stocks (below $5 share price). No stocks with average daily volume below $5M (liquidity requirement for the Alpaca executor).

**Output (JSON):**
```json
{
  "candidates": [
    {
      "ticker": "NVDA",
      "score": 6,
      "signals": ["sector_momentum", "institutional_buy", "analyst_upgrade", "macro_tailwind"],
      "direction_hint": "LONG",
      "freshness_penalty": 0
    }
  ],
  "total_candidates": 50,
  "generation_summary": "Brief explanation of today's screening logic"
}
```

**Data Sources:**
- Ruflo shared memory (Phase 1 outputs)
- `data/universe.csv` (pre-built stock universe file)

---

### AGENT 6 — Fundamental Analyst

**File:** `agents/fundamental_analyst.py`  
**Phase:** 3 (runs in parallel with Agents 7 and 8)  
**Dependencies:** Candidate list from Agent 5, Macro report from Agent 1

**Role:**  
Performs deep financial analysis on each of the 50 candidates. All analysis is RELATIVE — every metric is assessed against direct sector peers, not in isolation. A stock is never labelled cheap or expensive without reference to its peer group.

**Responsibilities:**

For every candidate, fetch and analyse:

**Valuation (always vs 3-5 direct peers):**
- P/E ratio — trailing and forward, vs peer average and vs stock's own 5-year historical range
- EV/EBITDA — better cross-sector comparison than P/E
- P/S ratio — essential for high-growth pre-profit companies
- Price/Free Cash Flow — how much you pay for actual cash generation
- PEG ratio — P/E divided by growth rate (accounts for growth premium)

**Growth:**
- Revenue growth rate YoY and QoQ — is it accelerating or decelerating?
- EPS growth rate — are earnings growing faster or slower than revenue?
- Analyst earnings revision trend — are estimates going up or down? (Very predictive)
- Revenue beat/miss history over last 4 quarters

**Profitability & Quality:**
- Gross margin and operating margin — absolute level and trend (expanding = good)
- Return on Equity (ROE) — how efficiently is management using shareholder capital?
- Return on Invested Capital (ROIC) — the single best measure of business quality
- Free cash flow generation vs reported net income (divergence = red flag)

**Balance Sheet:**
- Net debt / EBITDA — leverage ratio (above 4x = concern in rising rate environment)
- Current ratio — can they cover short-term obligations?
- Cash runway for unprofitable companies — how many quarters of cash remain?
- Debt maturity schedule — any large refinancing needs upcoming?

**Peer Comparison Logic (CRITICAL):**  
The agent must never score a stock as overvalued simply because it has a high P/E in isolation. It must:
1. Identify 3-5 direct competitors in the same sub-sector
2. Calculate the peer group average and median for each metric
3. Score the stock relative to peers (cheapest in group vs most expensive in group)
4. Apply a growth-adjusted comparison — a company growing at 3x the sector rate deserves a premium
5. Apply a quality-adjusted comparison — a company with ROIC 2x above peers deserves a premium

Example: A quantum computing stock with P/E 200 should NOT be automatically flagged as overvalued if all peers trade at P/E 180-250 and the sector has genuine structural growth tailwinds. Score it as slightly expensive vs peers, not uninvestable.

**Short candidate analysis:**  
For any stock flagged as a potential short, additionally look for:
- Deteriorating margins over 3+ consecutive quarters
- Revenue deceleration from high to low growth
- Valuation premium vs peers with no growth or quality justification
- Rising debt load with falling cash generation
- Accounting red flags: divergence between net income and free cash flow, unusual receivables growth

**Output (JSON per stock):**
```json
{
  "ticker": "NVDA",
  "fundamental_score": 78,
  "direction": "LONG",
  "valuation_vs_peers": "slight premium — justified by growth",
  "pe_ratio": 36.2,
  "pe_peer_average": 28.4,
  "revenue_growth_yoy": 0.22,
  "operating_margin": 0.31,
  "roic": 0.28,
  "net_debt_ebitda": -0.4,
  "peers_used": ["AMD", "INTC", "QCOM"],
  "key_strengths": ["dominant market position", "expanding margins"],
  "key_concerns": ["high valuation vs history"],
  "fundamental_summary": "Full paragraph analyst-style narrative"
}
```

**Data Sources:**
- yfinance — financial statements, income statement, balance sheet, cash flow (free)
- Alpha Vantage — detailed financials, earnings data (free tier)
- Finnhub — peer data, financial metrics (free tier)

---

### AGENT 7 — Quant Agent

**File:** `agents/quant_agent.py`  
**Phase:** 3 (runs in parallel with Agents 6 and 8)  
**Dependencies:** Candidate list from Agent 5, Macro report from Agent 1

**Role:**  
Performs pure data-driven technical and statistical analysis on all 50 candidates. No narratives, no opinions — only numbers and historically validated patterns. The Quant Agent is the most improved by the memory system over time as it builds a library of which signals actually preceded successful moves in which market conditions.

**Responsibilities:**

For every candidate, calculate and assess:

**Momentum:**
- 1-week, 1-month, 3-month, 6-month price returns
- Return vs sector ETF (relative strength — is it outperforming its sector?)
- Return vs S&P 500 (is it outperforming the market?)
- Whether momentum is accelerating or decelerating (rate of change of returns)

**Oscillators (oversold/overbought):**
- RSI (14-day) — below 30 = oversold signal, above 70 = overbought
- IMPORTANT: RSI must be interpreted in trend context. RSI 28 in a strong uptrend (mean reversion buy) is different from RSI 28 in a downtrend (falling knife). The agent must check 50-day and 200-day moving average slope to determine trend context.
- Stochastic oscillator — secondary confirmation of RSI signals
- MACD — direction and histogram trend

**Volume Analysis:**
- Today's volume vs 20-day average volume (ratio — above 2x = significant)
- Volume trend over last 10 days — accumulation (rising volume on up days) vs distribution (rising volume on down days)
- On-Balance Volume (OBV) — is volume confirming or diverging from price?

**Volatility:**
- Average True Range (ATR) — used for position sizing and stop-loss placement
- Bollinger Band position — is the stock outside normal range?
- Historical volatility vs implied volatility (if options data available)

**Price Structure:**
- Distance from 52-week high and 52-week low
- Key moving averages: 20-day, 50-day, 200-day — is price above or below?
- Golden cross / death cross — 50-day crossing 200-day (significant long-term signal)
- Gap analysis — has the stock gapped up or down significantly on news?
- Support and resistance levels (for dashboard display and stop-loss placement)

**Pattern learning from memory:**  
Before scoring, the Quant Agent must query Ruflo memory for: "What happened historically when this combination of signals appeared in this macro regime?" Weight current signals by their historical success rate from the memory database. If memory database is too new to have data, note this and apply neutral weighting.

**Output (JSON per stock):**
```json
{
  "ticker": "NVDA",
  "quant_score": 72,
  "direction": "LONG",
  "rsi": 58.3,
  "rsi_signal": "neutral — approaching overbought but in strong uptrend",
  "volume_ratio": 1.8,
  "momentum_1m": 0.12,
  "momentum_3m": 0.31,
  "above_200ma": true,
  "macd_signal": "bullish crossover",
  "atr": 8.4,
  "support_level": 165.0,
  "resistance_level": 195.0,
  "memory_pattern_match": "similar setup worked 68% of time in risk-on regime",
  "quant_summary": "Full paragraph technical narrative"
}
```

**Data Sources:**
- yfinance — full price and volume history (free)
- ta (Python technical analysis library) — all indicator calculations (free)
- Ruflo memory — historical pattern matching

---

### AGENT 8 — Sentiment Agent

**File:** `agents/sentiment_agent.py`  
**Phase:** 3 (runs in parallel with Agents 6 and 7)  
**Dependencies:** Candidate list from Agent 5, News report from Agent 4

**Role:**  
Reads the market's collective mood on each candidate. Measures how institutional analysts, retail investors, and the broader media feel about each stock — and applies contrarian logic where appropriate.

**Responsibilities:**

**Analyst Consensus:**
- Current consensus rating (strong buy / buy / hold / sell / strong sell)
- Number of analysts covering the stock
- Direction of recent rating changes (improving = bullish, deteriorating = bearish)
- Average price target vs current price (implied upside/downside)
- Price target revision trend — are targets going up or down over last 30 days?
- Earnings estimate revision trend (EPS estimates going up = very bullish signal)

**Retail Sentiment:**
- Reddit mention volume on r/stocks, r/investing, r/wallstreetbets over last 7 days vs 30-day average
- Reddit sentiment tone (positive/negative/neutral ratio from post titles and comments)
- CRITICAL CONTRARIAN LOGIC: Extremely high retail bullishness on a stock is often a SHORT signal, not a long signal. When everyone is already in, there is no one left to buy. The agent must flag "retail euphoria" as a warning, not a green light.

**News Sentiment:**
- Aggregate news sentiment score for the stock over last 7 days
- Ratio of positive to negative headlines
- Whether sentiment is improving or deteriorating week-over-week

**Short Interest:**
- Short interest as % of float — high short interest (above 15%) means either:
  a) A well-researched institutional bear thesis exists (bearish signal), OR
  b) A potential short squeeze if a catalyst emerges (bullish signal)
- The agent must determine which interpretation is more likely based on the broader context

**Output (JSON per stock):**
```json
{
  "ticker": "NVDA",
  "sentiment_score": 71,
  "direction": "LONG",
  "analyst_consensus": "buy",
  "analyst_target": 220.0,
  "implied_upside": 0.22,
  "target_revision_trend": "rising",
  "reddit_mention_ratio": 1.4,
  "reddit_sentiment": "moderately bullish",
  "retail_euphoria_warning": false,
  "news_sentiment": "positive",
  "short_interest_pct": 0.019,
  "short_interest_signal": "low — no squeeze or bear thesis concern",
  "sentiment_summary": "Full paragraph narrative"
}
```

**Data Sources:**
- Finnhub — analyst ratings, price targets, news sentiment (free tier)
- yfinance — short interest, analyst data
- PRAW — Reddit mention and sentiment data (free)
- NewsAPI — news sentiment (free tier)

---

### AGENT 9 — Memory Agent

**File:** `agents/memory_agent.py`  
**Phase:** Runs throughout ALL phases — not a sequential step but a continuous background service  
**Dependencies:** Ruflo memory database at `.swarm/memory.db`

**Role:**  
The institutional memory of the entire system. Records every decision made, every thesis proposed, and every outcome observed. Feeds historical context into every other agent to prevent repeating mistakes and to amplify successful patterns over time. This is what makes the system learn and improve.

**What it stores (all written to Ruflo memory database):**
- Every stock the committee has ever recommended (ticker, date, direction, reasoning)
- Every score from every analyst agent for every stock ever analysed
- The macro regime and sector context at the time of each recommendation
- What actually happened to the stock price after recommendation (tracked daily for 30 days)
- Whether the thesis played out (price moved as predicted), failed, or is still pending
- Which signal combinations preceded successful outcomes vs failures
- Individual agent accuracy scores — which analyst has been most predictive over time
- Market regime performance — which agents perform best in risk-on vs risk-off environments

**What it provides to other agents:**
- To Candidate Generator: "This stock appeared in the last 3 daily runs — apply freshness penalty"
- To Fundamental Analyst: "Last time you scored this stock highly, the main risk materialised — weight risks more heavily"
- To Quant Agent: "This RSI + volume pattern appeared 8 times in risk-on regimes and worked 75% of the time"
- To Committee: "This stock was recommended 2 weeks ago. Thesis: earnings catalyst. Price is flat. Has the catalyst failed to materialise?"
- To all agents: "Agent 7 (Quant) has been the most predictive analyst over the last 30 days in the current risk-on regime — weight its scores 15% higher"

**Weekly performance review:**  
Every Monday, the Memory Agent produces a written performance review stored in `data/performance/`:
- Trades made last week, outcome, P&L
- Which agents made the most accurate predictions
- Which signal types were most predictive
- Recommendations for system improvement (e.g. "Quant signals have been unreliable in high-volatility regimes — suggest reducing quant weight when VIX > 25")

**Data Sources:**
- Ruflo memory database exclusively (`.swarm/memory.db`)
- Alpaca API — for fetching actual post-trade price performance

---

### AGENT 10 — Investment Committee

**File:** `agents/committee_agent.py`  
**Phase:** 4 (runs after all Phase 3 agents complete)  
**Dependencies:** All outputs from Agents 1-9

**Role:**  
The final decision-maker. Reads every agent's scores and reasoning, identifies agreements and conflicts between analysts, resolves conflicts using dynamic weighting based on recent track records, and produces the 3 final investment memos with full reasoning.

**The debate process:**
1. For each of the 50 candidates, combine the three analyst scores into a composite score
2. Identify stocks where analysts AGREE strongly (all three score 70+) — high confidence picks
3. Identify stocks where analysts DISAGREE significantly (spread of 30+ points between agents) — these require explicit conflict resolution
4. For conflicts: determine which analyst's view is more relevant given the current macro regime and that analyst's recent track record from Memory Agent
5. Example conflict resolution: "Quant says oversold (bullish), Fundamental says overvalued (bearish), Sentiment says neutral. In current value rotation regime, Fundamental signal takes precedence. Quant oversold reading may reflect justified re-rating, not a buying opportunity."
6. Rank all 50 stocks by final composite score
7. Select top 3, ensuring diversification — avoid selecting 3 stocks from the same sector unless the case is overwhelming

**Dynamic weighting:**
- Default weights: Fundamental 35%, Quant 35%, Sentiment 30%
- Weights adjusted based on Memory Agent's recent accuracy data per regime
- Example: If in current risk-on regime Quant has been 80% accurate but Fundamental only 55%, shift to Fundamental 25%, Quant 45%, Sentiment 30%

**Position sizing:**
- Maximum single position: 40% of portfolio (£20 of the £50)
- Minimum single position: 15% of portfolio (£7.50)
- Size positions according to conviction score — higher score = larger position
- Always maintain enough cash for at least one more position (never fully invested)

**Stop-loss requirement:**
- Every position must have a stop-loss level specified
- Default: ATR × 2 below entry (from Quant Agent's ATR calculation)
- For high-conviction picks: ATR × 1.5
- For speculative picks: ATR × 2.5

**Output (JSON):**
```json
{
  "top_picks": [
    {
      "ticker": "NVDA",
      "direction": "LONG",
      "composite_score": 81,
      "position_size_pct": 0.35,
      "entry_price_approx": 180.0,
      "stop_loss": 166.0,
      "target_price": 210.0,
      "expected_return": 0.17,
      "time_horizon": "3-6 weeks",
      "investment_thesis": "Full investment memo paragraph",
      "key_catalysts": ["AI infrastructure spending cycle", "data centre GPU demand"],
      "key_risks": ["margin compression from competition", "China export restrictions"],
      "macro_alignment": "Strong — benefits from risk-on, AI theme favoured",
      "agent_scores": {"fundamental": 78, "quant": 72, "sentiment": 71},
      "conflict_notes": "Agents broadly agree — no major conflicts",
      "memory_context": "Similar setup 3 months ago returned +14% over 4 weeks"
    }
  ],
  "rejected_candidates": [
    {"ticker": "TSLA", "reason": "Sentiment euphoria warning — retail crowded long, short squeeze risk"}
  ],
  "portfolio_allocation": {"NVDA": 0.35, "NVO": 0.35, "DEO": 0.20, "cash": 0.10},
  "committee_narrative": "Full paragraph explaining today's overall market view and selections"
}
```

---

### AGENT 11 — Trade Executor

**File:** `agents/trade_executor.py`  
**Phase:** 5 (runs after Investment Committee output)  
**Dependencies:** Committee output (Agent 10), current portfolio state from Alpaca

**Role:**  
Translates the Investment Committee's recommendations into actual trades via the Alpaca brokerage API. Manages the £50 portfolio — opens new positions, closes positions when thesis completes or stop-loss is hit, and maintains the trade log.

**Responsibilities:**
- Connect to Alpaca API (paper trading mode initially, live when ready)
- Read current portfolio positions and cash balance
- Compare committee recommendations to current positions:
  - If a recommended stock is already held: review whether to add to position or hold
  - If a recommended stock is new: size and place the order
  - If a currently held stock is no longer in top 3: assess whether to exit
- Check stop-loss levels on all current positions against latest prices — exit any positions that have hit their stop
- Place market orders at market open (09:30 EST) for new positions
- Log every trade to `data/trades/trade_log.csv`
- Write trade details to Ruflo memory for performance tracking

**Hard risk rules (never bypass these):**
- Never invest more than 40% of total portfolio in a single position
- Always maintain minimum 10% cash buffer
- Never trade in the first 15 minutes of market open (09:30-09:45 EST) — high volatility
- Never trade in the last 15 minutes before market close (15:45-16:00 EST)
- If Alpaca API returns an error, log the error and do NOT retry automatically — alert instead
- If total portfolio drawdown exceeds 20% from starting value, halt all trading and alert

**Paper trading first:**  
The system must run in paper trading mode (Alpaca paper URL) until at least 20 full daily runs have completed and the Memory Agent has sufficient data to evaluate performance. Switch to live trading only after manual review of paper performance.

**Output:**
- Trade confirmation log entry
- Updated portfolio state JSON
- Ruflo memory entry recording the trade

**Data Sources:**
- Alpaca API — portfolio management and order execution
- yfinance — real-time price verification before order placement

---

## 8. Dashboard Specifications

**File:** `dashboard/app.py`  
**Framework:** Streamlit  
**Run command:** `streamlit run dashboard/app.py`

### Layout

**Header:**
- System name and today's date
- Portfolio value vs starting value (£50) with % change
- Performance vs S&P 500 since inception (line chart)

**Section 1 — Today's Picks (top of page)**
For each of the 3 daily picks, display a card containing:
- Company name, ticker, exchange
- LONG or SHORT badge
- Composite score out of 100 (colour coded: green 70+, amber 50-69, red below 50)
- Agent score breakdown (Fundamental / Quant / Sentiment) as a mini bar chart
- Investment thesis (full paragraph from committee)
- Key catalysts (bullet list)
- Key risks (bullet list)
- Entry price, stop-loss level, target price, expected return %
- Stock price chart (pulled live from yfinance — last 3 months of daily prices)
- Support and resistance levels overlaid on the chart (from Quant Agent)
- Analyst consensus and average price target
- Macro alignment note

**Section 2 — Portfolio State**
- Current open positions with entry price, current price, unrealised P&L
- Cash remaining
- Total portfolio value
- Risk exposure per position

**Section 3 — Historical Performance**
- Table of every past recommendation with: date, ticker, direction, entry price, exit price, return %, outcome (win/loss/pending), time held
- Performance vs S&P 500 over same holding periods
- Win rate, average return, best trade, worst trade
- Cumulative portfolio value chart

**Section 4 — Agent Performance**
- Which agent has been most accurate over time
- Signal type accuracy breakdown
- Memory Agent weekly report (most recent)

---

## 9. Scheduling — GitHub Actions

**File:** `.github/workflows/daily_run.yml`

The system runs automatically every weekday at 07:00 UTC (before US pre-market, before UK market open).

```yaml
name: Daily AI Stock Agent Run
on:
  schedule:
    - cron: '0 7 * * 1-5'
  workflow_dispatch:  # allow manual trigger
jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      - run: pip install -r requirements.txt
      - run: python main.py
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          ALPACA_API_KEY: ${{ secrets.ALPACA_API_KEY }}
          ALPACA_SECRET_KEY: ${{ secrets.ALPACA_SECRET_KEY }}
          ALPHA_VANTAGE_API_KEY: ${{ secrets.ALPHA_VANTAGE_API_KEY }}
          FINNHUB_API_KEY: ${{ secrets.FINNHUB_API_KEY }}
          NEWS_API_KEY: ${{ secrets.NEWS_API_KEY }}
          FRED_API_KEY: ${{ secrets.FRED_API_KEY }}
          REDDIT_CLIENT_ID: ${{ secrets.REDDIT_CLIENT_ID }}
          REDDIT_CLIENT_SECRET: ${{ secrets.REDDIT_CLIENT_SECRET }}
```

All API keys must be added as GitHub repository secrets (never in the yaml file itself).

---

## 10. Python Dependencies (requirements.txt)

```
crewai>=0.11.0
openai>=1.0.0
yfinance>=0.2.0
pandas>=2.0.0
numpy>=1.26.0
ta>=0.11.0
python-dotenv>=1.0.0
requests>=2.31.0
finnhub-python>=2.4.0
alpha-vantage>=2.3.0
newsapi-python>=0.2.7
praw>=7.7.0
fredapi>=0.5.0
alpaca-trade-api>=3.0.0
streamlit>=1.30.0
plotly>=5.18.0
sqlalchemy>=2.0.0
schedule>=1.2.0
```

---

## 11. Data Flow Summary

```
07:00 UTC — main.py triggers

Phase 1 (parallel, ~2 minutes):
  Macro Agent     → writes macro_report.json to Ruflo memory
  Sector Agent    → writes sector_report.json to Ruflo memory
  Institutional   → writes institutional_report.json to Ruflo memory
  News Agent      → writes news_report.json to Ruflo memory

Phase 2 (~1 minute):
  Candidate Gen   → reads all 4 reports from memory
                  → writes candidates.json (50 stocks) to Ruflo memory

Phase 3 (parallel, ~3 minutes):
  Fundamental     → reads candidates + macro report
                  → writes fundamental_scores.json to Ruflo memory
  Quant           → reads candidates + macro report
                  → writes quant_scores.json to Ruflo memory
  Sentiment       → reads candidates + news report
                  → writes sentiment_scores.json to Ruflo memory
  Memory Agent    → feeds context into all 3 agents throughout

Phase 4 (~2 minutes):
  Committee       → reads all agent scores from memory
                  → debates, resolves conflicts, selects top 3
                  → writes committee_output.json to Ruflo memory
                  → writes investment memos to data/reports/

Phase 5 (~1 minute):
  Trade Executor  → reads committee output
                  → checks current Alpaca positions
                  → places orders
                  → logs trades
                  → updates dashboard data

Dashboard updates automatically from data/ files.

Total runtime target: under 10 minutes
Total API cost target: under $0.15 per run
```

---

## 12. Build Order for Claude Code

Build the system in this exact order. Do not skip ahead. Each step must be tested before moving to the next.

1. **Setup** — Create `requirements.txt`, install all dependencies, verify all API keys work
2. **Utils** — Build `utils/data_fetcher.py` (shared data fetching functions) and `utils/logger.py`
3. **Agent 1** — `agents/macro_agent.py` — test independently, verify it produces valid JSON output
4. **Agent 2** — `agents/sector_agent.py` — test independently
5. **Agent 3** — `agents/institutional_agent.py` — test independently
6. **Agent 4** — `agents/news_agent.py` — test independently
7. **Agent 5** — `agents/candidate_generator.py` — test with mock Phase 1 outputs first
8. **Agent 6** — `agents/fundamental_analyst.py` — test on a single stock first (e.g. AAPL)
9. **Agent 7** — `agents/quant_agent.py` — test on a single stock first
10. **Agent 8** — `agents/sentiment_agent.py` — test on a single stock first
11. **Agent 9** — `agents/memory_agent.py` — test read/write to Ruflo memory
12. **Agent 10** — `agents/committee_agent.py` — test with mock analyst outputs
13. **Agent 11** — `agents/trade_executor.py` — test in Alpaca PAPER mode only
14. **Integration** — `main.py` — wire all agents together, run full pipeline end-to-end
15. **Dashboard** — `dashboard/app.py` — build Streamlit UI reading from data/ files
16. **Scheduling** — `.github/workflows/daily_run.yml` — set up GitHub Actions

---

## 13. Constraints & Hard Rules

- **Never hardcode API keys** — always load from .env using python-dotenv
- **Never trust LLM knowledge for financial data** — always fetch real data from APIs
- **Always run in Alpaca paper mode** until 20+ days of tracked performance exists
- **Never bypass stop-losses** — the trade executor must respect them unconditionally
- **Never trade the same stock twice on the same day**
- **Keep GPT-4o-mini as the LLM** — do not switch to GPT-4o unless a specific agent genuinely requires it (cost control)
- **All agent outputs must be valid JSON** — no free-form text responses from agents
- **Log everything** — every API call, every agent output, every trade, every error
- **Fail gracefully** — if any single agent fails, the system should continue with reduced confidence rather than crashing entirely
- **The .claude, .claude-flow, .swarm, CLAUDE.md, and .mcp.json files must never be modified or deleted** — they are Ruflo system files

---

## 14. Interview Talking Points

This project demonstrates:
- **Multi-agent AI architecture** — 11 specialised agents with defined roles, parallel execution, and inter-agent communication via shared memory
- **Real financial data pipelines** — 8+ live data sources integrated via APIs
- **Machine learning feedback loops** — system learns from past decisions and improves signal weighting over time
- **Autonomous execution** — end-to-end from data collection to trade placement with no human intervention required
- **Risk management** — stop-losses, position sizing, portfolio constraints, and circuit breakers built into the architecture
- **Production engineering** — scheduled via GitHub Actions, environment variable management, structured logging, graceful failure handling
- **Investment framework** — multi-strategy approach covering growth momentum, value mispricing, event-driven, and institutional flow signals with peer-relative analysis throughout

---

*End of PRD — Version 1.0*