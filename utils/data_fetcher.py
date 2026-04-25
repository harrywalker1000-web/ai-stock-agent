"""
Shared data fetching utilities for the AI Stock Agent system.
All agents import from here rather than making raw API calls themselves.
Every function logs what it fetches and raises on unrecoverable errors.
"""

import os
import time
from datetime import datetime, timedelta
from typing import Any

import finnhub
import pandas as pd
import requests
import yfinance as yf
from alpha_vantage.fundamentaldata import FundamentalData
from alpha_vantage.timeseries import TimeSeries
from fredapi import Fred
from newsapi import NewsApiClient

from utils.logger import get_logger

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Lazy client singletons — created once on first use
# ---------------------------------------------------------------------------

_finnhub_client: finnhub.Client | None = None
_fred_client: Fred | None = None
_newsapi_client: NewsApiClient | None = None


def _finnhub() -> finnhub.Client:
    global _finnhub_client
    if _finnhub_client is None:
        key = os.environ.get("FINNHUB_API_KEY")
        if not key:
            raise EnvironmentError("FINNHUB_API_KEY not set in environment")
        _finnhub_client = finnhub.Client(api_key=key)
    return _finnhub_client


def _fred() -> Fred:
    global _fred_client
    if _fred_client is None:
        key = os.environ.get("FRED_API_KEY")
        if not key:
            raise EnvironmentError("FRED_API_KEY not set in environment")
        _fred_client = Fred(api_key=key)
    return _fred_client


def _newsapi() -> NewsApiClient:
    global _newsapi_client
    if _newsapi_client is None:
        key = os.environ.get("NEWS_API_KEY")
        if not key:
            raise EnvironmentError("NEWS_API_KEY not set in environment")
        _newsapi_client = NewsApiClient(api_key=key)
    return _newsapi_client


# ---------------------------------------------------------------------------
# yfinance helpers
# ---------------------------------------------------------------------------

def fetch_price_history(ticker: str, period: str = "6mo", interval: str = "1d") -> pd.DataFrame:
    """
    Return OHLCV price history for a single ticker.
    period: '1d','5d','1mo','3mo','6mo','1y','2y','5y','10y','ytd','max'
    interval: '1m','2m','5m','15m','30m','60m','90m','1h','1d','5d','1wk','1mo','3mo'
    """
    logger.debug("yfinance price history: %s period=%s interval=%s", ticker, period, interval)
    df = yf.download(ticker, period=period, interval=interval, progress=False, auto_adjust=True)
    if df.empty:
        logger.warning("No price data returned for %s", ticker)
    return df


def fetch_price_history_multi(tickers: list[str], period: str = "3mo", interval: str = "1d") -> pd.DataFrame:
    """Return closing prices for a list of tickers as a DataFrame (columns = tickers)."""
    logger.debug("yfinance multi price history: %s tickers, period=%s", len(tickers), period)
    raw = yf.download(tickers, period=period, interval=interval, progress=False, auto_adjust=True)
    if isinstance(raw.columns, pd.MultiIndex):
        return raw["Close"]
    return raw


def fetch_ticker_info(ticker: str) -> dict[str, Any]:
    """Return yfinance .info dict for a ticker (P/E, market cap, sector, etc.)."""
    logger.debug("yfinance info: %s", ticker)
    try:
        info = yf.Ticker(ticker).info
        return info or {}
    except Exception as exc:
        logger.error("yfinance info failed for %s: %s", ticker, exc)
        return {}


def fetch_financials(ticker: str) -> dict[str, pd.DataFrame]:
    """
    Return income statement, balance sheet, and cash flow DataFrames for a ticker.
    Keys: 'income_stmt', 'balance_sheet', 'cash_flow'
    """
    logger.debug("yfinance financials: %s", ticker)
    t = yf.Ticker(ticker)
    return {
        "income_stmt": t.income_stmt,
        "balance_sheet": t.balance_sheet,
        "cash_flow": t.cashflow,
    }


