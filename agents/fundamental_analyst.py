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

from utils.data_fetcher import (
    fetch_fmp_income_statement,
    fetch_fmp_key_metrics,
    fetch_fmp_analyst_estimates,
)
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

        # Analyst consensus forward estimates (Yahoo Finance / Wall Street consensus)
        # These are REAL analyst estimates, not LLM guesses.
        try:
            rev_est = t.revenue_estimate
            if rev_est is not None and not rev_est.empty:
                fwd_revs = []
                for idx in rev_est.index:
                    row = rev_est.loc[idx]
                    avg = row.get("avg") if hasattr(row, "get") else None
                    if avg is not None:
                        fwd_revs.append({"period": str(idx), "revenue_avg": float(avg)})
                if fwd_revs:
                    result["analyst_revenue_estimates"] = fwd_revs
        except Exception:
            pass

        try:
            earn_est = t.earnings_estimate
            if earn_est is not None and not earn_est.empty:
                fwd_eps = []
                for idx in earn_est.index:
                    row = earn_est.loc[idx]
                    avg = row.get("avg") if hasattr(row, "get") else None
                    if avg is not None:
                        fwd_eps.append({"period": str(idx), "eps_avg": float(avg)})
                if fwd_eps:
                    result["analyst_eps_estimates"] = fwd_eps
        except Exception:
            pass

        # 3-year historical financials for institutional framework
        try:
            fin2 = t.income_stmt
            if fin2 is not None and not fin2.empty:
                hist_years: list[dict] = []
                for col in list(fin2.columns)[:4]:
                    yr: dict = {}
                    try:
                        yr["period"] = str(col)[:4]
                        for rl in ("Total Revenue", "Revenue", "Net Revenue"):
                            if rl in fin2.index:
                                v = fin2.loc[rl, col]
                                yr["revenue"] = float(v) if v is not None else None
                                break
                        if "Operating Income" in fin2.index and "Reconciled Depreciation" in fin2.index:
                            oi = fin2.loc["Operating Income", col]
                            dep = fin2.loc["Reconciled Depreciation", col]
                            if oi is not None and dep is not None:
                                yr["ebitda"] = round(float(oi) + float(dep), 0)
                        for nl in ("Net Income", "Net Income Common Stockholders"):
                            if nl in fin2.index:
                                v = fin2.loc[nl, col]
                                yr["net_income"] = float(v) if v is not None else None
                                break
                        if yr.get("period") and yr.get("revenue") is not None:
                            hist_years.append(yr)
                    except Exception:
                        pass
                if hist_years:
                    result["historical_financials"] = hist_years
        except Exception:
            pass

        # Ownership data
        try:
            result["held_percent_institutions"] = info.get("heldPercentInstitutions")
            result["held_percent_insiders"] = info.get("heldPercentInsiders")
            result["float_shares"] = info.get("floatShares")
            result["shares_outstanding"] = info.get("sharesOutstanding")
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
# FMP metrics
# ---------------------------------------------------------------------------

