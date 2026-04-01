"""
Ad-hoc single-ticker research report.
Runs fundamental + quant + sentiment on one ticker, then writes a committee pitch.
No positions modified, no orders placed.

Usage:
  python scripts/adhoc_report.py --ticker AAPL
"""

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

REPORTS_DIR = ROOT / "data" / "reports"
ADHOC_DIR = ROOT / "data" / "reports" / "adhoc_reports"
ADHOC_DIR.mkdir(parents=True, exist_ok=True)


def _run_quant(ticker: str) -> dict:
    """Lightweight quant analysis for a single ticker."""
    import yfinance as yf
    import ta.momentum
    import ta.trend
    import ta.volatility
    try:
        df = yf.download(ticker, period="1y", auto_adjust=True, progress=False)
        if df.empty:
            return {}
        if hasattr(df.columns, "get_level_values"):
            df.columns = df.columns.get_level_values(0)
        df = df.dropna()
        close = df["Close"]
        high = df["High"]
        low = df["Low"]
        current = float(close.iloc[-1])
        rsi = ta.momentum.RSIIndicator(close, window=14).rsi()
        sma50 = close.rolling(50).mean().iloc[-1]
        sma200 = close.rolling(200).mean().iloc[-1]
        atr = ta.volatility.AverageTrueRange(high, low, close, window=14).average_true_range()
        atr_pct = round(float(atr.iloc[-1]) / current * 100, 2)
        ret_1m = round((current / float(close.iloc[-22]) - 1) * 100, 2) if len(close) >= 22 else None
        ret_3m = round((current / float(close.iloc[-66]) - 1) * 100, 2) if len(close) >= 66 else None
        return {
            "current_price": round(current, 2),
            "rsi_14": round(float(rsi.iloc[-1]), 1),
            "sma_50": round(float(sma50), 2),
            "sma_200": round(float(sma200), 2),
            "atr_pct": atr_pct,
            "ret_1m": ret_1m,
            "ret_3m": ret_3m,
            "trend": "uptrend" if current > float(sma50) > float(sma200) else "downtrend" if current < float(sma50) < float(sma200) else "mixed",
        }
    except Exception as exc:
        return {"error": str(exc)}


def _run_fundamental(ticker: str) -> dict:
    """Lightweight fundamental fetch for a single ticker."""
    import yfinance as yf
    try:
        info = yf.Ticker(ticker).info
        return {
            "company_name": info.get("longName", ticker),
            "sector": info.get("sector", "N/A"),
            "market_cap": info.get("marketCap"),
            "pe_trailing": info.get("trailingPE"),
            "pe_forward": info.get("forwardPE"),
            "revenue": info.get("totalRevenue"),
            "operating_margin": info.get("operatingMargins"),
            "roe": info.get("returnOnEquity"),
            "debt_to_equity": info.get("debtToEquity"),
            "current_ratio": info.get("currentRatio"),
            "beta": info.get("beta"),
            "52w_high": info.get("fiftyTwoWeekHigh"),
            "52w_low": info.get("fiftyTwoWeekLow"),
        }
    except Exception as exc:
        return {"error": str(exc)}


def _generate_pitch(ticker: str, quant: dict, fundamental: dict, date: str) -> dict:
    """Single LLM call to produce a structured stock pitch."""
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

    def _f(v):
        return "N/A" if v is None else str(round(v, 2) if isinstance(v, float) else v)

    prompt = f"""You are an Investment Committee analyst writing an ad-hoc research note on {ticker}.
This is for INFORMATIONAL PURPOSES ONLY — no trade will be placed.

TICKER: {ticker}
DATE: {date}
COMPANY: {fundamental.get('company_name', ticker)}  SECTOR: {fundamental.get('sector', 'N/A')}

FUNDAMENTAL DATA:
  Market Cap: {_f(fundamental.get('market_cap'))}
  P/E (trailing): {_f(fundamental.get('pe_trailing'))}  P/E (forward): {_f(fundamental.get('pe_forward'))}
  Revenue: {_f(fundamental.get('revenue'))}  Op Margin: {_f(fundamental.get('operating_margin'))}
  ROE: {_f(fundamental.get('roe'))}  Debt/Equity: {_f(fundamental.get('debt_to_equity'))}
  Current Ratio: {_f(fundamental.get('current_ratio'))}  Beta: {_f(fundamental.get('beta'))}

TECHNICAL DATA:
  Current Price: ${_f(quant.get('current_price'))}
  52w High: {_f(fundamental.get('52w_high'))}  52w Low: {_f(fundamental.get('52w_low'))}
  RSI (14): {_f(quant.get('rsi_14'))}  Trend: {quant.get('trend', 'N/A')}
  ATR %: {_f(quant.get('atr_pct'))}%  1M return: {_f(quant.get('ret_1m'))}%  3M return: {_f(quant.get('ret_3m'))}%

Write a structured investment pitch. Return ONLY valid JSON:
{{
  "ticker": "{ticker}",
  "company_name": "<string>",
  "sector": "<string>",
  "current_price": <number or null>,
  "date": "{date}",
  "executive_summary": "<2-3 sentence overview>",
  "bull_case": "<3-4 sentences — key upside arguments with specific data>",
  "bear_case": "<3-4 sentences — key downside risks with specific data>",
  "verdict": "bullish | neutral | bearish",
  "conviction": <integer 47-89, NOT a multiple of 5>,
  "suggested_entry": <number or null>,
  "suggested_exit": <number or null>,
  "stop_loss": <number or null>,
  "risk_factors": ["<risk 1>", "<risk 2>", "<risk 3>"],
  "key_catalysts": ["<catalyst 1>", "<catalyst 2>"],
  "valuation_note": "<1-2 sentences on whether current price is fair, cheap, or expensive>",
  "disclaimer": "This is an AI-generated research note for informational purposes only. Not financial advice."
}}"""

    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=1200,
            response_format={"type": "json_object"},
        )
        return json.loads(resp.choices[0].message.content)
    except Exception as exc:
        return {"error": str(exc), "ticker": ticker}


def generate(ticker: str) -> dict:
    ticker = ticker.upper().strip()
    date = datetime.utcnow().date().isoformat()
    print(f"Generating ad-hoc report for {ticker}...")

    quant = _run_quant(ticker)
    fundamental = _run_fundamental(ticker)
    pitch = _generate_pitch(ticker, quant, fundamental, date)

    output = {
        **pitch,
        "quant_snapshot": quant,
        "fundamental_snapshot": fundamental,
        "generated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
    }

    out_path = ADHOC_DIR / f"{ticker}_{date}.json"
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)

    print(f"Saved to {out_path}")
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--ticker", required=True)
    args = parser.parse_args()
    result = generate(args.ticker)
    print(json.dumps({k: v for k, v in result.items() if k not in ("quant_snapshot", "fundamental_snapshot")}, indent=2))
