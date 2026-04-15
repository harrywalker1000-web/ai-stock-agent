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

// Pipeline columns: each column is a stage, agents flow left to right
const STAGES = [
  {
    id: "intake",
    label: "SIGNAL INTAKE",
    sublabel: "Phase 1",
    agentIds: ["macro", "sector", "institutional", "news"],
  },
  {
    id: "filter",
    label: "FILTER",
    sublabel: "Quality Gate",
    agentIds: ["candidate"],
  },
  {
    id: "analysis",
    label: "DEEP ANALYSIS",
    sublabel: "Phase 2",
    agentIds: ["fundamental", "quant", "sentiment"],
  },
  {
    id: "decision",
    label: "DECISION",
    sublabel: "Committee",
    agentIds: ["committee"],
  },
  {
    id: "execution",
    label: "EXECUTION",
    sublabel: "Alpaca + Memory",
    agentIds: ["executor", "memory"],
  },
];

function AgentChip({
  agent,
  selected,
  onClick,
}: {
  agent: Agent;
  selected: boolean;
  onClick: () => void;
}) {
  const rgb = hexToRgb(agent.color);
  const isLarge = agent.id === "committee" || agent.id === "candidate";

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl transition-all duration-200 cursor-pointer group"
      style={{
        background: selected
          ? `rgba(${rgb},0.15)`
          : `rgba(255,255,255,0.03)`,
        border: `1px solid ${selected ? agent.color : `rgba(${rgb},0.25)`}`,
        padding: isLarge ? "16px" : "12px",
        boxShadow: selected ? `0 0 20px rgba(${rgb},0.2)` : "none",
      }}
    >
      <div className="flex items-start gap-3">
        {/* Color bar */}
        <div
          className="shrink-0 rounded-sm mt-0.5"
          style={{
            width: 3,
            height: isLarge ? 44 : 32,
            background: agent.color,
            opacity: selected ? 1 : 0.6,
          }}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <span
              className="text-[9px] font-mono tracking-widest"
              style={{ color: agent.color, opacity: 0.8 }}
            >
              {String(agent.number).padStart(2, "0")}
            </span>
            {agent.has_live_data && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
            )}
          </div>
          <p
            className="font-semibold leading-tight truncate"
            style={{
              fontFamily: "var(--font-space-grotesk)",
              fontSize: isLarge ? 13 : 11,
              color: "#E8EDF2",
            }}
          >
            {agent.name}
          </p>
          <p
            className="text-[10px] truncate mt-0.5"
            style={{ color: "#6B7280" }}
          >
            {agent.role}
          </p>

          {/* Live data snippet */}
          {agent.has_live_data && selected && (
            <p
              className="text-[10px] mt-2 leading-snug"
              style={{ color: "#94A3B8" }}
            >
              {agent.current_focus?.slice(0, 80)}
              {(agent.current_focus?.length ?? 0) > 80 ? "..." : ""}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

// Connector arrow between stages
function StageConnector({ color }: { color: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-1 shrink-0" style={{ minWidth: 28 }}>
      <div className="flex flex-col items-center gap-1">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="rounded-full"
            style={{
              width: 2,
              height: 2,
              background: color,
              opacity: 0.2 + i * 0.15,
            }}
          />
        ))}
        <svg width="12" height="8" viewBox="0 0 12 8" fill="none" style={{ opacity: 0.5 }}>
          <path d="M0 4H10M7 1L11 4L7 7" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

export default function TeamDesign2() {
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
    <div className="min-h-screen flex flex-col pt-16" style={{ background: "#030005" }}>
      {/* Header */}
      <div className="px-8 pt-8 pb-6">
        <p className="text-[10px] tracking-[0.25em] text-[#6B7280] font-mono mb-1">
          DESIGN 2 — SIGNAL PIPELINE
        </p>
        <div className="flex items-end justify-between">
          <h1
            className="text-3xl font-bold tracking-tight"
            style={{ fontFamily: "var(--font-syne)", color: "#E8EDF2" }}
          >
            Intelligence Pipeline
          </h1>
          <div className="text-[10px] font-mono text-[#6B7280]">
            {agents.filter((a) => a.has_live_data).length} / {agents.length} AGENTS LIVE
          </div>
        </div>
      </div>

      {/* Pipeline */}
      <div className="flex-1 px-4 pb-6">
        <div className="flex items-stretch gap-0 overflow-x-auto pb-2">
          {STAGES.map((stage, si) => {
            const stageAgents = stage.agentIds.map(byId).filter(Boolean) as Agent[];
            const accentColor = stageAgents[0]?.color ?? "#6B7280";
            const rgb = hexToRgb(accentColor);

            return (
              <div key={stage.id} className="flex items-stretch">
                {/* Stage column */}
                <div
                  className="flex flex-col rounded-2xl overflow-hidden"
                  style={{
                    minWidth: stage.id === "filter" || stage.id === "decision" ? 180 : 200,
                    maxWidth: stage.id === "filter" || stage.id === "decision" ? 200 : 220,
                    background: `rgba(${rgb},0.04)`,
                    border: `1px solid rgba(${rgb},0.15)`,
                  }}
                >
                  {/* Column header */}
                  <div
                    className="px-4 py-3 border-b"
                    style={{ borderColor: `rgba(${rgb},0.15)` }}
                  >
                    <p
                      className="text-[9px] font-mono tracking-[0.2em] mb-0.5"
                      style={{ color: accentColor, opacity: 0.8 }}
                    >
                      {stage.sublabel.toUpperCase()}
                    </p>
                    <p
                      className="text-xs font-semibold text-[#E8EDF2]"
                      style={{ fontFamily: "var(--font-space-grotesk)" }}
                    >
                      {stage.label}
                    </p>
                  </div>

                  {/* Agent chips */}
                  <div className="flex flex-col gap-2 p-3 flex-1">
                    {stageAgents.map((agent) => (
                      <AgentChip
                        key={agent.id}
                        agent={agent}
                        selected={selected?.id === agent.id}
                        onClick={() => setSelected(selected?.id === agent.id ? null : agent)}
                      />
                    ))}
                  </div>

                  {/* Stage stat */}
                  <div
                    className="px-4 py-2 border-t text-[9px] font-mono"
                    style={{ borderColor: `rgba(${rgb},0.12)`, color: "#4B5563" }}
                  >
                    {stageAgents.filter((a) => a.has_live_data).length} / {stageAgents.length} LIVE
                  </div>
                </div>

                {/* Connector between stages */}
                {si < STAGES.length - 1 && (
                  <StageConnector color={accentColor} />
                )}
              </div>
            );
          })}
        </div>

        {/* Detail panel */}
        {selected && (
          <div
            className="mt-4 rounded-2xl p-5 border relative"
            style={{
              background: `rgba(${hexToRgb(selected.color)},0.06)`,
              borderColor: `rgba(${hexToRgb(selected.color)},0.3)`,
            }}
          >
            <button
              onClick={() => setSelected(null)}
              className="absolute top-4 right-4 text-[#6B7280] hover:text-[#E8EDF2] transition-colors text-xl leading-none cursor-pointer"
            >
              ×
            </button>

            <div className="flex items-start gap-4 mb-4">
              <div
                className="rounded-xl px-3 py-1.5 shrink-0"
                style={{ background: `rgba(${hexToRgb(selected.color)},0.15)` }}
              >
                <span
                  className="text-lg font-bold font-mono"
                  style={{ color: selected.color }}
                >
                  {String(selected.number).padStart(2, "0")}
                </span>
              </div>
              <div>
                <h2
                  className="text-lg font-bold text-[#E8EDF2]"
                  style={{ fontFamily: "var(--font-syne)" }}
                >
                  {selected.name}
                </h2>
                <p className="text-xs text-[#6B7280]">{selected.role}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <p className="text-[11px] text-[#94A3B8] leading-relaxed">
                {selected.personality}
              </p>

              {selected.has_live_data && (
                <div className="space-y-2">
                  {[
                    { label: "CURRENT FOCUS", val: selected.current_focus },
                    { label: "MARKET VIEW", val: selected.market_view },
                    { label: "RECENT ACTIVITY", val: selected.recent_activity },
                  ].map(({ label, val }) => (
                    <div
                      key={label}
                      className="rounded-lg p-3"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                    >
                      <p className="text-[9px] font-mono tracking-widest mb-1" style={{ color: selected.color }}>
                        {label}
                      </p>
                      <p className="text-[11px] text-[#CBD5E1] leading-snug">{val}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selected.feeds && (
              <div
                className="mt-4 pt-3 border-t text-[10px] font-mono text-[#6B7280]"
                style={{ borderColor: `rgba(${hexToRgb(selected.color)},0.2)` }}
              >
                FEEDS → <span className="text-[#94A3B8]">{selected.feeds}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
