#!/usr/bin/env python3
"""
Monthly script to build/refresh data/universe.csv.

Sources:
  - S&P 500 tickers + GICS sectors from Wikipedia
  - Russell 2000 tickers from iShares IWM holdings CSV (free, no key)

Filters applied after batch price/volume download:
  - Price >= $3.00
  - Average daily volume (5-day) >= 1,000,000 shares

Run: venv/bin/python scripts/build_universe.py

Note: First run can take 20-30 minutes due to yfinance batch downloads.
Smaller companies (Russell 2000) will naturally have lower confidence scores
in downstream agents due to less analyst/institutional data coverage — expected.
"""

import os
import sys
import time
import logging
from io import StringIO
from pathlib import Path

import pandas as pd
import requests
import yfinance as yf

# ---------------------------------------------------------------------------
# Setup paths and logging
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
DATA_DIR = ROOT / "data"
DATA_DIR.mkdir(exist_ok=True)
OUT_PATH = DATA_DIR / "universe.csv"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("build_universe")

# ---------------------------------------------------------------------------
# GICS sector → sector ETF mapping
# ---------------------------------------------------------------------------
GICS_TO_ETF: dict[str, str] = {
    "Information Technology": "XLK",
    "Financials": "XLF",
    "Energy": "XLE",
    "Consumer Staples": "XLP",
    "Health Care": "XLV",
    "Industrials": "XLI",
    "Utilities": "XLU",
    "Real Estate": "XLRE",
    "Consumer Discretionary": "XLY",
    "Materials": "XLB",
    "Communication Services": "XLC",
}

# Filter thresholds
MIN_PRICE = 3.0
MIN_AVG_VOLUME = 1_000_000

# Batch size for yfinance downloads
DOWNLOAD_CHUNK = 200


# ---------------------------------------------------------------------------
# Source 1: S&P 500 from Wikipedia
# ---------------------------------------------------------------------------
def fetch_sp500() -> pd.DataFrame:
    """
    Returns DataFrame with columns: ticker, name, gics_sector, sector_etf, in_sp500
    """
    log.info("Fetching S&P 500 components from Wikipedia...")
    url = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        )
    }
    resp = requests.get(url, headers=headers, timeout=30)
    resp.raise_for_status()
    try:
        tables = pd.read_html(StringIO(resp.text), attrs={"id": "constituents"})
        tbl = tables[0]
    except Exception:
        tables = pd.read_html(StringIO(resp.text))
        tbl = tables[0]

    tbl = tbl.rename(columns={
        "Symbol": "ticker",
        "Security": "name",
        "GICS Sector": "gics_sector",
    })
    tbl = tbl[["ticker", "name", "gics_sector"]].copy()

    # Fix tickers that use dots instead of dashes (Wikipedia → yfinance format)
    tbl["ticker"] = tbl["ticker"].str.replace(".", "-", regex=False)
    tbl["sector_etf"] = tbl["gics_sector"].map(GICS_TO_ETF).fillna("")
    tbl["in_sp500"] = True

    log.info(f"  S&P 500: {len(tbl)} tickers fetched")
    return tbl


# ---------------------------------------------------------------------------
# Source 2: Russell 2000 from iShares IWM holdings CSV
# ---------------------------------------------------------------------------
def fetch_iwm_holdings() -> pd.DataFrame:
    """
    Downloads iShares IWM (Russell 2000 ETF) holdings CSV.
    Returns DataFrame with columns: ticker, name
    """
    log.info("Fetching Russell 2000 components from iShares IWM holdings...")
    url = (
        "https://www.ishares.com/us/products/239710/"
        "ISHARES-RUSSELL-2000-ETF/1467271812596.ajax"
        "?fileType=csv&fileName=IWM_holdings&dataType=fund"
    )
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Referer": "https://www.ishares.com/",
    }

    try:
        resp = requests.get(url, headers=headers, timeout=45)
        resp.raise_for_status()
    except requests.RequestException as e:
        log.warning(f"iShares IWM download failed: {e}")
        log.warning("Skipping Russell 2000 — universe will be S&P 500 only")
        return pd.DataFrame(columns=["ticker", "name"])

    # The CSV has ~9 metadata rows before the column header row
    lines = resp.text.splitlines()
    header_idx = None
    for i, line in enumerate(lines):
        if line.startswith("Ticker,"):
            header_idx = i
            break

    if header_idx is None:
        log.warning("Could not find Ticker column in IWM CSV — skipping Russell 2000")
        return pd.DataFrame(columns=["ticker", "name"])

    csv_body = "\n".join(lines[header_idx:])
    try:
        df = pd.read_csv(StringIO(csv_body))
    except Exception as e:
        log.warning(f"Failed to parse IWM CSV: {e}")
        return pd.DataFrame(columns=["ticker", "name"])

    # Keep only equity rows with valid tickers
    if "Asset Class" in df.columns:
        df = df[df["Asset Class"] == "Equity"].copy()
    df = df[df["Ticker"].notna()].copy()
    df = df[df["Ticker"].str.strip() != "-"].copy()
    df["Ticker"] = df["Ticker"].str.strip()

    # Some IWM tickers use dots (e.g. BRK.B) — convert for yfinance
    df["Ticker"] = df["Ticker"].str.replace(".", "-", regex=False)

    name_col = "Name" if "Name" in df.columns else df.columns[1]
    out = df[["Ticker", name_col]].rename(columns={"Ticker": "ticker", name_col: "name"}).copy()
    out["gics_sector"] = ""
    out["sector_etf"] = ""
    out["in_sp500"] = False

    log.info(f"  IWM (Russell 2000): {len(out)} equity rows fetched")
    return out


