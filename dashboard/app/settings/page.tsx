"use client";

import { useEffect, useState } from "react";

type AnalysisMode = "Lite" | "Standard" | "Full" | "Auto";

type CandidateLimits = Record<AnalysisMode, { analyze: number; debate: number; contested: number }>;

const DEFAULT_LIMITS: CandidateLimits = {
  Lite:     { analyze: 15, debate: 10, contested: 5  },
  Standard: { analyze: 25, debate: 20, contested: 8  },
  Full:     { analyze: 50, debate: 40, contested: 15 },
  Auto:     { analyze: 30, debate: 25, contested: 10 },
};

const MODE_INFO: Record<AnalysisMode, { description: string; phaseA: string; phaseB: string; time: string; cost: string }> = {
  Auto: {
    description: "Recommended. Standard every day — automatically adds Fundamental Analyst for held positions with earnings within 3 days.",
    phaseA: "Macro + News + Quant + Sentiment (+ Fundamental if earnings ≤3 days)",
    phaseB: "Phases 1–4 + Sentiment",
    time: "~12-25 min",
    cost: "Smart",
  },
  Lite: {
    description: "Fastest daily run — essential signals only. No Sentiment or Fundamental in either phase.",
    phaseA: "Macro + News + Quant",
    phaseB: "Phases 1–3 (no Sentiment)",
    time: "~8-12 min",
    cost: "Low",
  },
  Standard: {
    description: "Adds Sentiment to both phases — catches daily analyst upgrades and short interest shifts on held positions.",
    phaseA: "Macro + News + Quant + Sentiment",
    phaseB: "Phases 1–4 + Sentiment",
    time: "~14-20 min",
    cost: "Medium",
  },
  Full: {
    description: "Complete analysis every day — Sentiment plus Fundamental Analyst on all held positions regardless of earnings schedule.",
    phaseA: "All agents including Sentiment + Fundamental",
    phaseB: "Phases 1–5 (all agents)",
    time: "~30-45 min",
    cost: "High",
  },
};

