import { NextRequest, NextResponse } from "next/server";
import YahooFinanceClass from "yahoo-finance2";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yf = new (YahooFinanceClass as any)({ suppressNotices: ["yahooSurvey"] });

// Analyst-defined peer groups — selection is based on sector/subsector overlap
const PEER_MAP: Record<string, { tickers: string[]; note: string }> = {
  UNH:  { tickers: ["CVS", "HUM", "CI", "ELV", "MOH"],       note: "US Managed Care / Health Insurance" },
  DG:   { tickers: ["DLTR", "WMT", "TGT", "COST"],            note: "Discount & Value Retail" },
  EL:   { tickers: ["COTY", "ULTA", "CHD", "CLX"],            note: "Beauty / Personal Care" },
  CRM:  { tickers: ["ORCL", "WDAY", "NOW", "MSFT", "SAP"],   note: "Enterprise Cloud SaaS" },
  MKC:  { tickers: ["HRL", "CPB", "SJM", "K", "GIS"],        note: "Consumer Packaged Goods" },
  COIN: { tickers: ["HOOD", "ICE", "CME", "MSTR"],            note: "Crypto / Financial Exchanges" },
};

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
  const group = PEER_MAP[ticker];

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
