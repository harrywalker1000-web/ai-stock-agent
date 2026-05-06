import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import YahooFinanceClass from "yahoo-finance2";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yf = new (YahooFinanceClass as any)({ suppressNotices: ["yahooSurvey"] });

// Analyst-defined peer groups — selection is based on sector/subsector overlap
const PEER_MAP: Record<string, { tickers: string[]; note: string }> = {
  // Technology — Semiconductors
  NVDA: { tickers: ["AMD", "INTC", "AVGO", "QCOM", "TXN"],   note: "Semiconductors / AI Chips" },
  AMD:  { tickers: ["NVDA", "INTC", "AVGO", "QCOM"],          note: "Semiconductors" },
  SMCI: { tickers: ["HPE", "DELL", "NTAP", "PSTG"],           note: "Server Infrastructure" },
  // Technology — Mega Cap
  AAPL: { tickers: ["MSFT", "GOOGL", "META", "AMZN"],         note: "Mega Cap Technology" },
  MSFT: { tickers: ["AAPL", "GOOGL", "AMZN", "CRM", "NOW"],  note: "Mega Cap / Cloud" },
  GOOGL:{ tickers: ["META", "MSFT", "AMZN", "SNAP", "PINS"],  note: "Digital Advertising / Cloud" },
  META: { tickers: ["GOOGL", "SNAP", "PINS", "RDDT", "TTD"],  note: "Social Media / Digital Ads" },
  // Consumer Discretionary
  AMZN: { tickers: ["EBAY", "CPNG", "DDS", "OLLI", "ETSY"],  note: "E-Commerce / Cloud" },
  TSLA: { tickers: ["F", "GM", "RIVN", "NIO", "LCID"],        note: "EV / Automotive" },
  NKE:  { tickers: ["ADDYY", "UAA", "LULU", "SKX", "HBI"],    note: "Footwear / Apparel" },
  DG:   { tickers: ["DLTR", "WMT", "TGT", "COST"],            note: "Discount & Value Retail" },
  HD:   { tickers: ["LOW", "SHW", "WSM", "RH", "TSCO"],       note: "Home Improvement Retail" },
  LEN:  { tickers: ["DHI", "PHM", "TOL", "NVR", "KBH"],       note: "Homebuilders" },
  // Healthcare
  NVO:  { tickers: ["LLY", "PFE", "MRK", "ABBV", "AZN"],     note: "Large Cap Pharma / GLP-1" },
  LLY:  { tickers: ["NVO", "PFE", "MRK", "ABBV", "BMY"],     note: "Large Cap Pharma / GLP-1" },
  MRK:  { tickers: ["LLY", "PFE", "ABBV", "BMY", "AZN"],     note: "Large Cap Pharma" },
  JNJ:  { tickers: ["ABT", "MDT", "SYK", "BSX", "ZBH"],      note: "Diversified Healthcare" },
  ABBV: { tickers: ["LLY", "MRK", "PFE", "BMY", "AMGN"],     note: "Biopharmaceuticals" },
  // Consumer Staples
  MKC:  { tickers: ["HRL", "CPB", "SJM", "K", "GIS"],        note: "Consumer Packaged Goods" },
  KO:   { tickers: ["PEP", "MNST", "KDP", "SAM", "CELH"],    note: "Beverages" },
  PG:   { tickers: ["CL", "CLX", "KMB", "CHD", "EL"],        note: "Consumer Staples" },
  EL:   { tickers: ["COTY", "ULTA", "CHD", "CLX"],            note: "Beauty / Personal Care" },
  // Materials
  AMCR: { tickers: ["IP", "PKG", "SEE", "BERY", "GPK"],       note: "Packaging Materials" },
  // Industrials
  LUV:  { tickers: ["DAL", "UAL", "AAL", "ALK", "JBLU"],     note: "US Airlines" },
  // Enterprise Software
  CRM:  { tickers: ["ORCL", "WDAY", "NOW", "MSFT", "SAP"],   note: "Enterprise Cloud SaaS" },
  COIN: { tickers: ["HOOD", "ICE", "CME", "MSTR"],            note: "Crypto / Financial Exchanges" },
  UNH:  { tickers: ["CVS", "HUM", "CI", "ELV", "MOH"],       note: "US Managed Care / Health Insurance" },
};

