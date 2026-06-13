"""
Research data fetcher for ad-hoc stock research reports.
Runs all API calls in parallel: yfinance, FMP (free tier only), Finnhub,
FRED, SEC EDGAR, and Tavily. Returns raw structured data tagged with source.
AI never touches this layer — numbers come from APIs only.
"""

import concurrent.futures
import os
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from typing import Any

import pandas as pd
import requests
import yfinance as yf

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from utils.data_fetcher import (
    fetch_finnhub_analyst_ratings,
    fetch_finnhub_basic_financials,
    fetch_finnhub_company_news,
    fetch_fmp_income_statement,
    fetch_fmp_key_metrics,
    fetch_fred_latest,
)
from utils.logger import get_logger

logger = get_logger(__name__)

FMP_BASE = "https://financialmodelingprep.com/stable"
FMP_V3 = "https://financialmodelingprep.com/api/v3"
SEC_HEADERS = {"User-Agent": "HazCapital research@hazcapital.com"}


def _fmp_key() -> str:
    key = os.environ.get("FMP_API_KEY", "")
    if not key:
        raise EnvironmentError("FMP_API_KEY not set")
    return key


# ---------------------------------------------------------------------------
# FMP — free-tier endpoints only
# ---------------------------------------------------------------------------

def fetch_fmp_profile(ticker: str) -> dict:
    """Company profile: name, CEO, employees, sector, description, exchange."""
    try:
        r = requests.get(
            f"{FMP_BASE}/profile",
            params={"symbol": ticker, "apikey": _fmp_key()},
            timeout=15,
        )
        r.raise_for_status()
        data = r.json()
        if not data:
            return {}
        p = data[0] if isinstance(data, list) else data
        return {
            "company_name": p.get("companyName"),
            "exchange": p.get("exchangeShortName"),
            "sector": p.get("sector"),
            "industry": p.get("industry"),
            "country": p.get("country"),
            "ceo": p.get("ceo"),
            "employees": p.get("fullTimeEmployees"),
            "ipo_date": p.get("ipoDate"),
            "website": p.get("website"),
            "description": p.get("description"),
            "currency": p.get("currency"),
            "market_cap": p.get("mktCap"),
            "image": p.get("image"),
        }
    except Exception as exc:
        logger.error("FMP profile failed for %s: %s", ticker, exc)
        return {}


def fetch_fmp_balance_sheet(ticker: str, limit: int = 4) -> list[dict]:
    """Balance sheet: debt, equity, current assets/liabilities, cash, interest expense."""
    try:
        r = requests.get(
            f"{FMP_BASE}/balance-sheet-statement",
            params={"symbol": ticker, "limit": limit, "apikey": _fmp_key()},
            timeout=15,
        )
        r.raise_for_status()
        return r.json() or []
    except Exception as exc:
        logger.error("FMP balance sheet failed for %s: %s", ticker, exc)
        return []


def fetch_fmp_cash_flow(ticker: str, limit: int = 4) -> list[dict]:
    """Cash flow statement: operating CF, capex, FCF, D&A, NWC changes."""
    try:
        r = requests.get(
            f"{FMP_BASE}/cash-flow-statement",
            params={"symbol": ticker, "limit": limit, "apikey": _fmp_key()},
            timeout=15,
        )
        r.raise_for_status()
        return r.json() or []
    except Exception as exc:
        logger.error("FMP cash flow failed for %s: %s", ticker, exc)
        return []


def fetch_fmp_dcf(ticker: str) -> dict:
    """FMP's own DCF estimate — free tier stable endpoint. Used as cross-check only."""
    try:
        r = requests.get(
            f"{FMP_BASE}/discounted-cash-flow",
            params={"symbol": ticker, "apikey": _fmp_key()},
            timeout=15,
        )
        r.raise_for_status()
        data = r.json()
        if not data:
            return {}
        d = data[0] if isinstance(data, list) else data
        return {"dcf": d.get("dcf"), "stock_price": d.get("Stock Price"), "date": d.get("date")}
    except Exception as exc:
        logger.error("FMP DCF failed for %s: %s", ticker, exc)
        return {}


