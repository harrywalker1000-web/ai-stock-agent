# PRD: Ad-Hoc Stock Analysis Tool
**Haz Capital Management — Deep-Dive Research Engine**
*Version 1.0 — April 2026*

---

## Overview

A standalone research tool that lets Harry input any ticker and receive a full institutional-grade investment analysis covering all 14 sections of the Haz Capital investment framework. Every agent contributes. Output is both a live website page and a downloadable PDF. Results are cached for 7 days by default, with a force-refresh option.

This tool is standalone for now. The roadmap includes the Investment Committee reading these reports before every daily decision — making it a core input to the pipeline, not just a side feature.

---

## Problem Being Solved

The daily pipeline analyses stocks at speed — useful for trading decisions but not deep enough for genuine conviction building. Harry needs a way to do a proper institutional-quality deep-dive on any ticker, on demand, using every data source available. The 14-section framework from his university assignment is the gold standard — this tool forces the model to complete every section before producing a recommendation.

---

## Goals

1. Full 14-section analysis on any ticker, on demand
2. All agents contribute — Fundamental does the heavy lifting, others provide context
3. Results cached 7 days by default; force-refresh available
4. Output: live page on the website + downloadable PDF
5. Future: Committee reads these reports before daily investment decisions

---

## Agent Involvement

### Primary
- **Fundamental Analyst** — owns sections 1–7, all financial data, valuation, comps. Uses yfinance (primary), Alpha Vantage (secondary), SEC EDGAR (ground truth for revenue/EPS), FMP /stable/ endpoints for analyst ratings and estimates.

### Supporting
- **Macro Agent** — provides current regime (RISK-ON / RISK-OFF / NEUTRAL), rates, VIX, DXY context. Feeds into Section 5 (Market Timing) and Section 7 (Recommendation).
- **Quant Agent** — RSI, MACD, Bollinger Bands, ATR, OBV, support/resistance, chart patterns. Feeds into Section 5 (Market Timing).
- **Sentiment Agent** — analyst consensus trend, news tone, short interest. Uses FMP /stable/ endpoints and Finnhub. Feeds into Section 2g (Analyst Rating History) and Section 6 (Investment Thesis).
- **News & Catalyst Agent** — scans Finnhub + NewsAPI for recent headlines on the ticker. Feeds into Section 3d (Catalysts & Risks).
- **Investment Committee** — synthesises all agent outputs into a final recommendation with conviction score. Completes Section 7.

### API Mapping (by section)
| Data Need | Primary Source | Fallback |
|-----------|---------------|---------|
| Price, financials, ratios | yfinance | Alpha Vantage |
| Revenue, EPS (ground truth) | SEC EDGAR | FMP /stable/ |
| Analyst ratings, estimates | FMP /stable/analyst-estimates | yfinance |
| News, catalysts | Finnhub + NewsAPI | — |
| Short interest | FMP /stable/ | Finnhub |
| Macro context | FRED + yfinance (VIX, DXY) | — |
| Technical indicators | yfinance OHLCV → calculated | — |

---

## The 14-Section Framework

Every report must complete all 14 sections before the Committee produces a recommendation. Sections 1–3 (mandate, company info, setup checklist) must be completed before the conviction score is assigned.

### Section 1 — Fund Mandate Checklist
Checkboxes: asset class, exchange listing, sector constraints, market cap, liquidity (min daily volume), geography (revenue derivation — flag Russia/Mongolia/Cambodia), PEPs check, setup type (growth / distressed / turnaround etc), float.

**Pass/Fail output** — if the stock fails the mandate, the report stops here and says why.

### Section 2 — Company Info
a. Background — HQ, employees, sector, general overview
b. Business overview — revenue segments with % weightings, geographic revenue breakdown
c. Financials snapshot — 3yr historical + 2yr forward projections (revenue, gross profit, EBITDA, net income, EPS)
d. Comparables table — 5 closest peers, showing Rev, Gross Profit, EBITDA, Net Income, D/E, and margins
e. Market — growth rates, competition, sector trends, macro factors, key catalysts and risks
f. Quality of earnings — moats, competitive advantages, defensibility
g. Management — quality, track record, any scandals or legal issues
h. Analyst rating history — last 24 months, trend in buy/sell/hold calls, number of changes
i. Cap table — institutional holders, management ownership %, float, short interest

