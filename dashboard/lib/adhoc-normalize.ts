/**
 * The repo holds adhoc research reports in two schemas:
 *   "flat"     — top-level s5_timing, s6_thesis, s7_recommendation, s10…s13 (older, GPT-4o)
 *   "sections" — report.sections.s1_cover … s17_reliability, each value {value, source, status}
 * Consumers (position page) want one shape. This maps both into it and marks which
 * numbers are AI-generated so the UI can label them "AI estimate".
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export interface NormalizedScenario {
  price_target: number | null;
  change_pct: number | null;          // signed % vs price at report time
  probability: number | null;
  probability_basis: "ai_estimate" | "fixed_assumption" | null;
  target_basis: "ai_estimate" | "data";
  note: string | null;
}

export interface NormalizedAdhoc {
  schema: "flat" | "sections";
  generated_at: string | null;
  thesis_narrative: string | null;     // AI narrative
  entry_verdict: string | null;        // AI
  recommendation: Any | null;          // AI committee/LLM output
  scenarios: { bull: NormalizedScenario; base: NormalizedScenario; bear: NormalizedScenario } | null;
  historical_performance: {
    ret_1m: number | null; ret_3m: number | null; ret_6m: number | null; ret_1yr: number | null; // percent
    vs_spy_1yr: number | null; high_52w: number | null; low_52w: number | null; pct_from_high: number | null;
  } | null;
  risk_dashboard: Any | null;
  institutional: Any | null;
}

const v = (x: Any) => (x && typeof x === "object" && "value" in x ? x.value : x) ?? null;
const num = (x: Any): number | null => {
  const n = v(x);
  return typeof n === "number" && isFinite(n) ? n : null;
};
const pct = (frac: Any): number | null => {
  const n = num(frac);
  return n == null ? null : n * 100;
};

export function isSectionsReport(r: Any): boolean {
  return !!(r && typeof r.sections === "object" && r.sections);
}

function flatScenario(s: Any, bear: boolean): NormalizedScenario {
  const change = bear ? (s?.downside_pct ?? s?.upside_pct) : s?.upside_pct;
  return {
    price_target: num(s?.price_target),
    // flat reports store bear downside as either signed or absolute — force the sign
    change_pct: change == null ? null : bear ? -Math.abs(Number(change)) : Number(change),
    probability: num(s?.probability),
    probability_basis: s?.probability != null ? "ai_estimate" : null,
    target_basis: "ai_estimate",
    note: s?.catalyst ?? s?.trigger ?? s?.assumptions ?? null,
  };
}

function sectionScenario(s: Any): NormalizedScenario {
  const probSrc = String(s?.probability?.source ?? "").toLowerCase();
  return {
    price_target: num(s?.price_target),
    change_pct: num(s?.upside_pct),
    probability: num(s?.probability),
    probability_basis: num(s?.probability) == null ? null : probSrc.includes("fixed") ? "fixed_assumption" : "ai_estimate",
    target_basis: String(s?.price_target?.source ?? "").includes("AI") ? "ai_estimate" : "data",
    note: s?.price_target?.source ? `Target: ${s.price_target.source}` : null,
  };
}

export function normalizeAdhoc(r: Any): NormalizedAdhoc | null {
  if (!r || typeof r !== "object") return null;

  if (!isSectionsReport(r)) {
    const p = r.s11_performance;
    return {
      schema: "flat",
      generated_at: r.generated_at ?? null,
      thesis_narrative: r.s6_thesis?.narrative ?? null,
      entry_verdict: r.s5_timing?.entry_verdict ?? null,
      recommendation: r.s7_recommendation ?? null,
      scenarios: r.s13_scenarios
        ? {
            bull: flatScenario(r.s13_scenarios.bull, false),
            base: flatScenario(r.s13_scenarios.base, false),
            bear: flatScenario(r.s13_scenarios.bear, true),
          }
        : null,
      // flat reports store returns as fractions (0.128 = 12.8%)
      historical_performance: p
        ? {
            ret_1m: pct(p.ret_1m), ret_3m: pct(p.ret_3m), ret_6m: pct(p.ret_6m), ret_1yr: pct(p.ret_1yr),
            vs_spy_1yr: pct(p.vs_spy_1yr), high_52w: num(p.high_52w), low_52w: num(p.low_52w),
            pct_from_high: num(p.pct_from_high),
          }
        : null,
      risk_dashboard: r.s12_risk ?? null,
      institutional: r.s10_institutional ?? null,
    };
  }

  const s = r.sections;
  const cover = s.s1_cover ?? {};
  const rec = s.s16_recommendation ?? null;
  const risks = s.s11_risks ?? {};
  const fin = risks.financials_snapshot ?? {};
  const tech = s.s7_technicals ?? {};
  const inst = s.s10_institutional ?? null;
  const ret = cover.returns ?? {};
  const price = num(cover.current_price);
  const hi = num(cover["52w_high"]);
  return {
    schema: "sections",
    generated_at: r.generated_at ?? null,
    thesis_narrative: rec?.committee_narrative ?? null,
    entry_verdict: null,
    recommendation: rec
      ? {
          direction: rec.direction ?? null,
          conviction: rec.conviction ?? null,
          expected_return_12m: rec.expected_return_12m ?? null,
          suggested_size_pct: rec.position_size_pct ?? null,
          stop_loss_pct: rec.stop_loss_pct ?? null,
          key_risks: rec.key_risks ?? [],
        }
      : null,
    scenarios: s.s12_scenarios
      ? {
          bull: sectionScenario(s.s12_scenarios.bull),
          base: sectionScenario(s.s12_scenarios.base),
          bear: sectionScenario(s.s12_scenarios.bear),
        }
      : null,
    // sections reports store returns already in percent
    historical_performance: {
      ret_1m: num(ret["1m"]), ret_3m: num(ret["3m"]), ret_6m: num(ret["6m"]), ret_1yr: num(ret["1y"]),
      vs_spy_1yr: null, high_52w: hi, low_52w: num(cover["52w_low"]),
      pct_from_high: num(tech.pct_from_52w_high) ?? (price != null && hi ? ((price - hi) / hi) * 100 : null),
    },
    risk_dashboard: {
      beta: num(fin.beta),
      max_drawdown: null,
      volatility_pct: null,
      atr_pct: num(tech.atr_pct),
      // yfinance reports D/E as a percentage (122.9 = 1.23x) — convert to a ratio
      debt_to_equity: num(fin.debt_to_equity) != null ? (num(fin.debt_to_equity) as number) / 100 : null,
      current_ratio: num(fin.current_ratio),
      liquidity_risk: null,
      data_conflicts: [],
    },
    institutional: inst
      ? {
          institutional_pct: num(inst.institutional_pct),
          insider_pct: num(inst.insider_pct),
          fund_theses: [],
          convergence_signals: [],
          unusual_options: [],
          multi_fund_flag: false,
        }
      : null,
  };
}