def fetch_fmp_stock_peers(ticker: str) -> list[dict]:
    """
    Peer group from FMP stable endpoint — free tier.
    Returns list of {symbol, companyName, price, mktCap} dicts.
    """
    try:
        r = requests.get(
            f"{FMP_BASE}/stock-peers",
            params={"symbol": ticker, "apikey": _fmp_key()},
            timeout=15,
        )
        r.raise_for_status()
        data = r.json()
        if not data:
            return []
        return [
            {
                "symbol":      p.get("symbol"),
                "company_name": p.get("companyName"),
                "price":       p.get("price"),
                "market_cap":  p.get("mktCap"),
            }
            for p in data
            if p.get("symbol")
        ]
    except Exception as exc:
        logger.error("FMP stock peers failed for %s: %s", ticker, exc)
        return []


# ---------------------------------------------------------------------------
# yfinance — comprehensive profile, price, holders, analyst estimates
# ---------------------------------------------------------------------------

def fetch_yfinance_comprehensive(ticker: str) -> dict:
    """
    Full yfinance pull: info dict, 1Y OHLCV, returns, holders,
    analyst price targets, earnings estimates, EPS surprise history.
    """
    t = yf.Ticker(ticker)
    result: dict[str, Any] = {}

    try:
        info = t.info or {}
        result["info"] = {
            "company_name":             info.get("longName"),
            "quote_type":               info.get("quoteType"),
            "sector":                   info.get("sector"),
            "industry":                 info.get("industry"),
            "country":                  info.get("country"),
            "currency":                 info.get("currency"),
            "exchange":                 info.get("exchange"),
            "market_cap":               info.get("marketCap"),
            "current_price":            info.get("currentPrice") or info.get("regularMarketPrice"),
            "previous_close":           info.get("previousClose"),
            "52w_high":                 info.get("fiftyTwoWeekHigh"),
            "52w_low":                  info.get("fiftyTwoWeekLow"),
            "avg_volume":               info.get("averageVolume"),
            "shares_outstanding":       info.get("sharesOutstanding"),
            "float_shares":             info.get("floatShares"),
            "short_pct_float":          info.get("shortPercentOfFloat"),
            "short_ratio":              info.get("shortRatio"),
            "institutional_pct":        info.get("heldPercentInstitutions"),
            "insider_pct":              info.get("heldPercentInsiders"),
            "beta":                     info.get("beta"),
            "pe_ttm":                   info.get("trailingPE"),
            "pe_fwd":                   info.get("forwardPE"),
            "ps":                       info.get("priceToSalesTrailing12Months"),
            "pb":                       info.get("priceToBook"),
            "ev_ebitda":                info.get("enterpriseToEbitda"),
            "peg":                      info.get("pegRatio"),
            "dividend_yield":           info.get("dividendYield"),
            "gross_margins":            info.get("grossMargins"),
            "ebitda_margins":           info.get("ebitdaMargins"),
            "profit_margins":           info.get("profitMargins"),
            "revenue_growth":           info.get("revenueGrowth"),
            "earnings_growth":          info.get("earningsGrowth"),
            "recommendation_key":       info.get("recommendationKey"),
            "recommendation_mean":      info.get("recommendationMean"),
            "num_analyst_opinions":     info.get("numberOfAnalystOpinions"),
            "target_mean_price":        info.get("targetMeanPrice"),
            "target_high_price":        info.get("targetHighPrice"),
            "target_low_price":         info.get("targetLowPrice"),
            "target_median_price":      info.get("targetMedianPrice"),
            "total_debt":               info.get("totalDebt"),
            "current_ratio":            info.get("currentRatio"),
            "debt_to_equity":           info.get("debtToEquity"),
            "free_cashflow":            info.get("freeCashflow"),
            "operating_cashflow":       info.get("operatingCashflow"),
            "long_business_summary":    info.get("longBusinessSummary"),
        }
    except Exception as exc:
        result["info"] = {}
        logger.error("yfinance .info failed for %s: %s", ticker, exc)

    try:
        hist = t.history(period="1y", interval="1d")
        result["price_history"] = hist
    except Exception as exc:
        result["price_history"] = pd.DataFrame()
        logger.error("yfinance price history failed for %s: %s", ticker, exc)

    try:
        closes = result.get("price_history", pd.DataFrame())
        if not closes.empty:
            c = closes["Close"].squeeze()
            now = float(c.iloc[-1])
            def _ret(n: int) -> float | None:
                idx = min(n, len(c) - 1)
                if idx <= 0:
                    return None
                return round((now - float(c.iloc[-idx])) / float(c.iloc[-idx]) * 100, 2)
            ytd = c[c.index.year == datetime.now().year]
            result["returns"] = {
                "1m": _ret(21), "3m": _ret(63), "6m": _ret(126), "1y": _ret(252),
                "ytd": round((now - float(ytd.iloc[0])) / float(ytd.iloc[0]) * 100, 2) if not ytd.empty else None,
            }
        else:
            result["returns"] = {}
    except Exception as exc:
        result["returns"] = {}
        logger.error("yfinance returns calc failed for %s: %s", ticker, exc)

    for attr, key in [
        ("institutional_holders", "institutional_holders"),
        ("major_holders", "major_holders"),
    ]:
        try:
            df = getattr(t, attr)
            result[key] = df.head(5).to_dict("records") if df is not None and not df.empty else []
        except Exception:
            result[key] = []

    for attr, key in [
        ("analyst_price_targets", "analyst_price_targets"),
        ("earnings_estimate", "earnings_estimate"),
        ("revenue_estimate", "revenue_estimate"),
    ]:
        try:
            df = getattr(t, attr)
            result[key] = df.to_dict() if (df is not None and not getattr(df, "empty", False)) else None
        except Exception:
            result[key] = None

    # Earnings history — reset index to preserve the date column
    try:
        eh = t.earnings_history
        if eh is not None and not eh.empty:
            result["eps_surprises"] = eh.reset_index().tail(4).to_dict("records")
        else:
            result["eps_surprises"] = []
    except Exception:
        result["eps_surprises"] = []

    return result