### Section 3 — Setup Checklist
Classify the setup type first (Growth / Distressed / Turnaround / Mean Reversion / Dislocation), then run the relevant checklist:

**Growth:**
- Rev growth > 20% YoY 3yr CAGR?
- Revenue drivers — sustainable?
- EBITDA and net margins — direction and defensibility
- Market size, growth rate, room to run, competition
- Peripheral markets available?
- Organic vs M&A growth
- EPS CAGR — consistent or lumpy? 1-off events?
- FCF — positive or approaching?
- Leverage — D/E vs peers, default risk?
- Catalysts — product launches, new markets, M&A
- Key risks

**Mean Reversion / Dislocation (relevant for current RISK-OFF regime):**
- How far has it fallen from 52-week high?
- Is the thesis broken or is this macro noise?
- What is the reversion target?
- Catalyst for reversion?

### Section 4 — Valuation
i. Classify the stock type and select methodology:
   - Early disruptor (pre-profit) → P/S
   - Scale-up with optionality → DCF + optionality
   - Mature growth → forward comps multiples

ii. If analyst estimates available (FMP):
   - Get consensus estimates and price targets
   - Reverse-engineer implied multiples — what does consensus assume?
   - Is the price target realistic? State own view vs consensus.

iii. If no analyst estimates:
   - Comps valuation — derive mean multiples from peers
   - Apply defensible forward CAGR or own estimates
   - Factor in catalysts
   - Calculate theoretical ROI and MOIC

iv. Narrative risk — flag if multiples depend on story remaining intact

v. Expected ROI in 2–3 years assuming entry at current market price