# ---------------------------------------------------------------------------
# Price and volume filtering via yfinance batch downloads
# ---------------------------------------------------------------------------
def batch_download_stats(tickers: list[str]) -> pd.DataFrame:
    """
    Downloads 5-day OHLCV for all tickers in chunks.
    Returns DataFrame: ticker, price (last close), avg_volume (5d mean).
    """
    results = []
    total_chunks = (len(tickers) - 1) // DOWNLOAD_CHUNK + 1

    for idx, start in enumerate(range(0, len(tickers), DOWNLOAD_CHUNK), 1):
        chunk = tickers[start : start + DOWNLOAD_CHUNK]
        log.info(f"  Downloading chunk {idx}/{total_chunks} ({len(chunk)} tickers)...")

        try:
            data = yf.download(
                chunk,
                period="5d",
                auto_adjust=True,
                progress=False,
                threads=True,
            )
        except Exception as e:
            log.warning(f"  Chunk {idx} download failed: {e}")
            continue

        if data.empty:
            continue

        # yfinance returns MultiIndex columns for multi-ticker downloads
        if isinstance(data.columns, pd.MultiIndex):
            try:
                close_df = data["Close"]
                vol_df = data["Volume"]
            except KeyError:
                continue
        else:
            # Single ticker — wrap in DataFrame
            close_df = data[["Close"]].rename(columns={"Close": chunk[0]})
            vol_df = data[["Volume"]].rename(columns={"Volume": chunk[0]})

        for ticker in chunk:
            if ticker not in close_df.columns:
                continue
            prices = close_df[ticker].dropna()
            vols = vol_df[ticker].dropna()
            if prices.empty or vols.empty:
                continue
            try:
                price = float(prices.iloc[-1])
                avg_vol = float(vols.mean())
                results.append({"ticker": ticker, "price": round(price, 2), "avg_volume": int(avg_vol)})
            except (ValueError, TypeError):
                continue

        # Respectful pause between chunks
        if idx < total_chunks:
            time.sleep(1)

    return pd.DataFrame(results) if results else pd.DataFrame(columns=["ticker", "price", "avg_volume"])


# ---------------------------------------------------------------------------
# Main build logic
# ---------------------------------------------------------------------------
def build():
    log.info("=" * 60)
    log.info("Building universe.csv — S&P 500 + Russell 2000")
    log.info(f"Filters: price >= ${MIN_PRICE}, avg_volume >= {MIN_AVG_VOLUME:,}")
    log.info("=" * 60)

    # ---- Fetch ticker lists ----
    sp500 = fetch_sp500()
    iwm = fetch_iwm_holdings()

    # Combine and deduplicate (S&P 500 data takes priority)
    combined = pd.concat([sp500, iwm], ignore_index=True)
    combined = combined.drop_duplicates(subset="ticker", keep="first")
    all_tickers = combined["ticker"].tolist()
    log.info(f"\nTotal unique tickers before filtering: {len(all_tickers)}")

    # ---- Batch download price/volume ----
    log.info("\nStarting batch price/volume downloads (this takes a while)...")
    stats = batch_download_stats(all_tickers)
    log.info(f"\nSuccessfully retrieved data for {len(stats)} tickers")

    # ---- Apply filters ----
    stats = stats[stats["price"] >= MIN_PRICE].copy()
    stats = stats[stats["avg_volume"] >= MIN_AVG_VOLUME].copy()
    log.info(f"After price/volume filter: {len(stats)} tickers pass")

    # ---- Merge metadata back in ----
    universe = stats.merge(combined[["ticker", "name", "gics_sector", "sector_etf", "in_sp500"]], on="ticker", how="left")
    universe["name"] = universe["name"].fillna("")
    universe["gics_sector"] = universe["gics_sector"].fillna("")
    universe["sector_etf"] = universe["sector_etf"].fillna("")
    universe["in_sp500"] = universe["in_sp500"].fillna(False)

    # Sort: S&P 500 first, then by volume descending
    universe = universe.sort_values(["in_sp500", "avg_volume"], ascending=[False, False])
    universe = universe.reset_index(drop=True)

    # ---- Save ----
    universe.to_csv(OUT_PATH, index=False)
    sp_count = universe["in_sp500"].sum()
    r2000_count = len(universe) - sp_count
    log.info(f"\nSaved {len(universe)} stocks to {OUT_PATH}")
    log.info(f"  S&P 500: {sp_count} | Russell 2000 additions: {r2000_count}")
    log.info(f"  Sectors covered: {universe[universe['sector_etf'] != '']['ticker'].count()} tickers with sector data")
    log.info("\nDone.")


if __name__ == "__main__":
    build()