# ---------------------------------------------------------------------------
# Technical indicators — computed from OHLCV, zero AI
# ---------------------------------------------------------------------------

def compute_technicals(price_history: pd.DataFrame) -> dict:
    """RSI(14), MACD(12/26/9), Bollinger Bands, ATR(14), SMAs, support/resistance."""
    if price_history is None or price_history.empty or len(price_history) < 20:
        return {"status": "insufficient_data"}

    closes  = price_history["Close"].squeeze()
    highs   = price_history["High"].squeeze()
    lows    = price_history["Low"].squeeze()
    volumes = price_history["Volume"].squeeze()
    current = float(closes.iloc[-1])

    delta    = closes.diff()
    avg_gain = delta.clip(lower=0).ewm(com=13, adjust=False).mean()
    avg_loss = (-delta.clip(upper=0)).ewm(com=13, adjust=False).mean()
    rs       = avg_gain / avg_loss.replace(0, float("nan"))
    rsi      = round(float((100 - 100 / (1 + rs)).iloc[-1]), 1)

    ema12      = closes.ewm(span=12, adjust=False).mean()
    ema26      = closes.ewm(span=26, adjust=False).mean()
    macd_line  = ema12 - ema26
    sig_line   = macd_line.ewm(span=9, adjust=False).mean()
    macd = {
        "macd":      round(float(macd_line.iloc[-1]), 4),
        "signal":    round(float(sig_line.iloc[-1]), 4),
        "histogram": round(float((macd_line - sig_line).iloc[-1]), 4),
        "bullish":   bool(macd_line.iloc[-1] > sig_line.iloc[-1]),
    }

    sma50  = round(float(closes.rolling(50).mean().iloc[-1]), 2)
    sma200 = round(float(closes.rolling(200).mean().iloc[-1]), 2) if len(closes) >= 200 else None

    sma20   = closes.rolling(20).mean()
    std20   = closes.rolling(20).std()
    bb_up   = float(sma20.iloc[-1]) + 2 * float(std20.iloc[-1])
    bb_dn   = float(sma20.iloc[-1]) - 2 * float(std20.iloc[-1])
    bb_pos  = round((current - bb_dn) / (bb_up - bb_dn) * 100, 1) if bb_up != bb_dn else 50.0

    tr  = pd.concat([highs - lows, (highs - closes.shift()).abs(), (lows - closes.shift()).abs()], axis=1).max(axis=1)
    atr = round(float(tr.rolling(14).mean().iloc[-1]), 4)

    avg_vol = float(volumes.rolling(20).mean().iloc[-1])

    bull_signals = sum([
        current > sma50,
        rsi > 50,
        macd["bullish"],
        current > sma200 if sma200 else False,
    ])
    trend = {4: "Strong Uptrend", 3: "Uptrend", 2: "Neutral", 1: "Downtrend", 0: "Strong Downtrend"}[bull_signals]

    return {
        "current_price":      current,
        "sma_50":             sma50,
        "sma_200":            sma200,
        "pct_from_sma50":     round((current - sma50) / sma50 * 100, 2),
        "pct_from_sma200":    round((current - sma200) / sma200 * 100, 2) if sma200 else None,
        "52w_high":           round(float(closes.max()), 2),
        "52w_low":            round(float(closes.min()), 2),
        "pct_from_52w_high":  round((current - float(closes.max())) / float(closes.max()) * 100, 2),
        "pct_from_52w_low":   round((current - float(closes.min())) / float(closes.min()) * 100, 2),
        "rsi":                rsi,
        "macd":               macd,
        "bb_upper":           round(bb_up, 2),
        "bb_lower":           round(bb_dn, 2),
        "bb_position_pct":    bb_pos,
        "atr":                atr,
        "atr_pct":            round(atr / current * 100, 2),
        "volume_vs_20d_avg":  round(float(volumes.iloc[-1]) / avg_vol, 2) if avg_vol > 0 else None,
        "support":            round(float(closes.tail(63).min()), 2),
        "resistance":         round(float(closes.max()), 2),
        "trend_signal":       trend,
        "source":             "yfinance [CALCULATED]",
    }