### Section 5 — Market Timing
Defend why NOW is the right entry (or flag that it isn't). Must reference:
- Current macro regime (from Macro Agent)
- Technical setup (from Quant Agent) — is it at support? Oversold RSI?
- Recent catalyst or news that changes the picture
- Downside scenario — what if timing is wrong?

### Section 6 — Investment Thesis
Narrative summary of the bull case. Cover: market position, quality of earnings, growth drivers, moat, sector tailwinds, macro fit. 200–400 words.

### Section 7 — Recommendation
- Direction: BUY / HOLD / SELL / PASS
- Conviction score: 0–100 (must NOT be a multiple of 5 — enforce decimal precision)
- Expected return: % over 2–3 year horizon
- Suggested position size: Kelly formula output (same as daily pipeline)
- Key risks to the thesis

---

## Sections 8–14 (Website Display / Supplementary)

These expand on the above for the website deep-dive page and are populated where data is available:

8. **Technical Analysis Summary** — full Quant Agent output: RSI, MACD, Bollinger, ATR, OBV, support/resistance levels, chart pattern identified
9. **Sentiment Summary** — news tone score, short interest trend, analyst upgrade/downgrade momentum
10. **Institutional Activity** — any 13F/13D holdings by tracked funds (Berkshire, ARK, etc). Flags if 2+ funds hold.
11. **Historical Performance** — 1m, 3m, 6m, 1yr, 3yr price performance vs SPY and sector ETF
12. **Risk Dashboard** — beta, max drawdown, volatility vs sector, liquidity risk, geographic concentration
13. **Scenario Analysis** — Bull / Base / Bear case price targets with assumptions
14. **Data Reliability** — source badges for every data point (yfinance / Alpha Vantage / SEC EDGAR / FMP). Timestamps on all data. Last updated date prominent.

---

## Caching Logic

- Default: if a report exists for this ticker dated within the last 7 days, serve it from cache
- Cache location: `data/adhoc_reports/{ticker}_{date}.json`
- If cached: show banner at top of page — `⚠️ CACHED REPORT — Data as of {DATE}. Run fresh analysis?`
- Force-refresh button always visible — reruns all agents from scratch
- PDF is generated from whatever is currently displayed (cached or fresh)

---

## Website Page — `/reports/adhoc`

### Input UI
- Single ticker input field (uppercase enforced)
- "Run Analysis" button
- Toggle: `Use cached (7 days)` / `Run fresh` — default cached
- While running: progress indicator showing which agent is currently working
  - e.g. `Macro Agent ✓ → Fundamental Analyst (running...) → Quant Agent → ...`

### Output Page — `/reports/adhoc/{ticker}`
- Dark institutional design, same as rest of the site
- Header: ticker, company name, sector, market cap, last price, % change today
- Cached banner if applicable (date + refresh button)
- 14 sections rendered as expandable cards — all expanded by default
- Sidebar: sticky navigation jumping to each section
- Fund mandate result prominent at top — green PASS or red FAIL
- Conviction score displayed as a large number with colour coding (≥70 green, 40–69 amber, <40 red)
- "Download PDF" button — generates PDF of current page
- "Flag for Tomorrow's Pipeline" button — future feature (see roadmap)

### PDF Output
- Clean, printable version of all 14 sections
- Haz Capital Management letterhead
- Generated date + data-as-of date
- Saved to `data/adhoc_reports/pdf/{ticker}_{date}.pdf`
- Also offered as direct download from the website

---

## Backend — `scripts/adhoc_report.py`

The existing script needs to be extended to:

1. Accept a ticker and a `--force-refresh` flag
2. Check cache first (unless force-refresh)
3. Run agents in this order:
   - Macro Agent (fast, provides regime context)
   - News & Catalyst Agent (ticker-specific headlines)
   - Fundamental Analyst (main analysis — all 14 sections)
   - Quant Agent (technical overlay)
   - Sentiment Agent (analyst ratings, short interest)
   - Investment Committee (final recommendation + conviction score)
4. Write output to `data/adhoc_reports/{ticker}_{date}.json`
5. Trigger PDF generation
6. Return structured JSON for the website page to render

### API Route — `dashboard/app/api/adhoc/route.ts`
- POST `/api/adhoc` — accepts `{ ticker, forceRefresh }`, triggers the Python script, streams progress back to the frontend
- GET `/api/adhoc/{ticker}` — returns the most recent cached report for a ticker

---

## Enforcement in Daily Pipeline (Future — Phase 2)

Once the tool is mature, the Investment Committee should be forced to read the ad-hoc report (if one exists for a candidate) before voting. Implementation:

- Before Committee deliberation, check `data/adhoc_reports/` for any report on the candidate ticker dated within 30 days
- If found: inject the full Section 4 (Valuation) and Section 7 (Recommendation) into the Committee prompt as prior research
- Committee must explicitly reference the ad-hoc report in its rationale if one exists
- This turns ad-hoc reports into a genuine knowledge base that improves daily decisions over time

This is the single highest-leverage improvement to decision quality available — the Committee will have institutional-quality valuation work to draw on rather than generating it fresh each morning.

---

## Implementation Order

1. **Extend `scripts/adhoc_report.py`** — add all 14 sections, caching logic, all agents
2. **Build `/reports/adhoc` input page** — ticker input, run button, progress indicator
3. **Build `/reports/adhoc/{ticker}` output page** — 14-section display, sticky nav, conviction score
4. **PDF generation** — from the rendered output
5. **Committee integration** — read ad-hoc reports in daily pipeline (Phase 2)

---

## Success Criteria

- [ ] Any ticker can be analysed on demand in under 3 minutes
- [ ] All 14 sections populated with real data (no placeholder text)
- [ ] Conviction score is never a multiple of 5 (decimal precision enforced)
- [ ] Cached reports served with clear date labelling
- [ ] Force-refresh works and overwrites cache
- [ ] PDF downloads correctly with all sections
- [ ] Fund mandate fail stops the report and explains why
- [ ] Website page matches the dark institutional design of the rest of the site