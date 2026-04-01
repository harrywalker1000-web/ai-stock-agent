"use client";

import { useEffect, useState } from "react";

type AnalysisMode = "Lite" | "Standard" | "Full";

const MODE_INFO: Record<AnalysisMode, { description: string; phaseA: string; phaseB: string; time: string; cost: string }> = {
  Lite: {
    description: "Fastest daily run — essential signals only. Skips Sentiment in both phases.",
    phaseA: "Macro + News + Quant",
    phaseB: "Phases 1–3 (no Sentiment)",
    time: "~8-12 min",
    cost: "Low",
  },
  Standard: {
    description: "Balanced coverage — adds Fundamental analysis to Phase A and full Phase B pipeline.",
    phaseA: "Macro + News + Quant + Fundamental",
    phaseB: "Full Phases 1–4",
    time: "~18-25 min",
    cost: "Medium",
  },
  Full: {
    description: "Complete analysis — adds Sentiment to both phases and uses longer LLM prompts.",
    phaseA: "All agents including Sentiment",
    phaseB: "Full Phases 1–5 + extended prompts",
    time: "~30-45 min",
    cost: "High",
  },
};

export default function SettingsPage() {
  const [mode, setMode] = useState<AnalysisMode>("Lite");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.mode) setMode(data.mode as AnalysisMode);
        if (data.updated_at) setUpdatedAt(data.updated_at);
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
            {(["Lite", "Standard", "Full"] as AnalysisMode[]).map((m) => {
              const info = MODE_INFO[m];
              const isSelected = mode === m;
              return (
                <button
                  key={m}
                  onClick={() => save(m)}
                  disabled={saving}
                  className={`text-left p-5 rounded-xl border transition-all duration-200 ${
                    isSelected
                      ? "border-[#0EA5E9] bg-[#0EA5E9]/08"
                      : "border-white/08 bg-white/02 hover:border-white/15 hover:bg-white/04"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isSelected ? "border-[#0EA5E9]" : "border-white/20"}`}>
                        {isSelected && <div className="w-2 h-2 rounded-full bg-[#0EA5E9]" />}
                      </div>
                      <span className={`font-bold text-sm ${isSelected ? "text-[#0EA5E9]" : "text-[#E8EDF2]"}`}>{m}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-[#6B7280]">{info.time}</span>
                      <span className={`px-1.5 py-0.5 rounded font-medium ${
                        info.cost === "Low" ? "bg-[#10B981]/10 text-[#10B981]"
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

        {/* Info card */}
        <div className="card p-5 bg-[#0EA5E9]/04 border border-[#0EA5E9]/10">
          <p className="text-xs text-[#6B7280] leading-relaxed">
            <span className="text-[#0EA5E9] font-semibold">Note:</span> The pipeline runs daily at 9:45am ET.
            Changes made here apply to the next scheduled run. You can also override this at runtime by setting
            the <code className="text-[#E8EDF2]">ANALYSIS_MODE</code> environment variable.
          </p>
        </div>
      </div>
    </div>
  );
}