export default function SettingsPage() {
  const [mode, setMode] = useState<AnalysisMode>("Auto");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedLimits, setSavedLimits] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [limits, setLimits] = useState<CandidateLimits>(DEFAULT_LIMITS);
  const [editingLimits, setEditingLimits] = useState(false);
  const [draftLimits, setDraftLimits] = useState<CandidateLimits>(DEFAULT_LIMITS);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setErrorMsg(data.error);
        if (data.mode && ["Auto", "Lite", "Standard", "Full"].includes(data.mode)) setMode(data.mode as AnalysisMode);
        if (data.updated_at) setUpdatedAt(data.updated_at);
        if (data.candidate_limits) {
          setLimits(data.candidate_limits as CandidateLimits);
          setDraftLimits(data.candidate_limits as CandidateLimits);
        }
      })
      .catch(() => setErrorMsg("Could not load saved settings — network error"));
  }, []);

  const save = async (newMode: AnalysisMode) => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: newMode }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setErrorMsg(d.error ?? `Save failed (HTTP ${res.status})`);
      else setErrorMsg(null);
      if (res.ok) {
        setMode(newMode);
        setSaved(true);
        setUpdatedAt(new Date().toISOString());
        setTimeout(() => setSaved(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  };

  const saveLimits = async () => {
    setSaving(true);
    setSavedLimits(false);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate_limits: draftLimits }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setErrorMsg(d.error ?? `Save failed (HTTP ${res.status})`);
      else setErrorMsg(null);
      if (res.ok) {
        if (d.candidate_limits) setDraftLimits(d.candidate_limits as CandidateLimits);
        setLimits({ ...draftLimits });
        setEditingLimits(false);
        setSavedLimits(true);
        setUpdatedAt(new Date().toISOString());
        setTimeout(() => setSavedLimits(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  };

  const updateDraft = (m: AnalysisMode, field: "analyze" | "debate" | "contested", raw: string) => {
    const val = Math.max(1, Math.min(200, parseInt(raw, 10) || 1));
    setDraftLimits((prev) => {
      const next = { ...prev[m], [field]: val };
      // Cascade constraints: contested ≤ debate ≤ analyze
      if (field === "analyze") {
        if (next.debate > val) next.debate = val;
        if (next.contested > next.debate) next.contested = next.debate;
      } else if (field === "debate") {
        next.debate = Math.min(val, prev[m].analyze);
        if (next.contested > next.debate) next.contested = next.debate;
      } else {
        next.contested = Math.min(val, prev[m].debate);
      }
      return { ...prev, [m]: next };
    });
  };

  return (
    <div className="min-h-screen bg-canvas pb-16">
      <div className="max-w-3xl mx-auto px-6 pt-8">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold text-ink-1">Settings</h1>
          <p className="text-ink-3 text-sm mt-1">Configure pipeline behaviour and analysis depth. Saved to the repo, so the next pipeline run uses it.</p>
        </div>

        {errorMsg && (
          <div className="card p-4 mb-6 border border-loss/30 bg-loss/5" role="alert">
            <p className="text-sm text-loss">{errorMsg}</p>
          </div>
        )}

        {/* Analysis Mode */}
        <div className="card p-6 mb-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-display text-lg font-bold text-ink-1">Analysis Mode</h2>
            {saved && (
              <span className="text-xs font-bold text-gain bg-gain/10 px-2 py-0.5 rounded-md">
                Saved
              </span>
            )}
          </div>
          <p className="text-xs text-ink-3 mb-6">
            Controls how much of the pipeline runs each day. Takes effect on the next run.
            The <code className="text-ink-1">ANALYSIS_MODE</code> environment variable overrides this setting.
          </p>

          <div className="grid grid-cols-1 gap-3">
            {(["Auto", "Lite", "Standard", "Full"] as AnalysisMode[]).map((m) => {
              const info = MODE_INFO[m];
              const isSelected = mode === m;
              const isAuto = m === "Auto";
              return (
                <button
                  key={m}
                  onClick={() => save(m)}
                  disabled={saving}
                  className={`text-left p-5 rounded-xl border transition-all duration-200 ${
 isSelected
 ? isAuto ?"border-accent bg-accent/8":"border-accent bg-accent/8"
 :"border-white/08 bg-white/02 hover:border-white/15 hover:bg-white/04"
 }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isSelected ? (isAuto ?"border-accent":"border-accent") :"border-white/20"}`}>
                        {isSelected && <div className={`w-2 h-2 rounded-full ${isAuto ?"bg-accent":"bg-accent"}`} />}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`font-bold text-sm ${isSelected ? (isAuto ?"text-accent":"text-accent") :"text-ink-1"}`}>{m}</span>
                        {isAuto && (
                          <span className="text-micro font-semibold px-1.5 py-0.5 rounded bg-accent/15 text-accent">Recommended</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-ink-3">{info.time}</span>
                      <span className={`px-1.5 py-0.5 rounded font-medium ${
 info.cost ==="Smart"?"bg-accent/10 text-accent"
 : info.cost ==="Low"?"bg-gain/10 text-gain"
 : info.cost ==="Medium"?"bg-caution/10 text-caution"
 :"bg-loss/10 text-loss"
 }`}>{info.cost} cost</span>
                    </div>
                  </div>
                  <p className="text-xs text-ink-3 mb-3 ml-7">{info.description}</p>
                  <div className="ml-7 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-ink-3 mb-0.5">Phase A (Review)</p>
                      <p className="text-ink-2">{info.phaseA}</p>
                    </div>
                    <div>
                      <p className="text-ink-3 mb-0.5">Phase B (Research)</p>
                      <p className="text-ink-2">{info.phaseB}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {updatedAt && (
            <p className="text-micro text-ink-3 mt-4 text-right">
              Last saved: {new Date(updatedAt).toLocaleString()}
            </p>
          )}
        </div>

        {/* Phase B Candidate Limits */}
        <div className="card p-6 mb-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-display text-lg font-bold text-ink-1">Phase B Candidate Limits</h2>
            <div className="flex items-center gap-2">
              {savedLimits && (
                <span className="text-xs font-bold text-gain bg-gain/10 px-2 py-0.5 rounded-md">Saved</span>
              )}
              {editingLimits ? (
                <>
                  <button
                    onClick={() => { setDraftLimits({ ...limits }); setEditingLimits(false); }}
                    className="text-xs text-ink-3 hover:text-ink-1 px-3 py-1 rounded-lg border border-white/10 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveLimits}
                    disabled={saving}
                    className="text-xs font-semibold text-ink-3 bg-accent hover:bg-accent/90 px-3 py-1 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Save
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setEditingLimits(true)}
                  className="text-xs text-ink-3 hover:text-ink-1 px-3 py-1 rounded-lg border border-white/10 transition-colors cursor-pointer"
                >
                  Edit
                </button>
              )}
            </div>
          </div>
          {/* Phase B flow explanation */}
          <div className="flex items-start gap-3 mb-5 p-4 rounded-xl bg-white/03 border border-white/06">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-ink-3 leading-relaxed mb-2">Phase B runs in three stages. Only configurable columns affect cost — <span className="text-ink-1">Max Contested</span> is fixed at 10 in code.</p>
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-accent/10 border border-accent/20 text-accent font-medium">① Analyse</span>
                <span className="text-ink-3">→</span>
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-accent/10 border border-accent/20 text-accent font-medium">② Committee Vote</span>
                <span className="text-ink-3">→</span>
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-loss/10 border border-loss/20 text-loss font-medium">③ Contested Debate</span>
              </div>
              <div className="mt-3 space-y-1 text-micro text-ink-3">
                <p><span className="text-accent">① Analyse:</span> Candidate Generator selects stocks → Fundamental, Quant, Sentiment (not Lite) agents all run on each one.</p>
                <p><span className="text-accent">② Committee Vote:</span> Top N by composite score go to the Investment Committee. Each gets an initial verdict (Buy / Skip). A stock can be added to the portfolio here without proceeding further.</p>
                <p><span className="text-loss">③ Contested Debate:</span> Stocks where agents disagreed significantly (spread ≥ 20 pts) get up to 10 rounds of back-and-forth challenge. Max 10 stocks enter this stage. A stock can be added <em>without</em> reaching this stage if agents agreed from the start.</p>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-white/08">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/08 bg-white/02">
                  <th className="text-left px-4 py-3 text-ink-3 text-xs font-semibold">Mode</th>
                  <th className="text-center px-4 py-3 text-accent text-xs font-semibold">① Analyse</th>
                  <th className="text-center px-4 py-3 text-accent text-xs font-semibold">② Committee</th>
                  <th className="text-center px-4 py-3 text-loss text-xs font-semibold hidden sm:table-cell">③ Max Contested</th>
                  <th className="text-left px-4 py-3 text-ink-3 text-xs font-semibold hidden md:table-cell">Notes</th>
                </tr>
              </thead>
              <tbody>
                {(["Auto", "Lite", "Standard", "Full"] as AnalysisMode[]).map((m, i) => {
                  const isActive = mode === m;
                  const row = editingLimits ? draftLimits[m] : limits[m];
                  const def = DEFAULT_LIMITS[m];
                  const changed = limits[m].analyze !== def.analyze || limits[m].debate !== def.debate || limits[m].contested !== def.contested;
                  return (
                    <tr key={m} className={`border-b border-white/05 last:border-0 ${i % 2 === 0 ?"bg-white/01":""} ${isActive ?"bg-accent/4":""}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`font-semibold text-sm ${isActive ?"text-accent":"text-ink-1"}`}>{m}</span>
                          {isActive && <span className="text-micro px-1.5 py-0.5 rounded bg-accent/15 text-accent font-semibold">Active</span>}
                          {changed && !editingLimits && <span className="text-micro px-1.5 py-0.5 rounded bg-accent/15 text-accent font-semibold">Custom</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {editingLimits ? (
                          <input
                            type="number"
                            min={1}
                            max={200}
                            value={draftLimits[m].analyze}
                            onChange={(e) => updateDraft(m, "analyze", e.target.value)}
                            className="w-20 text-center bg-white/08 border border-white/15 rounded-lg px-2 py-1 text-ink-1 text-sm focus:outline-none focus:border-accent/60"
                          />
                        ) : (
                          <span className="text-accent font-semibold">{row.analyze}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {editingLimits ? (
                          <input
                            type="number"
                            min={1}
                            max={draftLimits[m].analyze}
                            value={draftLimits[m].debate}
                            onChange={(e) => updateDraft(m, "debate", e.target.value)}
                            className="w-20 text-center bg-white/08 border border-white/15 rounded-lg px-2 py-1 text-ink-1 text-sm focus:outline-none focus:border-accent/60"
                          />
                        ) : (
                          <span className="text-accent font-semibold">{row.debate}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center hidden sm:table-cell">
                        {editingLimits ? (
                          <input
                            type="number"
                            min={1}
                            max={draftLimits[m].debate}
                            value={draftLimits[m].contested}
                            onChange={(e) => updateDraft(m, "contested", e.target.value)}
                            className="w-20 text-center bg-white/08 border border-white/15 rounded-lg px-2 py-1 text-ink-1 text-sm focus:outline-none focus:border-loss/60"
                          />
                        ) : (
                          <span className="text-loss font-semibold">{row.contested}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-ink-3 text-xs hidden md:table-cell">
                        {m === "Full" ? "Max coverage — good for weekend catch-up runs" :
                         m === "Auto" ? "Slightly above Standard for smarter days" :
                         m === "Standard" ? "Balanced — recommended for daily use" :
                         "Fastest run — essential signals only"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-micro text-ink-3 mt-3">
            Constraints: ③ Contested ≤ ② Committee ≤ ① Analyse ≤ 200. Defaults: Lite 15/10/5 · Standard 25/20/8 · Auto 30/25/10 · Full 50/40/15.
          </p>
        </div>

        {/* Info card */}
        <div className="card p-5 bg-accent/4 border border-accent/10">
          <p className="text-xs text-ink-3 leading-relaxed">
            <span className="text-accent font-semibold">Note:</span> The pipeline runs daily at 9:45am ET.
            Changes made here apply to the next scheduled run. You can also override this at runtime by setting
            the <code className="text-ink-1">ANALYSIS_MODE</code> environment variable.
          </p>
        </div>
      </div>
    </div>
  );
}
