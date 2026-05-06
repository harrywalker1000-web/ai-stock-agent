# CHANGES V2 PRD — Haz Capital Management
**Institutional Quality Improvements**
*Version 2.0 — April 2026*

---

## Overview

V2 focuses on closing the gap between "AI agents making trades" and "a real hedge fund operating with institutional discipline." The core themes are:

1. **Full portfolio awareness** — every relevant agent knows the book, the thesis, the conviction, and the risk profile before making any decision
2. **Benchmark accountability** — the system knows if it's beating SPY and why, and agents are aware of this when deliberating
3. **Factor attribution** — wins and losses are attributed to specific signals, agents, and market factors so the system learns what's actually working
4. **LLM-native backtesting and learning** — not a formula, not a simple lookup table. The agents read historical pipeline data, trade outcomes, and market context the same way a human analyst would review their track record
5. **Phase B Committee capital awareness** — the Committee knows exactly what it would have to give up to fund new positions before it votes

These improvements must not introduce research bias. Agents must never skip researching a stock because of current portfolio composition. Risk awareness informs the decision layer, not the research layer.

---

## Section 1 — Portfolio Risk Context Layer

### Problem
Agents currently operate in isolation. The Fundamental Analyst doesn't know the book is already 40% healthcare. The Committee sees conviction scores but not the portfolio-level implications of adding another correlated position. Nothing enforces awareness of concentration, correlation, or factor exposure — it's left to the LLM's general knowledge, which is not enough.

### Solution
Create a **Portfolio Risk Snapshot** — a structured JSON object computed at the start of every pipeline run by the Portfolio Manager, before any agent runs. This snapshot is injected into the prompt of every agent that makes decisions (Committee, Portfolio Construction, Trade Executor). Research agents (Fundamental, Quant, Sentiment) do NOT receive it — they must research every candidate on its merits, blind to current holdings.

### Portfolio Risk Snapshot — Contents

Computed fresh each run from `positions_log.json` + live Alpaca data + yfinance:

```json
{
  "as_of": "2026-04-13T09:45:00",
  "total_portfolio_value": 104250.00,
  "cash_available": 22400.00,
  "cash_pct": 21.5,
  "invested_pct": 78.5,
  "positions": [
    {
      "ticker": "EL",
      "direction": "LONG",
      "size_pct": 10.2,
      "entry_price": 67.80,
      "current_price": 71.20,
      "unrealised_pnl_pct": 5.01,
      "conviction_at_entry": 80,
      "days_held": 14,
      "thesis_summary": "Mean reversion dislocation play, RISK-OFF regime",
      "thesis_intact": true,
      "agent_scores": { "fundamental": 78, "quant": 71, "sentiment": 65 }
    }
  ],
  "sector_exposure": {
    "Consumer Staples": 30.5,
    "Healthcare": 20.1,
    "Technology": 0.0
  },
  "factor_exposure": {
    "beta_weighted_avg": 0.72,
    "long_short_ratio": "4L/0S",
    "mean_reversion_pct": 100,
    "momentum_pct": 0
  },
  "correlation_matrix": {
    "EL_LLY": 0.31,
    "EL_AMCR": 0.18,
    "LLY_AMCR": 0.22
  },
  "concentration_flags": [],
  "weakest_position": {
    "ticker": "MKC",
    "conviction": 65,
    "unrealised_pnl_pct": -1.2,
    "note": "Lowest conviction in book. Candidate for trim if capital needed."
  },
  "strongest_position": {
    "ticker": "EL",
    "conviction": 80,
    "unrealised_pnl_pct": 5.01
  }
}
```

### Correlation Matrix
- Computed using 90-day rolling returns from yfinance for all current holdings
- Any pair with correlation > 0.75 gets flagged in `concentration_flags` with a plain-English note
- Example flag: `"EL and LLY correlation is 0.81 over 90 days — effectively a concentrated consumer defensive bet"`
- This flag is for information only. The Committee reads it and decides. Nothing is blocked automatically.

### Who Gets the Risk Snapshot
| Agent | Receives Snapshot | Rationale |
|-------|------------------|-----------|
| Macro Agent | ❌ | Purely macro — doesn't need to know holdings |
| Sector Agent | ❌ | Sector research must be unbiased |
| Institutional Tracker | ❌ | Signal research must be unbiased |
| News Agent | ❌ | Signal research must be unbiased |
| Candidate Generator | ❌ | Must surface candidates on merit, not portfolio fit |
| Fundamental Analyst | ❌ | Research must be blind to current book |
| Quant Agent | ❌ | Research must be blind to current book |
| Sentiment Agent | ❌ | Research must be blind to current book |
| Memory Agent | ✅ | Needs full context to store meaningful records |
| Investment Committee | ✅ | Must deliberate with full portfolio awareness |
| Portfolio Construction | ✅ | Makes sizing and capital tradeoff decisions |
| Trade Executor | ✅ | Needs full context for reconciliation |

