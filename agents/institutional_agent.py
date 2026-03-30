"""
Agent 3 — Institutional Tracker Agent
Phase 1 (parallel with Agents 1, 2, 4)

Follows the smart money. Tracks what major funds are buying/selling via SEC 13F
filings, monitors analyst rating changes, and surfaces insider transactions.

All data is fetched live from SEC EDGAR (free), Finnhub, and yfinance.
13F filings lag by up to 45 days — the agent weights recent signals higher.
"""

import json
import os
import pathlib
from datetime import datetime, timedelta

import requests
from dotenv import load_dotenv
from openai import OpenAI

from utils.data_fetcher import (
    fetch_finnhub_analyst_ratings,
    fetch_finnhub_insider_transactions,
    fetch_fmp_institutional_holders,
    fetch_ticker_info,
)
from utils.logger import get_logger

load_dotenv()
logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Major institutional investors to track via SEC EDGAR
# CIK numbers for key funds (Central Index Key — permanent SEC identifier)
# ---------------------------------------------------------------------------

TRACKED_FUNDS = {
    "Berkshire Hathaway":   "0001067983",
    "Bridgewater Associates": "0001350694",
    "ARK Invest":           "0001697748",
    "Pershing Square":      "0001336528",
    "Tiger Global":         "0001167483",
    "Appaloosa Management": "0001006438",
    "Third Point":          "0001040621",
    "Greenlight Capital":   "0001079114",
}

# High-profile stocks to track for analyst and insider activity
WATCH_TICKERS = [
    "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "JPM", "V",
    "UNH", "XOM", "CVX", "LLY", "JNJ", "WMT", "PG", "HD", "BAC", "MA",
    "AVGO", "COST", "MRK", "ABBV", "PEP", "KO", "TMO", "ORCL", "CRM",
    "AMD", "INTC", "QCOM", "PLTR", "COIN", "GS", "MS", "C", "WFC",
    "RTX", "LMT", "NOC", "GD", "BA", "CAT", "DE", "UNP", "NEE", "DUK",
]


# ---------------------------------------------------------------------------
# SEC EDGAR 13F parsing
# ---------------------------------------------------------------------------