def _fetch_fmp_metrics(ticker: str) -> dict:
    """Extract key fundamental metrics from Financial Modeling Prep (FMP)."""
    result: dict = {"source": "fmp", "ticker": ticker}
    key = os.environ.get("FMP_API_KEY")
    if not key:
        result["error"] = "FMP_API_KEY not set"
        return result

    try:
        # Income statement — most recent annual
        income = fetch_fmp_income_statement(ticker, limit=2)
        if income:
            latest = income[0]
            result["revenue_ttm"] = latest.get("revenue")
            result["gross_profit"] = latest.get("grossProfit")
            result["ebitda"] = latest.get("ebitda")
            result["net_income"] = latest.get("netIncome")
            result["eps_ttm"] = latest.get("epsDiluted")
            if len(income) >= 2 and income[1].get("revenue") and income[1]["revenue"] != 0:
                r0, r1 = income[0].get("revenue", 0), income[1].get("revenue", 0)
                result["revenue_growth_yoy"] = round((r0 - r1) / abs(r1), 4) if r1 else None
            result["gross_margin"] = (
                round(latest["grossProfit"] / latest["revenue"], 4)
                if latest.get("grossProfit") and latest.get("revenue") and latest["revenue"] != 0
                else None
            )
            result["operating_income"] = latest.get("operatingIncome")
            result["operating_margin"] = (
                round(latest["operatingIncome"] / latest["revenue"], 4)
                if latest.get("operatingIncome") and latest.get("revenue") and latest["revenue"] != 0
                else None
            )
            result["period"] = latest.get("date")
    except Exception as exc:
        logger.warning("FMP income statement parse failed for %s: %s", ticker, exc)

    try:
        # Key metrics — P/E, EV/EBITDA, ROIC, D/E
        km = fetch_fmp_key_metrics(ticker, limit=1)
        if km:
            m = km[0]
            # FMP /stable/ endpoint uses different field names from the old /api/v3/ endpoint.
            ey = m.get("earningsYield")
            result["pe_trailing"] = round(1 / ey, 1) if ey and ey != 0 else None
            result["pb_ratio"] = m.get("pbRatio")  # not in free key-metrics; stays None
            result["ev_to_ebitda"] = m.get("evToEBITDA") or m.get("evToEbitda")
            result["roic"] = m.get("returnOnInvestedCapital") or m.get("roic")
            result["return_on_equity"] = m.get("returnOnEquity")
            result["debt_to_equity"] = m.get("debtToEquity")  # not in /stable/ key-metrics
            result["price_to_sales"] = m.get("evToSales") or m.get("priceToSalesRatio")
            result["net_debt_ebitda"] = m.get("netDebtToEBITDA")
            result["current_ratio"] = m.get("currentRatio")
            result["free_cashflow"] = m.get("freeCashFlowYield") or m.get("freeCashFlowPerShare")
            result["dividend_yield"] = m.get("dividendYield")
    except Exception as exc:
        logger.warning("FMP key metrics parse failed for %s: %s", ticker, exc)

    try:
        # Analyst forward estimates
        ests = fetch_fmp_analyst_estimates(ticker, limit=4)
        if ests:
            # Filter to future periods
            from datetime import date as _date
            today_str = str(_date.today())
            future_ests = [e for e in ests if e.get("date", "") >= today_str[:7]][:2]
            if future_ests:
                result["fmp_revenue_estimates"] = [
                    {
                        "period": e.get("date", "")[:7],
                        "revenue_avg": e.get("estimatedRevenueAvg"),
                        "revenue_low": e.get("estimatedRevenueLow"),
                        "revenue_high": e.get("estimatedRevenueHigh"),
                        "eps_avg": e.get("estimatedEpsAvg"),
                        "num_analysts": e.get("numberAnalysts"),
                    }
                    for e in future_ests
                ]
    except Exception as exc:
        logger.warning("FMP analyst estimates parse failed for %s: %s", ticker, exc)

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


def _cross_reference(yf: dict, av: dict, edgar: dict, fmp: dict | None = None) -> tuple[dict, list[dict]]:
    """
    Merge four source dicts into a single reconciled metrics dict.
    Returns (reconciled_dict, conflicts_list).
    SEC EDGAR is ground truth for revenue and EPS.
    FMP provides an additional cross-check and supplements missing metrics.
    Conservative figure used when sources disagree.
    """
    reconciled: dict = {}
    conflicts: list[dict] = []
    sources_used: list[str] = ["yfinance"]

    av_ok = "error" not in av
    edgar_ok = "error" not in edgar and edgar.get("revenue_annual") is not None
    fmp_ok = fmp is not None and "error" not in fmp and fmp.get("revenue_ttm") is not None

    if av_ok:
        sources_used.append("alpha_vantage")
    if edgar_ok:
        sources_used.append("sec_edgar")
    if fmp_ok:
        sources_used.append("fmp")

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
        "held_percent_institutions", "held_percent_insiders", "float_shares",
        "shares_outstanding", "historical_financials", "net_income_ttm", "ebitda",
        "total_cash", "total_debt",
        "analyst_revenue_estimates", "analyst_eps_estimates",
    ):
        reconciled[field] = yf.get(field)

    # --- FMP cross-checks and supplements ---
    if fmp_ok:
        # Revenue: FMP as a third corroboration (after yf/AV reconcile, before EDGAR override)
        fmp_rev = fmp.get("revenue_ttm")
        current_rev = reconciled.get("revenue") or reconciled.get("revenue_ttm") or yf.get("revenue_ttm")
        if fmp_rev and current_rev:
            c = _check_conflict("revenue_ttm (fmp vs reconciled)", current_rev, fmp_rev, "yf_av", "fmp")
            if c:
                conflicts.append(c)

        # Supplement missing margins with FMP
        for fmp_field, rec_field in (
            ("gross_margin", "gross_margin"),
            ("operating_margin", "operating_margin"),
            ("revenue_growth_yoy", "revenue_growth_yoy"),
        ):
            if not reconciled.get(rec_field) and fmp.get(fmp_field) is not None:
                reconciled[rec_field] = fmp[fmp_field]

        # Supplement missing key ratios with FMP
        for fmp_field, rec_field in (
            ("roic", "roic"),
            ("ev_to_ebitda", "ev_to_ebitda"),
            ("net_debt_ebitda", "net_debt_ebitda"),
            ("current_ratio", "current_ratio"),
            ("price_to_sales", "price_to_sales"),
        ):
            if not reconciled.get(rec_field) and fmp.get(fmp_field) is not None:
                reconciled[rec_field] = fmp[fmp_field]

        # FMP forward estimates supplement yfinance if missing
        if not reconciled.get("analyst_revenue_estimates") and fmp.get("fmp_revenue_estimates"):
            reconciled["analyst_revenue_estimates"] = [
                {"period": e["period"], "revenue_avg": e["revenue_avg"]}
                for e in fmp["fmp_revenue_estimates"]
                if e.get("revenue_avg")
            ]
        if not reconciled.get("analyst_eps_estimates") and fmp.get("fmp_revenue_estimates"):
            reconciled["analyst_eps_estimates"] = [
                {"period": e["period"], "eps_avg": e["eps_avg"]}
                for e in fmp["fmp_revenue_estimates"]
                if e.get("eps_avg")
            ]

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
    """
    Fetch live fundamental metrics for each peer from yfinance.
    All figures come from Yahoo Finance (sourced from SEC filings) — no LLM estimates.
    """
    result: dict[str, dict] = {}
    for p in peers:
        try:
            t = yf.Ticker(p)
            info = t.info or {}
            peer: dict = {
                "pe_trailing": info.get("trailingPE"),
                "pe_forward": info.get("forwardPE"),
                "price_to_sales": info.get("priceToSalesTrailing12Months"),
                "ev_to_ebitda": info.get("enterpriseToEbitda"),
                "gross_margin": info.get("grossMargins"),
                "operating_margin": info.get("operatingMargins"),
                "profit_margin": info.get("profitMargins"),
                "debt_to_equity": info.get("debtToEquity"),
                "revenue_ttm": info.get("totalRevenue"),
                "market_cap": info.get("marketCap"),
                "revenue_growth_yoy": None,
            }
            # Pull revenue YoY growth from income statement (live filed data)
            try:
                fin = t.income_stmt
                if fin is not None and not fin.empty:
                    for label in ("Total Revenue", "Revenue", "Net Revenue"):
                        if label in fin.index:
                            rev_row = fin.loc[label]
                            if len(rev_row) >= 2:
                                r0 = float(rev_row.iloc[0])
                                r1 = float(rev_row.iloc[1])
                                if r1 and r1 != 0:
                                    peer["revenue_growth_yoy"] = round((r0 - r1) / abs(r1), 4)
                            break
            except Exception:
                pass
            result[p] = peer
        except Exception:
            pass
    return result


