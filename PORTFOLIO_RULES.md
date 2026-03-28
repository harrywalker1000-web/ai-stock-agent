# Portfolio Management Philosophy
**Authority:** This file is authoritative alongside PRD.md for all remaining build work.
Any conflict between this document and PRD.md is resolved in favour of this document.

---

## Core Philosophy

The system makes decisions, not recommendations. Each day it may initiate 0 to many positions. There are no quotas or fixed numbers. The system must never force a trade to meet a target count.

---

## Daily Pipeline — Two Phases

### Phase A: Portfolio Review (runs first)
Before any new research, every open position is re-evaluated using fresh data. The full analyst team (Macro, Sector, Fundamental, Quant, Sentiment) re-runs on each held stock. The original entry thesis is retrieved from memory and explicitly compared against today's findings. The Investment Committee then decides for each position:

- **Hold** — nothing material has changed
- **Increase size** — thesis has strengthened, stock more attractive than at entry
- **Decrease size** — partial profit-taking, slightly reduced confidence, or risk management
- **Exit** — thesis broken, opportunity fully realised with no further upside identified, or capital urgently needed for a higher-conviction opportunity

**Review intensity modes** (selectable via config, not hardcoded):

| Mode | Agents used | Default |
|------|-------------|---------|
| Lite | Macro + Quant + News only | ✅ Yes — default while paper trading |
| Standard | All agents in lightweight form | |
| Full | Complete re-run identical to original entry analysis | |

Every decision requires a written rationale stored in memory.

### Phase B: New Opportunity Research
Runs after Phase A completes. The existing pipeline (Agents 1–11). Identifies new positions to initiate.

**These two phases run sequentially in one daily job to minimise cost. Target total daily cost under $1.00 including both phases.**

---

## Position Sizing

- **Conviction-based.** Higher conviction = larger allocation.
- **Soft cap 20% per position.** Model may exceed with written justification.
- **Target minimum 10 simultaneous positions** when capital is available.
- **Target 80%+ invested at all times** — but never force trades to hit this.
- **Hold cash if genuine opportunities are absent.**
- Never buy broad market ETFs as cash placeholders. The goal is to beat the market, not replicate it.

---

## Daily Position Decisions

For each open position the team may:

- **Increase size** — thesis strengthened, stock more attractive than at entry
- **Decrease size** — partial profit-taking, slightly reduced confidence, risk management
- **Hold** — nothing material has changed
- **Exit** — thesis broken, opportunity fully realised with no further upside, or capital urgently needed for higher-conviction opportunity

**Hitting a price target is a checkpoint for re-evaluation, NOT an automatic sell trigger.** If the thesis remains intact or has strengthened, the position stays open.

When a position is exited, capital may be redeployed same-day if a high-conviction opportunity exists in today's pipeline — but only after confirming the thesis is still valid at time of redeployment.

---

## Long / Short

Full flexibility. The model may hold a majority short book if the thesis warrants it. No hard directional rules. Slight preference for long-biased book where signals are equal, but this never overrides a strong bearish thesis.

---

## ETFs

Treated identically to individual stocks across the full universe. Sector ETFs, thematic ETFs, and any others are tradeable instruments, not just research tools. The universe filter (`data/universe.csv`) should include relevant ETFs.

---

## Risk Management

No automatic de-risking rules based on portfolio drawdown. If the portfolio is significantly down, each agent evaluates why each position is down, whether the thesis is still valid, and learns from any mistakes. The model decides case by case.

Risk is managed through:
- Diversification across 10+ positions
- A mix of higher and lower volatility assets
- Not through blanket drawdown-triggered rules

The model should be aware of earnings risk and factor it into position decisions, but there are no hard restrictions on trading around earnings dates.

---

## The Why Is Mandatory

Every decision — enter, increase, decrease, hold, exit — must produce a written rationale stored in memory. This includes:

- Which agents flagged it
- What signals drove the decision
- The conviction score
- The position size rationale
- How today's view compares to the original entry thesis

This feeds the dashboard where recent decisions show a one-line summary; clicking through shows full reasoning per agent.

---

## The Portfolio Manager

**The Portfolio Manager is not a separate numbered agent.** It is an orchestration module (`agents/portfolio_manager.py`) that coordinates Phase A each morning. It:

- Reads open positions from Alpaca (or local position log during paper trading)
- Retrieves each position's original entry thesis from memory
- Passes each held ticker to the analyst team for Phase A analysis
- Collects analyst outputs and forwards to the Investment Committee
- The Committee makes the hold/increase/decrease/exit decisions
- The Trade Executor implements them

The analyst team (Agents 1–9) provide the analysis. The Committee (Agent 10) makes the decision. The Executor (Agent 11) acts. Portfolio Manager is the coordinator, not a decision-maker.

---

## Hard Rules

- No switching to live trading without explicit user confirmation
- Every decision must have a stored written rationale
- Paper trading until 20+ full daily runs complete
- The soft 20% position cap may be exceeded with written justification — but this must be rare