### Committee Prompt Addition
The Committee's deliberation prompt must include a section explicitly covering:
- Current sector and factor exposure
- Any correlation flags
- Which position is weakest (lowest conviction + worst P&L) and could be trimmed to fund new entries
- Available cash and what % of the portfolio a new position would represent
- The Committee must address concentration explicitly in its written rationale for every new BUY decision

---

## Section 2 — Phase B Committee Capital Awareness Fix

### Problem
The Phase B Committee currently sees `available_cash: 2%` and may preemptively skip high-conviction candidates assuming there's no capital. But Portfolio Construction (which runs after) has the ability to trim or exit weak positions to fund better ones. The Committee is making decisions without knowing what capital could be freed.

### Solution
The Portfolio Risk Snapshot (Section 1) already includes `weakest_position`. Extend the Committee prompt to explicitly state:

> "Available cash is currently 2%. However, [MKC] is your lowest-conviction position at 65 with -1.2% unrealised P&L. Portfolio Construction can trim or exit this to fund new entries if you identify something materially superior. Do not dismiss high-conviction candidates on capital grounds alone — flag them and let Portfolio Construction decide."

This is a prompt change to `investment_committee.py`, not a structural change. The Committee's job is conviction assessment. Portfolio Construction's job is capital allocation. Keep these separated but ensure the Committee has the information it needs.

---

## Section 3 — Benchmark Tracking vs SPY

### Problem
The system tracks P&L but has no way to know if it's beating the market or just riding beta. An 8% gain means nothing if SPY is up 12% in the same period. Agents have no awareness of relative performance when deliberating.

### Backend Implementation

Add a `benchmark_tracker.py` utility (not an agent) that runs at the end of every pipeline:

1. Fetch SPY daily close from yfinance for every day since first trade
2. Compute portfolio daily returns from `decision_log.json` trade history
3. Store in `data/memory/benchmark_history.json`:

```json
{
  "inception_date": "2026-03-30",
  "periods": {
    "1w": { "portfolio_return_pct": 2.1, "spy_return_pct": 1.4, "alpha": 0.7 },
    "1m": { "portfolio_return_pct": 4.3, "spy_return_pct": 3.8, "alpha": 0.5 },
    "6m": { "portfolio_return_pct": null, "spy_return_pct": null, "note": "insufficient_history" },
    "ytd": { "portfolio_return_pct": 4.3, "spy_return_pct": 3.8, "alpha": 0.5 }
  },
  "daily_series": [
    { "date": "2026-03-30", "portfolio_cumulative": 0.0, "spy_cumulative": 0.0 },
    { "date": "2026-03-31", "portfolio_cumulative": 1.2, "spy_cumulative": 0.8 }
  ]
}
```

4. Sync to `dashboard/data/benchmark_history.json` via `sync_reports.py`

### Committee Awareness
Inject a one-line benchmark summary into the Committee's daily briefing:
> "Current alpha vs SPY: +0.7% (1w), +0.5% (1m). The portfolio is outperforming. Note: insufficient history for 6m/YTD."

The Committee should reference this when assessing whether its current strategy is working.

### Website — Dashboard Addition
Add a **vs SPY** panel to the bottom of the dashboard page:

- Line chart: portfolio cumulative return vs SPY cumulative return, both indexed to 0 at inception
- Toggle: 1W / 1M / 6M / YTD (grey out periods with insufficient history)
- Display: alpha figure prominently (e.g. `+0.7% alpha` in green or red)
- Design: same dark glassmorphism style, small chart (~300px tall), sits below existing P&L stats
- Label: "Returns since inception (paper trading)" — honest about the paper trading context
- Use Recharts (already in the stack) — `ComposedChart` with two `Line` series

---

## Section 4 — Factor Attribution & Performance Analysis

### Problem
The system can't answer: "Are our wins coming from good stock picking, or did we just go long during a bull run?" Without factor attribution, agent weights could be calibrated against luck rather than skill. The Committee could keep backing a signal that looks good but is just correlated with market beta.