# ---------------------------------------------------------------------------
# LLM analysis
# ---------------------------------------------------------------------------

def _score_with_llm(
    ticker: str,
    metrics: dict,
    conflicts: list[dict],
    peers_snapshot: dict[str, dict],
    peers: list[str],
    direction_hint: str,
    macro_regime: str,
    position_context: dict | None = None,
    convergence_signal: dict | None = None,
    fund_thesis: dict | None = None,
) -> dict:
    """
    SCORING CALL — feeds into the composite score and Committee decisions.

    STRICT RULE: This call uses ONLY verified live API data passed in the prompt.
    The LLM must base fundamental_score, direction, and all scoring fields
    exclusively on the numbers provided. It must NOT draw on training knowledge
    about the company's narrative, products, or reputation to influence the score.

    Output fields from this call: fundamental_score, direction, valuation_vs_peers,
    price_vs_intrinsic_value, dislocation_opportunity, key_strengths, key_concerns,
    fundamental_summary, pe_ratio, pe_peer_average, revenue_growth_yoy,
    operating_margin, roic, net_debt_ebitda, peers_used, setup_type,
    fcf_positive, leverage_vs_peers, default_risk, margin_trend,
    thesis_intact / thesis_drift_notes (portfolio_review mode only).
    """
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

    def _fmt(val, pct=False, mult=100):
        if val is None:
            return "N/A"
        if pct:
            return f"{val * mult:.1f}%"
        if isinstance(val, float):
            return f"{val:.2f}"
        return str(val)

    def _fmt_bn(val: float | None) -> str:
        if val is None:
            return "N/A"
        if abs(val) >= 1e9:
            return f"${val / 1e9:.1f}B"
        if abs(val) >= 1e6:
            return f"${val / 1e6:.0f}M"
        return f"${val:.0f}"

    # Build live peer comparison block (all from yfinance — verified data)
    peer_lines = []
    pe_vals = [v.get("pe_trailing") for v in peers_snapshot.values() if v.get("pe_trailing")]
    ps_vals = [v.get("price_to_sales") for v in peers_snapshot.values() if v.get("price_to_sales")]
    peer_avg_pe = round(sum(pe_vals) / len(pe_vals), 1) if pe_vals else None
    peer_avg_ps = round(sum(ps_vals) / len(ps_vals), 1) if ps_vals else None
    for p, v in peers_snapshot.items():
        peer_lines.append(
            f"  {p}: P/E={_fmt(v.get('pe_trailing'))} "
            f"P/S={_fmt(v.get('price_to_sales'))} "
            f"EV/EBITDA={_fmt(v.get('ev_to_ebitda'))} "
            f"GrossMargin={_fmt(v.get('gross_margin'), pct=True)} "
            f"OpMargin={_fmt(v.get('operating_margin'), pct=True)} "
            f"NetMargin={_fmt(v.get('profit_margin'), pct=True)} "
            f"D/E={_fmt(v.get('debt_to_equity'))} "
            f"RevGrowth={_fmt(v.get('revenue_growth_yoy'), pct=True)}"
        )

    # Historical financials (yfinance/SEC EDGAR — verified)
    hist = metrics.get("historical_financials", [])
    hist_lines = [
        f"  {h.get('period','?')}: Revenue={_fmt_bn(h.get('revenue'))} "
        f"EBITDA={_fmt_bn(h.get('ebitda'))} Net Income={_fmt_bn(h.get('net_income'))}"
        for h in (hist or [])[:4]
    ]
    hist_section = "\n".join(hist_lines) if hist_lines else "  Not available from filed data"

    # Analyst forward estimates (Yahoo Finance consensus — NOT LLM)
    rev_ests = metrics.get("analyst_revenue_estimates", [])
    eps_ests = metrics.get("analyst_eps_estimates", [])
    fwd_section = ""
    if rev_ests:
        fwd_section += "  Revenue estimates (analyst consensus from Yahoo Finance):\n"
        for e in rev_ests[:2]:
            fwd_section += f"    {e['period']}: {_fmt_bn(e.get('revenue_avg'))}\n"
    if eps_ests:
        fwd_section += "  EPS estimates (analyst consensus):\n"
        for e in eps_ests[:2]:
            fwd_section += f"    {e['period']}: ${_fmt(e.get('eps_avg'))}\n"
    if not fwd_section:
        fwd_section = "  Not available — no analyst estimates found in Yahoo Finance"

    inst_pct = metrics.get("held_percent_institutions")
    insider_pct = metrics.get("held_percent_insiders")
    float_shares = metrics.get("float_shares")
    shares_out = metrics.get("shares_outstanding")
    float_pct = round(float_shares / shares_out * 100, 1) if float_shares and shares_out else None

    conflicts_str = json.dumps(conflicts, indent=2) if conflicts else "None"
    review_instruction = (
        "- PORTFOLIO REVIEW MODE: compare today's quantitative metrics vs the entry thesis recorded below. "
        "Determine if the fundamental thesis is intact, strengthened, or broken based solely on numbers."
        if position_context else ""
    )
    thesis_fields = (
        ',\n  "thesis_intact": true or false,'
        '\n  "thesis_drift_notes": "<1-2 sentences: what changed vs entry thesis metrics, or No material change>"'
        if position_context else ""
    )

    prompt = f"""You are a quantitative equity analyst. Score {ticker} using ONLY the verified data below.

CRITICAL RULE: Your fundamental_score, direction, dislocation_opportunity, and all other scoring fields
must be derived EXCLUSIVELY from the numbers in this prompt. Do NOT use your training knowledge about
{ticker}'s products, brand, competitive position, or business narrative to influence any score.
Only numbers count. If data is missing (N/A), treat it as neutral.

MACRO: {macro_regime}  |  DIRECTION HINT: {direction_hint}
DATA SOURCES: {', '.join(metrics.get('sources_used', ['yfinance']))} — all live as of today
CROSS-SOURCE CONFLICTS: {len(conflicts)}

LIVE METRICS ({ticker}):
  Market Cap: {_fmt_bn(metrics.get('market_cap'))}  Sector: {metrics.get('sector','N/A')}  Industry: {metrics.get('industry','N/A')}
  Revenue TTM: {_fmt_bn(metrics.get('revenue'))}  Rev growth YoY: {_fmt(metrics.get('revenue_growth_yoy'), pct=True)}
  EBITDA: {_fmt_bn(metrics.get('ebitda'))}  Net Income TTM: {_fmt_bn(metrics.get('net_income_ttm'))}
  EPS (filed): {_fmt(metrics.get('eps'))}  P/E trailing: {_fmt(metrics.get('pe_trailing'))}  P/E forward: {_fmt(metrics.get('pe_forward'))}
  EV/EBITDA: {_fmt(metrics.get('ev_to_ebitda'))}  P/S: {_fmt(metrics.get('price_to_sales'))}  P/B: {_fmt(metrics.get('price_to_book'))}
  Gross margin: {_fmt(metrics.get('gross_margin'), pct=True)}  Op margin: {_fmt(metrics.get('operating_margin'), pct=True)}  Net margin: {_fmt(metrics.get('profit_margin'), pct=True)}
  ROE: {_fmt(metrics.get('roe'), pct=True)}  ROIC: {_fmt(metrics.get('roic'), pct=True)}
  Net Debt/EBITDA: {_fmt(metrics.get('net_debt_ebitda'))}  D/E: {_fmt(metrics.get('debt_to_equity'))}  Current ratio: {_fmt(metrics.get('current_ratio'))}  Beta: {_fmt(metrics.get('beta'))}
  FCF: {_fmt_bn(metrics.get('free_cashflow') or metrics.get('fcf'))}
  Institutional ownership: {f"{inst_pct*100:.1f}%" if inst_pct else "N/A"}  Insider: {f"{insider_pct*100:.1f}%" if insider_pct else "N/A"}  Float: {f"{float_pct}%" if float_pct else "N/A"}

HISTORICAL FINANCIALS (yfinance / SEC EDGAR filed):
{hist_section}

ANALYST FORWARD ESTIMATES (Yahoo Finance Wall Street consensus — real data, not LLM):
{fwd_section}

LIVE PEER COMPARABLES (all from yfinance — no LLM estimates):
{chr(10).join(peer_lines) if peer_lines else '  No peer data available'}
  Peer avg P/E: {_fmt(peer_avg_pe)}  |  Peer avg P/S: {_fmt(peer_avg_ps)}

DATA CONFLICTS (conservative values applied):
{conflicts_str}
{_fmt_position_section(position_context)}
INSTITUTIONAL CONTEXT (from Institutional Agent — informational only, do not let this override financial metrics):
{f"CONVERGENCE SIGNAL: {convergence_signal.get('funds')} independently initiated/increased {ticker} — thesis: {convergence_signal.get('note', '')} | Strength: {convergence_signal.get('signal_strength', '')}" if convergence_signal else "No convergence signal for this ticker."}
{f"INFERRED FUND THESIS: {fund_thesis.get('inferred_thesis', 'unknown')} — {fund_thesis.get('thesis_reasoning', '')}" if fund_thesis else ""}

SCORING RULES (numbers only):
- fundamental_score 0-100: weight peer-relative valuation (30%), profitability vs peers (25%), balance sheet health (20%), growth vs peers (15%), data completeness (10%)
- direction: LONG if metrics are above peer median AND no distress signals; SHORT if deteriorating vs peers
- dislocation_opportunity: true ONLY when P/E (or P/S for unprofitable) is >20% below peer median AND ROE/ROIC confirm business quality
- setup_type based purely on numbers: Growth = revenue_growth_yoy >15%; Distressed = D/E >3 or net_income negative 2+ yrs; Short = margins contracting + revenue decelerating
- price_vs_intrinsic_value: calculate % discount/premium vs peer median P/E (or P/S if P/E unavailable)
- key_strengths / key_concerns: cite specific numbers, not narrative
- leverage_vs_peers: compare D/E to peer average D/E from the peer data above
- default_risk: Low if current_ratio >1.5 and D/E <2; High if current_ratio <1 or D/E >5
{review_instruction}

Return ONLY valid JSON:
{{
  "ticker": "{ticker}",
  "fundamental_score": <0-100>,
  "direction": "LONG" or "SHORT",
  "valuation_vs_peers": "<one sentence citing specific numbers and peer comparison>",
  "price_vs_intrinsic_value": "<% premium or discount vs peer median valuation metric>",
  "dislocation_opportunity": true | false,
  "pe_ratio": <float or null>,
  "pe_peer_average": <float or null>,
  "revenue_growth_yoy": <decimal or null>,
  "operating_margin": <decimal or null>,
  "roic": <decimal or null>,
  "net_debt_ebitda": <float or null>,
  "peers_used": {json.dumps(peers)},
  "setup_type": "<Growth|Distressed/Turnaround|Event-Driven|Short>",
  "margin_trend": "<Expanding|Stable|Contracting>",
  "fcf_positive": <true|false|null>,
  "leverage_vs_peers": "<Lower|Similar|Higher>",
  "default_risk": "<Low|Medium|High>",
  "key_strengths": ["<strength — must cite a specific number>"],
  "key_concerns": ["<concern — must cite a specific number>"],
  "fundamental_summary": "<2-3 sentences citing specific metrics and peer comparisons only>"{thesis_fields}
}}"""

    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=800,
            response_format={"type": "json_object"},
        )
        result = json.loads(resp.choices[0].message.content)
    except Exception as exc:
        logger.error("LLM scoring failed for %s: %s", ticker, exc)
        result = {
            "ticker": ticker, "fundamental_score": 50, "direction": direction_hint,
            "valuation_vs_peers": "Scoring unavailable",
            "key_strengths": [], "key_concerns": [f"LLM error: {exc}"],
            "fundamental_summary": "Scoring could not be completed.",
        }
    return result