def fetch_analyst_recommendations(ticker: str) -> pd.DataFrame:
    """Return analyst recommendation history from yfinance."""
    logger.debug("yfinance recommendations: %s", ticker)
    try:
        return yf.Ticker(ticker).recommendations or pd.DataFrame()
    except Exception as exc:
        logger.error("yfinance recommendations failed for %s: %s", ticker, exc)
        return pd.DataFrame()


def fetch_earnings_calendar(ticker: str) -> pd.DataFrame:
    """Return upcoming earnings dates from yfinance."""
    logger.debug("yfinance earnings dates: %s", ticker)
    try:
        cal = yf.Ticker(ticker).calendar
        return cal if cal is not None else pd.DataFrame()
    except Exception as exc:
        logger.error("yfinance earnings calendar failed for %s: %s", ticker, exc)
        return pd.DataFrame()


# ---------------------------------------------------------------------------
# FRED API helpers
# ---------------------------------------------------------------------------

def fetch_fred_series(series_id: str, limit: int = 60) -> pd.Series:
    """
    Fetch a FRED economic time series.
    Common series_ids:
      FEDFUNDS  — Fed Funds Rate
      CPIAUCSL  — CPI (inflation)
      PCEPI     — PCE Price Index
      GDP       — Gross Domestic Product
      DGS10     — 10-Year Treasury yield
      DGS2      — 2-Year Treasury yield
      BAMLH0A0HYM2 — High-yield credit spread
    """
    logger.debug("FRED series: %s", series_id)
    try:
        series = _fred().get_series(series_id)
        return series.dropna().tail(limit)
    except Exception as exc:
        logger.error("FRED fetch failed for %s: %s", series_id, exc)
        return pd.Series(dtype=float)


def fetch_fred_latest(series_id: str) -> float | None:
    """Return the single most recent value for a FRED series."""
    series = fetch_fred_series(series_id, limit=1)
    if series.empty:
        return None
    return float(series.iloc[-1])


# ---------------------------------------------------------------------------
# Finnhub helpers
# ---------------------------------------------------------------------------

def fetch_finnhub_company_news(ticker: str, days_back: int = 7) -> list[dict]:
    """Return recent news articles for a company from Finnhub."""
    logger.debug("Finnhub company news: %s", ticker)
    to_date = datetime.utcnow().strftime("%Y-%m-%d")
    from_date = (datetime.utcnow() - timedelta(days=days_back)).strftime("%Y-%m-%d")
    try:
        articles = _finnhub().company_news(ticker, _from=from_date, to=to_date)
        return articles or []
    except Exception as exc:
        logger.error("Finnhub company news failed for %s: %s", ticker, exc)
        return []


def fetch_finnhub_market_news(category: str = "general") -> list[dict]:
    """Return market-level news from Finnhub. category: 'general','forex','crypto','merger'"""
    logger.debug("Finnhub market news: category=%s", category)
    try:
        return _finnhub().general_news(category, min_id=0) or []
    except Exception as exc:
        logger.error("Finnhub market news failed: %s", exc)
        return []


def fetch_finnhub_analyst_ratings(ticker: str) -> dict:
    """Return aggregated analyst buy/sell/hold ratings from Finnhub."""
    logger.debug("Finnhub analyst ratings: %s", ticker)
    try:
        return _finnhub().recommendation_trends(ticker) or {}
    except Exception as exc:
        logger.error("Finnhub analyst ratings failed for %s: %s", ticker, exc)
        return {}


def fetch_finnhub_price_target(ticker: str) -> dict:
    """Return analyst consensus price target from Finnhub."""
    logger.debug("Finnhub price target: %s", ticker)
    try:
        return _finnhub().price_target(ticker) or {}
    except Exception as exc:
        logger.error("Finnhub price target failed for %s: %s", ticker, exc)
        return {}


def fetch_finnhub_insider_transactions(ticker: str) -> dict:
    """Return recent insider buy/sell transactions from Finnhub."""
    logger.debug("Finnhub insider transactions: %s", ticker)
    try:
        return _finnhub().stock_insider_transactions(ticker) or {}
    except Exception as exc:
        logger.error("Finnhub insider transactions failed for %s: %s", ticker, exc)
        return {}