# ---------------------------------------------------------------------------
# SEC EDGAR — Form 4 insider trades, 8-K press releases
# ---------------------------------------------------------------------------

def fetch_sec_cik_from_ticker(ticker: str) -> str | None:
    """Resolve a ticker to its SEC CIK number via the EDGAR company_tickers endpoint."""
    try:
        r = requests.get(
            "https://www.sec.gov/files/company_tickers.json",
            headers=SEC_HEADERS,
            timeout=15,
        )
        r.raise_for_status()
        for entry in r.json().values():
            if entry.get("ticker", "").upper() == ticker.upper():
                return str(entry["cik_str"]).zfill(10)
        return None
    except Exception as exc:
        logger.error("SEC CIK lookup failed for %s: %s", ticker, exc)
        return None


def fetch_sec_form4_trades(ticker: str, limit: int = 10) -> list[dict]:
    """Recent insider trades from SEC EDGAR Form 4 RSS feed."""
    try:
        cik = fetch_sec_cik_from_ticker(ticker)
        if not cik:
            return []
        url = (
            f"https://www.sec.gov/cgi-bin/browse-edgar"
            f"?action=getcompany&CIK={cik}&type=4&dateb=&owner=include"
            f"&count={limit}&search_text=&output=atom"
        )
        r = requests.get(url, headers=SEC_HEADERS, timeout=15)
        r.raise_for_status()
        root = ET.fromstring(r.text)
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        trades = []
        for entry in root.findall("atom:entry", ns)[:limit]:
            link_el = entry.find("atom:link", ns)
            trades.append({
                "title":   entry.findtext("atom:title", "", ns),
                "date":    (entry.findtext("atom:updated", "", ns) or "")[:10],
                "url":     link_el.get("href", "") if link_el is not None else "",
                "source":  "SEC EDGAR Form 4",
            })
        return trades
    except Exception as exc:
        logger.error("SEC Form 4 failed for %s: %s", ticker, exc)
        return []


def fetch_sec_8k_filings(ticker: str, limit: int = 5) -> list[dict]:
    """Recent 8-K press release filings from SEC EDGAR."""
    try:
        cik = fetch_sec_cik_from_ticker(ticker)
        if not cik:
            return []
        r = requests.get(
            f"https://data.sec.gov/submissions/CIK{cik}.json",
            headers=SEC_HEADERS,
            timeout=15,
        )
        r.raise_for_status()
        filings = r.json().get("filings", {}).get("recent", {})
        forms   = filings.get("form", [])
        dates   = filings.get("filingDate", [])
        accnos  = filings.get("accessionNumber", [])
        docs    = filings.get("primaryDocument", [])
        results = []
        for i, form in enumerate(forms):
            if form == "8-K" and len(results) < limit:
                acc = accnos[i] if i < len(accnos) else ""
                results.append({
                    "form":       form,
                    "date":       dates[i] if i < len(dates) else "",
                    "accession":  acc,
                    "document":   docs[i] if i < len(docs) else "",
                    "url":        f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{acc.replace('-','')}/",
                    "source":     "SEC EDGAR 8-K",
                })
        return results
    except Exception as exc:
        logger.error("SEC 8-K failed for %s: %s", ticker, exc)
        return []


# ---------------------------------------------------------------------------
# Tavily web search
# ---------------------------------------------------------------------------

