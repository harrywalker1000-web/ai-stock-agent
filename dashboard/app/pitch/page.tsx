"use client";
import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

const EXAMPLES = ["AAPL", "NVDA", "MSFT", "AMZN", "GOOGL"];

const SECTIONS = [
  "Investment Thesis",
  "Company Overview & Revenue Segments",
  "Market Opportunity (TAM / Competitive Intensity)",
  "Financial Performance (3-year historical + forward estimates)",
  "Competitive Landscape & Comparable Companies",
  "Management Quality & Competitive Moat",
  "Setup, Timing & Near-term Catalysts",
  "Valuation Analysis",
  "Technical Analysis",
  "Sentiment & Institutional Activity",
  "Risk Factors",
  "Scenario Analysis — Bull / Base / Bear",
  "Final Recommendation",
];

export default function PitchLanding() {
  const [ticker, setTicker] = useState("");
  const router = useRouter();

  const go = (t: string) => {
    const clean = t.trim().toUpperCase().replace(/[^A-Z.]/g, "");
    if (clean) router.push(`/pitch/${clean}`);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    go(ticker);
  };

  return (
    <div className="min-h-screen bg-white text-[#0F172A]">
      <div className="max-w-2xl mx-auto px-6 py-24">
        <p className="text-xs font-mono text-amber-500 uppercase tracking-widest mb-4">
          Haz Capital Management
        </p>
        <h1 className="text-5xl font-bold mb-4">Stock Pitch Generator</h1>
        <p className="text-slate-500 text-lg mb-12 max-w-md">
          AI-generated investment analysis across 13 research dimensions. Enter a
          ticker to produce a professional pitch document.
        </p>

        <form onSubmit={handleSubmit} className="mb-12">
          <div className="flex gap-3 mb-3">
            <input
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              placeholder="Ticker symbol (e.g. NVDA)"
              className="flex-1 px-5 py-4 text-lg font-mono uppercase border-2 border-slate-200 rounded-xl focus:outline-none focus:border-amber-400 placeholder:font-sans placeholder:normal-case placeholder:text-slate-400"
              maxLength={6}
              autoFocus
            />
            <button
              type="submit"
              disabled={!ticker.trim()}
              className="px-8 py-4 bg-[#0F172A] text-white font-semibold rounded-xl hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Generate
            </button>
          </div>
          <div className="flex gap-2 flex-wrap">
            <span className="text-xs text-slate-400 self-center">Try:</span>
            {EXAMPLES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => go(t)}
                className="px-3 py-1 text-xs font-mono bg-slate-100 text-slate-500 rounded-lg hover:bg-amber-50 hover:text-amber-700 transition-colors"
              >
                {t}
              </button>
            ))}
          </div>
        </form>

        <div className="border-t border-slate-100 pt-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-5">
            Sections included
          </p>
          <div className="space-y-3">
            {SECTIONS.map((s, i) => (
              <div key={s} className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full bg-amber-50 text-amber-600 text-xs font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <span className="text-sm text-slate-600">{s}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-6">
            Requires a prior ad-hoc research run for the requested ticker.
          </p>
        </div>
      </div>
    </div>
  );
}
