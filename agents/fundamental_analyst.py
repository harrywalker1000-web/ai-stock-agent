"""
Agent 6 — Fundamental Analyst
Phase 3: runs in parallel with Agents 7 (Quant) and 8 (Sentiment).

Data sources (per PRD spec and user confirmation):
  Primary:  yfinance — financial statements, ratios, price data
  Secondary: Alpha Vantage — independent financial metrics (25 free calls/day limit)
  Tertiary: SEC EDGAR — actual filed documents, ground truth for revenue and EPS

Cross-reference rules:
  - If yfinance and Alpha Vantage disagree by >5% on revenue, EPS, margins, or debt
    → flag as data conflict, use the conservative figure, log in data_conflicts[]
  - If SEC EDGAR conflicts with yfinance or Alpha Vantage on revenue or EPS
    → SEC EDGAR wins (it IS the filed document)

Note: smaller Russell 2000 candidates may have limited AV/EDGAR data — they will
show fewer sources and lower data_confidence. This is expected and noted in output.

Alpha Vantage free tier: 25 requests/day. The agent tracks usage and skips AV
for lower-priority candidates once the limit is reached (falling back to 2-source).
"""

import json
import os
import time
from datetime import datetime
from pathlib import Path

import requests
import yfinance as yf
from dotenv import load_dotenv
from openai import OpenAI

from utils.logger import get_logger

load_dotenv()
logger = get_logger(__name__)

ROOT = Path(__file__).resolve().parent.parent
REPORTS_DIR = ROOT / "data" / "reports"
OUT_PATH = REPORTS_DIR / "fundamental_report.json"
POSITIONS_LOG_PATH = ROOT / "data" / "memory" / "positions_log.json"

AV_DAY_LIMIT = 25       # Alpha Vantage free tier: 25 calls/day
CONFLICT_THRESHOLD = 0.05  # Flag if sources disagree by more than 5%
MAX_CANDIDATES = 50     # Max tickers to analyse in one run

_av_calls_used = 0
_cik_map: dict[str, str] = {}   # ticker → CIK (loaded once)


def _load_position_context(ticker: str) -> dict | None:
    """Load entry thesis and position metadata from positions_log.json."""
    if not POSITIONS_LOG_PATH.exists():
        return None
    try:
        with open(POSITIONS_LOG_PATH) as f:
            log = json.load(f)
        return log.get(ticker)
    except Exception:
        return None


def _fmt_position_section(position_context: dict | None) -> str:
    """Format the original entry thesis block for the LLM prompt."""
    if not position_context:
        return ""
    entry_price = position_context.get("entry_price", "N/A")
    direction = position_context.get("direction", "LONG")
    thesis = position_context.get("entry_thesis", "Not recorded")
    signals = position_context.get("signals", [])
    entry_date = position_context.get("entry_date", "Unknown")
    return f"""
PORTFOLIO REVIEW — ORIGINAL ENTRY THESIS:
  Entry date: {entry_date}
  Entry price: ${entry_price}
  Direction: {direction}
  Original signals: {', '.join(signals) if signals else 'Not recorded'}
  Original thesis: {thesis}

"""


# ---------------------------------------------------------------------------
# SEC EDGAR CIK lookup (single HTTP call caches all ~12K tickers)
# ---------------------------------------------------------------------------

def _load_cik_map() -> dict[str, str]:
    global _cik_map
    if _cik_map:
        return _cik_map
    url = "https://www.sec.gov/files/company_tickers.json"
    try:
        resp = requests.get(url, headers={"User-Agent": "ai-stock-agent research@example.com"}, timeout=20)
        resp.raise_for_status()
        raw = resp.json()
        _cik_map = {v["ticker"].upper(): str(v["cik_str"]).zfill(10) for v in raw.values()}
        logger.info("SEC EDGAR CIK map loaded: %d tickers", len(_cik_map))
    except Exception as exc:
        logger.warning("SEC EDGAR CIK map load failed: %s", exc)
    return _cik_map


