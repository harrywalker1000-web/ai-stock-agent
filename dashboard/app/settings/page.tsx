"use client";

import { useEffect, useState } from "react";

type AnalysisMode = "Lite" | "Standard" | "Full" | "Auto";

type CandidateLimits = Record<AnalysisMode, { analyze: number; debate: number }>;

const DEFAULT_LIMITS: CandidateLimits = {
  Lite:     { analyze: 15, debate: 10 },
  Standard: { analyze: 25, debate: 20 },
  Full:     { analyze: 50, debate: 40 },
  Auto:     { analyze: 30, debate: 25 },
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
  const [limits, setLimits] = useState<CandidateLimits>(DEFAULT_LIMITS);
  const [editingLimits, setEditingLimits] = useState(false);
  const [draftLimits, setDraftLimits] = useState<CandidateLimits>(DEFAULT_LIMITS);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.mode && ["Auto", "Lite", "Standard", "Full"].includes(data.mode)) setMode(data.mode as AnalysisMode);
        if (data.updated_at) setUpdatedAt(data.updated_at);
        if (data.candidate_limits) {
          setLimits(data.candidate_limits as CandidateLimits);
          setDraftLimits(data.candidate_limits as CandidateLimits);
        }
      })
      .catch(() => {});
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
      if (res.ok) {
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

  const updateDraft = (m: AnalysisMode, field: "analyze" | "debate", raw: string) => {
    const val = Math.max(1, Math.min(200, parseInt(raw, 10) || 1));
    setDraftLimits((prev) => ({
      ...prev,
      [m]: {
        ...prev[m],
        [field]: field === "debate" ? Math.min(val, prev[m].analyze) : val,
        ...(field === "analyze" && val < prev[m].debate ? { debate: val } : {}),
      },
    }));
  };

  return (
    <div className="min-h-screen bg-[#080C10] pb-16">
      <div className="max-w-3xl mx-auto px-6 pt-8">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold text-[#E8EDF2]">Settings</h1>
          <p className="text-[#6B7280] text-sm mt-1">Configure pipeline behaviour and analysis depth.</p>
        </div>

        {/* Analysis Mode */}
        <div className="card p-6 mb-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-display text-lg font-bold text-[#E8EDF2]">Analysis Mode</h2>
            {saved && (
              <span className="text-xs font-bold text-[#10B981] bg-[#10B981]/10 px-2 py-0.5 rounded-md">
                Saved
              </span>
            )}
          </div>
          <p className="text-xs text-[#6B7280] mb-6">
            Controls how much of the pipeline runs each day. Takes effect on the next run.
            The <code className="text-[#E8EDF2]">ANALYSIS_MODE</code> environment variable overrides this setting.
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
                      ? isAuto ? "border-[#06B6D4] bg-[#06B6D4]/08" : "border-[#F5A623] bg-[#F5A623]/08"
                      : "border-white/08 bg-white/02 hover:border-white/15 hover:bg-white/04"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isSelected ? (isAuto ? "border-[#06B6D4]" : "border-[#F5A623]") : "border-white/20"}`}>
                        {isSelected && <div className={`w-2 h-2 rounded-full ${isAuto ? "bg-[#06B6D4]" : "bg-[#F5A623]"}`} />}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`font-bold text-sm ${isSelected ? (isAuto ? "text-[#06B6D4]" : "text-[#F5A623]") : "text-[#E8EDF2]"}`}>{m}</span>
                        {isAuto && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#06B6D4]/15 text-[#06B6D4]">Recommended</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-[#6B7280]">{info.time}</span>
                      <span className={`px-1.5 py-0.5 rounded font-medium ${
                        info.cost === "Smart" ? "bg-[#06B6D4]/10 text-[#06B6D4]"
                        : info.cost === "Low" ? "bg-[#10B981]/10 text-[#10B981]"
                        : info.cost === "Medium" ? "bg-[#F59E0B]/10 text-[#F59E0B]"
                        : "bg-[#EF4444]/10 text-[#EF4444]"
                      }`}>{info.cost} cost</span>
                    </div>
                  </div>
                  <p className="text-xs text-[#6B7280] mb-3 ml-7">{info.description}</p>
                  <div className="ml-7 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-[#4B5563] uppercase tracking-wider mb-0.5">Phase A (Review)</p>
                      <p className="text-[#9CA3AF]">{info.phaseA}</p>
                    </div>
                    <div>
                      <p className="text-[#4B5563] uppercase tracking-wider mb-0.5">Phase B (Research)</p>
                      <p className="text-[#9CA3AF]">{info.phaseB}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {updatedAt && (
            <p className="text-[10px] text-[#4B5563] mt-4 text-right">
              Last saved: {new Date(updatedAt).toLocaleString()}
            </p>
          )}
        </div>

        {/* Phase B Candidate Limits */}
        <div className="card p-6 mb-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-display text-lg font-bold text-[#E8EDF2]">Phase B Candidate Limits</h2>
            <div className="flex items-center gap-2">
              {savedLimits && (
                <span className="text-xs font-bold text-[#10B981] bg-[#10B981]/10 px-2 py-0.5 rounded-md">Saved</span>
              )}
              {editingLimits ? (
                <>
                  <button
                    onClick={() => { setDraftLimits({ ...limits }); setEditingLimits(false); }}
                    className="text-xs text-[#6B7280] hover:text-[#E8EDF2] px-3 py-1 rounded-lg border border-white/10 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveLimits}
                    disabled={saving}
                    className="text-xs font-semibold text-[#080C10] bg-[#F5A623] hover:bg-[#F5A623]/90 px-3 py-1 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Save
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setEditingLimits(true)}
                  className="text-xs text-[#6B7280] hover:text-[#E8EDF2] px-3 py-1 rounded-lg border border-white/10 transition-colors cursor-pointer"
                >
                  Edit
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-[#6B7280] mb-5">
            Controls how many stocks are deeply analysed and debated by the committee each day in Phase B, per mode.
            Analyze = stocks fundamental analysis runs on. Debate = stocks the committee actually votes on.
          </p>

          <div className="overflow-hidden rounded-xl border border-white/08">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/08 bg-white/02">
                  <th className="text-left px-4 py-3 text-[#4B5563] text-xs font-semibold uppercase tracking-wider">Mode</th>
                  <th className="text-center px-4 py-3 text-[#4B5563] text-xs font-semibold uppercase tracking-wider">Analyze</th>
                  <th className="text-center px-4 py-3 text-[#4B5563] text-xs font-semibold uppercase tracking-wider">Debate</th>
                  <th className="text-left px-4 py-3 text-[#4B5563] text-xs font-semibold uppercase tracking-wider hidden sm:table-cell">Notes</th>
                </tr>
              </thead>
              <tbody>
                {(["Auto", "Lite", "Standard", "Full"] as AnalysisMode[]).map((m, i) => {
                  const isActive = mode === m;
                  const row = editingLimits ? draftLimits[m] : limits[m];
                  const def = DEFAULT_LIMITS[m];
                  const changed = limits[m].analyze !== def.analyze || limits[m].debate !== def.debate;
                  return (
                    <tr key={m} className={`border-b border-white/05 last:border-0 ${i % 2 === 0 ? "bg-white/01" : ""} ${isActive ? "bg-[#F5A623]/04" : ""}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`font-semibold text-sm ${isActive ? "text-[#F5A623]" : "text-[#E8EDF2]"}`}>{m}</span>
                          {isActive && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F5A623]/15 text-[#F5A623] font-semibold">Active</span>}
                          {changed && !editingLimits && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#06B6D4]/15 text-[#06B6D4] font-semibold">Custom</span>}
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
                            className="w-20 text-center bg-white/08 border border-white/15 rounded-lg px-2 py-1 text-[#E8EDF2] text-sm focus:outline-none focus:border-[#F5A623]/60"
                          />
                        ) : (
                          <span className="text-[#E8EDF2] font-mono">{row.analyze}</span>
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
                            className="w-20 text-center bg-white/08 border border-white/15 rounded-lg px-2 py-1 text-[#E8EDF2] text-sm focus:outline-none focus:border-[#F5A623]/60"
                          />
                        ) : (
                          <span className="text-[#E8EDF2] font-mono">{row.debate}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#6B7280] text-xs hidden sm:table-cell">
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
          <p className="text-[10px] text-[#4B5563] mt-3">
            Debate must be ≤ Analyze. Max 200. Defaults: Lite 15/10 · Standard 25/20 · Auto 30/25 · Full 50/40.
          </p>
        </div>

        {/* Info card */}
        <div className="card p-5 bg-[#F5A623]/04 border border-[#F5A623]/10">
          <p className="text-xs text-[#6B7280] leading-relaxed">
            <span className="text-[#F5A623] font-semibold">Note:</span> The pipeline runs daily at 9:45am ET.
            Changes made here apply to the next scheduled run. You can also override this at runtime by setting
            the <code className="text-[#E8EDF2]">ANALYSIS_MODE</code> environment variable.
          </p>
        </div>
      </div>
    </div>
  );
}
