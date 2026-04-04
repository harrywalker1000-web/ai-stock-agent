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
    // Pipeline historical + forward data (real per-ticker data)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    historical:        (fundamental as any).financial_snapshot?.historical ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    forward:           (fundamental as any).financial_snapshot?.forward ?? null,
    // Live from Yahoo Finance
    revenue_ttm:       liveQuote?.revenue_ttm,
    ebitda_live:       liveQuote?.ebitda,
    gross_margins:     liveQuote?.gross_margins,
    ebitda_margins:    liveQuote?.ebitda_margins,
    profit_margins:    liveQuote?.profit_margins,
  } : MOCK_POSITION_DETAIL.financial_snapshot;

  // Build market analysis from real fundamental + macro + sector
  const marketAnalysis = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tam_usd:               (fundamental as any)?.market_analysis?.tam_usd ?? "—",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    growth_rate:           (fundamental as any)?.market_analysis?.growth_rate ?? (sectorReport ? `${sectorReport.sector_rankings?.[0]?.growth_outlook ?? "—"}` : "—"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    competition_intensity: (fundamental as any)?.market_analysis?.competition_intensity ?? "—",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sector_trends:         macroReport?.macro_summary ?? (fundamental as any)?.market_analysis?.sector_trends ?? sectorReport?.sector_summary ?? "—",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    macro_factors:         macroReport?.macro_summary ?? (fundamental as any)?.market_analysis?.macro_factors ?? "—",
    _macro_regime:         macroReport?.regime,
    _favoured_themes:      macroReport?.favoured_themes,
    _avoid_themes:         macroReport?.avoid_themes,
    _source:               "live_pipeline",
  };

  // Quality of earnings — from fundamental.quality_of_earnings (real per-ticker data)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fundamentalQoE = (fundamental as any)?.quality_of_earnings ?? null;
  const qualityOfEarnings = fundamental ? {
    moat:                  fundamentalQoE?.moat ?? "—",
    competitive_advantages: fundamentalQoE?.competitive_advantages ?? [],
    barriers_to_entry:     fundamentalQoE?.barriers_to_entry ?? "—",
    sustainability:        fundamentalQoE?.sustainability ?? "—",
    valuation_assessment:  fundamental.valuation_vs_peers,
    price_vs_intrinsic:    fundamental.price_vs_intrinsic_value,
    dislocation:           fundamental.dislocation_opportunity,
    key_strengths:         fundamental.key_strengths,
    key_concerns:          fundamental.key_concerns,
    data_confidence:       fundamental.data_confidence,
  } : MOCK_POSITION_DETAIL.quality_of_earnings;

  // Recommendation — add direction derived from decision action / held position
  const recDirection = decision?.action === "enter_long" ? "LONG"
    : decision?.action === "enter_short" ? "SHORT"
    : (alpacaPosition?.side === "short" || positionEntry?.direction?.toUpperCase() === "SHORT") ? "SHORT"
    : "LONG";
  const recommendation = decision ? {
    direction:      recDirection,
    action:         decision.action?.toUpperCase().replace("_", " ") ?? "HOLD",
    conviction:     decision.conviction,
    target_price:   decision.target_price,
    stop_loss:      decision.stop_loss,
    stop_loss_note: decision.stop_loss ? `Stop loss: $${decision.stop_loss}` : null,
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

  // ── Setup Checklist — built from fundamental pipeline data ───────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setupChecklist: { item: string; detail: string }[] = fundamental ? (() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const f = fundamental as any;
    const items: { item: string; detail: string }[] = [];
    if (f.setup_type) items.push({ item: "Setup type", detail: `${f.setup_type}${f.fundamental_summary ? ` — ${String(f.fundamental_summary).slice(0, 200)}` : ""}` });
    if (f.revenue_growth_yoy != null) items.push({ item: "Revenue growth YoY", detail: `${Number(f.revenue_growth_yoy).toFixed(1)}% — ${Number(f.revenue_growth_yoy) >= 10 ? "above" : "below"} 10% threshold. Margin trend: ${f.margin_trend ?? "—"}` });
    if (f.operating_margin != null) items.push({ item: "Operating margin", detail: `${Number(f.operating_margin).toFixed(1)}%` });
    if (f.fcf_positive != null) items.push({ item: "FCF status", detail: f.fcf_positive ? "Positive — cash generation intact" : "Negative — burning cash, monitor closely" });
    if (f.default_risk) items.push({ item: "Default risk", detail: String(f.default_risk) });
    if (f.leverage_vs_peers) items.push({ item: "Leverage vs peers", detail: String(f.leverage_vs_peers) });
    const strengths: string[] = f.key_strengths ?? [];
    if (strengths.length > 0) items.push({ item: "Key strengths", detail: strengths.slice(0, 3).join("; ") });
    const concerns: string[] = f.key_concerns ?? [];
    if (concerns.length > 0) items.push({ item: "Key concerns", detail: concerns.slice(0, 3).join("; ") });
    return items;
  })() : MOCK_POSITION_DETAIL.setup_checklist as unknown as { item: string; detail: string }[];

  // ── Mandate Checklist — built from fund_mandate in fundamental report ─────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fundMandateData = (fundamental as any)?.fund_mandate ?? null;
  const mandateChecklist: { item: string; pass: boolean }[] = fundMandateData ? (() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fm = fundMandateData as any;
    const items: { item: string; pass: boolean }[] = [];
    if (fm.asset_class || fm.exchange) items.push({ item: `Asset class — ${fm.asset_class ?? "Equity"} (${fm.exchange ?? "—"})`, pass: true });
    if (fm.market_cap_figure) items.push({ item: `Market cap: ${fm.market_cap_figure}`, pass: true });
    if (fm.sector) items.push({ item: `Sector in universe: ${fm.sector}`, pass: true });
    if (fm.avg_daily_volume_usd) {
      items.push({ item: `Avg daily volume: $${fm.avg_daily_volume_usd}`, pass: true });
    } else {
      items.push({ item: "Avg daily volume — data unavailable", pass: false });
    }
    const gf = fm.geography_flags ?? {};
    const sanctionsClean = !gf.russia_exposure && !gf.mongolia_exposure && !gf.cambodia_exposure;
    items.push({ item: `Sanctions check — ${sanctionsClean ? "Clean" : "FLAGGED"} (${gf.exposure_detail ?? "—"})`, pass: sanctionsClean });
    const pepsClean = fm.peps_check?.clean !== false;
    items.push({ item: `PEPs check — ${fm.peps_check?.notes ?? "manual check required"}`, pass: pepsClean });
    if (fm.setup_type) items.push({ item: `Setup type identified: ${fm.setup_type}`, pass: true });
    if (fm.float_pct != null) items.push({ item: `Float: ${fm.float_pct}%`, pass: Number(fm.float_pct) > 20 });
    return items;
  })() : MOCK_POSITION_DETAIL.mandate_checklist as unknown as { item: string; pass: boolean }[];

  // ── Valuation — built from decision + scorecard + fundamental ─────────────────
  const valuation = (() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const f = fundamental as any;
    if (!f && !decision) return MOCK_POSITION_DETAIL.valuation;
    return {
      trade_type_classification: f?.setup_type ?? (decision?.action?.includes("long") ? "Long momentum" : "Tactical/Swing"),
      methodology: "Peer comps + technical signals",
      analyst_consensus_target: decision?.target_price ?? liveQuote?.analyst_target ?? null,
      implied_multiples: f?.valuation_vs_peers ?? "—",
      is_forecast_realistic: f?.price_vs_intrinsic_value ?? "—",
      expected_roi_2_3yr: decision?.target_price
        ? `Target: $${decision.target_price}${decision.stop_loss ? `, stop $${decision.stop_loss}` : ""}. Conviction: ${decision.conviction ?? "—"}/100`
        : "—",
      moic_estimate: "—",
    };
  })();

  // ── Analyst rating history — from live Yahoo Finance data ────────────────────
  const analystRatingHistory = liveQuote ? {
    current_consensus: liveQuote.recommendation_key
      ? (liveQuote.recommendation_key as string).replace(/_/g, " ").split(" ").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
      : "—",
    num_analysts:      liveQuote.number_of_analyst_opinions ?? null,
    avg_target_price:  liveQuote.analyst_target ?? null,
    implied_upside_pct: (liveQuote.analyst_target && liveQuote.current_price)
      ? parseFloat(((liveQuote.analyst_target - liveQuote.current_price) / liveQuote.current_price * 100).toFixed(1))
      : null,
    trend_24m: "—",
    summary: [
      liveQuote.number_of_analyst_opinions ? `${liveQuote.number_of_analyst_opinions} analysts covering.` : "",
      liveQuote.analyst_target ? `Mean target $${Number(liveQuote.analyst_target).toFixed(0)}` : "",
      (liveQuote.analyst_low && liveQuote.analyst_high) ? `(range $${Number(liveQuote.analyst_low).toFixed(0)}–$${Number(liveQuote.analyst_high).toFixed(0)}).` : "",
      liveQuote.recommendation_key ? `Consensus: ${String(liveQuote.recommendation_key).replace(/_/g, " ")}.` : "",
    ].filter(Boolean).join(" "),
  } : null;

  // ── Market timing — from quant signals + entry thesis ────────────────────────
  const marketTiming = (() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = quant as any;
    if (!q) return positionEntry?.entry_thesis ?? null;
    const parts: string[] = [];
    if (q.rsi_14 != null) parts.push(`RSI(14) at ${Number(q.rsi_14).toFixed(0)}${Number(q.rsi_14) < 30 ? " — oversold" : Number(q.rsi_14) > 70 ? " — overbought" : " — neutral"}`);
    if (q.macd_signal) parts.push(`MACD: ${q.macd_signal}`);
    if (q.support) parts.push(`Support: $${q.support}`);
    if (q.resistance) parts.push(`Resistance: $${q.resistance}`);
    if (q.forward_bias) parts.push(`Bias: ${q.forward_bias}`);
    if (q.quant_summary) parts.push(q.quant_summary);
    if (catalysts.length > 0) parts.push(`Catalyst: ${catalysts[0].catalyst}`);
    return parts.length > 0 ? parts.join(". ") : (positionEntry?.entry_thesis ?? null);
  })();

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

    // Ticker-specific data from pipeline + live sources
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    company_info:         (fundamental as any)?.company_info ?? null,
    fund_mandate:         fundMandateData,
    setup_checklist:      setupChecklist,
    mandate_checklist:    mandateChecklist,
    valuation,
    analyst_rating_history: analystRatingHistory,
    market_timing:        marketTiming,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    comparables:          (fundamental as any)?.comparables ?? MOCK_POSITION_DETAIL.comparables,
    management_team:      null,
    cap_table:            null,

    _source:              "pipeline",
    _pipeline_date:       committeeReport?.generated_at ?? fundamentalReport?.generated_at ?? "—",
    _macro_regime:        macroReport?.regime,
  };

  return NextResponse.json(result);
}