def _edgar_latest_annual(us_gaap: dict, concept: str) -> float | None:
    """Extract the most recent annual (10-K/20-F) filed value for a GAAP concept."""
    data = us_gaap.get(concept)
    if not data:
        return None
    for unit_key in ("USD", "USD/shares", "shares"):
        entries = data.get("units", {}).get(unit_key, [])
        if entries:
            break
    # Filter to annual full-year figures (fp=FY or CY) to avoid quarterly sub-totals
    annual = [
        e for e in entries
        if e.get("form") in ("10-K", "20-F")
        and e.get("val")
        and e.get("fp") in ("FY", "CY", None)  # None: include if fp field absent
    ]
    # Prefer entries explicitly marked FY/CY over those without fp
    fy_entries = [e for e in annual if e.get("fp") in ("FY", "CY")]
    if fy_entries:
        annual = fy_entries
    if not annual:
        return None
    annual.sort(key=lambda x: x.get("filed", ""), reverse=True)
    return float(annual[0]["val"])


# ---------------------------------------------------------------------------
# Metric extraction per source
# ---------------------------------------------------------------------------

def _fetch_yf_metrics(ticker: str) -> dict:
    """Extract key fundamental metrics from yfinance."""
    result: dict = {"source": "yfinance", "ticker": ticker}
    try:
        t = yf.Ticker(ticker)
        info = t.info or {}

        result["revenue_ttm"] = info.get("totalRevenue")
        result["eps_ttm"] = info.get("trailingEps")
        result["forward_eps"] = info.get("forwardEps")
        result["pe_trailing"] = info.get("trailingPE")
        result["pe_forward"] = info.get("forwardPE")
        result["price_to_sales"] = info.get("priceToSalesTrailing12Months")
        result["price_to_book"] = info.get("priceToBook")
        result["ev_to_ebitda"] = info.get("enterpriseToEbitda")
        result["gross_margin"] = info.get("grossMargins")
        result["operating_margin"] = info.get("operatingMargins")
        result["profit_margin"] = info.get("profitMargins")
        result["roe"] = info.get("returnOnEquity")
        result["roa"] = info.get("returnOnAssets")
        result["current_ratio"] = info.get("currentRatio")
        result["debt_to_equity"] = info.get("debtToEquity")
        result["total_cash"] = info.get("totalCash")
        result["total_debt"] = info.get("totalDebt")
        result["free_cashflow"] = info.get("freeCashflow")
        result["market_cap"] = info.get("marketCap")
        result["beta"] = info.get("beta")
        result["sector"] = info.get("sector", "")
        result["industry"] = info.get("industry", "")

        # Revenue growth YoY from financials
        try:
            fin = t.income_stmt
            if fin is not None and not fin.empty:
                rev_row = None
                for label in ("Total Revenue", "Revenue", "Net Revenue"):
                    if label in fin.index:
                        rev_row = fin.loc[label]
                        break
                if rev_row is not None and len(rev_row) >= 2:
                    rev_curr = float(rev_row.iloc[0])
                    rev_prev = float(rev_row.iloc[1])
                    if rev_prev and rev_prev != 0:
                        result["revenue_growth_yoy"] = round((rev_curr - rev_prev) / abs(rev_prev), 4)

                # Net income + EPS from income statement
                for label in ("Net Income", "Net Income Common Stockholders"):
                    if label in fin.index:
                        result["net_income_ttm"] = float(fin.loc[label].iloc[0])
                        break

                # EBITDA: Operating Income + D&A
                if "Operating Income" in fin.index and "Reconciled Depreciation" in fin.index:
                    op_inc = float(fin.loc["Operating Income"].iloc[0])
                    dep = float(fin.loc["Reconciled Depreciation"].iloc[0])
                    result["ebitda"] = op_inc + dep

            # FCF growth
            cf = t.cashflow
            if cf is not None and not cf.empty:
                for label in ("Free Cash Flow", "Operating Cash Flow"):
                    if label in cf.index:
                        result["fcf"] = float(cf.loc[label].iloc[0])
                        break

            # Net Debt / EBITDA
            total_debt = result.get("total_debt") or 0
            cash = result.get("total_cash") or 0
            ebitda = result.get("ebitda")
            if ebitda and ebitda != 0:
                result["net_debt_ebitda"] = round((total_debt - cash) / abs(ebitda), 2)

        except Exception:
            pass  # financials parsing is best-effort

        # ROIC approximation: EBIT * (1-tax) / (total_debt + equity)
        try:
            info2 = info
            ebit = info2.get("ebit")
            tax_rate = info2.get("taxRateForCalcs", 0.21)
            equity = info2.get("bookValue", 0) * info2.get("sharesOutstanding", 0) if info2.get("bookValue") else None
            total_debt_r = result.get("total_debt") or 0
            if ebit and equity:
                invested_capital = total_debt_r + equity
                if invested_capital > 0:
                    result["roic"] = round(ebit * (1 - tax_rate) / invested_capital, 4)
        except Exception:
            pass

    except Exception as exc:
        logger.error("yfinance metrics failed for %s: %s", ticker, exc)

    return result