def fetch_tavily_search(query: str, max_results: int = 5) -> list[dict]:
    """Tavily web search. Returns list of {title, url, content, score}."""
    try:
        from tavily import TavilyClient
        key = os.environ.get("TAVILY_API_KEY", "")
        if not key:
            raise EnvironmentError("TAVILY_API_KEY not set")
        client = TavilyClient(api_key=key)
        response = client.search(query=query, max_results=max_results)
        return response.get("results", [])
    except Exception as exc:
        logger.error("Tavily search failed for '%s': %s", query, exc)
        return []


# ---------------------------------------------------------------------------
# FRED macro snapshot — 5 series in parallel
# ---------------------------------------------------------------------------

def fetch_fred_macro_snapshot() -> dict:
    """Fetch all 5 macro indicators from FRED: rates, inflation, GDP, unemployment."""
    series_map = {
        "risk_free_rate":  "DGS10",
        "fed_funds_rate":  "FEDFUNDS",
        "cpi_yoy":         "CPIAUCSL",
        "gdp_growth":      "A191RL1Q225SBEA",
        "unemployment":    "UNRATE",
    }

    def _one(kv: tuple) -> tuple:
        k, s = kv
        return k, fetch_fred_latest(s)

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:
        return dict(ex.map(_one, series_map.items()))


# ---------------------------------------------------------------------------
# Peer metrics (yfinance) — for valuation comparables and DCF terminal value
# ---------------------------------------------------------------------------

def fetch_peer_yfinance_metrics(peer_symbols: list[str], limit: int = 6) -> list[dict]:
    """
    Fetch key valuation metrics for peer tickers from yfinance.
    Returns list of {symbol, company_name, market_cap, pe, ev_ebitda, ps, pb,
                      ebitda_margin, revenue_growth, debt_to_equity}.
    """
    symbols = [s for s in peer_symbols if s][:limit]
    if not symbols:
        return []

    def _fetch_one(sym: str) -> dict | None:
        try:
            info = yf.Ticker(sym).info or {}
            mc = info.get("marketCap")
            return {
                "symbol":        sym,
                "company_name":  info.get("longName") or sym,
                "market_cap":    mc,
                "pe":            info.get("trailingPE"),
                "pe_fwd":        info.get("forwardPE"),
                "ev_ebitda":     info.get("enterpriseToEbitda"),
                "ps":            info.get("priceToSalesTrailing12Months"),
                "pb":            info.get("priceToBook"),
                "ebitda_margin": info.get("ebitdaMargins"),
                "net_margin":    info.get("profitMargins"),
                "revenue_growth": info.get("revenueGrowth"),
                "debt_to_equity": info.get("debtToEquity"),
            }
        except Exception as exc:
            logger.warning("Peer yfinance fetch failed for %s: %s", sym, exc)
            return None

    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=min(len(symbols), 6)) as ex:
        for item in ex.map(_fetch_one, symbols):
            if item:
                results.append(item)
    return results


# ---------------------------------------------------------------------------
# Finnhub earnings calendar (next 60 days for subject ticker)
# ---------------------------------------------------------------------------

def fetch_finnhub_earnings_for_ticker(ticker: str) -> list[dict]:
    """Upcoming and recent earnings dates + EPS estimates for a single ticker."""
    try:
        from_date = (datetime.utcnow() - timedelta(days=90)).strftime("%Y-%m-%d")
        to_date   = (datetime.utcnow() + timedelta(days=90)).strftime("%Y-%m-%d")
        import finnhub
        key = os.environ.get("FINNHUB_API_KEY", "")
        if not key:
            return []
        client = finnhub.Client(api_key=key)
        cal = client.earnings_calendar(_from=from_date, to=to_date, symbol=ticker)
        return cal.get("earningsCalendar", [])
    except Exception as exc:
        logger.error("Finnhub earnings calendar failed for %s: %s", ticker, exc)
        return []


# ---------------------------------------------------------------------------
# Main orchestrator: runs everything in parallel
# ---------------------------------------------------------------------------

