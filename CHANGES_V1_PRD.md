# CHANGES V1 — Product Requirements Document

> Implementation tracker for the v1 upgrade. Each section is self-contained; implement in order.

---

## Section 1 — Logo Redesign ✅

**Goal:** Replace the candlestick-H logo with a standalone upward-trending candlestick chart that feels like a real financial institution mark.

**Spec:**
- 4 candles, ascending left-to-right (staircase upward trend)
- Candle 1: small, bearish (red) — adds realism
- Candles 2–4: bullish (green), each progressively taller
- Each candle has a wick extending above and below the body
- Clean, minimal — no grid lines, no decoration
- Renders white-on-dark; uses brand colours (#10B981 green, #EF4444 red)
- Applied in `dashboard/components/Navbar.tsx` — affects every page

---

## Section 2 — Conviction Score Precision ✅

**Goal:** Stop the LLM from rounding conviction scores to multiples of 5.

**Spec:**
- Pass `composite_score` (weighted average of incoming agent scores) as an anchor in the prompt
- Add a schema hint that conviction must be an integer ≠ multiples of 5 (or explicitly say "no rounding")
- Python post-processing: if score % 5 == 0, retry once with stronger instruction; if still rounded on retry, nudge ±1–2 randomly to break the pattern
- Affects `agents/investment_committee.py`

---

## Section 3 — Position Sizing ✅

**Goal:** Replace flat 10% allocation with a Kelly-adjacent formula.

**Formula:**
```
raw_size = (conviction / 100) × (1 / (1 + atr_pct)) × max_position_pct
```
Where:
- `conviction` = LLM conviction score 0–100
- `atr_pct` = 14-day ATR as % of price (volatility scalar)
- `max_position_pct` = 20% (hard cap per position)
- All sizes normalised so total new + existing ≤ 90% of portfolio

**Implementation:**
- Compute ATR in `agents/quant_agent.py` (already has price data) → store in quant_report
- In `agents/investment_committee.py`: read quant_report for ATR, compute suggested size, pass to LLM as `SUGGESTED_SIZE: {x:.1f}%` — LLM may adjust ±3%
- Affects `agents/investment_committee.py`, `agents/quant_agent.py`

---

## Section 4 — Committee-Led Debate Mechanic ✅

**Goal:** When agent scores diverge ≥20 points, trigger a targeted rebuttal round before the Committee makes its final decision.

**Spec:**
- After collecting all agent scores, compute pairwise spread
- If max spread ≥ 20: identify the lowest-scoring agent, show it the highest-scoring agent's reasoning, ask it to defend or revise its score
- Revised score + rebuttal stored in `agent_debate` field of the decision record
- Shown on the position detail page in the dashboard
- Affects `agents/investment_committee.py`, `dashboard/app/position/[ticker]/page.tsx`

---

## Section 5 — Dynamic Agent Weighting ✅

**Goal:** After 20 closed trades, weight agent scores by their historical accuracy.

**Formula:**
```
new_weight = base_weight × (1 + (win_rate - 0.50) × 0.5)
```
Weights normalised to sum to 1.0 across all agents.

**Spec:**
- Weights stored in `data/memory/agent_weights.json`
- Activates only when `closed_trade_count ≥ 20`; uses base equal-weights before that
- Weights computed by `agents/memory_agent.py` on each `memory.run()` call
- Shown on the Team page in the dashboard
- Affects `agents/memory_agent.py`, `agents/investment_committee.py`, `dashboard/app/team/page.tsx`

---

## Section 6 — Candidate Variety ✅

**Goal:** Prevent the pipeline from repeatedly selecting the same tickers.

**Spec:**
- Momentum decay: deduct 1.5 pts from a ticker's score for each consecutive day it appears without being selected (tracked in `candidates_report.json`)
- Recency bonus: add 0.5 pts for tickers not seen in the last 5 days
- Minimum 20% new tickers per daily run (tickers not seen in the last 10 days)
- Log final adjusted scores and variety metrics to `data/reports/candidates_report.json`
- Affects `agents/candidate_generator.py`

---

## Section 7 — Institutional Analyst Upgrade ✅

**Goal:** Make the Institutional Agent reason about *why* funds hold positions, not just *that* they do.

**Spec:**
- For each institution holding a position, infer the likely thesis (value, growth, momentum, catalyst-driven, activist)
- Detect convergence: if 2+ independent funds initiated the same ticker within 45 days, flag as `convergence_signal: true`
- Convergence signal passed to Fundamental Analyst as additional context
- Affects `agents/institutional_agent.py`, `agents/fundamental_analyst.py`

---

## Section 8 — Framework Timing + Analysis Modes ✅

**Goal:** Let the user control how much analysis the pipeline runs via an env toggle and the website settings.

**Modes:**
| Mode | Phase A | Phase B |
|------|---------|---------|
| LITE | Macro + News + Quant only | Phases 1–3 (no Sentiment) |
| STANDARD | + Fundamental | Full Phases 1–4 |
| FULL | + Sentiment | Full Phases 1–5 + longer prompts |

**Spec:**
- `ANALYSIS_MODE` env var (LITE / STANDARD / FULL) — default LITE
- Website settings page writes selection to `data/config/analysis_mode.json`
- Pipeline reads from JSON at startup (env var takes precedence)
- Affects `agents/portfolio_manager.py`, `dashboard/app/settings/page.tsx` (create if needed), website API route

---

## Section 9 — Website Run Buttons ✅

**Goal:** Let the user trigger pipeline runs from the dashboard.

**Spec:**
- "Review Positions" button: Phase A only (`SKIP_PHASE_B=true`)
- "Full Research Run" button: full pipeline
- Both show a confirmation modal before running
- Live progress log: SSE stream or polling endpoint showing real-time stdout
- Timeout: 15 min; show "still running…" message after 2 min
- API route: `dashboard/app/api/run/route.ts` — calls `python main.py` with appropriate flags
- Buttons shown on Dashboard page and/or a dedicated Run page
- Affects `dashboard/app/api/run/route.ts` (create), `dashboard/app/dashboard/page.tsx`

---

## Section 10 — Website Report Generator ✅

**Goal:** Generate an ad-hoc deep-dive pitch on any ticker, with no trade impact.

**Spec:**
- Input: ticker text field + "Generate Report" button on a new `/reports/adhoc` page
- Runs full Phase 3 analysis (Fundamental + Quant + Sentiment) on the ticker
- Committee writes a structured pitch (bull case, bear case, verdict, suggested entry/exit, risk factors)
- Saves to `data/reports/adhoc_reports/{ticker}_{date}.json`
- Report displayed inline on the page with print/export option
- API route: `dashboard/app/api/report/[ticker]/route.ts`
- No positions modified, no orders placed
- Affects: new `dashboard/app/reports/adhoc/page.tsx`, new API route, new Python entry point or flag in `main.py`

---

## Implementation Status

| # | Section | Status |
|---|---------|--------|
| 1 | Logo Redesign | ✅ Done |
| 2 | Conviction Score Precision | ✅ Done |
| 3 | Position Sizing | ✅ Done |
| 4 | Committee-Led Debate | ✅ Done |
| 5 | Dynamic Agent Weighting | ✅ Done |
| 6 | Candidate Variety | ✅ Done |
| 7 | Institutional Analyst Upgrade | ✅ Done |
| 8 | Framework Timing + Analysis Modes | ✅ Done |
| 9 | Website Run Buttons | ✅ Done |
| 10 | Website Report Generator | ✅ Done |