def _framework_with_llm(
    ticker: str,
    metrics: dict,
    peers_snapshot: dict[str, dict],
    peers: list[str],
    score_result: dict,
) -> dict:
    """
    DISPLAY-ONLY CALL — produces the institutional analyst framework for the website.

    *** THIS OUTPUT IS NEVER USED FOR SCORING OR TRADING DECISIONS ***
    It is stored in positions_log.json for display purposes only.

    Uses LLM training knowledge for: company overview, management, market analysis,
    TAM, geography notes, analyst consensus trend (qualitative), cap table narrative.
    Uses live API data for: comparables table, financial snapshot, ownership %.

    Comparables table uses ONLY verified yfinance data passed in peers_snapshot.
    Forward projections use ONLY analyst consensus data from Yahoo Finance if available;
    otherwise marks the field null with source="unavailable".
    """
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

    def _fmt_bn(val: float | None) -> str:
        if val is None:
            return "N/A"
        if abs(val) >= 1e9:
            return f"${val / 1e9:.1f}B"
        if abs(val) >= 1e6:
            return f"${val / 1e6:.0f}M"
        return f"${val:.0f}"

    def _fmt(val) -> str:
        if val is None:
            return "N/A"
        if isinstance(val, float):
            return f"{val:.2f}"
        return str(val)

    inst_pct = metrics.get("held_percent_institutions")
    insider_pct = metrics.get("held_percent_insiders")
    float_shares = metrics.get("float_shares")
    shares_out = metrics.get("shares_outstanding")
    float_pct = round(float_shares / shares_out * 100, 1) if float_shares and shares_out else None

    # Build verified comparables table from live yfinance peer data
    comp_rows = []
    for p, v in peers_snapshot.items():
        rev = v.get("revenue_ttm")
        gm = v.get("gross_margin")
        om = v.get("operating_margin")
        nm = v.get("profit_margin")
        de = v.get("debt_to_equity")
        comp_rows.append(
            f'  {{"ticker": "{p}", "company": null, '
            f'"revenue_bn": {round(rev/1e9,1) if rev else "null"}, '
            f'"gross_margin_pct": {round(gm*100,1) if gm else "null"}, '
            f'"ebitda_margin_pct": {round(om*100+3,1) if om else "null"}, '
            f'"net_margin_pct": {round(nm*100,1) if nm else "null"}, '
            f'"de_ratio": {round(de/100,2) if de else "null"}}}'
        )

    # Subject company comparables row from reconciled metrics
    subj_gm = metrics.get("gross_margin")
    subj_om = metrics.get("operating_margin")
    subj_pm = metrics.get("profit_margin")
    subj_de = metrics.get("debt_to_equity")
    subj_rev = metrics.get("revenue")
    subj_row = (
        f'  {{"ticker": "{ticker}", "company": null, "is_subject": true, '
        f'"revenue_bn": {round(subj_rev/1e9,1) if subj_rev else "null"}, '
        f'"gross_margin_pct": {round(subj_gm*100,1) if subj_gm else "null"}, '
        f'"ebitda_margin_pct": {round(subj_om*100+3,1) if subj_om else "null"}, '
        f'"net_margin_pct": {round(subj_pm*100,1) if subj_pm else "null"}, '
        f'"de_ratio": {round(subj_de/100,2) if subj_de else "null"}}}'
    )

    # Forward estimates from Yahoo Finance if available
    rev_ests = metrics.get("analyst_revenue_estimates", [])
    eps_ests = metrics.get("analyst_eps_estimates", [])
    fwd_note = "analyst consensus from Yahoo Finance" if rev_ests else "unavailable — no Yahoo Finance estimates found"

    # Historical from filed data
    hist = metrics.get("historical_financials", [])
    hist_json = json.dumps([
        {"year": h.get("period","?"), "revenue": h.get("revenue"), "ebitda": h.get("ebitda"), "net_income": h.get("net_income")}
        for h in (hist or [])[:4]
    ])

    prompt = f"""You are completing the display framework for a position in an AI hedge fund dashboard.
Ticker: {ticker}  Sector: {metrics.get('sector','N/A')}  Market Cap: {_fmt_bn(metrics.get('market_cap'))}

IMPORTANT: This output is for DISPLAY ONLY. It does not affect trading decisions or scores.
The scoring has already been done separately using only verified data.

Use your training knowledge for narrative fields. If uncertain about specifics, say so clearly.
NEVER invent specific financial figures for this company — those must come from the live data below.

VERIFIED LIVE DATA (use these exact figures — do not contradict):
  Revenue: {_fmt_bn(metrics.get('revenue'))}  EBITDA: {_fmt_bn(metrics.get('ebitda'))}  Net Income: {_fmt_bn(metrics.get('net_income_ttm'))}
  Institutions: {f"{inst_pct*100:.1f}%" if inst_pct else "N/A"}  Insiders: {f"{insider_pct*100:.1f}%" if insider_pct else "N/A"}  Float: {f"{float_pct}%" if float_pct else "N/A"}
  Historical (verified, use as-is): {hist_json}
  Forward estimates source: {fwd_note}

PRE-BUILT COMPARABLES (from live yfinance — use exact figures, only add company name):
[{subj_row},
{chr(10).join(comp_rows) if comp_rows else '  (no peer data available)'}]

Market cap context: {_fmt_bn(metrics.get('market_cap'))} — classify as: <$300M=Small Cap, $300M-$2B=Mid Cap, $2B-$10B=Large Cap, >$10B=Mega Cap

Return ONLY valid JSON:
{{
  "fund_mandate": {{
    "asset_class": "Equity",
    "exchange": "<NYSE|NASDAQ|null — from training knowledge>",
    "sector": "{metrics.get('sector', 'N/A')}",
    "market_cap_figure": "<size + figure from live data above>",
    "avg_daily_volume_usd": "<from training knowledge, or null>",
    "geography_flags": {{"russia_exposure": <bool>, "mongolia_exposure": <bool>, "cambodia_exposure": <bool>, "exposure_detail": "<revenue geography — training knowledge, null if unsure>"}},
    "peps_check": {{"clean": <bool or null>, "notes": "<from training knowledge, or 'Unverified — manual check required'>"}},
    "setup_type": "{score_result.get('setup_type', 'N/A')}",
    "float_pct": {float_pct if float_pct else "null"}
  }},
  "company_info": {{
    "hq": "<city, country — training knowledge>",
    "employees": <integer or null>,
    "overview": "<1 paragraph — training knowledge, clearly labelled>",
    "revenue_segments": [{{"segment": "<name>", "weight_pct": <float>}}],
    "geography_breakdown": [{{"region": "<name>", "pct": <float>}}]
  }},
  "financial_snapshot": {{
    "historical": <use the verified historical array provided above exactly>,
    "forward": [
      {{"year": "{rev_ests[0]['period'] if rev_ests else 'N/A'}", "revenue": {rev_ests[0].get('revenue_avg') if rev_ests else 'null'}, "ebitda": null, "net_income": {eps_ests[0].get('eps_avg') if eps_ests else 'null'}, "source": "{fwd_note}"}},
      {{"year": "{rev_ests[1]['period'] if len(rev_ests) > 1 else 'N/A'}", "revenue": {rev_ests[1].get('revenue_avg') if len(rev_ests) > 1 else 'null'}, "ebitda": null, "net_income": {eps_ests[1].get('eps_avg') if len(eps_ests) > 1 else 'null'}, "source": "{fwd_note}"}}
    ]
  }},
  "comparables": <use the pre-built comparables array above exactly — only fill in "company" name for each ticker>,
  "market_analysis": {{
    "tam_usd": "<qualitative description — training knowledge, null if uncertain>",
    "growth_rate": "<qualitative — training knowledge, null if uncertain>",
    "competition_intensity": "<Low|Medium|High>",
    "sector_trends": "<1-2 sentences — training knowledge>",
    "macro_factors": "<1-2 sentences — training knowledge>"
  }},
  "quality_of_earnings": {{
    "moat": "<Narrow|Wide|None — based on training knowledge>",
    "competitive_advantages": ["<advantage>"],
    "barriers_to_entry": "<description>",
    "sustainability": "<assessment>"
  }},
  "management_team": {{
    "ceo": "<name and brief background — training knowledge, null if unsure>",
    "track_record": "<assessment — training knowledge>",
    "red_flags": null
  }},
  "analyst_rating_history": {{
    "current_consensus": "<Buy|Hold|Sell — training knowledge, null if unsure>",
    "num_analysts": null,
    "avg_target_price": null,
    "implied_upside_pct": null,
    "trend_24m": "<Upgrading|Downgrading|Stable — training knowledge, null if unsure>",
    "summary": "<1-2 sentences — training knowledge>"
  }},
  "cap_table": {{
    "institutional_pct": {round(inst_pct*100,1) if inst_pct else "null"},
    "insider_pct": {round(insider_pct*100,1) if insider_pct else "null"},
    "float_pct": {float_pct if float_pct else "null"},
    "major_holders": [{{"name": "<fund name — training knowledge>", "pct": <float>}}]
  }},
  "setup_checklist": {{
    "setup_type": "{score_result.get('setup_type', 'N/A')}",
    "revenue_cagr_3yr": null,
    "above_20pct_threshold": null,
    "margin_trend": "{score_result.get('margin_trend', 'N/A')}",
    "sustainability_assessment": "<from training knowledge>",
    "tam_room_to_grow": "<from training knowledge>",
    "eps_growth_consistent": null,
    "fcf_positive": {str(score_result.get('fcf_positive')).lower() if score_result.get('fcf_positive') is not None else "null"},
    "leverage_vs_peers": "{score_result.get('leverage_vs_peers', 'N/A')}",
    "default_risk": "{score_result.get('default_risk', 'N/A')}",
    "upcoming_catalysts": ["<catalyst — training knowledge>"],
    "key_risks": ["<risk — training knowledge>"],
    "moat_strength": "<Narrow|Wide|None>",
    "longevity_estimate": "<assessment>"
  }},
  "valuation": {{
    "trade_type_classification": "<Early Disruptor|Scale-up|Mature Growth>",
    "methodology": "<P/S|DCF+optionality|Comps+multiples>",
    "analyst_consensus_target": null,
    "implied_multiples": "{score_result.get('valuation_vs_peers', 'See scoring')}",
    "is_forecast_realistic": "<training knowledge assessment>",
    "intrinsic_value_estimate": null,
    "expected_roi_2_3yr": "<range — training knowledge, null if uncertain>",
    "moic_estimate": null
  }},
  "market_timing": "<1-2 sentences — combine score_result signals with training context>",
  "investment_thesis_bullets": ["<bullet citing live metric>", "<bullet citing peer comparison>", "<bullet from training knowledge — clearly noted>"]
}}"""

    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=3000,
            response_format={"type": "json_object"},
        )
        return json.loads(resp.choices[0].message.content)
    except Exception as exc:
        logger.warning("Framework LLM call failed for %s: %s — display fields will be empty", ticker, exc)
        return {}


