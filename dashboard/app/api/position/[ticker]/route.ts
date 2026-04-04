import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { MOCK_POSITION_DETAIL } from "@/lib/mock-data";
import YahooFinanceClass from "yahoo-finance2";

// Fetch a single position from Alpaca
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAlpacaPosition(ticker: string): Promise<any | null> {
  const key    = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_SECRET_KEY;
  const base   = process.env.ALPACA_BASE_URL ?? "https://paper-api.alpaca.markets";
  if (!key || !secret) return null;
  try {
    const res = await fetch(`${base}/v2/positions/${ticker}`, {
      headers: { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret },
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function fetchAlpacaAccount(): Promise<{ equity: number } | null> {
  const key    = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_SECRET_KEY;
  const base   = process.env.ALPACA_BASE_URL ?? "https://paper-api.alpaca.markets";
  if (!key || !secret) return null;
  try {
    const res = await fetch(`${base}/v2/account`, {
      headers: { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret },
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { equity: parseFloat(data.equity) };
  } catch { return null; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yf = new (YahooFinanceClass as any)({ suppressNotices: ["yahooSurvey"] });

function readReport(name: string) {
  // Try dashboard/data/reports/ (Vercel production & local after sync)
  const candidates = [
    path.join(process.cwd(), "data", "reports", name),
    path.join(process.cwd(), "..", "data", "reports", name),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed && (Array.isArray(parsed) ? parsed.length > 0 : Object.keys(parsed).length > 0)) {
          return parsed;
        }
      }
    } catch { /* try next */ }
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findByTicker(arr: any[], ticker: string) {
  return arr?.find((x: { ticker?: string }) => x.ticker?.toUpperCase() === ticker) ?? null;
}

function readMemory(name: string) {
  const candidates = [
    path.join(process.cwd(), "data", "memory", name),
    path.join(process.cwd(), "..", "data", "memory", name),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf-8"));
    } catch { /* try next */ }
  }
  return null;
}

export async function GET(
  _req: NextRequest,
  context: { params: { ticker: string } }
) {
  const ticker = context.params.ticker.toUpperCase();

  // ── Load all agent reports + positions_log + decision_log ───────────────────
  const positionsLog = readMemory("positions_log.json");
  const positionEntry = positionsLog?.[ticker] ?? null;

  // Build review timeline from decision_log filtered to this ticker
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const decisionLog: any[] = readMemory("decision_log.json") ?? [];
  const reviewTimeline = decisionLog
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((d: any) => d.ticker?.toUpperCase() === ticker)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .sort((a: any, b: any) => (a.date ?? "").localeCompare(b.date ?? ""))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((d: any) => ({
      date:      d.date,
      decision:  d.action,
      rationale: d.rationale ?? "—",
      conviction: d.conviction ?? null,
      size_pct:  d.size_pct ?? null,
    }));

  const committeeReport   = readReport("committee_report.json");
  const fundamentalReport = readReport("fundamental_report.json");
  const quantReport       = readReport("quant_report.json");
  const sentimentReport   = readReport("sentiment_report.json");
  const newsReport        = readReport("news_report.json");
  const macroReport       = readReport("macro_report.json");
  const sectorReport      = readReport("sector_report.json");

  const scorecard    = findByTicker(committeeReport?.scorecards ?? [], ticker);
  const decision     = findByTicker(committeeReport?.position_decisions ?? [], ticker);
  const fundamental  = findByTicker(fundamentalReport?.fundamental_analyses ?? [], ticker);
  const quant        = findByTicker(quantReport?.quant_analyses ?? [], ticker);
  const sentiment    = findByTicker(sentimentReport?.sentiment_analyses ?? [], ticker);

  // News catalysts for this ticker
  const allCatalysts = [
    ...(newsReport?.fresh_catalysts ?? []),
    ...(newsReport?.stale_catalysts ?? []),
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const catalysts = allCatalysts.filter((c: any) => c.ticker?.toUpperCase() === ticker);

  const hasPipelineData = !!(scorecard || fundamental || quant || sentiment);

  // ── Fetch live data in parallel: Yahoo Finance + Alpaca ───────────────────
  const [alpacaPosition, alpacaAccount] = await Promise.all([
    fetchAlpacaPosition(ticker),
    fetchAlpacaAccount(),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let liveQuote: any = null;
  try {
    const summary = await yf.quoteSummary(ticker, {
      modules: ["price", "summaryDetail", "defaultKeyStatistics", "financialData"],
    });
    liveQuote = {
      current_price: summary.price?.regularMarketPrice ?? null,
      company:       summary.price?.longName ?? summary.price?.shortName ?? ticker,
      sector:        summary.price?.sector ?? null,
      pe_trailing:   summary.summaryDetail?.trailingPE ?? null,
      pe_forward:    summary.defaultKeyStatistics?.forwardPE ?? null,
      ps_ratio:      summary.summaryDetail?.priceToSalesTrailing12Months ?? null,
      market_cap:    summary.summaryDetail?.marketCap ?? null,
      revenue_ttm:   summary.financialData?.totalRevenue ?? null,
      ebitda:        summary.financialData?.ebitda ?? null,
      gross_margins: summary.financialData?.grossMargins ?? null,
      ebitda_margins:summary.financialData?.ebitdaMargins ?? null,
      profit_margins:summary.financialData?.profitMargins ?? null,
      debt_to_equity:summary.financialData?.debtToEquity ?? null,
      analyst_target:summary.financialData?.targetMeanPrice ?? null,
      analyst_low:   summary.financialData?.targetLowPrice ?? null,
      analyst_high:  summary.financialData?.targetHighPrice ?? null,
      recommendation_key: summary.financialData?.recommendationKey ?? null,
      number_of_analyst_opinions: summary.financialData?.numberOfAnalystOpinions ?? null,
    };
  } catch { /* live data unavailable — not fatal */ }

  // ── Merge: use pipeline agent data + live prices ───────────────────────────
  if (!hasPipelineData) {
    // No pipeline data for this ticker — return mock with live price overlay
    return NextResponse.json({
      ...MOCK_POSITION_DETAIL,
      ticker,
      current_price: liveQuote?.current_price ?? MOCK_POSITION_DETAIL.current_price,
      _source: "mock",
    });
  }

  // Build agent_scores array from scorecard
  const agentScores = scorecard ? [
    { agent: "Fundamental", score: scorecard.fundamental_score ?? 0, view: fundamental?.fundamental_summary ?? "—" },
    { agent: "Quant",       score: scorecard.quant_score ?? 0,       view: quant?.quant_summary ?? quant?.forward_bias ?? "—" },
    { agent: "Sentiment",   score: scorecard.sentiment_score ?? 0,   view: sentiment?.sentiment_summary ?? sentiment?.analyst_consensus ?? "—" },
    { agent: "Macro",       score: scorecard.macro_score ?? 0,       view: macroReport ? `${macroReport.regime} — ${(macroReport.favoured_themes ?? []).slice(0,2).join(", ")}` : "—" },
    { agent: "News",        score: scorecard.news_score ?? 0,        view: catalysts[0]?.reasoning ?? newsReport?.news_summary ?? "—" },
  ] : MOCK_POSITION_DETAIL.agent_scores;

  // Build investment thesis bullets from pipeline
  const thesisBullets = decision ? [
    decision.investment_thesis,
    ...(decision.key_catalysts ?? []).map((c: string) => `Catalyst: ${c}`),
    ...(decision.key_risks ?? []).map((r: string) => `Risk: ${r}`),
  ].filter(Boolean) : MOCK_POSITION_DETAIL.investment_thesis_bullets;

  // Build financial snapshot from fundamental report (real data)
  const financialSnapshot = fundamental ? {
    pe_ratio:          fundamental.pe_ratio,
    pe_peer_avg:       fundamental.pe_peer_average,
    revenue_growth:    fundamental.revenue_growth_yoy,
    operating_margin:  fundamental.operating_margin,
    roic:              fundamental.roic,
    net_debt_ebitda:   fundamental.net_debt_ebitda,
    peers_used:        fundamental.peers_used,
    data_confidence:   fundamental.data_confidence,
    data_conflicts:    fundamental.data_conflicts,
    // Live from Yahoo Finance
    revenue_ttm:       liveQuote?.revenue_ttm,
    ebitda_live:       liveQuote?.ebitda,
    gross_margins:     liveQuote?.gross_margins,
    ebitda_margins:    liveQuote?.ebitda_margins,
    profit_margins:    liveQuote?.profit_margins,
    // Keep historical mock for now — will be replaced by FMP
    historical:        MOCK_POSITION_DETAIL.financial_snapshot?.historical,
    forward:           MOCK_POSITION_DETAIL.financial_snapshot?.forward,
  } : MOCK_POSITION_DETAIL.financial_snapshot;

  // Build market analysis from real macro + sector
  const marketAnalysis = {
    tam_usd:               MOCK_POSITION_DETAIL.market_analysis?.tam_usd,
    growth_rate:           sectorReport ? `${sectorReport.sector_rankings?.[0]?.growth_outlook ?? "—"}` : MOCK_POSITION_DETAIL.market_analysis?.growth_rate,
    competition_intensity: MOCK_POSITION_DETAIL.market_analysis?.competition_intensity,
    sector_trends:         sectorReport?.sector_summary ?? MOCK_POSITION_DETAIL.market_analysis?.sector_trends,
    macro_factors:         macroReport?.macro_summary ?? MOCK_POSITION_DETAIL.market_analysis?.macro_factors,
    _macro_regime:         macroReport?.regime,
    _favoured_themes:      macroReport?.favoured_themes,
    _avoid_themes:         macroReport?.avoid_themes,
    _source:               "live_pipeline",
  };

  // Quality of earnings from fundamental report
  const qualityOfEarnings = fundamental ? {
    ...(MOCK_POSITION_DETAIL.quality_of_earnings ?? {}),
    valuation_assessment: fundamental.valuation_vs_peers,
    price_vs_intrinsic:   fundamental.price_vs_intrinsic_value,
    dislocation:          fundamental.dislocation_opportunity,
    key_strengths:        fundamental.key_strengths,
    key_concerns:         fundamental.key_concerns,
    data_confidence:      fundamental.data_confidence,
  } : MOCK_POSITION_DETAIL.quality_of_earnings;

  // Recommendation from committee decision
  const recommendation = decision ? {
    action:         decision.action?.toUpperCase().replace("_", " ") ?? "HOLD",
    conviction:     decision.conviction,
    target_price:   decision.target_price,
    stop_loss:      decision.stop_loss,
    conflict_note:  decision.conflict_resolution,
    composite_score: scorecard?.composite_score,
    overall_confidence: scorecard?.overall_confidence,
    _source: "committee_agent",
  } : MOCK_POSITION_DETAIL.recommendation;

  // Quant technical data
  const technicalData = quant ? {
    trend:               quant.trend,
    rsi_14:              quant.rsi_14,
    macd_signal:         quant.macd_signal,
    volume_trend:        quant.volume_trend,
    support:             quant.support,
    resistance:          quant.resistance,
    trade_type:          quant.trade_type,
    forward_bias:        quant.forward_bias,
    mean_reversion_score: quant.mean_reversion_score,
    key_patterns:        quant.key_patterns,
    signal_confidence:   quant.signal_confidence,
    quant_summary:       quant.quant_summary,
  } : null;

  // Sentiment data
  const sentimentData = sentiment ? {
    analyst_consensus:      sentiment.analyst_consensus,
    price_target_upside_pct:sentiment.price_target_upside_pct,
    news_sentiment:         sentiment.news_sentiment,
    short_interest_pct:     sentiment.short_interest_pct,
    short_squeeze_risk:     sentiment.short_squeeze_risk,
    contrarian_signal:      sentiment.contrarian_signal,
    sentiment_type:         sentiment.sentiment_type,
    sentiment_summary:      sentiment.sentiment_summary,
    // Overlay live Yahoo Finance targets
    analyst_target_live:    liveQuote?.analyst_target,
    analyst_low_live:       liveQuote?.analyst_low,
    analyst_high_live:      liveQuote?.analyst_high,
    recommendation_key:     liveQuote?.recommendation_key,
    num_analysts:           liveQuote?.number_of_analyst_opinions,
  } : null;

  // ── Compute live position stats (Alpaca is source of truth) ─────────────────
  const alpacaMarketValue = alpacaPosition ? Math.abs(parseFloat(alpacaPosition.market_value)) : null;
  const alpacaEquity      = alpacaAccount?.equity ?? null;
  const alpacaUnrealPct   = alpacaPosition ? parseFloat(alpacaPosition.unrealized_plpc) * 100 : null;
  const alpacaUnrealAbs   = alpacaPosition ? parseFloat(alpacaPosition.unrealized_pl) : null;
  const alpacaCurrentPrice= alpacaPosition ? parseFloat(alpacaPosition.current_price) : null;
  const alpacaEntryPrice  = alpacaPosition ? parseFloat(alpacaPosition.avg_entry_price) : null;
  const alpacaQty         = alpacaPosition ? parseFloat(alpacaPosition.qty) : null;

  const liveCurrentPrice = alpacaCurrentPrice ?? liveQuote?.current_price ?? positionEntry?.entry_price ?? MOCK_POSITION_DETAIL.current_price;
  const liveEntryPrice   = alpacaEntryPrice ?? positionEntry?.entry_price ?? MOCK_POSITION_DETAIL.entry_price;
  const liveMarketValue  = alpacaMarketValue ?? (liveCurrentPrice && alpacaQty ? liveCurrentPrice * alpacaQty : null);
  const livePctPortfolio = (liveMarketValue && alpacaEquity && alpacaEquity > 0)
    ? parseFloat((liveMarketValue / alpacaEquity * 100).toFixed(2))
    : positionEntry?.size_pct ?? MOCK_POSITION_DETAIL.pct_portfolio;
  const livePctChange = alpacaUnrealPct ?? (liveCurrentPrice && liveEntryPrice
    ? ((liveCurrentPrice - liveEntryPrice) / liveEntryPrice) * 100
    : 0);
  const livePnlAbs = alpacaUnrealAbs ?? (liveMarketValue && livePctChange
    ? (livePctChange / 100) * liveMarketValue
    : 0);

  const result = {
    // Core position fields — Alpaca is source of truth for live metrics
    ticker,
    company:        liveQuote?.company ?? ticker,
    sector:         liveQuote?.sector ?? MOCK_POSITION_DETAIL.sector,
    direction:      alpacaPosition?.side === "short" ? "short" : (positionEntry?.direction ?? "LONG").toLowerCase(),
    entry_price:    parseFloat(liveEntryPrice.toFixed(2)),
    current_price:  parseFloat(liveCurrentPrice.toFixed(2)),
    pct_change:     parseFloat(livePctChange.toFixed(2)),
    pnl_absolute:   parseFloat(livePnlAbs.toFixed(2)),
    position_size:  liveMarketValue ? parseFloat(liveMarketValue.toFixed(2)) : MOCK_POSITION_DETAIL.position_size,
    qty:            alpacaQty ?? null,
    pct_portfolio:  livePctPortfolio,
    entry_date:     positionEntry?.entry_date ?? MOCK_POSITION_DETAIL.entry_date,
    conviction:     positionEntry?.conviction ?? decision?.conviction ?? MOCK_POSITION_DETAIL.conviction,
    scenario:       scorecard?.overall_confidence === "high" ? "A" : scorecard?.overall_confidence === "medium" ? "B" : "C",
    review_timeline: reviewTimeline.length > 0 ? reviewTimeline : undefined,

    // Real agent data
    agent_scores:            agentScores,
    investment_thesis_bullets: thesisBullets,
    recommendation,
    financial_snapshot:      financialSnapshot,
    market_analysis:         marketAnalysis,
    quality_of_earnings:     qualityOfEarnings,
    technical_data:          technicalData,
    sentiment_data:          sentimentData,
    news_catalysts:          catalysts,
    key_catalysts:           decision?.key_catalysts ?? [],
    key_risks:               decision?.key_risks ?? [],

    // Keep mock data for sections not yet wired to pipeline
    company_info:         MOCK_POSITION_DETAIL.company_info,
    management_team:      MOCK_POSITION_DETAIL.management_team,
    analyst_rating_history: MOCK_POSITION_DETAIL.analyst_rating_history,
    cap_table:            MOCK_POSITION_DETAIL.cap_table,
    fund_mandate:         MOCK_POSITION_DETAIL.fund_mandate,
    setup_checklist:      MOCK_POSITION_DETAIL.setup_checklist,
    mandate_checklist:    MOCK_POSITION_DETAIL.mandate_checklist,
    valuation:            MOCK_POSITION_DETAIL.valuation,

    _source:              "pipeline",
    _pipeline_date:       committeeReport?.generated_at ?? fundamentalReport?.generated_at ?? "—",
    _macro_regime:        macroReport?.regime,
  };

  return NextResponse.json(result);
}
