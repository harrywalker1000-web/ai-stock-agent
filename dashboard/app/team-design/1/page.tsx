"use client";

import { useEffect, useState, useRef, useCallback } from "react";

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

// Positions for each agent on a 900x700 canvas
// Committee at center. Phase 1 on left arc. Phase 2 on right arc. Candidate middle-left. Executor/Memory bottom.
const LAYOUT: Record<string, { x: number; y: number; ring: string }> = {
  macro:         { x: 90,  y: 130, ring: "phase1" },
  sector:        { x: 60,  y: 280, ring: "phase1" },
  institutional: { x: 90,  y: 430, ring: "phase1" },
  news:          { x: 140, y: 560, ring: "phase1" },
  candidate:     { x: 330, y: 350, ring: "filter" },
  fundamental:   { x: 555, y: 160, ring: "phase2" },
  quant:         { x: 600, y: 340, ring: "phase2" },
  sentiment:     { x: 555, y: 510, ring: "phase2" },
  committee:     { x: 780, y: 335, ring: "committee" },
  executor:      { x: 780, y: 540, ring: "execute" },
  memory:        { x: 780, y: 620, ring: "execute" },
};

const CONNECTIONS: [string, string][] = [
  ["macro", "candidate"],
  ["sector", "candidate"],
  ["institutional", "candidate"],
  ["news", "candidate"],
  ["candidate", "fundamental"],
  ["candidate", "quant"],
  ["candidate", "sentiment"],
  ["fundamental", "committee"],
  ["quant", "committee"],
  ["sentiment", "committee"],
  ["committee", "executor"],
  ["executor", "memory"],
  ["macro", "committee"],  // macro also directly informs committee
  ["news", "committee"],   // news also directly informs committee
];

const RING_LABELS: Record<string, string> = {
  phase1: "PHASE 1 — SIGNAL INTAKE",
  filter: "FILTER",
  phase2: "PHASE 2 — DEEP ANALYSIS",
  committee: "COMMITTEE",
  execute: "EXECUTION",
};

function OrbitalNode({
  agent,
  x, y,
  selected,
  onClick,
}: {
  agent: Agent;
  x: number;
  y: number;
  selected: boolean;
  onClick: () => void;
}) {
  const isCommittee = agent.id === "committee";
  const r = isCommittee ? 38 : 28;
  const rgb = hexToRgb(agent.color);

  return (
    <g
      transform={`translate(${x},${y})`}
      onClick={onClick}
      style={{ cursor: "pointer" }}
    >
      {/* Outer pulse ring */}
      {agent.has_live_data && (
        <circle
          r={r + 10}
          fill="none"
          stroke={agent.color}
          strokeWidth="1"
          opacity="0.25"
          style={{ animation: "pulse-ring 2.5s ease-out infinite" }}
        />
      )}
      {/* Glow bg */}
      <circle r={r + 6} fill={`rgba(${rgb},0.10)`} />
      {/* Main circle */}
      <circle
        r={r}
        fill={`rgba(${rgb},0.14)`}
        stroke={selected ? agent.color : `rgba(${rgb},0.5)`}
        strokeWidth={selected ? 2 : 1}
        style={{ transition: "all 0.25s" }}
      />
      {/* Number */}
      <text
        textAnchor="middle"
        dy="-6"
        fill={agent.color}
        fontSize={isCommittee ? 11 : 9}
        fontFamily="var(--font-fira-code)"
        opacity="0.7"
      >
        {String(agent.number).padStart(2, "0")}
      </text>
      {/* Role abbrev */}
      <text
        textAnchor="middle"
        dy="8"
        fill="#E8EDF2"
        fontSize={isCommittee ? 8 : 7}
        fontFamily="var(--font-space-grotesk)"
        fontWeight="600"
        opacity="0.9"
      >
        {agent.name.split(" ")[0].toUpperCase().slice(0, 7)}
      </text>
      {/* Live indicator */}
      {agent.has_live_data && (
        <circle cx={r - 4} cy={-(r - 4)} r="3.5" fill="#10B981" stroke="#030005" strokeWidth="1" />
      )}
    </g>
  );
}

