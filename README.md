# AI Hedge Fund — Autonomous Multi-Agent Investment System

An autonomous investment system built from scratch that runs a full investment committee in software. Every weekday it wakes up, reads the market, debates trades across 11 specialised AI agents, sizes positions using Kelly Criterion, and executes live orders — all without human intervention.

**Live dashboard → [dashboard-haz-capital.vercel.app](https://dashboard-haz-capital.vercel.app)**

---

## What it does

Each trading day the system runs a two-phase pipeline:

**Phase A — Portfolio review.** Every open position is re-evaluated by fresh market data. Agents look for thesis breaks, stop-loss breaches, earnings risk, and macro regime shifts. The committee decides: hold, add, reduce, or exit.

**Phase B — New opportunities.** The candidate generator screens the investable universe. Shortlisted stocks go through five specialist agents in parallel. The investment committee deliberates, scores, and decides whether to enter — with position sizing calculated via Kelly Criterion adjusted for volatility (ATR).

Orders are submitted to Alpaca Markets and confirmed. Results are committed to GitHub, synced to a live Next.js dashboard on Vercel, and a daily narrative report is generated.

---

## The 11 Agents

| Agent | Role |
|-------|------|
| **Candidate Generator** | Screens the universe for high-probability setups using momentum, mean-reversion, and dislocation signals |
| **Fundamental Analyst** | Cross-references Yahoo Finance, Alpha Vantage, and SEC EDGAR filings for revenue, EPS, margins, and valuation. Flags data conflicts >5% |
| **Quant Agent** | Technical analysis — RSI, ATR, trend, support/resistance, forward bias score |
| **Sentiment Agent** | Aggregates Reddit and news sentiment, scores market narrative for each ticker |
| **News Agent** | Reads breaking news and classifies catalysts (earnings beats, regulatory, macro shocks) by direction and conviction |
| **Macro Agent** | Determines portfolio-level regime (RISK-ON / RISK-OFF / NEUTRAL) and adjusts conviction weights accordingly |
| **Sector Agent** | Monitors sector rotation and relative strength to avoid concentration risk |
| **Institutional Agent** | Tracks 13F filings and large-holder positioning; identifies AI-institutional convergence signals |
| **Investment Committee** | The decision layer. Aggregates all agent scores (Fundamental 35%, Quant 35%, Sentiment 30%), runs portfolio construction, outputs position decisions with written rationale |
| **Portfolio Manager** | Orchestrates Phase A and Phase B, enforces risk constraints (leverage limits, concentration caps), reconciles with live Alpaca positions |
| **Trade Executor** | Submits, confirms, and logs orders. Handles market-closed deferrals, stop-loss placement, and position reconciliation |

A twelfth agent (**Memory Agent**) maintains a persistent SQLite ledger of every trade entry, exit, P&L, and agent score — feeding the attribution engine and post-mortem analysis.

---

## Data Sources

| Source | Used for |
|--------|----------|
| **Yahoo Finance** | Price history, earnings dates, analyst targets, basic fundamentals |
| **Alpha Vantage** | Supplementary fundamental data, cross-validation against Yahoo |
| **SEC EDGAR** | Revenue, EPS, and filing data — ground truth for fundamental conflicts |
| **NewsAPI** | Breaking news ingestion for the News Agent |
| **Reddit / PRAW** | Retail sentiment signal for the Sentiment Agent |
| **Alpaca Markets** | Live portfolio state, order execution, account equity history |
| **OpenAI GPT-4o-mini** | LLM reasoning layer powering all 11 agents |

---

## Position Sizing — Kelly Criterion

Position sizes are not fixed. Each position is sized using a Kelly-adjacent formula adjusted for ATR (Average True Range), conviction score, and portfolio-level leverage constraints:

```
size = (conviction / 100) × (1 / (1 + ATR%)) × max_position_cap
```

High conviction + low volatility stocks get larger allocations. The committee can also dynamically increase or decrease existing positions as conviction changes.

---

## Architecture

```
GitHub Actions (cron: weekdays 8:45am ET)
        │
        ▼
Portfolio Manager
  ├── Phase A: Review open positions
  │     ├── Macro Agent
  │     ├── News Agent
  │     ├── Quant Agent (Full mode)
  │     ├── Fundamental Agent (trigger-based)
  │     └── Investment Committee → hold / exit / resize
  │
  └── Phase B: Hunt new opportunities
        ├── Candidate Generator
        ├── Fundamental Analyst  ─┐
        ├── Quant Agent          ─┤ parallel
        ├── Sentiment Agent      ─┤
        ├── News Agent           ─┤
        ├── Sector Agent         ─┘
        └── Investment Committee → enter / skip
                │
                ▼
         Trade Executor → Alpaca Markets
                │
                ▼
         Memory Agent → SQLite + JSON reports
                │
                ▼
         sync_reports.py → GitHub commit → Vercel deploy
```

---

## Dashboard

The live dashboard (Next.js / Vercel) shows:

- Real-time portfolio positions with live P&L from Alpaca
- Per-position agent scorecards (Fundamental / Quant / Sentiment)
- Sector allocation and portfolio risk snapshot
- Daily committee reports and narrative
- Portfolio vs SPY benchmark chart
- Intraday alerts for stop-loss breaches and large moves
- Ad-hoc research reports for any ticker on demand

**→ [dashboard-haz-capital.vercel.app](https://dashboard-haz-capital.vercel.app)**

---

## Tech Stack

- **Python** — all agents, pipeline orchestration, risk logic
- **Next.js / TypeScript** — dashboard frontend
- **Vercel** — dashboard hosting with automatic deploys on each pipeline run
- **Alpaca Markets API** — paper/live brokerage
- **GitHub Actions** — daily pipeline scheduler + intraday monitor
- **SQLite** — persistent trade memory and attribution ledger

---

## Repository Structure

```
agents/          11 AI agents + memory agent
scripts/         Pipeline utilities: sync, backtest, attribution, benchmark
utils/           Alpaca client, data fetcher, risk snapshot
dashboard/       Next.js frontend (deployed to Vercel)
data/            Pipeline outputs, reports, trade memory
.github/         GitHub Actions workflows
```

---

## Status

Currently running on Alpaca paper trading. The system has been live since March 2026 with 184 commits tracking architecture decisions through to production deployment.