### What Factor Attribution Means Here
For each closed trade, attribute the P&L to one or more of:
- **Alpha** — return in excess of SPY over the same holding period
- **Beta contribution** — how much of the return was just the market going up
- **Sector contribution** — how much came from the sector ETF moving
- **Signal attribution** — which agent's signals (Fundamental, Quant, Sentiment, Institutional) were most predictive

### Backend — `attribution_engine.py`

A utility (not an agent) that runs when a trade closes:

1. On trade close, fetch:
   - SPY return over the holding period
   - Sector ETF return over the holding period (use sector from Fundamental report)
   - Individual agent scores at the time of entry (stored in `decision_log.json`)
   - Actual trade P&L

2. Compute:
   - `beta_contribution = spy_return * position_beta`
   - `sector_contribution = sector_etf_return - spy_return`
   - `stock_alpha = actual_return - spy_return`
   - `agent_signal_accuracy`: for each agent, was their score directionally correct? (high score + positive return = correct)

3. Store in `data/memory/attribution_log.json`:

```json
{
  "ticker": "EL",
  "entry_date": "2026-03-30",
  "exit_date": "2026-04-15",
  "holding_days": 16,
  "actual_return_pct": 5.01,
  "spy_return_same_period": 2.1,
  "sector_etf_return": 1.8,
  "stock_alpha": 2.91,
  "beta_contribution": 1.51,
  "sector_contribution": -0.3,
  "agent_scores_at_entry": {
    "fundamental": 78,
    "quant": 71,
    "sentiment": 65,
    "composite": 74
  },
  "agents_directionally_correct": {
    "fundamental": true,
    "quant": true,
    "sentiment": true
  },
  "setup_type": "mean_reversion",
  "macro_regime_at_entry": "RISK_OFF"
}
```

4. Aggregate statistics stored in `data/memory/agent_accuracy_summary.json`:

```json
{
  "as_of": "2026-04-15",
  "trades_analysed": 4,
  "by_agent": {
    "fundamental": { "directional_accuracy": 0.75, "avg_alpha_when_high_score": 2.1 },
    "quant": { "directional_accuracy": 0.50, "avg_alpha_when_high_score": 0.3 },
    "sentiment": { "directional_accuracy": 0.25, "avg_alpha_when_high_score": -0.8 }
  },
  "by_setup": {
    "mean_reversion": { "trades": 4, "avg_alpha": 1.8, "win_rate": 0.75 },
    "momentum": { "trades": 0 }
  },
  "by_macro_regime": {
    "RISK_OFF": { "trades": 4, "avg_alpha": 1.8, "win_rate": 0.75 },
    "RISK_ON": { "trades": 0 }
  },
  "beta_vs_alpha_split": {
    "pct_returns_from_alpha": 58,
    "pct_returns_from_beta": 42,
    "note": "Majority of returns are from stock selection, not market beta. Early positive signal."
  }
}
```

### Committee and Agent Awareness
The `agent_accuracy_summary.json` is injected into:
- The Investment Committee prompt — so the Committee knows which agents have been most predictive historically
- The Memory Agent — to update `agent_weights.json` not just on volume but on attribution-adjusted accuracy

The Committee prompt addition:
> "Historical signal accuracy (last N closed trades): Fundamental: 75% directional accuracy. Quant: 50%. Sentiment: 25%. Mean reversion setups: 75% win rate, avg +1.8% alpha. Do not over-index on any single agent's view — but be aware of these track records when weighing conflicting signals."

### Website — Dashboard Addition
Add a small **Signal Attribution** section (below vs SPY panel):
- Bar chart: agent directional accuracy % (Fundamental / Quant / Sentiment)
- Small stat: % of returns from alpha vs beta
- Breakdown by setup type (mean reversion / momentum / dislocation) — win rate and avg alpha per setup
- Only show when there are 3+ closed trades (show "Insufficient data" until then)

---

## Section 5 — LLM-Native Backtesting and Deep Learning

### Problem
The Memory Agent currently stores pattern history but the learning is shallow — it's essentially a win/loss counter. Real analysts review their past decisions deeply: what did they know, what did they miss, what did the market do, what would they do differently. The system needs this kind of reflective, qualitative learning baked in — not a formula.

### Philosophy
This is not a backtest in the quant sense (running a rule-based strategy over historical prices). The agents are LLMs — their "backtesting" is reading their own past reasoning, seeing what happened, and updating their priors. This is how human analysts learn. The infrastructure needs to support this.

### What Gets Stored (extend `decision_log.json`)