def fetch_finnhub_earnings_calendar(from_date: str = None, to_date: str = None) -> dict:
    """Return upcoming earnings announcements. Dates format: 'YYYY-MM-DD'."""
    if not from_date:
        from_date = datetime.utcnow().strftime("%Y-%m-%d")
    if not to_date:
        to_date = (datetime.utcnow() + timedelta(days=14)).strftime("%Y-%m-%d")
    logger.debug("Finnhub earnings calendar: %s to %s", from_date, to_date)
    try:
        return _finnhub().earnings_calendar(_from=from_date, to=to_date, symbol="", international=False) or {}
    except Exception as exc:
        logger.error("Finnhub earnings calendar failed: %s", exc)
        return {}


def fetch_finnhub_basic_financials(ticker: str) -> dict:
    """Return key financial metrics (P/E, EV/EBITDA, etc.) from Finnhub."""
    logger.debug("Finnhub basic financials: %s", ticker)
    try:
        return _finnhub().company_basic_financials(ticker, "all") or {}
    except Exception as exc:
        logger.error("Finnhub basic financials failed for %s: %s", ticker, exc)
        return {}


# ---------------------------------------------------------------------------
# NewsAPI helpers
# ---------------------------------------------------------------------------

def fetch_news_headlines(query: str, days_back: int = 3, page_size: int = 20) -> list[dict]:
    """
    Search NewsAPI for headlines matching a query string.
    Returns a list of article dicts with keys: title, description, url, publishedAt, source.
    """
    logger.debug("NewsAPI headlines: query='%s'", query)
    from_date = (datetime.utcnow() - timedelta(days=days_back)).strftime("%Y-%m-%dT%H:%M:%S")
    try:
        resp = _newsapi().get_everything(
            q=query,
            from_param=from_date,
            language="en",
            sort_by="relevancy",
            page_size=page_size,
        )
        return resp.get("articles", [])
    except Exception as exc:
        logger.error("NewsAPI headlines failed for query '%s': %s", query, exc)
        return []


def fetch_news_top_headlines(category: str = "business") -> list[dict]:
    """Return top business headlines from NewsAPI."""
    logger.debug("NewsAPI top headlines: category=%s", category)
    try:
        resp = _newsapi().get_top_headlines(category=category, language="en", page_size=20)
        return resp.get("articles", [])
    except Exception as exc:
        logger.error("NewsAPI top headlines failed: %s", exc)
        return []


# ---------------------------------------------------------------------------
# SEC EDGAR helpers
# ---------------------------------------------------------------------------

def fetch_sec_company_submissions(cik: str) -> dict:
    """
    Fetch a company's SEC filing history from EDGAR.
    cik: Central Index Key (zero-padded to 10 digits), e.g. '0000320193' for Apple.
    """
    logger.debug("SEC EDGAR submissions: CIK=%s", cik)
    url = f"https://data.sec.gov/submissions/CIK{cik.zfill(10)}.json"
    try:
        resp = requests.get(url, headers={"User-Agent": "ai-stock-agent research@example.com"}, timeout=15)
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:
        logger.error("SEC EDGAR fetch failed for CIK %s: %s", cik, exc)
        return {}


def fetch_sec_company_facts(cik: str) -> dict:
    """
    Fetch all reported financial facts (XBRL data) for a company from SEC EDGAR.
    This includes balance sheet, income statement items over time.
    """
    logger.debug("SEC EDGAR company facts: CIK=%s", cik)
    url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik.zfill(10)}.json"
    try:
        resp = requests.get(url, headers={"User-Agent": "ai-stock-agent research@example.com"}, timeout=15)
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:
        logger.error("SEC EDGAR facts failed for CIK %s: %s", cik, exc)
        return {}


def search_sec_cik(company_name: str) -> str | None:
    """Look up a company's CIK number by name via the SEC EDGAR full-text search."""
    logger.debug("SEC EDGAR CIK search: '%s'", company_name)
    url = "https://efts.sec.gov/LATEST/search-index?q=%22{}%22&dateRange=custom&startdt=2020-01-01&forms=13F-HR".format(
        requests.utils.quote(company_name)
    )
    try:
        resp = requests.get(url, headers={"User-Agent": "ai-stock-agent research@example.com"}, timeout=15)
        resp.raise_for_status()
        hits = resp.json().get("hits", {}).get("hits", [])
        if hits:
            return hits[0].get("_source", {}).get("entity_id")
    except Exception as exc:
        logger.error("SEC CIK search failed for '%s': %s", company_name, exc)
    return None