function readFundamentalPeers(ticker: string): string[] | null {
  const candidates = [
    path.join(process.cwd(), "data", "reports", "fundamental_report.json"),
    path.join(process.cwd(), "..", "data", "reports", "fundamental_report.json"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const data = JSON.parse(fs.readFileSync(p, "utf-8"));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const entry = (data.fundamental_analyses ?? []).find((x: any) => x.ticker?.toUpperCase() === ticker);
        if (entry?.peers_used?.length > 0) return entry.peers_used;
      }
    } catch { /* try next */ }
  }
  return null;
}

type CompRow = {
  ticker: string;
  company: string;
  is_subject?: boolean;
  revenue_bn: number | null;
  pe_ratio: number | null;
  ps_ratio: number | null;
  ebitda_margin_pct: number | null;
  net_margin_pct: number | null;
  de_ratio: number | null;
};

async function fetchMetrics(ticker: string, isSubject = false): Promise<CompRow> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s: any = await yf.quoteSummary(ticker, {
      modules: ["defaultKeyStatistics", "financialData", "summaryDetail", "price"],
    });
    const fd = s.financialData ?? {};
    const sd = s.summaryDetail ?? {};
    const ks = s.defaultKeyStatistics ?? {};
    const pr = s.price ?? {};

    return {
      ticker,
      company: pr.shortName ?? pr.longName ?? ticker,
      is_subject: isSubject || undefined,
      revenue_bn: fd.totalRevenue != null ? Number(fd.totalRevenue) / 1e9 : null,
      pe_ratio: sd.trailingPE ?? ks.forwardPE ?? null,
      ps_ratio: sd.priceToSalesTrailing12Months ?? null,
      ebitda_margin_pct: fd.ebitdaMargins != null ? Number(fd.ebitdaMargins) * 100 : null,
      net_margin_pct: fd.profitMargins != null ? Number(fd.profitMargins) * 100 : null,
      // Yahoo returns debtToEquity as a ratio already (e.g. 1.86 means 186% D/E)
      de_ratio: fd.debtToEquity != null ? Number(fd.debtToEquity) / 100 : null,
    };
  } catch {
    return {
      ticker, company: ticker, is_subject: isSubject || undefined,
      revenue_bn: null, pe_ratio: null, ps_ratio: null,
      ebitda_margin_pct: null, net_margin_pct: null, de_ratio: null,
    };
  }
}

export async function GET(
  _req: NextRequest,
  context: { params: { ticker: string } }
) {
  const ticker = context.params.ticker.toUpperCase();
  let group = PEER_MAP[ticker];

  // Fallback: if ticker not in PEER_MAP, use peers_used from fundamental_report.json
  if (!group) {
    const fundamentalPeers = readFundamentalPeers(ticker);
    if (fundamentalPeers && fundamentalPeers.length > 0) {
      group = { tickers: fundamentalPeers, note: `Pipeline-identified peers for ${ticker}` };
    }
  }

  if (!group) {
    // Ticker not in peer map — return subject-only
    const subject = await fetchMetrics(ticker, true);
    return NextResponse.json({
      comparables: [subject],
      note: "Peer group not defined for this ticker.",
      source: "yahoo-finance2",
    });
  }

  const allTickers = [ticker, ...group.tickers];
  const results = await Promise.all(
    allTickers.map((t, i) => fetchMetrics(t, i === 0))
  );

  return NextResponse.json({
    comparables: results,
    note: group.note,
    source: "yahoo-finance2",
  });
}