def fetch_all_data(ticker: str) -> dict:
    """
    Fetch all research data in parallel. Returns raw structured dict.
    Source tagging and conflict detection happen in report_assembler.py.
    Typical runtime: 8-15s for a US large cap.
    """
    ticker = ticker.upper().strip()
    t0 = time.time()
    logger.info("fetch_all_data: starting for %s", ticker)

    tasks = {
        "fmp_profile":       lambda: fetch_fmp_profile(ticker),
        "fmp_income":        lambda: fetch_fmp_income_statement(ticker, limit=10),
        "fmp_balance":       lambda: fetch_fmp_balance_sheet(ticker, limit=10),
        "fmp_cashflow":      lambda: fetch_fmp_cash_flow(ticker, limit=10),
        "fmp_key_metrics":   lambda: fetch_fmp_key_metrics(ticker, limit=4),
        "fmp_dcf":           lambda: fetch_fmp_dcf(ticker),
        "fmp_peers":         lambda: fetch_fmp_stock_peers(ticker),
        "yfinance":          lambda: fetch_yfinance_comprehensive(ticker),
        "finnhub_news":      lambda: fetch_finnhub_company_news(ticker, days_back=30),
        "finnhub_ratings":   lambda: fetch_finnhub_analyst_ratings(ticker),
        "finnhub_basics":    lambda: fetch_finnhub_basic_financials(ticker),
        "finnhub_earnings":  lambda: fetch_finnhub_earnings_for_ticker(ticker),
        "fred_macro":        lambda: fetch_fred_macro_snapshot(),
        "sec_form4":         lambda: fetch_sec_form4_trades(ticker, limit=10),
        "sec_8k":            lambda: fetch_sec_8k_filings(ticker, limit=5),
    }

    results: dict[str, Any] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=13) as executor:
        futures = {executor.submit(fn): key for key, fn in tasks.items()}
        for future in concurrent.futures.as_completed(futures):
            key = futures[future]
            try:
                results[key] = future.result()
            except Exception as exc:
                logger.error("fetch_all_data task '%s' failed: %s", key, exc)
                results[key] = None

    yf_data = results.get("yfinance") or {}
    price_hist = yf_data.get("price_history", pd.DataFrame())
    results["technicals"] = compute_technicals(price_hist)

    # Phase 2: Tavily searches (uses company name from Phase 1 for better query quality)
    fmp_profile  = results.get("fmp_profile") or {}
    yf_info      = yf_data.get("info") or {}
    company_name = fmp_profile.get("company_name") or yf_info.get("company_name") or ticker
    sector       = yf_info.get("sector") or fmp_profile.get("sector") or ""
    industry     = yf_info.get("industry") or fmp_profile.get("industry") or ""

    tavily_queries = {
        "tavily_overview":    f"{company_name} business model products services operations 2025",
        "tavily_catalysts":   f"{ticker} upcoming catalyst earnings {industry} 2025 2026",
        "tavily_industry":    f"{company_name} {ticker} industry competitive landscape key players IPO regulation 2025 2026",
        "tavily_competitive": f"{company_name} competitive advantages moat competitors 2025",
    }

    # Analyst-curated peer overrides — supersede FMP auto-peers when defined
    PEER_OVERRIDES: dict[str, list[str]] = {
        "ASTS": ["GSAT", "IRDM", "VSAT", "SATS", "TSAT"],
        "GSAT": ["ASTS", "IRDM", "VSAT", "SATS", "TSAT"],
        "IRDM": ["ASTS", "GSAT", "VSAT", "SATS"],
        "VSAT": ["ASTS", "GSAT", "IRDM", "SATS", "TSAT"],
        "SATS": ["ASTS", "GSAT", "IRDM", "VSAT", "TSAT"],
        "TSAT": ["ASTS", "GSAT", "IRDM", "VSAT", "SATS"],
    }

    # Also fetch peer yfinance metrics in this phase
    if ticker in PEER_OVERRIDES:
        peer_symbols = PEER_OVERRIDES[ticker]
    else:
        peer_symbols = [p["symbol"] for p in (results.get("fmp_peers") or []) if p.get("symbol")]

    phase2_tasks: dict[str, Any] = {k: (fetch_tavily_search, (q, 5)) for k, q in tavily_queries.items()}
    if peer_symbols:
        phase2_tasks["peer_metrics"] = (fetch_peer_yfinance_metrics, (peer_symbols,))

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:
        p2_futures = {ex.submit(fn, *args): k for k, (fn, args) in phase2_tasks.items()}
        for future in concurrent.futures.as_completed(p2_futures):
            key = p2_futures[future]
            try:
                results[key] = future.result()
            except Exception as exc:
                logger.error("Phase2 task '%s' failed: %s", key, exc)
                results[key] = [] if key != "peer_metrics" else []

    elapsed = round(time.time() - t0, 1)
    results["_meta"] = {
        "ticker":      ticker,
        "fetched_at":  datetime.utcnow().isoformat() + "Z",
        "elapsed_sec": elapsed,
        "company_name": company_name,
    }

    logger.info("fetch_all_data: completed for %s in %.1fs", ticker, elapsed)
    return results