Every entry and exit must store the **full reasoning snapshot** at the time of decision:

```json
{
  "ticker": "EL",
  "action": "BUY",
  "date": "2026-03-30",
  "entry_price": 67.80,
  "conviction": 80,
  "macro_regime": "RISK_OFF",
  "full_committee_rationale": "...(full text)...",
  "agent_reports_snapshot": {
    "fundamental_summary": "...",
    "quant_summary": "...",
    "sentiment_summary": "..."
  },
  "key_thesis_points": [
    "EL down 62% from 52w high on macro pressure, not fundamental deterioration",
    "Revenue mix shifting back to US, less China exposure than feared",
    "RSI 28 — deeply oversold"
  ],
  "risks_noted_at_entry": [
    "China luxury slowdown could persist longer than modelled",
    "Management credibility issues post-CEO departure"
  ],
  "exit_date": "2026-04-15",
  "exit_price": 71.20,
  "exit_reason": "target_reached",
  "actual_return_pct": 5.01,
  "post_mortem": {
    "thesis_correct": true,
    "what_worked": "RSI reversion signal was accurate. Macro pressure eased faster than expected.",
    "what_was_missed": "China recovery catalyst came 2 weeks earlier than any agent modelled.",
    "lesson": "In RISK_OFF regimes, oversold consumer staples with strong US revenue mix revert faster. Quant RSI signal should be weighted higher in these setups."
  }
}
```

The `post_mortem` section is generated by the Memory Agent using an LLM call when a trade closes — it reads the full entry reasoning, the actual outcome, and the market context during the holding period, then writes a qualitative post-mortem in plain English.

### Historical Pipeline Replay (Backtesting)

Build `scripts/backtest_runner.py`:

1. Takes a date range as input (e.g. `--start 2025-01-01 --end 2025-12-31`)
2. For each trading day in range:
   - Fetches historical OHLCV data (yfinance — available for any past date)
   - Fetches historical macro data (FRED — fully historical)
   - Reconstructs what the Candidate Generator would have surfaced (based on available historical signals)
   - Runs Fundamental, Quant, and Sentiment agents on historical data
   - Runs Committee deliberation
   - Records hypothetical decisions
3. Compares hypothetical portfolio vs SPY over the same period
4. Generates a full attribution report

**Important constraint:** Historical news/sentiment data is limited (NewsAPI only goes back 30 days on free tier, Finnhub similar). The backtest will note where data gaps exist and flag those sections as "estimated." The LLM agents must be instructed to reason carefully about what they would have known at the time, not with hindsight.

**Output:** `data/backtests/backtest_{start}_{end}.json` with full hypothetical trade log, P&L vs SPY, and agent accuracy over the period.

### Agent Learning Prompt Enhancement

The Memory Agent currently writes to `pattern_history.json`. Extend this so that at the start of every pipeline run, each decision-making agent receives a **Learning Brief** — a short LLM-generated summary of relevant past decisions:

```
LEARNING BRIEF — as of 2026-04-13

Past decisions in similar conditions (RISK_OFF regime, mean reversion setups):
- 4 trades closed. Win rate: 75%. Avg alpha: +1.8%.
- Strongest signal: Fundamental Analyst high conviction + RSI < 30 → 100% win rate (3/3)
- Weakest signal: Sentiment Agent positive score in RISK_OFF → only 25% accuracy
- Most common miss: underestimating how long macro pressure persists (China exposure)
- Post-mortem insight (EL trade): "RSI reversion in RISK_OFF consumer staples is faster than modelled. Consider tightening entry criteria to RSI < 25 for higher confidence."

Recommendation: In today's RISK_OFF conditions, prioritise Fundamental + Quant signals. 
Apply scepticism to Sentiment scores. Flag China revenue exposure as elevated risk.
```

This brief is generated fresh each run by the Memory Agent using an LLM call over `attribution_log.json` + `decision_log.json`. It's injected into the Investment Committee prompt and the Fundamental Analyst prompt.

The agents are not following rules — they're reading their own history and reasoning from it, exactly as a human PM would review their trading journal before the morning meeting.

---

## Section 6 — Intraday Stop Monitoring (STANDARD/FULL modes only)

### Problem
The pipeline runs once at 9:45am ET. If news breaks at 2pm that destroys a thesis, the system waits until tomorrow. In volatile conditions this can mean significant unnecessary losses.

### Solution
A lightweight GitHub Actions job running every 60 minutes during market hours (9:30am–4:00pm ET, Monday–Friday), **only in STANDARD or FULL analysis mode**.