# ---------------------------------------------------------------------------
# Alpha Vantage helpers
# ---------------------------------------------------------------------------

def fetch_alpha_vantage_overview(ticker: str) -> dict:
    """Return company overview (sector, industry, description, key ratios) from Alpha Vantage."""
    logger.debug("Alpha Vantage overview: %s", ticker)
    key = os.environ.get("ALPHA_VANTAGE_API_KEY")
    if not key:
        raise EnvironmentError("ALPHA_VANTAGE_API_KEY not set in environment")
    try:
        fd = FundamentalData(key=key, output_format="json")
        data, _ = fd.get_company_overview(ticker)
        return data or {}
    except Exception as exc:
        logger.error("Alpha Vantage overview failed for %s: %s", ticker, exc)
        return {}


def fetch_alpha_vantage_earnings(ticker: str) -> dict:
    """Return quarterly and annual earnings history from Alpha Vantage."""
    logger.debug("Alpha Vantage earnings: %s", ticker)
    key = os.environ.get("ALPHA_VANTAGE_API_KEY")
    if not key:
        raise EnvironmentError("ALPHA_VANTAGE_API_KEY not set in environment")
    try:
        fd = FundamentalData(key=key, output_format="json")
        data, _ = fd.get_company_earnings(ticker)
        return data or {}
    except Exception as exc:
        logger.error("Alpha Vantage earnings failed for %s: %s", ticker, exc)
        return {}


# ---------------------------------------------------------------------------
# Financial Modeling Prep (FMP) helpers
# ---------------------------------------------------------------------------

# FMP migrated all /api/v3/ endpoints to /stable/ for API keys created after Aug 2025.
# URL style changed: path params (/endpoint/{ticker}) → query params (?symbol=ticker)
FMP_BASE = "https://financialmodelingprep.com/stable"


def _fmp_key() -> str:
    key = os.environ.get("FMP_API_KEY")
    if not key:
        raise EnvironmentError("FMP_API_KEY not set in environment")
    return key


def fetch_fmp_income_statement(ticker: str, limit: int = 4) -> list[dict]:
    """
    Return the last N annual income statements from FMP.
    Fields include: revenue, grossProfit, ebitda, netIncome, eps, epsDiluted.
    """
    logger.debug("FMP income statement: %s (limit=%d)", ticker, limit)
    try:
        url = f"{FMP_BASE}/income-statement"
        resp = requests.get(url, params={"symbol": ticker, "limit": limit, "apikey": _fmp_key()}, timeout=15)
        resp.raise_for_status()
        return resp.json() or []
    except Exception as exc:
        logger.error("FMP income statement failed for %s: %s", ticker, exc)
        return []


def fetch_fmp_key_metrics(ticker: str, limit: int = 4) -> list[dict]:
    """
    Return key fundamental metrics from FMP (annual).
    Fields include: peRatio, pbRatio, evToEbitda, roic, debtToEquity, revenuePerShare, netIncomePerShare.
    """
    logger.debug("FMP key metrics: %s (limit=%d)", ticker, limit)
    try:
        url = f"{FMP_BASE}/key-metrics"
        resp = requests.get(url, params={"symbol": ticker, "limit": limit, "apikey": _fmp_key()}, timeout=15)
        resp.raise_for_status()
        return resp.json() or []
    except Exception as exc:
        logger.error("FMP key metrics failed for %s: %s", ticker, exc)
        return []


def fetch_fmp_analyst_estimates(ticker: str, limit: int = 8) -> list[dict]:
    """
    Return analyst forward revenue and EPS estimates from FMP.
    Fields include: date, estimatedRevenueLow, estimatedRevenueAvg, estimatedRevenueHigh,
    estimatedEpsAvg, estimatedEpsLow, estimatedEpsHigh, numberAnalysts.
    """
    logger.debug("FMP analyst estimates: %s", ticker)
    try:
        url = f"{FMP_BASE}/analyst-estimates"
        resp = requests.get(url, params={"symbol": ticker, "period": "annual", "limit": limit, "apikey": _fmp_key()}, timeout=15)
        resp.raise_for_status()
        return resp.json() or []
    except Exception as exc:
        logger.error("FMP analyst estimates failed for %s: %s", ticker, exc)
        return []