def _analyse_with_llm(
    ticker: str,
    metrics: dict,
    conflicts: list[dict],
    peers_snapshot: dict[str, dict],
    peers: list[str],
    direction_hint: str,
    macro_regime: str,
    position_context: dict | None = None,
    convergence_signal: dict | None = None,
    fund_thesis: dict | None = None,
) -> dict:
    """
    Orchestrates both LLM calls:
      1. _score_with_llm   — quantitative scoring, feeds Committee decisions
      2. _framework_with_llm — display-only institutional framework, never affects scores

    Returns merged dict with scoring fields at root and framework fields nested.
    """
    # CALL 1: quantitative scoring (influences trading)
    score_result = _score_with_llm(
        ticker, metrics, conflicts, peers_snapshot, peers,
        direction_hint, macro_regime, position_context,
        convergence_signal=convergence_signal,
        fund_thesis=fund_thesis,
    )

    # CALL 2: display framework (display only — never influences scoring)
    framework = _framework_with_llm(ticker, metrics, peers_snapshot, peers, score_result)

    # Merge: scoring fields stay at root, framework fields nested
    result = dict(score_result)
    for key in (
        "fund_mandate", "company_info", "financial_snapshot", "comparables",
        "market_analysis", "quality_of_earnings", "management_team",
        "analyst_rating_history", "cap_table", "setup_checklist",
        "valuation", "market_timing", "investment_thesis_bullets",
    ):
        if key in framework:
            result[key] = framework[key]

    result["_data_sources"] = {
        "fundamental_score": "live_api_only",
        "direction": "live_api_only",
        "dislocation_opportunity": "live_api_only",
        "valuation_vs_peers": "live_api_only",
        "key_strengths": "live_api_only",
        "key_concerns": "live_api_only",
        "historical_financials": "live_api",
        "peer_comparables_multiples": "live_api",
        "ownership_pct": "live_api",
        "analyst_fwd_revenue": "yahoo_finance_consensus" if metrics.get("analyst_revenue_estimates") else "unavailable",
        "analyst_fwd_eps": "yahoo_finance_consensus" if metrics.get("analyst_eps_estimates") else "unavailable",
        "company_info": "llm_knowledge_display_only",
        "management_team": "llm_knowledge_display_only",
        "analyst_rating_trend": "llm_knowledge_display_only",
        "cap_table_holders": "llm_knowledge_display_only",
        "market_analysis": "llm_knowledge_display_only",
        "setup_checklist_narrative": "llm_knowledge_display_only",
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

    # Load institutional convergence signals (from Institutional Agent)
    convergence_by_ticker: dict[str, dict] = {}
    fund_theses_by_ticker: dict[str, dict] = {}
    inst_path = REPORTS_DIR / "institutional_report.json"
    if inst_path.exists():
        try:
            with open(inst_path) as f:
                inst_data = json.load(f)
            for cs in inst_data.get("convergence_signals", []):
                t = str(cs.get("ticker", "")).upper()
                if t:
                    convergence_by_ticker[t] = cs
            for ft in inst_data.get("fund_theses", []):
                t = str(ft.get("ticker", "")).upper()
                if t:
                    fund_theses_by_ticker[t] = ft
        except Exception:
            pass

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

        # Fetch from all 4 sources
        yf_metrics = _fetch_yf_metrics(ticker)
        av_metrics = _fetch_av_metrics(ticker)
        edgar_metrics = _fetch_edgar_metrics(ticker)
        fmp_metrics = _fetch_fmp_metrics(ticker)

        # Cross-reference and reconcile
        reconciled, conflicts = _cross_reference(yf_metrics, av_metrics, edgar_metrics, fmp_metrics)

        # Identify peers and fetch their snapshot
        peers = _fetch_peers(ticker)
        peers_snapshot = _fetch_peer_snapshot(peers) if peers else {}

        # LLM analysis
        llm_result = _analyse_with_llm(
            ticker, reconciled, conflicts, peers_snapshot, peers,
            direction_hint, macro_regime, position_context,
            convergence_signal=convergence_by_ticker.get(ticker),
            fund_thesis=fund_theses_by_ticker.get(ticker),
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

    fmp_enabled = bool(os.environ.get("FMP_API_KEY"))
    output = {
        "fundamental_analyses": results,
        "total_analysed": len(results),
        "macro_regime": macro_regime,
        "av_calls_used": _av_calls_used,
        "fmp_enabled": fmp_enabled,
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