def _fetch_av_metrics(ticker: str) -> dict:
    """Extract key metrics from Alpha Vantage (respects 25-call daily limit)."""
    global _av_calls_used
    result: dict = {"source": "alpha_vantage", "ticker": ticker}
    key = os.environ.get("ALPHA_VANTAGE_API_KEY")
    if not key:
        result["error"] = "ALPHA_VANTAGE_API_KEY not set"
        return result
    if _av_calls_used >= AV_DAY_LIMIT:
        result["error"] = f"AV daily limit ({AV_DAY_LIMIT}) reached"
        return result

    try:
        url = f"https://www.alphavantage.co/query?function=OVERVIEW&symbol={ticker}&apikey={key}"
        resp = requests.get(url, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        _av_calls_used += 1

        if not data or "Symbol" not in data:
            result["error"] = "no data returned"
            return result

        def _safe_float(val: str) -> float | None:
            try:
                return float(val) if val and val not in ("None", "-", "") else None
            except (ValueError, TypeError):
                return None

        result["revenue_ttm"] = _safe_float(data.get("RevenueTTM"))
        result["eps_ttm"] = _safe_float(data.get("DilutedEPSTTM"))
        result["pe_trailing"] = _safe_float(data.get("PERatio"))
        result["pe_forward"] = _safe_float(data.get("ForwardPE"))
        result["price_to_sales"] = _safe_float(data.get("PriceToSalesRatioTTM"))
        result["price_to_book"] = _safe_float(data.get("PriceToBookRatio"))
        result["ev_to_ebitda"] = _safe_float(data.get("EVToEBITDA"))
        result["gross_margin"] = _safe_float(data.get("GrossProfitTTM")) / result["revenue_ttm"] \
            if _safe_float(data.get("GrossProfitTTM")) and result.get("revenue_ttm") else None
        result["profit_margin"] = _safe_float(data.get("ProfitMargin"))
        result["operating_margin"] = _safe_float(data.get("OperatingMarginTTM"))
        result["roe"] = _safe_float(data.get("ReturnOnEquityTTM"))
        result["roa"] = _safe_float(data.get("ReturnOnAssetsTTM"))
        result["debt_to_equity"] = _safe_float(data.get("DebtToEquityRatio"))
        result["beta"] = _safe_float(data.get("Beta"))

    except Exception as exc:
        logger.error("Alpha Vantage metrics failed for %s: %s", ticker, exc)
        result["error"] = str(exc)

    return result


def _fetch_edgar_metrics(ticker: str) -> dict:
    """Extract revenue and EPS from SEC EDGAR (ground truth for filed documents)."""
    result: dict = {"source": "sec_edgar", "ticker": ticker}
    cik_map = _load_cik_map()
    cik = cik_map.get(ticker.upper())
    if not cik:
        result["error"] = "CIK not found"
        return result

    try:
        url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
        resp = requests.get(url, headers={"User-Agent": "ai-stock-agent research@example.com"}, timeout=20)
        resp.raise_for_status()
        us_gaap = resp.json().get("facts", {}).get("us-gaap", {})

        # Revenue — try multiple GAAP concept names (varies by company/industry)
        for rev_concept in (
            "Revenues",
            "RevenueFromContractWithCustomerExcludingAssessedTax",
            "SalesRevenueNet",
            "RevenueFromContractWithCustomerIncludingAssessedTax",
            "SalesRevenueGoodsNet",
        ):
            val = _edgar_latest_annual(us_gaap, rev_concept)
            if val is not None:
                result["revenue_annual"] = val
                result["revenue_concept"] = rev_concept
                break

        # EPS diluted
        eps_val = _edgar_latest_annual(us_gaap, "EarningsPerShareDiluted")
        if eps_val is not None:
            result["eps_annual"] = eps_val

        # Net income
        ni_val = _edgar_latest_annual(us_gaap, "NetIncomeLoss")
        if ni_val is not None:
            result["net_income_annual"] = ni_val

        result["cik"] = cik

    except Exception as exc:
        logger.error("SEC EDGAR metrics failed for %s (CIK %s): %s", ticker, cik, exc)
        result["error"] = str(exc)

    return result


# ---------------------------------------------------------------------------
# Cross-reference and conflict detection
# ---------------------------------------------------------------------------

def _check_conflict(metric: str, v1: float | None, v2: float | None, src1: str, src2: str) -> dict | None:
    """Return a conflict dict if two values disagree by more than CONFLICT_THRESHOLD."""
    if v1 is None or v2 is None or v1 == 0:
        return None
    diff_pct = abs(v1 - v2) / abs(v1)
    if diff_pct > CONFLICT_THRESHOLD:
        return {
            "metric": metric,
            f"{src1}_value": round(v1, 4),
            f"{src2}_value": round(v2, 4),
            "diff_pct": round(diff_pct * 100, 1),
            "conservative_value": round(min(v1, v2) if v1 > 0 else max(v1, v2), 4),
            "resolution": f"{src2} used (conservative)" if min(v1, v2) == v2 else f"{src1} used (conservative)",
        }
    return None


def _cross_reference(yf: dict, av: dict, edgar: dict) -> tuple[dict, list[dict]]:
    """
    Merge three source dicts into a single reconciled metrics dict.
    Returns (reconciled_dict, conflicts_list).
    SEC EDGAR is ground truth for revenue and EPS.
    Conservative figure used when yfinance and Alpha Vantage disagree.
    """
    reconciled: dict = {}
    conflicts: list[dict] = []
    sources_used: list[str] = ["yfinance"]

    av_ok = "error" not in av
    edgar_ok = "error" not in edgar and edgar.get("revenue_annual") is not None

    if av_ok:
        sources_used.append("alpha_vantage")
    if edgar_ok:
        sources_used.append("sec_edgar")

    # --- Revenue ---
    yf_rev = yf.get("revenue_ttm")
    av_rev = av.get("revenue_ttm") if av_ok else None
    edgar_rev = edgar.get("revenue_annual") if edgar_ok else None

    # Check yf vs AV conflict
    if yf_rev and av_rev:
        c = _check_conflict("revenue_ttm", yf_rev, av_rev, "yfinance", "alpha_vantage")
        if c:
            conflicts.append(c)
            yf_rev = c["conservative_value"]  # use conservative between yf/av

    # EDGAR wins for revenue if available — but sanity-check first.
    # >80% discrepancy = almost certainly wrong XBRL concept (e.g. sub-segment revenue
    # filed under 'Revenues' instead of total). In that case, discard EDGAR and use
    # yf/av reconciled figure. Real conflicts are typically <50%.
    if edgar_rev is not None and yf_rev and abs(edgar_rev - yf_rev) / max(abs(yf_rev), 1) > 0.80:
        conflicts.append({
            "metric": "revenue (EDGAR concept mismatch — skipped)",
            "yfinance_value": round(yf_rev, 0),
            "sec_edgar_value": round(edgar_rev, 0),
            "diff_pct": round(abs(edgar_rev - yf_rev) / max(abs(yf_rev), 1) * 100, 1),
            "resolution": "yfinance used — EDGAR discrepancy >80% indicates wrong XBRL concept",
        })
        edgar_rev = None  # discard; fall through to yf value below

    if edgar_rev is not None:
        if yf_rev and abs(edgar_rev - yf_rev) / max(abs(edgar_rev), 1) > CONFLICT_THRESHOLD:
            conflicts.append({
                "metric": "revenue (EDGAR override)",
                "yfinance_value": round(yf_rev, 0),
                "sec_edgar_value": round(edgar_rev, 0),
                "diff_pct": round(abs(edgar_rev - yf_rev) / max(abs(yf_rev), 1) * 100, 1),
                "resolution": "sec_edgar used (ground truth — filed document)",
            })
        reconciled["revenue"] = edgar_rev
    else:
        reconciled["revenue"] = yf_rev

    # --- EPS ---
    yf_eps = yf.get("eps_ttm")
    av_eps = av.get("eps_ttm") if av_ok else None
    edgar_eps = edgar.get("eps_annual") if edgar_ok else None

    if yf_eps and av_eps:
        c = _check_conflict("eps_ttm", yf_eps, av_eps, "yfinance", "alpha_vantage")
        if c:
            conflicts.append(c)
            yf_eps = c["conservative_value"]

    # Same 80% sanity check for EPS — EDGAR may return a fiscal year figure while
    # yfinance returns TTM, causing large apparent differences for fast-growing companies
    if edgar_eps is not None and yf_eps and abs(edgar_eps - yf_eps) / max(abs(yf_eps), 0.01) > 0.80:
        conflicts.append({
            "metric": "eps (EDGAR period mismatch — skipped)",
            "yfinance_value": round(yf_eps, 4),
            "sec_edgar_value": round(edgar_eps, 4),
            "diff_pct": round(abs(edgar_eps - yf_eps) / max(abs(yf_eps), 0.01) * 100, 1),
            "resolution": "yfinance used — EDGAR EPS >80% different (likely prior fiscal year vs TTM)",
        })
        edgar_eps = None

    if edgar_eps is not None:
        if yf_eps and abs(edgar_eps - yf_eps) / max(abs(edgar_eps), 0.01) > CONFLICT_THRESHOLD:
            conflicts.append({
                "metric": "eps (EDGAR override)",
                "yfinance_value": round(yf_eps, 4),
                "sec_edgar_value": round(edgar_eps, 4),
                "diff_pct": round(abs(edgar_eps - yf_eps) / max(abs(yf_eps), 0.01) * 100, 1),
                "resolution": "sec_edgar used (ground truth — filed document)",
            })
        reconciled["eps"] = edgar_eps
    else:
        reconciled["eps"] = yf_eps

    # --- Margins (yfinance vs AV, no EDGAR equivalent) ---
    for field in ("gross_margin", "operating_margin", "profit_margin"):
        yf_val = yf.get(field)
        av_val = av.get(field) if av_ok else None
        if yf_val and av_val:
            c = _check_conflict(field, yf_val, av_val, "yfinance", "alpha_vantage")
            if c:
                conflicts.append(c)
                reconciled[field] = c["conservative_value"]
            else:
                reconciled[field] = yf_val
        else:
            reconciled[field] = yf_val

    # --- Remaining metrics (yfinance primary) ---
    for field in (
        "pe_trailing", "pe_forward", "price_to_sales", "price_to_book",
        "ev_to_ebitda", "roe", "roa", "roic", "current_ratio",
        "debt_to_equity", "free_cashflow", "fcf", "net_debt_ebitda",
        "revenue_growth_yoy", "market_cap", "beta", "sector", "industry",
    ):
        reconciled[field] = yf.get(field)

    # Forward EPS supplement from AV if yfinance missing
    if not reconciled.get("pe_forward") and av_ok and av.get("pe_forward"):
        reconciled["pe_forward"] = av.get("pe_forward")

    reconciled["sources_used"] = sources_used
    reconciled["sources_count"] = len(sources_used)

    return reconciled, conflicts


# ---------------------------------------------------------------------------
# Peer identification
# ---------------------------------------------------------------------------

def _fetch_peers(ticker: str) -> list[str]:
    """
    Fetch 3-5 peer tickers via Finnhub company_peers.
    Falls back to empty list (LLM will note peer data unavailable).
    """
    import finnhub
    key = os.environ.get("FINNHUB_API_KEY")
    if not key:
        return []
    try:
        client = finnhub.Client(api_key=key)
        peers = client.company_peers(ticker) or []
        # Remove the ticker itself, cap at 5 peers
        peers = [p for p in peers if p != ticker][:5]
        return peers
    except Exception as exc:
        logger.warning("Finnhub peers failed for %s: %s", ticker, exc)
        return []


def _fetch_peer_snapshot(peers: list[str]) -> dict[str, dict]:
    """Fetch basic P/E and P/S for each peer from yfinance info (fast_info)."""
    result: dict[str, dict] = {}
    for p in peers:
        try:
            info = yf.Ticker(p).info or {}
            result[p] = {
                "pe_trailing": info.get("trailingPE"),
                "pe_forward": info.get("forwardPE"),
                "price_to_sales": info.get("priceToSalesTrailing12Months"),
                "ev_to_ebitda": info.get("enterpriseToEbitda"),
                "gross_margin": info.get("grossMargins"),
                "revenue_growth_yoy": None,  # would require financials call; skip for speed
            }
        except Exception:
            pass
    return result


# ---------------------------------------------------------------------------
# LLM analysis
# ---------------------------------------------------------------------------

def _analyse_with_llm(
    ticker: str,
    metrics: dict,
    conflicts: list[dict],
    peers_snapshot: dict[str, dict],
    peers: list[str],
    direction_hint: str,
    macro_regime: str,
    position_context: dict | None = None,
) -> dict:
    """Single GPT-4o-mini call to produce fundamental analysis for one ticker."""
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

    def _fmt(val, pct=False, mult=100):
        if val is None:
            return "N/A"
        if pct:
            return f"{val * mult:.1f}%"
        if isinstance(val, float):
            return f"{val:.2f}"
        return str(val)

    # Build peer comparison summary
    peer_lines = []
    pe_vals = [v.get("pe_trailing") for v in peers_snapshot.values() if v.get("pe_trailing")]
    ps_vals = [v.get("price_to_sales") for v in peers_snapshot.values() if v.get("price_to_sales")]
    peer_avg_pe = round(sum(pe_vals) / len(pe_vals), 1) if pe_vals else None
    peer_avg_ps = round(sum(ps_vals) / len(ps_vals), 1) if ps_vals else None
    for p, v in peers_snapshot.items():
        peer_lines.append(f"  {p}: P/E={_fmt(v.get('pe_trailing'))} P/S={_fmt(v.get('price_to_sales'))} EV/EBITDA={_fmt(v.get('ev_to_ebitda'))}")

    conflicts_str = json.dumps(conflicts, indent=2) if conflicts else "None"
    review_instruction = (
        "- This is a PORTFOLIO REVIEW: compare today's fundamentals against the original entry thesis above. "
        "Determine if the thesis is intact, strengthened, or broken."
        if position_context else ""
    )
    thesis_fields = (
        ',\n  "thesis_intact": true or false,'
        '\n  "thesis_drift_notes": "<1-2 sentences: what has changed vs the entry thesis, or No material change detected>"'
        if position_context else ""
    )

    prompt = f"""You are a fundamental equity analyst. Analyse {ticker} and produce a structured JSON assessment.

MACRO CONTEXT: {macro_regime}
CANDIDATE DIRECTION HINT: {direction_hint}
DATA SOURCES USED: {', '.join(metrics.get('sources_used', ['yfinance']))}
DATA CONFLICTS FLAGGED: {len(conflicts)} (details below)

KEY METRICS ({ticker}):
  Revenue: ${_fmt(metrics.get('revenue'))}  |  Revenue growth YoY: {_fmt(metrics.get('revenue_growth_yoy'), pct=True)}
  EPS: {_fmt(metrics.get('eps'))}  |  P/E trailing: {_fmt(metrics.get('pe_trailing'))}  |  P/E forward: {_fmt(metrics.get('pe_forward'))}
  EV/EBITDA: {_fmt(metrics.get('ev_to_ebitda'))}  |  P/S: {_fmt(metrics.get('price_to_sales'))}  |  P/B: {_fmt(metrics.get('price_to_book'))}
  Gross margin: {_fmt(metrics.get('gross_margin'), pct=True)}  |  Operating margin: {_fmt(metrics.get('operating_margin'), pct=True)}
  ROE: {_fmt(metrics.get('roe'), pct=True)}  |  ROIC: {_fmt(metrics.get('roic'), pct=True)}
  Net Debt/EBITDA: {_fmt(metrics.get('net_debt_ebitda'))}  |  Current ratio: {_fmt(metrics.get('current_ratio'))}
  Sector: {metrics.get('sector', 'N/A')}  |  Industry: {metrics.get('industry', 'N/A')}

PEERS: {', '.join(peers) if peers else 'Not available'}
{chr(10).join(peer_lines) if peer_lines else '  Peer data not available'}
  Peer average P/E: {_fmt(peer_avg_pe)}  |  Peer average P/S: {_fmt(peer_avg_ps)}

DATA CONFLICTS:
{conflicts_str}
{_fmt_position_section(position_context)}
INSTRUCTIONS:
- Score the stock 0-100 on fundamental quality and value (100 = exceptional)
- All valuation commentary must reference the peer group — never call a stock cheap/expensive without peer context
- Industry/sector context matters: a high P/E is normal for high-growth tech but abnormal for industrials — benchmark within sector only
- If direction hint is SHORT, look specifically for: margin deterioration, revenue deceleration, leverage risk, FCF/earnings divergence
- If data conflicts exist, note them in key_concerns
- For price_vs_intrinsic_value: express as a % premium or discount to the peer median valuation (e.g. "-28% vs peer P/E median — significant discount")
- dislocation_opportunity: true when price is materially below intrinsic peer-relative value AND underlying business metrics are solid. This means the market may be irrationally penalising the stock beyond what fundamentals justify — a potential LONG opportunity regardless of short-term technicals.
{review_instruction}

Return ONLY valid JSON matching this exact structure:
{{
  "ticker": "{ticker}",
  "fundamental_score": <integer 0-100>,
  "direction": "LONG" or "SHORT",
  "valuation_vs_peers": "<one sentence — e.g. 'slight premium vs peers, justified by 22% revenue growth'>",
  "price_vs_intrinsic_value": "<e.g. '-30% vs peer P/E median — potential dislocation' or 'in line with peers'>",
  "dislocation_opportunity": true | false,
  "pe_ratio": <float or null>,
  "pe_peer_average": <float or null>,
  "revenue_growth_yoy": <float as decimal e.g. 0.22 or null>,
  "operating_margin": <float as decimal or null>,
  "roic": <float as decimal or null>,
  "net_debt_ebitda": <float or null>,
  "peers_used": {json.dumps(peers)},
  "key_strengths": ["<strength 1>", "<strength 2>"],
  "key_concerns": ["<concern 1>"],
  "fundamental_summary": "<2-3 sentence analyst-style narrative — must address whether current price fairly reflects fundamentals>"{thesis_fields}
}}"""

    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=500,
            response_format={"type": "json_object"},
        )
        result = json.loads(resp.choices[0].message.content)
    except Exception as exc:
        logger.error("LLM analysis failed for %s: %s", ticker, exc)
        result = {
            "ticker": ticker, "fundamental_score": 50, "direction": direction_hint,
            "valuation_vs_peers": "Analysis unavailable",
            "key_strengths": [], "key_concerns": [f"LLM error: {exc}"],
            "fundamental_summary": "Analysis could not be completed.",
        }

    return result