function AnimatedEdge({
  x1, y1, x2, y2, color, active,
}: { x1: number; y1: number; x2: number; y2: number; color: string; active: boolean }) {
  const mid1x = x1 + (x2 - x1) * 0.35;
  const mid2x = x1 + (x2 - x1) * 0.65;
  const d = `M ${x1} ${y1} C ${mid1x} ${y1}, ${mid2x} ${y2}, ${x2} ${y2}`;
  const rgb = hexToRgb(color);

  return (
    <g>
      <path d={d} fill="none" stroke={`rgba(${rgb},0.12)`} strokeWidth="1" />
      <path
        d={d}
        fill="none"
        stroke={active ? color : `rgba(${rgb},0.35)`}
        strokeWidth={active ? 1.5 : 0.8}
        strokeDasharray="4 8"
        opacity={active ? 0.9 : 0.5}
        style={{
          animation: "dash-flow 2s linear infinite",
          transition: "all 0.3s",
        }}
      />
    </g>
  );
}

export default function TeamDesign1() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selected, setSelected] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data: Agent[]) => { setAgents(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const byId = useCallback((id: string) => agents.find((a) => a.id === id), [agents]);

  const isConnectedToSelected = useCallback((a: string, b: string) => {
    if (!selected) return false;
    return a === selected.id || b === selected.id;
  }, [selected]);

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
        @keyframes pulse-ring {
          0% { r: 38; opacity: 0.3; }
          70% { r: 54; opacity: 0; }
          100% { r: 54; opacity: 0; }
        }
        @keyframes dash-flow {
          to { stroke-dashoffset: -24; }
        }
      `}</style>

      <div className="min-h-screen flex flex-col pt-16" style={{ background: "#030005" }}>
        {/* Header */}
        <div className="px-8 pt-8 pb-4 flex items-end justify-between">
          <div>
            <p className="text-[10px] tracking-[0.25em] text-[#6B7280] font-mono mb-1">
              DESIGN 1 — ORBITAL NETWORK
            </p>
            <h1
              className="text-3xl font-bold tracking-tight"
              style={{ fontFamily: "var(--font-syne)", color: "#E8EDF2" }}
            >
              Agent Intelligence Map
            </h1>
          </div>
          <div className="flex gap-4 text-[10px] font-mono text-[#6B7280] items-center">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#10B981] inline-block" />
              LIVE DATA
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-px border-t border-dashed border-[#6B7280] inline-block" />
              SIGNAL FLOW
            </span>
          </div>
        </div>

        {/* SVG Canvas */}
        <div className="flex-1 flex flex-col lg:flex-row gap-0 px-4 pb-6">
          <div className="flex-1 relative">
            <svg
              ref={svgRef}
              viewBox="0 0 940 700"
              className="w-full"
              style={{ maxHeight: "calc(100vh - 160px)" }}
            >
              {/* Phase labels */}
              <text x="60" y="70" fill="#6B7280" fontSize="8" fontFamily="var(--font-fira-code)" letterSpacing="3">
                PHASE 1
              </text>
              <text x="280" y="300" fill="#6B7280" fontSize="8" fontFamily="var(--font-fira-code)" letterSpacing="3">
                FILTER
              </text>
              <text x="510" y="100" fill="#6B7280" fontSize="8" fontFamily="var(--font-fira-code)" letterSpacing="3">
                PHASE 2
              </text>
              <text x="730" y="280" fill="#6B7280" fontSize="8" fontFamily="var(--font-fira-code)" letterSpacing="3">
                DECISION
              </text>
              <text x="720" y="490" fill="#6B7280" fontSize="8" fontFamily="var(--font-fira-code)" letterSpacing="3">
                EXECUTE
              </text>

              {/* Grid background lines */}
              {[...Array(10)].map((_, i) => (
                <line key={`h${i}`} x1="0" y1={i * 78} x2="940" y2={i * 78} stroke="#ffffff04" strokeWidth="1" />
              ))}
              {[...Array(14)].map((_, i) => (
                <line key={`v${i}`} x1={i * 72} y1="0" x2={i * 72} y2="700" stroke="#ffffff04" strokeWidth="1" />
              ))}

              {/* Edges */}
              {CONNECTIONS.map(([from, to]) => {
                const a = byId(from);
                const b = byId(to);
                const posA = LAYOUT[from];
                const posB = LAYOUT[to];
                if (!a || !b || !posA || !posB) return null;
                return (
                  <AnimatedEdge
                    key={`${from}-${to}`}
                    x1={posA.x} y1={posA.y}
                    x2={posB.x} y2={posB.y}
                    color={a.color}
                    active={isConnectedToSelected(from, to)}
                  />
                );
              })}

              {/* Nodes */}
              {agents.map((agent) => {
                const pos = LAYOUT[agent.id];
                if (!pos) return null;
                return (
                  <OrbitalNode
                    key={agent.id}
                    agent={agent}
                    x={pos.x}
                    y={pos.y}
                    selected={selected?.id === agent.id}
                    onClick={() => setSelected(selected?.id === agent.id ? null : agent)}
                  />
                );
              })}
            </svg>
          </div>

          {/* Info Panel */}
          <div
            className="w-full lg:w-80 shrink-0 flex flex-col justify-center p-4"
          >
            {selected ? (
              <div
                className="rounded-2xl p-5 border"
                style={{
                  background: `rgba(${hexToRgb(selected.color)},0.06)`,
                  borderColor: `rgba(${hexToRgb(selected.color)},0.3)`,
                }}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="text-[10px] font-mono tracking-widest"
                        style={{ color: selected.color }}
                      >
                        AGENT {String(selected.number).padStart(2, "0")}
                      </span>
                      {selected.has_live_data && (
                        <span className="flex items-center gap-1 text-[9px] font-mono text-[#10B981]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                          LIVE
                        </span>
                      )}
                    </div>
                    <h2
                      className="text-xl font-bold"
                      style={{ fontFamily: "var(--font-syne)", color: "#E8EDF2" }}
                    >
                      {selected.name}
                    </h2>
                    <p className="text-xs text-[#6B7280] mt-0.5">{selected.role}</p>
                  </div>
                  <button
                    onClick={() => setSelected(null)}
                    className="text-[#6B7280] hover:text-[#E8EDF2] text-lg leading-none cursor-pointer transition-colors"
                  >
                    ×
                  </button>
                </div>

                {/* Personality */}
                <p className="text-[11px] text-[#94A3B8] leading-relaxed mb-4">
                  {selected.personality}
                </p>

                {/* Live stats */}
                {selected.has_live_data && (
                  <div className="space-y-2 mb-4">
                    {[
                      { label: "FOCUS", val: selected.current_focus },
                      { label: "VIEW", val: selected.market_view },
                      { label: "ACTIVITY", val: selected.recent_activity },
                    ].map(({ label, val }) => (
                      <div key={label} className="rounded-lg p-2.5" style={{ background: "rgba(255,255,255,0.03)" }}>
                        <span className="text-[9px] font-mono tracking-widest" style={{ color: selected.color }}>
                          {label}
                        </span>
                        <p className="text-[11px] text-[#CBD5E1] mt-0.5 leading-snug">{val}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Feeds */}
                {selected.feeds && (
                  <div className="text-[10px] font-mono text-[#6B7280] border-t pt-3" style={{ borderColor: `rgba(${hexToRgb(selected.color)},0.2)` }}>
                    <span className="tracking-widest">FEEDS → </span>
                    <span className="text-[#94A3B8]">{selected.feeds}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center p-8">
                <p className="text-[10px] font-mono tracking-widest text-[#4B5563]">SELECT AN AGENT</p>
                <p className="text-xs text-[#374151] mt-2">Click any node to inspect</p>
                <div className="mt-6 grid grid-cols-2 gap-2">
                  {agents.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setSelected(a)}
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors cursor-pointer"
                      style={{ background: "rgba(255,255,255,0.03)", border: `1px solid rgba(${hexToRgb(a.color)},0.2)` }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: a.color }} />
                      <span className="text-[10px] text-[#94A3B8] truncate">{a.name.split(" ")[0]}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
