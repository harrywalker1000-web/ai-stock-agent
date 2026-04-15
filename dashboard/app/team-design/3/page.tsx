"use client";

import { useEffect, useState } from "react";

interface Agent {
  id: string;
  name: string;
  role: string;
  number: number;
  personality: string;
  accuracy: number;
  current_focus: string;
  market_view: string;
  recent_activity: string;
  color: string;
  has_live_data?: boolean;
  feeds?: string;
}

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

// Bento grid cells — each agent maps to a CSS grid area
// Layout: 4 columns × 5 rows
// Committee: spans 2x2 in center-right
// Candidate: spans 1x2 (tall)
// Others: 1x1

// Flow lines: which agents feed which (for visual decoration)
const FLOW_GROUPS = [
  { label: "PHASE 1 — INTAKE", ids: ["macro", "sector", "institutional", "news"], color: "#0EA5E9" },
  { label: "FILTER", ids: ["candidate"], color: "#06B6D4" },
  { label: "PHASE 2 — ANALYSIS", ids: ["fundamental", "quant", "sentiment"], color: "#8B5CF6" },
  { label: "COMMITTEE", ids: ["committee"], color: "#F5A623" },
  { label: "EXECUTION", ids: ["executor", "memory"], color: "#EF4444" },
];

function BentoCard({
  agent,
  size,
  selected,
  onClick,
}: {
  agent: Agent;
  size: "sm" | "md" | "lg";
  selected: boolean;
  onClick: () => void;
}) {
  const rgb = hexToRgb(agent.color);

  const padding = size === "lg" ? "p-5" : size === "md" ? "p-4" : "p-3";
  const nameSize = size === "lg" ? "text-base" : size === "md" ? "text-sm" : "text-[11px]";
  const roleSize = size === "lg" ? "text-xs" : "text-[10px]";

  return (
    <button
      onClick={onClick}
      className={`relative w-full h-full text-left rounded-2xl transition-all duration-250 cursor-pointer group overflow-hidden ${padding}`}
      style={{
        background: selected
          ? `rgba(${rgb},0.12)`
          : `rgba(255,255,255,0.025)`,
        border: `1px solid ${selected ? agent.color : `rgba(${rgb},0.2)`}`,
        boxShadow: selected
          ? `0 0 32px rgba(${rgb},0.15), inset 0 0 24px rgba(${rgb},0.06)`
          : `inset 0 0 20px rgba(${rgb},0.03)`,
        transition: "all 0.25s ease",
      }}
    >
      {/* Gradient corner accent */}
      <div
        className="absolute top-0 right-0 w-16 h-16 rounded-bl-full opacity-20 group-hover:opacity-40 transition-opacity"
        style={{ background: `radial-gradient(circle at top right, ${agent.color}, transparent 70%)` }}
      />

      {/* Content */}
      <div className="relative z-10 h-full flex flex-col">
        {/* Number badge */}
        <div className="flex items-center justify-between mb-2">
          <span
            className="text-[9px] font-mono tracking-[0.2em] font-bold"
            style={{ color: agent.color }}
          >
            {String(agent.number).padStart(2, "0")}
          </span>
          {agent.has_live_data && (
            <span
              className="flex items-center gap-1 text-[8px] font-mono text-[#10B981] rounded-full px-1.5 py-0.5"
              style={{ background: "rgba(16,185,129,0.12)" }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" style={{ animation: "pulse-dot 2s ease-in-out infinite" }} />
              LIVE
            </span>
          )}
        </div>

        {/* Name + role */}
        <p
          className={`font-semibold text-[#E8EDF2] leading-tight ${nameSize}`}
          style={{ fontFamily: "var(--font-space-grotesk)" }}
        >
          {agent.name}
        </p>
        <p className={`text-[#6B7280] mt-0.5 ${roleSize}`}>{agent.role}</p>

        {/* For large cards, show personality snippet */}
        {size === "lg" && (
          <p className="text-[11px] text-[#94A3B8] leading-relaxed mt-3 flex-1 line-clamp-4">
            {agent.personality}
          </p>
        )}

        {/* For md cards, show one stat */}
        {size === "md" && agent.has_live_data && (
          <p className="text-[10px] text-[#64748B] mt-auto pt-2 leading-snug line-clamp-2">
            {agent.current_focus}
          </p>
        )}

        {/* Bottom accent line */}
        <div
          className="absolute bottom-0 left-0 right-0 h-px opacity-30"
          style={{ background: `linear-gradient(90deg, transparent, ${agent.color}, transparent)` }}
        />
      </div>
    </button>
  );
}

export default function TeamDesign3() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selected, setSelected] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data: Agent[]) => { setAgents(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const byId = (id: string) => agents.find((a) => a.id === id);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-[#6B7280] font-mono text-sm tracking-widest">LOADING AGENTS...</div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      <div className="min-h-screen flex flex-col pt-16" style={{ background: "#030005" }}>
        {/* Header */}
        <div className="px-8 pt-8 pb-6">
          <p className="text-[10px] tracking-[0.25em] text-[#6B7280] font-mono mb-1">
            DESIGN 3 — INTELLIGENCE GRID
          </p>
          <div className="flex items-end justify-between">
            <h1
              className="text-3xl font-bold tracking-tight"
              style={{ fontFamily: "var(--font-syne)", color: "#E8EDF2" }}
            >
              11 Agents. One Portfolio.
            </h1>
            <div className="flex gap-6 text-[10px] font-mono text-[#6B7280]">
              {FLOW_GROUPS.map((g) => (
                <div key={g.label} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: g.color }} />
                  <span>{g.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bento Grid */}
        <div className="flex-1 px-6 pb-6">
          <div
            className="grid gap-2 h-full"
            style={{
              gridTemplateColumns: "repeat(4, 1fr)",
              gridTemplateRows: "repeat(5, minmax(80px, 1fr))",
              maxHeight: "calc(100vh - 180px)",
            }}
          >
            {/* Phase 1 agents — column 1 */}
            {["macro", "sector", "institutional", "news"].map((id, i) => {
              const agent = byId(id);
              if (!agent) return null;
              return (
                <div key={id} style={{ gridColumn: "1", gridRow: `${i + 1}` }}>
                  <BentoCard
                    agent={agent}
                    size="sm"
                    selected={selected?.id === id}
                    onClick={() => setSelected(selected?.id === id ? null : agent)}
                  />
                </div>
              );
            })}

            {/* Candidate — column 2, rows 1-2 (tall) */}
            {(() => {
              const agent = byId("candidate");
              if (!agent) return null;
              return (
                <div style={{ gridColumn: "2", gridRow: "1 / span 2" }}>
                  <BentoCard
                    agent={agent}
                    size="md"
                    selected={selected?.id === "candidate"}
                    onClick={() => setSelected(selected?.id === "candidate" ? null : agent)}
                  />
                </div>
              );
            })()}

            {/* Phase 2 agents — column 2, rows 3-5 */}
            {["fundamental", "quant", "sentiment"].map((id, i) => {
              const agent = byId(id);
              if (!agent) return null;
              return (
                <div key={id} style={{ gridColumn: "2", gridRow: `${i + 3}` }}>
                  <BentoCard
                    agent={agent}
                    size="sm"
                    selected={selected?.id === id}
                    onClick={() => setSelected(selected?.id === id ? null : agent)}
                  />
                </div>
              );
            })}

            {/* Committee — columns 3-4, rows 3-5 (large feature cell) */}
            {(() => {
              const agent = byId("committee");
              if (!agent) return null;
              return (
                <div style={{ gridColumn: "3 / span 2", gridRow: "3 / span 3" }}>
                  <BentoCard
                    agent={agent}
                    size="lg"
                    selected={selected?.id === "committee"}
                    onClick={() => setSelected(selected?.id === "committee" ? null : agent)}
                  />
                </div>
              );
            })()}

            {/* Executor — column 3, rows 1-2 */}
            {(() => {
              const agent = byId("executor");
              if (!agent) return null;
              return (
                <div style={{ gridColumn: "3", gridRow: "1 / span 2" }}>
                  <BentoCard
                    agent={agent}
                    size="md"
                    selected={selected?.id === "executor"}
                    onClick={() => setSelected(selected?.id === "executor" ? null : agent)}
                  />
                </div>
              );
            })()}

            {/* Memory — column 4, rows 1-2 */}
            {(() => {
              const agent = byId("memory");
              if (!agent) return null;
              return (
                <div style={{ gridColumn: "4", gridRow: "1 / span 2" }}>
                  <BentoCard
                    agent={agent}
                    size="md"
                    selected={selected?.id === "memory"}
                    onClick={() => setSelected(selected?.id === "memory" ? null : agent)}
                  />
                </div>
              );
            })()}
          </div>

          {/* Detail drawer — slides in from bottom */}
          {selected && (
            <div
              className="mt-4 rounded-2xl border overflow-hidden"
              style={{
                background: `rgba(${hexToRgb(selected.color)},0.06)`,
                borderColor: `rgba(${hexToRgb(selected.color)},0.3)`,
              }}
            >
              <div className="flex items-start gap-6 p-5">
                {/* Left: identity */}
                <div className="shrink-0">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-2"
                    style={{ background: `rgba(${hexToRgb(selected.color)},0.15)` }}
                  >
                    <span
                      className="text-xl font-bold font-mono"
                      style={{ color: selected.color }}
                    >
                      {String(selected.number).padStart(2, "0")}
                    </span>
                  </div>
                  <p className="text-[9px] font-mono text-[#6B7280] text-center">
                    {selected.has_live_data ? (
                      <span className="text-[#10B981]">● LIVE</span>
                    ) : (
                      <span>OFFLINE</span>
                    )}
                  </p>
                </div>

                {/* Center: name + desc */}
                <div className="flex-1">
                  <h2
                    className="text-lg font-bold text-[#E8EDF2] mb-0.5"
                    style={{ fontFamily: "var(--font-syne)" }}
                  >
                    {selected.name}
                  </h2>
                  <p className="text-xs text-[#6B7280] mb-3">{selected.role}</p>
                  <p className="text-[11px] text-[#94A3B8] leading-relaxed">{selected.personality}</p>
                  {selected.feeds && (
                    <p className="text-[10px] font-mono text-[#6B7280] mt-3">
                      FEEDS → <span className="text-[#94A3B8]">{selected.feeds}</span>
                    </p>
                  )}
                </div>

                {/* Right: live stats */}
                {selected.has_live_data && (
                  <div className="shrink-0 w-56 space-y-2">
                    {[
                      { label: "FOCUS", val: selected.current_focus },
                      { label: "VIEW", val: selected.market_view },
                      { label: "ACTIVITY", val: selected.recent_activity },
                    ].map(({ label, val }) => (
                      <div
                        key={label}
                        className="rounded-lg p-2.5"
                        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
                      >
                        <p className="text-[8px] font-mono tracking-widest mb-0.5" style={{ color: selected.color }}>
                          {label}
                        </p>
                        <p className="text-[10px] text-[#CBD5E1] leading-snug line-clamp-2">{val}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Close */}
                <button
                  onClick={() => setSelected(null)}
                  className="text-[#6B7280] hover:text-[#E8EDF2] transition-colors text-xl leading-none shrink-0 cursor-pointer"
                >
                  ×
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