### `scripts/intraday_monitor.py`

Does NOT run full agents. Purely a circuit breaker. Checks:

1. For each open position:
   - Current price vs entry price → has it moved more than the stop-loss threshold?
   - Any Finnhub/NewsAPI headlines in the last 60 mins mentioning the ticker?
   - If headline found: LLM call (cheap, single prompt) — "Does this headline materially break the investment thesis? Answer YES/NO with one sentence."

2. Trigger conditions for an alert/exit:
   - Position down >7% intraday (hard stop)
   - Position down >5% AND negative headline flagged by LLM
   - Position up >15% intraday (take profit alert — doesn't auto-exit, flags for review)

3. Actions:
   - Hard stop hit → Trade Executor exits immediately, logs reason
   - Soft alert → writes to `data/memory/intraday_alerts.json`, included in tomorrow's Committee briefing
   - Does NOT place new trades — purely defensive

4. Mode gate: reads `data/config/analysis_mode.json`. If LITE → skips entirely and logs "Intraday monitoring disabled in LITE mode."

### GitHub Actions Job
```yaml
name: Intraday Monitor
on:
  schedule:
    - cron: '30 13,14,15,16,17,18,19,20 * * 1-5'  # Every hour 9:30am-4:30pm ET
```

Separate job from the main pipeline. Cheap — only triggers real LLM calls if a headline is found.

---

## Section 7 — Website Updates Summary

All new data surfaces on the website. Summary of additions:

### Dashboard Page additions
1. **vs SPY panel** — line chart, portfolio vs SPY indexed to inception, toggle 1W/1M/6M/YTD, alpha figure prominent
2. **Signal Attribution panel** — agent accuracy bars, alpha vs beta split, win rate by setup type (show after 3+ closed trades)
3. Both panels sit below existing P&L stats, same glassmorphism card style

### Daily Report additions
The Investment Committee's daily narrative report should now include (where data exists):
- One-line benchmark summary (current alpha vs SPY)
- Brief learning brief summary ("In today's conditions, based on past performance...")
- Any intraday alerts from previous day
- Concentration/correlation flags from Portfolio Risk Snapshot (if any)

### Position Detail Page additions
- Post-mortem section (shown after trade closes) — plain English, LLM-generated
- Attribution breakdown for closed trades (alpha vs beta vs sector)

---

## Implementation Order

Recommended sequence to minimise conflicts:

1. **Portfolio Risk Snapshot** (Section 1) — foundational, everything else builds on it
2. **Phase B Committee Capital Awareness** (Section 2) — small prompt change, quick win
3. **Benchmark Tracking** (Section 3) — backend utility + dashboard panel
4. **Factor Attribution Engine** (Section 4) — runs on trade close, no pipeline changes
5. **Extended Decision Log + Post-Mortems** (Section 5a) — Memory Agent extension
6. **Learning Brief injection** (Section 5b) — Committee and Fundamental Analyst prompts
7. **Backtest Runner** (Section 5c) — standalone script, no pipeline risk
8. **Intraday Monitor** (Section 6) — new GitHub Actions job, fully isolated

---

## Success Criteria

- [ ] Portfolio Risk Snapshot generated at start of every run and visible in Committee logs
- [ ] Committee rationale explicitly addresses concentration/correlation for every new BUY
- [ ] Committee knows weakest position and available capital before voting on Phase B
- [ ] vs SPY panel live on dashboard with correct data (even if just 2 data points early on)
- [ ] Attribution log populated on every trade close
- [ ] Agent accuracy summary updates after every closed trade
- [ ] Memory Agent generates post-mortems in plain English on trade close
- [ ] Learning Brief injected into Committee and Fundamental prompts each run
- [ ] Intraday monitor runs hourly in STANDARD/FULL mode, silent in LITE
- [ ] Backtest runner works on any date range with available data
- [ ] All new data synced to dashboard via sync_reports.py
- [ ] No research bias introduced — Fundamental/Quant/Sentiment agents remain blind to current holdings

---

## What This Does NOT Do (By Design)

- **No hard sector limits** — the model can be 60% tech if it wants to. Concentration is flagged and discussed, never blocked.
- **No forced diversification** — if all the best ideas are in one sector, the model takes them.
- **No VWAP/TWAP execution** — at paper trading scale, market orders are fine. Revisit when going live.
- **No alternative data** — satellite, card transactions, job postings are on the long-term roadmap but require paid APIs and significant infrastructure. Not in V2.