def fetch_fmp_price_targets(ticker: str) -> list[dict]:
    """
    Return aggregated analyst price target summary from FMP.
    Returns single-element list with fields: lastMonthCount, lastMonthAvgPriceTarget,
    lastQuarterCount, lastQuarterAvgPriceTarget, lastYearAvgPriceTarget, allTimeAvgPriceTarget.
    Note: per-analyst targets (/price-target) require a paid FMP plan; this endpoint is free.
    """
    logger.debug("FMP price target summary: %s", ticker)
    try:
        url = f"{FMP_BASE}/price-target-summary"
        resp = requests.get(url, params={"symbol": ticker, "apikey": _fmp_key()}, timeout=15)
        resp.raise_for_status()
        return resp.json() or []
    except Exception as exc:
        logger.error("FMP price targets failed for %s: %s", ticker, exc)
        return []


def fetch_fmp_upgrades_downgrades(ticker: str, limit: int = 20) -> list[dict]:
    """
    Return recent analyst upgrades/downgrades from FMP.
    Fields include: analystName, publishedDate, newGrade, previousGrade, action (upgrade/downgrade/init).
    Note: returns empty list on FMP free tier — paid plan required for this endpoint.
    """
    logger.debug("FMP upgrades/downgrades: %s", ticker)
    try:
        url = f"{FMP_BASE}/upgrades-downgrades"
        resp = requests.get(url, params={"symbol": ticker, "limit": limit, "apikey": _fmp_key()}, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        if not data:
            logger.debug("FMP upgrades/downgrades: no data for %s (free tier limitation)", ticker)
        return data or []
    except Exception as exc:
        logger.error("FMP upgrades/downgrades failed for %s: %s", ticker, exc)
        return []


def fetch_fmp_institutional_holders(ticker: str) -> list[dict]:
    """
    Return current institutional holders from FMP.
    Fields include: holder, shares, dateReported, change, weightPercent.
    Note: returns empty list on FMP free tier — paid plan required for this endpoint.
    """
    logger.debug("FMP institutional holders: %s", ticker)
    try:
        url = f"{FMP_BASE}/institutional-holder"
        resp = requests.get(url, params={"symbol": ticker, "apikey": _fmp_key()}, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        if not data:
            logger.debug("FMP institutional holders: no data for %s (free tier limitation)", ticker)
        return data or []
    except Exception as exc:
        logger.error("FMP institutional holders failed for %s: %s", ticker, exc)
        return []


def fetch_fmp_revenue_segments(ticker: str) -> list[dict]:
    """
    Return product revenue segmentation from FMP.
    Returns list of {segment, weight_pct} dicts normalised to percentages.
    Falls back to empty list if endpoint unavailable (requires paid plan).
    """
    logger.debug("FMP revenue segments: %s", ticker)
    try:
        url = f"{FMP_BASE}/revenue-product-segmentation"
        resp = requests.get(url, params={"symbol": ticker, "apikey": _fmp_key()}, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        if not data:
            return []
        # FMP returns list of {date: {SegmentName: value, ...}} or a flat dict
        # Shape 1: [{"date": "...", "SegA": 1234, "SegB": 5678}]
        # Shape 2: {"2024-12-31": {"SegA": 1234, ...}}
        row: dict = {}
        if isinstance(data, list) and data:
            first = data[0]
            if isinstance(first, dict):
                # Strip non-numeric keys
                row = {k: v for k, v in first.items() if isinstance(v, (int, float)) and k != "date"}
        elif isinstance(data, dict):
            # Take the most recent date key
            latest_key = sorted(data.keys(), reverse=True)[0]
            row = {k: v for k, v in data[latest_key].items() if isinstance(v, (int, float))}
        if not row:
            return []
        total = sum(abs(v) for v in row.values()) or 1
        segments = [
            {"segment": k, "weight_pct": round(abs(v) / total * 100, 1)}
            for k, v in sorted(row.items(), key=lambda x: -abs(x[1]))
            if abs(v) > 0
        ]
        return segments
    except Exception as exc:
        logger.error("FMP revenue segments failed for %s: %s", ticker, exc)
        return []


# ---------------------------------------------------------------------------
# SEC activist filing helpers (13D / 13G)
# ---------------------------------------------------------------------------

def fetch_sec_activist_filings(days_back: int = 10) -> list[dict]:
    """
    Fetch recent SC 13D and SC 13G activist filings from SEC EDGAR full-text search.
    13D = activist (>5% stake, intend to influence management) — strong signal.
    13G = passive (>5% stake, no control intent) — moderate signal.
    Returns list of: {ticker, entity_name, cik, filer_name, form_type, filed_date, pct_owned}
    Both are filed within 10 days of crossing the 5% threshold.
    """
    logger.debug("SEC EDGAR activist filings: last %d days", days_back)
    from_date = (datetime.utcnow() - timedelta(days=days_back)).strftime("%Y-%m-%d")
    to_date = datetime.utcnow().strftime("%Y-%m-%d")

    url = "https://efts.sec.gov/LATEST/search-index"
    params = {
        "q": "",
        "forms": "SC 13D,SC 13G",
        "dateRange": "custom",
        "startdt": from_date,
        "enddt": to_date,
    }
    headers = {"User-Agent": "ai-stock-agent research@example.com"}

    try:
        resp = requests.get(url, params=params, headers=headers, timeout=20)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        logger.error("SEC activist filings fetch failed: %s", exc)
        return []

    # Build CIK → ticker map for fast lookup
    cik_to_ticker = _load_cik_to_ticker()

    results = []
    for hit in data.get("hits", {}).get("hits", [])[:50]:
        src = hit.get("_source", {})
        entity_name = src.get("entity_name", "")
        entity_id = str(src.get("entity_id") or "").lstrip("0")
        form_type = src.get("form_type", "")
        filed_date = src.get("file_date", "")

        # Try to resolve ticker from CIK
        ticker = cik_to_ticker.get(entity_id.zfill(10)) or cik_to_ticker.get(entity_id)

        # Try to extract percent owned from display_names if available
        display_names = src.get("display_names", [])
        filer_name = display_names[0].get("name", "") if display_names else ""

        results.append({
            "ticker": ticker,
            "entity_name": entity_name,
            "cik": entity_id,
            "filer_name": filer_name,
            "form_type": form_type,
            "filed_date": filed_date,
            "signal_strength": "high" if "13D" in form_type else "medium",
            "accession_no": src.get("accession_no", ""),
        })

    logger.info("SEC activist filings: found %d filings in last %d days", len(results), days_back)
    return results


_cik_to_ticker_cache: dict[str, str] = {}


def _load_cik_to_ticker() -> dict[str, str]:
    """Load reverse CIK→ticker map from SEC EDGAR (cached)."""
    global _cik_to_ticker_cache
    if _cik_to_ticker_cache:
        return _cik_to_ticker_cache
    url = "https://www.sec.gov/files/company_tickers.json"
    try:
        resp = requests.get(url, headers={"User-Agent": "ai-stock-agent research@example.com"}, timeout=20)
        resp.raise_for_status()
        raw = resp.json()
        _cik_to_ticker_cache = {
            str(v["cik_str"]).zfill(10): v["ticker"].upper()
            for v in raw.values()
        }
        logger.debug("CIK→ticker map loaded: %d entries", len(_cik_to_ticker_cache))
    except Exception as exc:
        logger.warning("CIK→ticker map load failed: %s", exc)
    return _cik_to_ticker_cache


# ---------------------------------------------------------------------------
# Unusual options activity (via yfinance)
# ---------------------------------------------------------------------------

def fetch_unusual_options_activity(
    tickers: list[str],
    min_volume: int = 500,
    volume_oi_ratio: float = 2.0,
) -> list[dict]:
    """
    Detect unusual options activity for a list of tickers using yfinance.
    "Unusual" = options contract where volume >> open interest, suggesting
    fresh institutional positioning rather than existing hedges rolling.

    Criteria:
      - volume >= min_volume (filters noise)
      - volume / open_interest >= volume_oi_ratio (fresh money, not existing position)
      - Nearest 2 expiry dates only (institutional plays are usually near-term)

    Returns list of dicts sorted by volume descending:
      { ticker, type (call/put), strike, expiry, volume, open_interest,
        vol_oi_ratio, implied_volatility, in_the_money, signal (bullish/bearish) }
    """
    logger.debug("Unusual options scan: %d tickers", len(tickers))
    unusual: list[dict] = []

    for ticker_sym in tickers:
        try:
            t = yf.Ticker(ticker_sym)
            expiry_dates = t.options
            if not expiry_dates:
                continue

            # Check nearest 2 expiry dates to catch near-term institutional bets
            for expiry in expiry_dates[:2]:
                try:
                    chain = t.option_chain(expiry)
                except Exception:
                    continue

                for opt_type, df in (("call", chain.calls), ("put", chain.puts)):
                    if df is None or df.empty:
                        continue
                    for _, row in df.iterrows():
                        vol = row.get("volume") or 0
                        oi = row.get("openInterest") or 0
                        if vol < min_volume:
                            continue
                        if oi == 0 or (vol / oi) < volume_oi_ratio:
                            continue
                        unusual.append({
                            "ticker": ticker_sym,
                            "type": opt_type,
                            "strike": round(float(row.get("strike", 0)), 2),
                            "expiry": expiry,
                            "volume": int(vol),
                            "open_interest": int(oi),
                            "vol_oi_ratio": round(vol / oi, 1),
                            "implied_volatility": round(float(row.get("impliedVolatility", 0)) * 100, 1),
                            "in_the_money": bool(row.get("inTheMoney", False)),
                            "last_price": round(float(row.get("lastPrice", 0)), 2),
                            "signal": "bullish" if opt_type == "call" else "bearish",
                        })
        except Exception as exc:
            logger.debug("Options scan failed for %s: %s", ticker_sym, exc)

    # Sort by raw volume — largest bets first
    unusual.sort(key=lambda x: x["volume"], reverse=True)
    logger.info("Unusual options: found %d contracts across %d tickers", len(unusual), len(tickers))
    return unusual[:30]  # Cap at 30 most unusual


# ---------------------------------------------------------------------------
# Reddit / PRAW helpers
# ---------------------------------------------------------------------------

def fetch_reddit_mentions(
    ticker: str,
    subreddits: list[str] = None,
    days_back: int = 7,
    limit: int = 100,
) -> dict[str, Any]:
    """
    Search Reddit posts mentioning a ticker across the specified subreddits.
    Returns: { 'post_count': int, 'posts': [{'title', 'score', 'created_utc', 'subreddit'}] }
    Requires REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USER_AGENT in environment.
    """
    import praw

    if subreddits is None:
        subreddits = ["stocks", "investing", "wallstreetbets"]

    client_id = os.environ.get("REDDIT_CLIENT_ID")
    client_secret = os.environ.get("REDDIT_CLIENT_SECRET")
    user_agent = os.environ.get("REDDIT_USER_AGENT", "ai-stock-agent/1.0")

    if not client_id or not client_secret:
        raise EnvironmentError("REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET must be set")

    logger.debug("Reddit mentions: %s in %s", ticker, subreddits)

    reddit = praw.Reddit(
        client_id=client_id,
        client_secret=client_secret,
        user_agent=user_agent,
    )

    cutoff = time.time() - (days_back * 86400)
    posts = []
    try:
        for sub in subreddits:
            for post in reddit.subreddit(sub).search(ticker, sort="new", limit=limit):
                if post.created_utc >= cutoff:
                    posts.append({
                        "title": post.title,
                        "score": post.score,
                        "created_utc": post.created_utc,
                        "subreddit": sub,
                    })
    except Exception as exc:
        logger.error("Reddit fetch failed for %s: %s", ticker, exc)

    return {"post_count": len(posts), "posts": posts}