def _fetch_latest_13f(cik: str, fund_name: str) -> list[dict]:
    """
    Fetch the most recent 13F-HR filing for a fund and return top holdings.
    Returns list of dicts: {ticker, shares, value_usd, pct_of_portfolio, filed_date}
    """
    base_url = "https://data.sec.gov/submissions/CIK{}.json".format(cik.zfill(10))
    headers = {"User-Agent": "ai-stock-agent research@harrywalker.com"}

    try:
        resp = requests.get(base_url, headers=headers, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        logger.error("SEC EDGAR submissions failed for %s (CIK %s): %s", fund_name, cik, exc)
        return []

    # Find the most recent 13F-HR filing
    filings = data.get("filings", {}).get("recent", {})
    forms = filings.get("form", [])
    acc_nums = filings.get("accessionNumber", [])
    filing_dates = filings.get("filingDate", [])

    latest_13f_acc = None
    latest_13f_date = None
    for form, acc, date in zip(forms, acc_nums, filing_dates):
        if form in ("13F-HR", "13F-HR/A"):
            latest_13f_acc = acc.replace("-", "")
            latest_13f_date = date
            break

    if not latest_13f_acc:
        logger.debug("No 13F-HR found for %s", fund_name)
        return []

    # Fetch the filing index to find the holdings XML
    index_url = "https://www.sec.gov/Archives/edgar/data/{}/{}/".format(
        cik.lstrip("0"), latest_13f_acc
    )
    try:
        idx_resp = requests.get(index_url + "index.json", headers=headers, timeout=15)
        idx_resp.raise_for_status()
        idx_data = idx_resp.json()
    except Exception as exc:
        logger.error("SEC filing index failed for %s: %s", fund_name, exc)
        return []

    # Find the infotable XML (primary holdings document)
    info_file = None
    for item in idx_data.get("directory", {}).get("item", []):
        name = item.get("name", "")
        if "infotable" in name.lower() or name.endswith(".xml"):
            info_file = name
            break

    if not info_file:
        logger.debug("No infotable XML found in 13F for %s", fund_name)
        return []

    try:
        xml_resp = requests.get(index_url + info_file, headers=headers, timeout=20)
        xml_resp.raise_for_status()
        xml_text = xml_resp.text
    except Exception as exc:
        logger.error("SEC infotable XML failed for %s: %s", fund_name, exc)
        return []

    return _parse_13f_xml(xml_text, latest_13f_date, fund_name)


def _parse_13f_xml(xml_text: str, filing_date: str, fund_name: str) -> list[dict]:
    """Parse 13F holdings XML and return top holdings sorted by value."""
    import re

    holdings = []

    # Extract all infoTable entries
    entries = re.findall(r"<infoTable>(.*?)</infoTable>", xml_text, re.DOTALL | re.IGNORECASE)

    for entry in entries:
        def extract(tag: str) -> str:
            m = re.search(rf"<{tag}[^>]*>(.*?)</{tag}>", entry, re.IGNORECASE | re.DOTALL)
            return m.group(1).strip() if m else ""

        name = extract("nameOfIssuer")
        cusip = extract("cusip")
        value_str = extract("value")
        shares_str = re.search(r"<sshPrnamt>(.*?)</sshPrnamt>", entry, re.IGNORECASE)
        shares_str = shares_str.group(1).strip() if shares_str else "0"

        try:
            value_usd = int(value_str.replace(",", "")) * 1000  # SEC values in thousands
            shares = int(shares_str.replace(",", ""))
        except ValueError:
            continue

        if value_usd < 1_000_000:  # Skip positions under $1M
            continue

        holdings.append({
            "name": name,
            "cusip": cusip,
            "value_usd": value_usd,
            "shares": shares,
            "filing_date": filing_date,
            "fund": fund_name,
        })

    # Sort by value descending, return top 20
    holdings.sort(key=lambda x: x["value_usd"], reverse=True)
    total_value = sum(h["value_usd"] for h in holdings)
    for h in holdings:
        h["pct_of_portfolio"] = round(h["value_usd"] / total_value * 100, 2) if total_value > 0 else 0

    logger.debug("Parsed %d holdings from %s 13F (filed %s)", len(holdings), fund_name, filing_date)
    return holdings[:20]


# ---------------------------------------------------------------------------
# Analyst ratings and insider data
# ---------------------------------------------------------------------------

def _fetch_analyst_data(tickers: list[str]) -> list[dict]:
    """
    Fetch analyst ratings and price targets using yfinance (free, no tier restriction).
    yfinance .info provides targetMeanPrice, numberOfAnalystOpinions, recommendationKey.
    Finnhub recommendation_trends provides the buy/hold/sell breakdown.
    """
    results = []
    for ticker in tickers:
        try:
            info = fetch_ticker_info(ticker)

            current_price = info.get("currentPrice") or info.get("regularMarketPrice")
            target_mean = info.get("targetMeanPrice")
            target_high = info.get("targetHighPrice")
            target_low = info.get("targetLowPrice")
            analyst_count = info.get("numberOfAnalystOpinions", 0)
            rec_key = info.get("recommendationKey", "")  # e.g. "buy", "strong_buy", "hold"

            upside = None
            if current_price and target_mean and current_price > 0:
                upside = round((target_mean - current_price) / current_price * 100, 1)

            # Finnhub recommendation breakdown (buy/sell/hold counts) — this endpoint IS free
            ratings = fetch_finnhub_analyst_ratings(ticker)
            recent_rating = {}
            if isinstance(ratings, list) and ratings:
                recent_rating = ratings[0]

            results.append({
                "ticker": ticker,
                "current_price": current_price,
                "analyst_count": analyst_count or 0,
                "target_mean": round(target_mean, 2) if target_mean else None,
                "target_high": round(target_high, 2) if target_high else None,
                "target_low": round(target_low, 2) if target_low else None,
                "implied_upside_pct": upside,
                "recommendation_key": rec_key,
                "strong_buy": recent_rating.get("strongBuy", 0),
                "buy": recent_rating.get("buy", 0),
                "hold": recent_rating.get("hold", 0),
                "sell": recent_rating.get("sell", 0),
                "strong_sell": recent_rating.get("strongSell", 0),
                "period": recent_rating.get("period", ""),
            })
        except Exception as exc:
            logger.warning("Analyst data failed for %s: %s", ticker, exc)

    return results


def _fetch_insider_data(tickers: list[str]) -> list[dict]:
    """Fetch recent insider transactions for a list of tickers."""
    insider_signals = []
    cutoff = datetime.utcnow() - timedelta(days=30)

    for ticker in tickers:
        try:
            data = fetch_finnhub_insider_transactions(ticker)
            transactions = data.get("data", []) if isinstance(data, dict) else []

            for tx in transactions:
                tx_date_str = tx.get("transactionDate", "")
                try:
                    tx_date = datetime.strptime(tx_date_str, "%Y-%m-%d")
                except ValueError:
                    continue

                if tx_date < cutoff:
                    continue

                tx_code = tx.get("transactionCode", "")
                # P = Purchase, S = Sale
                if tx_code not in ("P", "S"):
                    continue

                shares = tx.get("share", 0) or 0
                price = tx.get("transactionPrice", 0) or 0
                value = round(shares * price)

                if value < 50_000:  # Skip trivial transactions
                    continue

                insider_signals.append({
                    "ticker": ticker,
                    "name": tx.get("name", "Unknown"),
                    "title": tx.get("filingPerson", ""),
                    "transaction_type": "BUY" if tx_code == "P" else "SELL",
                    "shares": shares,
                    "price": price,
                    "value_usd": value,
                    "date": tx_date_str,
                    "days_ago": (datetime.utcnow() - tx_date).days,
                })
        except Exception as exc:
            logger.warning("Insider data failed for %s: %s", ticker, exc)

    # Sort by value descending
    insider_signals.sort(key=lambda x: x["value_usd"], reverse=True)
    return insider_signals


# ---------------------------------------------------------------------------
# Collect everything
# ---------------------------------------------------------------------------

def _fetch_fmp_holders_for_tickers(tickers: list[str]) -> dict[str, list[dict]]:
    """
    Fetch current institutional holders from FMP for a list of tickers.
    Returns {ticker: [holder_dict, ...]} — more current than 13F (no 45-day lag).
    """
    fmp_key = os.environ.get("FMP_API_KEY", "").strip()
    if not fmp_key:
        return {}

    results: dict[str, list[dict]] = {}
    for ticker in tickers[:20]:  # Rate-conscious — top 20 only
        try:
            holders = fetch_fmp_institutional_holders(ticker)
            if holders:
                # Keep top 10 by shares
                holders_sorted = sorted(holders, key=lambda h: h.get("shares", 0), reverse=True)[:10]
                results[ticker] = [
                    {
                        "holder": h.get("holder"),
                        "shares": h.get("shares"),
                        "date_reported": h.get("dateReported", ""),
                        "change": h.get("change"),
                        "weight_pct": h.get("weightPercent"),
                    }
                    for h in holders_sorted
                ]
        except Exception as exc:
            logger.debug("FMP holders failed for %s: %s", ticker, exc)
    return results


def _collect_institutional_data() -> dict:
    logger.info("Institutional Agent: collecting 13F, analyst, insider, and FMP holder data")

    # 1. SEC 13F filings — top holdings per fund
    all_holdings: dict[str, list[dict]] = {}
    for fund_name, cik in TRACKED_FUNDS.items():
        logger.debug("Fetching 13F for %s", fund_name)
        holdings = _fetch_latest_13f(cik, fund_name)
        if holdings:
            all_holdings[fund_name] = holdings

    # 2. Analyst ratings for watch list
    logger.info("Institutional Agent: fetching analyst data for %d tickers", len(WATCH_TICKERS))
    analyst_data = _fetch_analyst_data(WATCH_TICKERS)

    # 3. Insider transactions for watch list
    logger.info("Institutional Agent: fetching insider transactions")
    insider_data = _fetch_insider_data(WATCH_TICKERS[:30])  # Rate limit — top 30

    # 4. FMP institutional holders (current quarter, no 45-day lag)
    logger.info("Institutional Agent: fetching FMP institutional holders")
    fmp_holders = _fetch_fmp_holders_for_tickers(WATCH_TICKERS[:20])

    logger.info(
        "Institutional Agent: collected %d funds, %d analyst records, %d insider transactions, %d FMP holder snapshots",
        len(all_holdings), len(analyst_data), len(insider_data), len(fmp_holders),
    )

    ticker_confidence = _compute_ticker_confidence(all_holdings, analyst_data, insider_data)

    return {
        "fund_holdings": all_holdings,
        "analyst_data": analyst_data,
        "insider_transactions": insider_data,
        "fmp_institutional_holders": fmp_holders,
        "ticker_confidence": ticker_confidence,
        "as_of": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
    }


# ---------------------------------------------------------------------------
# Confidence pre-computation
# ---------------------------------------------------------------------------

def _compute_ticker_confidence(
    all_holdings: dict,
    analyst_data: list[dict],
    insider_data: list[dict],
) -> dict[str, dict]:
    """
    For each ticker in our watch universe, count how many independent
    institutional signal sources are pointing the same direction.

    Source 1 — 13F: ticker appears in ≥1 major fund's top holdings
    Source 2 — Analyst: strong_buy consensus (strong_buy+buy > hold+sell) with ≥5 analysts
    Source 3 — Insider: net insider buying (buy value > sell value) in last 30 days

    Rules:
      1 source  → low
      2 sources → medium
      3 sources → high
      Any source pointing opposite direction → conflict → cap at medium
    """
    # Build 13F ticker set (names are company names not tickers — do best-match)
    # We map analyst tickers to check if they appear in holdings by name fragment
    tickers_in_13f: set[str] = set()
    holding_names: list[str] = []
    for holdings in all_holdings.values():
        for h in holdings:
            holding_names.append(h.get("name", "").upper())

    # Analyst data indexed by ticker
    analyst_map = {a["ticker"]: a for a in analyst_data}

    # Insider data: net buy/sell value per ticker
    insider_net: dict[str, float] = {}
    for tx in insider_data:
        ticker = tx["ticker"]
        value = tx["value_usd"] if tx["transaction_type"] == "BUY" else -tx["value_usd"]
        insider_net[ticker] = insider_net.get(ticker, 0) + value

    results = {}
    for ticker in WATCH_TICKERS:
        sources = []
        conflicts = []

        # Source 1: 13F presence — rough name match since SEC uses full company names
        # This is imperfect but avoids requiring a CUSIP→ticker mapping
        ticker_variants = [ticker, ticker.replace(".", " ")]
        in_13f = any(
            any(variant in name for name in holding_names)
            for variant in ticker_variants
        )
        if in_13f:
            sources.append("13F_holding")

        # Source 2: Analyst consensus
        a = analyst_map.get(ticker, {})
        bullish_count = a.get("strong_buy", 0) + a.get("buy", 0)
        bearish_count = a.get("sell", 0) + a.get("strong_sell", 0)
        total_analysts = a.get("analyst_count", 0)
        upside = a.get("implied_upside_pct")

        analyst_signal = None
        if total_analysts >= 5:
            if bullish_count > bearish_count * 2 and (upside or 0) > 10:
                analyst_signal = "bullish"
                sources.append("analyst_consensus")
            elif bearish_count > bullish_count and (upside or 0) < -10:
                analyst_signal = "bearish"
                sources.append("analyst_consensus")

        # Source 3: Insider net position
        net = insider_net.get(ticker, 0)
        insider_signal = None
        if abs(net) > 100_000:
            if net > 0:
                insider_signal = "bullish"
                sources.append("insider_buying")
            else:
                insider_signal = "bearish"
                sources.append("insider_selling")

        # Check for conflicts between sources
        if analyst_signal and insider_signal and analyst_signal != insider_signal:
            conflicts.append(
                f"Analyst says {analyst_signal} but insider activity says {insider_signal}"
            )

        n = len(sources)
        if n >= 3 and not conflicts:
            level = "high"
        elif n >= 2 and len(conflicts) == 0:
            level = "medium"
        elif n >= 1:
            level = "low"
        else:
            level = "no_signal"
        if conflicts and level == "high":
            level = "medium"

        results[ticker] = {
            "level": level,
            "sources_count": n,
            "sources": sources,
            "conflicts": conflicts,
            "analyst_upside_pct": upside,
            "insider_net_usd": round(net),
        }

    return results


# ---------------------------------------------------------------------------
# Format data for LLM prompt
# ---------------------------------------------------------------------------

def _format_holdings_summary(all_holdings: dict) -> str:
    lines = []
    for fund, holdings in all_holdings.items():
        if not holdings:
            continue
        filed = holdings[0].get("filing_date", "unknown date")
        lines.append(f"\n{fund} (13F filed: {filed}) — top holdings:")
        for h in holdings[:8]:
            lines.append(
                f"  {h['name']:<35} ${h['value_usd']:>15,.0f}  ({h['pct_of_portfolio']:.1f}% of portfolio)"
            )
    return "\n".join(lines) if lines else "No 13F data retrieved."


def _format_analyst_summary(analyst_data: list[dict]) -> str:
    # Show tickers with meaningful upside or strong buy consensus
    notable = [
        a for a in analyst_data
        if a.get("implied_upside_pct") and (
            a["implied_upside_pct"] > 15 or a["implied_upside_pct"] < -15
        ) and a.get("analyst_count", 0) >= 5
    ]
    notable.sort(key=lambda x: abs(x.get("implied_upside_pct", 0)), reverse=True)

    lines = [f"{'Ticker':<7} {'Price':>8} {'Target':>8} {'Upside%':>8} {'Analysts':>8} {'StBuy':>6} {'Buy':>5} {'Hold':>5} {'Sell':>5}"]
    lines.append("-" * 70)
    for a in notable[:20]:
        lines.append(
            f"{a['ticker']:<7} "
            f"${a['current_price']:>7.2f} "
            f"${a['target_mean']:>7.2f} "
            f"{a['implied_upside_pct']:>+7.1f}% "
            f"{a['analyst_count']:>8} "
            f"{a['strong_buy']:>6} "
            f"{a['buy']:>5} "
            f"{a['hold']:>5} "
            f"{a['sell']:>5}"
        ) if a.get("current_price") and a.get("target_mean") else None
    return "\n".join(l for l in lines if l)


def _format_insider_summary(insider_data: list[dict]) -> str:
    if not insider_data:
        return "No significant insider transactions in the last 30 days."
    lines = [f"{'Ticker':<7} {'Type':<5} {'Name':<28} {'Value':>12} {'Date':<12} {'Days ago':>8}"]
    lines.append("-" * 78)
    for tx in insider_data[:20]:
        lines.append(
            f"{tx['ticker']:<7} {tx['transaction_type']:<5} {tx['name'][:27]:<28} "
            f"${tx['value_usd']:>11,.0f} {tx['date']:<12} {tx['days_ago']:>8}d ago"
        )
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# LLM analysis
# ---------------------------------------------------------------------------

def _load_macro_context() -> str:
    macro_path = pathlib.Path("data/reports/macro_report.json")
    if macro_path.exists():
        try:
            with open(macro_path) as f:
                macro = json.load(f)
            return f"Regime: {macro.get('regime')} | Favoured: {', '.join(macro.get('favoured_themes', []))} | Avoid: {', '.join(macro.get('avoid_themes', []))}"
        except Exception:
            pass
    return "Not available."


def _analyse_with_llm(raw_data: dict) -> dict:
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    macro_context = _load_macro_context()

    holdings_str = _format_holdings_summary(raw_data["fund_holdings"])
    analyst_str = _format_analyst_summary(raw_data["analyst_data"])
    insider_str = _format_insider_summary(raw_data["insider_transactions"])

    # Format FMP institutional holders
    fmp_holders = raw_data.get("fmp_institutional_holders", {})
    fmp_lines = []
    for ticker, holders in list(fmp_holders.items())[:15]:
        top = holders[:3]
        holder_names = ", ".join(h.get("holder", "?") for h in top if h.get("holder"))
        fmp_lines.append(f"  {ticker}: {holder_names}")
    fmp_str = "\n".join(fmp_lines) if fmp_lines else "Not available (FMP_API_KEY not set)"

    # Format confidence block for prompt
    ticker_conf = raw_data.get("ticker_confidence", {})
    high_conf = [t for t, c in ticker_conf.items() if c.get("level") == "high"]
    med_conf  = [t for t, c in ticker_conf.items() if c.get("level") == "medium"]
    conflicts = [(t, c["conflicts"]) for t, c in ticker_conf.items() if c.get("conflicts")]
    conf_block = (
        f"HIGH confidence (3 sources): {', '.join(high_conf) or 'none'}\n"
        f"MEDIUM confidence (2 sources): {', '.join(med_conf) or 'none'}\n"
        f"CONFLICTS detected: {'; '.join(f'{t}: {c[0]}' for t, c in conflicts) or 'none'}"
    )

    system_prompt = """You are the Institutional Tracker Agent for an AI hedge fund system.
You have been given real data from SEC 13F filings, analyst rating databases, and insider transaction filings,
plus pre-computed signal confidence scores per ticker.

CRITICAL RULES:
- Only use the data provided. Do not invent figures or recall training knowledge.
- 13F filings are quarterly and lag by up to 45 days — MEDIUM recency weight alone.
- Analyst consensus + insider buys in last 30 days are HIGH recency weight.
- CEO/Director buying with personal money is a strong bullish signal.
- Large insider SELLS are NOT necessarily bearish — they often reflect diversification.
- CONFIDENCE IS MANDATORY: use the pre-computed signal_confidence for each signal.
  - 1 source (e.g. only 13F, no analyst/insider corroboration) = LOW confidence.
  - 2 sources = MEDIUM. 3 sources = HIGH.
  - Single-source signals must NEVER appear in top_institutional_signals alone.
  - Any source conflict must be explained and reduces confidence.
- Your output must be valid JSON matching the schema exactly.

Output this JSON schema:
{
  "institutional_buys": [
    {
      "ticker": "string",
      "company_name": "string",
      "signal": "specific description of what institution did",
      "institution": "fund or firm name",
      "signal_type": "13F | analyst_upgrade | insider_buy",
      "value_or_detail": "specific dollar amount or rating change detail",
      "recency": "today | this_week | this_month | 30-45_days_ago",
      "direction": "LONG | SHORT",
      "signal_confidence": {
        "level": "high | medium | low",
        "sources_count": <integer>,
        "sources": ["13F_holding", "analyst_consensus", "insider_buying"],
        "conflicts": ["description of conflict — empty if none"]
      },
      "reasoning": "why this matters; reference the confidence level explicitly"
    }
  ],
  "analyst_upgrades": [
    {
      "ticker": "string",
      "company_name": "string",
      "analyst_count": number,
      "consensus": "strong_buy | buy | hold | sell | strong_sell",
      "price_target": number,
      "current_price": number,
      "implied_upside_pct": number,
      "strong_buy_count": number,
      "buy_count": number,
      "hold_count": number,
      "sell_count": number,
      "signal": "strong conviction buy | moderate buy | hold | avoid",
      "signal_confidence": {
        "level": "high | medium | low",
        "sources_count": <integer>,
        "corroborated_by": ["any other sources confirming this view"]
      },
      "reasoning": "specific explanation referencing the numbers and confidence"
    }
  ],
  "insider_buys": [
    {
      "ticker": "string",
      "insider_name": "string",
      "transaction_type": "BUY | SELL",
      "value_usd": number,
      "date": "YYYY-MM-DD",
      "days_ago": number,
      "signal_confidence": {
        "level": "high | medium | low",
        "corroborated_by": ["analyst_consensus if applicable", "13F if applicable"]
      },
      "interpretation": "specific interpretation referencing confidence"
    }
  ],
  "top_institutional_signals": ["list of 5-8 tickers — ONLY include medium or high confidence signals"],
  "institutional_summary": "4-5 sentence paragraph; explicitly state which signals are high vs low confidence and why",
  "confidence": <0-100>
}"""

    user_prompt = f"""Here is today's live institutional data. Analyse it and return your detailed JSON assessment.

MACRO CONTEXT: {macro_context}

PRE-COMPUTED SIGNAL CONFIDENCE PER TICKER (13F / analyst / insider cross-reference):
{conf_block}

=== SEC 13F HOLDINGS (quarterly filings — up to 45 day lag) ===
{holdings_str}

=== FMP CURRENT INSTITUTIONAL HOLDERS (current quarter — no 45-day lag) ===
{fmp_str}

=== ANALYST CONSENSUS & PRICE TARGETS (tickers with >15% implied upside or downside, min 5 analysts) ===
{analyst_str}

=== INSIDER TRANSACTIONS (last 30 days, >$50,000) ===
{insider_str}

Data as of: {raw_data['as_of']}

INSTRUCTIONS:
1. Only include tickers in institutional_buys if they have analyst OR insider corroboration (medium+).
2. A 13F holding alone = low confidence — note it but do NOT put it in top_institutional_signals.
3. Populate signal_confidence using the pre-computed block above for each signal.
4. Flag any ticker where sources conflict (e.g. strong analyst buy but net insider selling).

Return ONLY valid JSON. No markdown, no explanation outside the JSON."""

    logger.info("Institutional Agent: sending data to GPT-4o-mini")
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.2,
        response_format={"type": "json_object"},
    )

    result = json.loads(response.choices[0].message.content)
    logger.info(
        "Institutional Agent: identified %d institutional signals, %d analyst signals, %d insider signals",
        len(result.get("institutional_buys", [])),
        len(result.get("analyst_upgrades", [])),
        len(result.get("insider_buys", [])),
    )
    return result


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def run() -> dict:
    logger.info("=== Institutional Agent starting ===")

    raw_data = _collect_institutional_data()
    result = _analyse_with_llm(raw_data)

    result["raw_data"] = raw_data
    result["generated_at"] = datetime.utcnow().isoformat()

    output_dir = pathlib.Path("data/reports")
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "institutional_report.json"
    with open(output_path, "w") as f:
        json.dump(result, f, indent=2, default=str)

    logger.info("Institutional Agent: report saved to %s", output_path)
    logger.info("=== Institutional Agent complete ===")
    return result


if __name__ == "__main__":
    result = run()
    printable = {k: v for k, v in result.items() if k != "raw_data"}
    print(json.dumps(printable, indent=2))