# ---------------------------------------------------------------------------
# Main run function
# ---------------------------------------------------------------------------

def run(mode: str = "new_opportunities") -> dict:
    logger.info("=== Fundamental Analyst (Agent 6) — mode: %s ===", mode)

    # Load candidate list from Agent 5
    candidates_path = REPORTS_DIR / "candidates_report.json"
    if not candidates_path.exists():
        raise RuntimeError("candidates_report.json not found — run Agent 5 first")
    with open(candidates_path) as f:
        candidates_data = json.load(f)

    candidates = candidates_data.get("candidates", [])[:MAX_CANDIDATES]
    logger.info("Analysing %d candidates", len(candidates))

    # Load macro context
    macro_path = REPORTS_DIR / "macro_report.json"
    macro_regime = "NEUTRAL"
    if macro_path.exists():
        with open(macro_path) as f:
            macro = json.load(f)
        macro_regime = macro.get("regime", "NEUTRAL")

    # Load SEC EDGAR CIK map (one call for all tickers)
    _load_cik_map()

    results: list[dict] = []

    for i, candidate in enumerate(candidates):
        ticker = str(candidate.get("ticker", "")).upper()
        direction_hint = str(candidate.get("direction_hint", "LONG")).upper()
        logger.info("[%d/%d] Analysing %s (%s)...", i + 1, len(candidates), ticker, direction_hint)

        # Load position context in portfolio_review mode
        position_context = _load_position_context(ticker) if mode == "portfolio_review" else None
        if position_context:
            direction_hint = str(position_context.get("direction", direction_hint)).upper()

        # Fetch from all 3 sources
        yf_metrics = _fetch_yf_metrics(ticker)
        av_metrics = _fetch_av_metrics(ticker)
        edgar_metrics = _fetch_edgar_metrics(ticker)

        # Cross-reference and reconcile
        reconciled, conflicts = _cross_reference(yf_metrics, av_metrics, edgar_metrics)

        # Identify peers and fetch their snapshot
        peers = _fetch_peers(ticker)
        peers_snapshot = _fetch_peer_snapshot(peers) if peers else {}

        # LLM analysis
        llm_result = _analyse_with_llm(
            ticker, reconciled, conflicts, peers_snapshot, peers,
            direction_hint, macro_regime, position_context
        )

        # Attach data quality metadata
        conf_level = "high" if reconciled["sources_count"] >= 3 and not conflicts else \
                     "medium" if reconciled["sources_count"] >= 2 else "low"

        llm_result["data_conflicts"] = conflicts
        llm_result["data_confidence"] = {
            "level": conf_level,
            "sources_count": reconciled["sources_count"],
            "sources_used": reconciled["sources_used"],
            "conflicts_count": len(conflicts),
        }

        # Attach P&L context in portfolio_review mode
        if position_context:
            entry_price = position_context.get("entry_price")
            current_price = reconciled.get("current_price") or reconciled.get("price")
            direction = position_context.get("direction", "LONG").upper()
            if entry_price and current_price:
                raw_pnl = (current_price - entry_price) / entry_price
                pnl_pct = round(raw_pnl * 100 if direction == "LONG" else -raw_pnl * 100, 2)
            else:
                pnl_pct = None
            llm_result["entry_price"] = entry_price
            llm_result["current_price"] = current_price
            llm_result["pnl_pct"] = pnl_pct

        # Candidate context passthrough
        llm_result["candidate_score"] = candidate.get("score")
        llm_result["candidate_signals"] = candidate.get("signals", [])

        results.append(llm_result)

        # Brief pause to avoid hammering APIs
        time.sleep(0.5)

    output = {
        "fundamental_analyses": results,
        "total_analysed": len(results),
        "macro_regime": macro_regime,
        "av_calls_used": _av_calls_used,
        "generated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
    }

    with open(OUT_PATH, "w") as f:
        json.dump(output, f, indent=2)

    logger.info("Saved fundamental report to %s", OUT_PATH)
    logger.info("=== Fundamental Analyst complete: %d tickers analysed ===", len(results))
    return output


if __name__ == "__main__":
    result = run()
    print(f"\nAnalysed {result['total_analysed']} tickers")
    print(f"Alpha Vantage calls used: {result['av_calls_used']}/{AV_DAY_LIMIT}")
    for a in result["fundamental_analyses"][:5]:
        conflicts = len(a.get("data_conflicts", []))
        conf = a.get("data_confidence", {}).get("level", "?")
        print(
            f"  {a['ticker']:6s}  score={a.get('fundamental_score', '?'):3}  "
            f"dir={a.get('direction', '?'):5s}  "
            f"data={conf} ({a.get('data_confidence', {}).get('sources_count', '?')} src)  "
            f"conflicts={conflicts}"
        )
