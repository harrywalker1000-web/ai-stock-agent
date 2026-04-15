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

interface ChatMessage {
  role: "user" | "agent";
  text: string;
}

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

// Canvas: 1060 × 720. Nodes spread with breathing room for labels below.
const LAYOUT: Record<string, { x: number; y: number }> = {
  macro:         { x: 120,  y: 110 },
  sector:        { x: 80,   y: 270 },
  institutional: { x: 115,  y: 430 },
  news:          { x: 165,  y: 575 },
  candidate:     { x: 370,  y: 340 },
  fundamental:   { x: 590,  y: 150 },
  quant:         { x: 640,  y: 340 },
  sentiment:     { x: 590,  y: 520 },
  committee:     { x: 870,  y: 305 },
  executor:      { x: 870,  y: 500 },
  memory:        { x: 870,  y: 620 },
};

const CONNECTIONS: [string, string][] = [
  ["macro", "candidate"], ["sector", "candidate"],
  ["institutional", "candidate"], ["news", "candidate"],
  ["candidate", "fundamental"], ["candidate", "quant"], ["candidate", "sentiment"],
  ["fundamental", "committee"], ["quant", "committee"], ["sentiment", "committee"],
  ["committee", "executor"], ["executor", "memory"],
  ["macro", "committee"], ["news", "committee"],
];

const R_COMMITTEE = 50;
const R_CANDIDATE = 42;
const R_NORMAL    = 36;

function nodeR(id: string) {
  if (id === "committee") return R_COMMITTEE;
  if (id === "candidate") return R_CANDIDATE;
  return R_NORMAL;
}

// ─── Node ────────────────────────────────────────────────────────────────────

function OrbitalNode({
  agent, x, y, selected, hovered,
  onClick, onMouseEnter, onMouseLeave,
}: {
  agent: Agent; x: number; y: number;
  selected: boolean; hovered: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const r = nodeR(agent.id);
  const rgb = hexToRgb(agent.color);
  const scale = hovered ? 1.12 : selected ? 1.06 : 1;

  return (
    <g
      transform={`translate(${x},${y})`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ cursor: "pointer" }}
    >
      {/* Scale group */}
      <g style={{ transform: `scale(${scale})`, transformOrigin: "0 0", transition: "transform 0.2s ease" }}>
        {/* Ambient glow */}
        <circle r={r + 14} fill={`rgba(${rgb},${hovered ? 0.14 : 0.07})`}
          style={{ transition: "all 0.2s ease" }} />
        {/* Pulse ring for live agents */}
        {agent.has_live_data && (
          <circle r={r + 22} fill="none" stroke={agent.color} strokeWidth="1"
            opacity="0" className="pulse-ring" />
        )}
        {/* Border ring — brightens on hover */}
        <circle r={r + 2} fill="none"
          stroke={agent.color}
          strokeWidth={hovered || selected ? 1.5 : 0.6}
          opacity={hovered || selected ? 0.6 : 0.2}
          style={{ transition: "all 0.2s ease" }} />
        {/* Main fill */}
        <circle r={r}
          fill={`rgba(${rgb},${selected ? 0.22 : 0.12})`}
          stroke={selected ? agent.color : `rgba(${rgb},0.55)`}
          strokeWidth={selected ? 2 : 1}
          style={{
            filter: (hovered || selected) ? `drop-shadow(0 0 ${hovered ? 14 : 10}px rgba(${rgb},0.55))` : "none",
            transition: "all 0.2s ease",
          }}
        />
        {/* Agent number */}
        <text textAnchor="middle" dy="-5"
          fill={agent.color} fontSize={agent.id === "committee" ? 13 : 11}
          fontFamily="var(--font-fira-code)" fontWeight="700" opacity="0.85">
          {String(agent.number).padStart(2, "0")}
        </text>
        {/* Short name inside */}
        <text textAnchor="middle" dy="10"
          fill="#E8EDF2" fontSize={agent.id === "committee" ? 9 : 8}
          fontFamily="var(--font-space-grotesk)" fontWeight="600" opacity="0.75">
          {agent.name.split(" ")[0].toUpperCase()}
        </text>
        {/* Live dot */}
        {agent.has_live_data && (
          <circle cx={r - 5} cy={-(r - 5)} r="4" fill="#10B981"
            stroke="#030005" strokeWidth="1.5" className="live-dot" />
        )}
      </g>
      {/* Label BELOW the circle (outside scale group so it doesn't scale) */}
      <text textAnchor="middle" y={r + 18}
        fill={selected || hovered ? "#E8EDF2" : "#9CA3AF"}
        fontSize="9" fontFamily="var(--font-space-grotesk)"
        style={{ transition: "fill 0.2s ease", letterSpacing: "0.05em" }}>
        {agent.name.toUpperCase()}
      </text>
    </g>
  );
}

// ─── Edge ────────────────────────────────────────────────────────────────────

function AnimatedEdge({ x1, y1, x2, y2, color, active }: {
  x1: number; y1: number; x2: number; y2: number; color: string; active: boolean;
}) {
  const cx1 = x1 + (x2 - x1) * 0.4;
  const cx2 = x1 + (x2 - x1) * 0.6;
  const d = `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`;
  const rgb = hexToRgb(color);
  return (
    <g>
      <path d={d} fill="none" stroke={`rgba(${rgb},0.08)`} strokeWidth="1.5" />
      <path d={d} fill="none"
        stroke={active ? color : `rgba(${rgb},0.3)`}
        strokeWidth={active ? 1.5 : 0.8}
        strokeDasharray="5 9"
        opacity={active ? 1 : 0.6}
        className="signal-dash"
        style={{ transition: "stroke 0.3s, opacity 0.3s" }} />
    </g>
  );
}

// ─── Report Viewer ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ReportViewer({ agentId, color }: { agentId: string; color: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true); setError(""); setReport(null);
    fetch(`/api/agent-report/${agentId}`)
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((d: any) => { setReport(d); setLoading(false); })
      .catch(() => { setError("No report available for today's run."); setLoading(false); });
  }, [agentId]);

  if (loading) return <p className="text-[11px] text-[#6B7280] font-mono py-4">LOADING REPORT...</p>;
  if (error) return <p className="text-[11px] text-[#6B7280] py-4">{error}</p>;
  if (!report) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderValue = (v: any): string => {
    if (v === null || v === undefined) return "—";
    if (typeof v === "boolean") return v ? "Yes" : "No";
    if (typeof v === "number") return String(v);
    if (typeof v === "string") return v;
    if (Array.isArray(v)) return v.map((x: unknown) => typeof x === "object" ? JSON.stringify(x) : String(x)).join(", ");
    return JSON.stringify(v);
  };

  // Prioritize specific keys per agent
  const PRIORITY_KEYS: Record<string, string[]> = {
    macro: ["regime", "macro_summary", "inflation_trend", "interest_rate_direction", "yield_curve", "geopolitical_risks", "favoured_themes", "macro_headlines", "geopolitical_headlines"],
    sector: ["sector_summary", "top_sectors", "sector_scores"],
    institutional: ["summary", "top_holdings", "stocks", "conviction"],
    news: ["market_summary", "key_catalysts", "articles", "risk_flags"],
    candidate: ["candidates", "selection_rationale", "universe_size"],
    fundamental: ["summary", "scored_tickers", "analyses"],
    quant: ["summary", "signals", "scored_tickers"],
    sentiment: ["summary", "scored_tickers", "contrarian_signals"],
    committee: ["committee_narrative", "position_decisions", "challenge_round"],
  };

  const priorityKeys = PRIORITY_KEYS[agentId] ?? [];
  const allKeys = Object.keys(report).filter(k => k !== "generated_at" && k !== "error");
  const orderedKeys = [
    ...priorityKeys.filter(k => allKeys.includes(k)),
    ...allKeys.filter(k => !priorityKeys.includes(k) && k !== "generated_at"),
  ];

  const rgb = hexToRgb(color);

  return (
    <div className="space-y-2">
      {report.generated_at && (
        <p className="text-[9px] font-mono text-[#4B5563] mb-3">
          GENERATED {new Date(report.generated_at).toLocaleString()}
        </p>
      )}
      {orderedKeys.slice(0, 12).map((key) => {
        const val = report[key];
        const isArray = Array.isArray(val);
        const isLong = typeof val === "string" && val.length > 80;

        return (
          <div key={key} className="rounded-lg p-2.5"
            style={{ background: `rgba(${rgb},0.04)`, border: `1px solid rgba(${rgb},0.12)` }}>
            <p className="text-[9px] font-mono tracking-widest mb-1 uppercase" style={{ color }}>
              {key.replace(/_/g, " ")}
            </p>
            {isArray ? (
              <div className="space-y-1">
                {(val as unknown[]).slice(0, 8).map((item, i) => (
                  <p key={i} className="text-[10px] text-[#CBD5E1] leading-snug">
                    {typeof item === "object" ? (
                      <span className="font-mono text-[9px] text-[#94A3B8] block">
                        {JSON.stringify(item).slice(0, 120)}
                      </span>
                    ) : (
                      <span>• {String(item).slice(0, 120)}</span>
                    )}
                  </p>
                ))}
                {val.length > 8 && (
                  <p className="text-[9px] text-[#6B7280] font-mono">+{val.length - 8} more</p>
                )}
              </div>
            ) : (
              <p className={`text-[#CBD5E1] leading-snug ${isLong ? "text-[10px]" : "text-[11px]"}`}>
                {renderValue(val).slice(0, 300)}
                {renderValue(val).length > 300 ? "..." : ""}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Chat Panel ───────────────────────────────────────────────────────────────

function ChatPanel({ agent }: { agent: Agent }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [notifyAgent, setNotifyAgent] = useState(false);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const rgb = hexToRgb(agent.color);

  const send = async () => {
    if (!input.trim() || sending) return;
    const userMsg = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", text: userMsg }]);
    setSending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: agent.id, message: userMsg, notifyAgent }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: "agent", text: data.reply ?? "No response." }]);
    } catch {
      setMessages(prev => [...prev, { role: "agent", text: "Error contacting agent." }]);
    }
    setSending(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Notify toggle */}
      <div className="flex items-center justify-between mb-3 px-1">
        <p className="text-[10px] font-mono text-[#6B7280]">
          Chat with {agent.name.split(" ")[0]}
        </p>
        <button
          onClick={() => setNotifyAgent(n => !n)}
          className="flex items-center gap-2 text-[9px] font-mono rounded-full px-3 py-1.5 transition-all cursor-pointer"
          style={{
            background: notifyAgent ? `rgba(${rgb},0.2)` : "rgba(255,255,255,0.05)",
            border: `1px solid ${notifyAgent ? agent.color : "rgba(255,255,255,0.1)"}`,
            color: notifyAgent ? agent.color : "#6B7280",
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: notifyAgent ? agent.color : "#6B7280" }} />
          {notifyAgent ? "NOTIFY: ON" : "NOTIFY: OFF"}
        </button>
      </div>
      {notifyAgent && (
        <p className="text-[9px] text-[#F59E0B] font-mono mb-2 px-1">
          Agent will acknowledge your message for tomorrow&apos;s run.
        </p>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-2 mb-3 min-h-[120px] max-h-[200px]">
        {messages.length === 0 && (
          <p className="text-[10px] text-[#4B5563] text-center py-6">
            Ask the {agent.name} anything about its analysis.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="rounded-xl px-3 py-2 text-[11px] leading-relaxed max-w-[85%]"
              style={{
                background: m.role === "user"
                  ? `rgba(${rgb},0.2)`
                  : "rgba(255,255,255,0.05)",
                border: `1px solid ${m.role === "user" ? `rgba(${rgb},0.4)` : "rgba(255,255,255,0.08)"}`,
                color: m.role === "user" ? agent.color : "#CBD5E1",
              }}
            >
              {m.text}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-xl px-3 py-2 text-[11px] outline-none transition-colors"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: `1px solid rgba(${rgb},0.25)`,
            color: "#E8EDF2",
          }}
          placeholder={`Message ${agent.name.split(" ")[0]}...`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button
          onClick={send}
          disabled={!input.trim() || sending}
          className="rounded-xl px-4 py-2 text-[11px] font-semibold transition-all cursor-pointer disabled:opacity-40"
          style={{
            background: `rgba(${rgb},0.2)`,
            border: `1px solid rgba(${rgb},0.4)`,
            color: agent.color,
          }}
        >
          {sending ? "..." : "SEND"}
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TeamDesign1() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selected, setSelected] = useState<Agent | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "report" | "chat">("overview");
  const [loading, setLoading] = useState(true);

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

  const handleSelect = (agent: Agent) => {
    setSelected(prev => prev?.id === agent.id ? null : agent);
    setTab("overview");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: "#030005" }}>
        <p className="text-[#6B7280] font-mono text-sm tracking-widest">INITIALISING AGENTS...</p>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes dash-flow { to { stroke-dashoffset: -28; } }
        .signal-dash { animation: dash-flow 2.2s linear infinite; }
        @keyframes pulse-live {
          0%, 100% { r: 4; opacity: 1; }
          50% { r: 6; opacity: 0.5; }
        }
        .live-dot { animation: pulse-live 2s ease-in-out infinite; }
        @keyframes pulse-ring-anim {
          0%   { r: 46; opacity: 0.4; }
          100% { r: 70; opacity: 0; }
        }
        .pulse-ring { animation: pulse-ring-anim 2.8s ease-out infinite; }
      `}</style>

      <div
        className="min-h-screen flex flex-col pt-16"
        style={{
          background: `
            radial-gradient(ellipse at 15% 35%, rgba(14,165,233,0.05) 0%, transparent 45%),
            radial-gradient(ellipse at 85% 65%, rgba(245,166,35,0.04) 0%, transparent 45%),
            radial-gradient(ellipse at 50% 50%, rgba(8,145,178,0.03) 0%, transparent 65%),
            #030005
          `,
        }}
      >
        {/* Header */}
        <div className="px-8 pt-8 pb-4 flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: "var(--font-syne)", color: "#E8EDF2" }}>
              Agent Intelligence Map
            </h1>
            <p className="text-[10px] tracking-[0.2em] text-[#4B5563] font-mono mt-1">
              11 AGENTS — ONE PORTFOLIO
            </p>
          </div>
          <div className="flex gap-5 text-[10px] font-mono text-[#6B7280] items-center">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#10B981]" />
              LIVE DATA
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-5 border-t border-dashed border-[#6B7280]" />
              SIGNAL FLOW
            </span>
            <span className="text-[#374151]">
              {agents.filter(a => a.has_live_data).length}/{agents.length} ONLINE
            </span>
          </div>
        </div>

        {/* Main */}
        <div className="flex-1 flex flex-col lg:flex-row gap-0 px-4 pb-6 min-h-0">
          {/* SVG */}
          <div className="flex-1 relative">
            <svg
              viewBox="0 0 1060 720"
              className="w-full h-full"
              style={{ maxHeight: "calc(100vh - 160px)" }}
            >
              {/* Subtle dot grid */}
              {[...Array(10)].map((_, row) =>
                [...Array(15)].map((_, col) => (
                  <circle key={`${row}-${col}`}
                    cx={col * 76 + 14} cy={row * 78 + 14}
                    r="0.8" fill="#ffffff08" />
                ))
              )}

              {/* Phase labels */}
              {[
                { x: 38, y: 58, label: "PHASE 1 — INTAKE" },
                { x: 300, y: 290, label: "FILTER" },
                { x: 520, y: 95, label: "PHASE 2 — ANALYSIS" },
                { x: 790, y: 252, label: "COMMITTEE" },
                { x: 800, y: 458, label: "EXECUTION" },
              ].map(({ x, y, label }) => (
                <text key={label} x={x} y={y} fill="#374151" fontSize="9"
                  fontFamily="var(--font-fira-code)" letterSpacing="3">
                  {label}
                </text>
              ))}

              {/* Edges */}
              {CONNECTIONS.map(([from, to]) => {
                const a = byId(from);
                const posA = LAYOUT[from];
                const posB = LAYOUT[to];
                if (!a || !posA || !posB) return null;
                return (
                  <AnimatedEdge key={`${from}-${to}`}
                    x1={posA.x} y1={posA.y} x2={posB.x} y2={posB.y}
                    color={a.color}
                    active={isConnectedToSelected(from, to)} />
                );
              })}

              {/* Nodes */}
              {agents.map((agent) => {
                const pos = LAYOUT[agent.id];
                if (!pos) return null;
                return (
                  <OrbitalNode
                    key={agent.id}
                    agent={agent} x={pos.x} y={pos.y}
                    selected={selected?.id === agent.id}
                    hovered={hovered === agent.id}
                    onClick={() => handleSelect(agent)}
                    onMouseEnter={() => setHovered(agent.id)}
                    onMouseLeave={() => setHovered(null)}
                  />
                );
              })}
            </svg>
          </div>

          {/* Info Panel */}
          <div className="w-full lg:w-[340px] shrink-0 flex flex-col py-4 pr-2">
            {selected ? (
              <div
                className="flex flex-col flex-1 rounded-2xl border overflow-hidden"
                style={{
                  background: `rgba(${hexToRgb(selected.color)},0.05)`,
                  borderColor: `rgba(${hexToRgb(selected.color)},0.25)`,
                }}
              >
                {/* Panel header */}
                <div className="px-5 pt-4 pb-3 border-b" style={{ borderColor: `rgba(${hexToRgb(selected.color)},0.15)` }}>
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[9px] font-mono tracking-widest" style={{ color: selected.color }}>
                        AGENT {String(selected.number).padStart(2, "0")}
                        {selected.has_live_data && (
                          <span className="ml-2 text-[#10B981]">● LIVE</span>
                        )}
                      </span>
                      <h2 className="text-xl font-bold text-[#E8EDF2] mt-0.5" style={{ fontFamily: "var(--font-syne)" }}>
                        {selected.name}
                      </h2>
                      <p className="text-[11px] text-[#6B7280]">{selected.role}</p>
                    </div>
                    <button onClick={() => setSelected(null)}
                      className="text-[#6B7280] hover:text-[#E8EDF2] text-xl cursor-pointer transition-colors leading-none mt-1">
                      ×
                    </button>
                  </div>

                  {/* Tabs */}
                  <div className="flex gap-1 mt-3">
                    {(["overview", "report", "chat"] as const).map((t) => (
                      <button key={t}
                        onClick={() => setTab(t)}
                        className="px-3 py-1 rounded-lg text-[9px] font-mono tracking-widest transition-all cursor-pointer uppercase"
                        style={{
                          background: tab === t ? `rgba(${hexToRgb(selected.color)},0.2)` : "transparent",
                          color: tab === t ? selected.color : "#6B7280",
                          border: `1px solid ${tab === t ? `rgba(${hexToRgb(selected.color)},0.4)` : "transparent"}`,
                        }}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tab content */}
                <div className="flex-1 overflow-y-auto p-4">
                  {tab === "overview" && (
                    <div className="space-y-3">
                      <p className="text-[11px] text-[#94A3B8] leading-relaxed">
                        {selected.personality}
                      </p>
                      {selected.has_live_data && (
                        <div className="space-y-2 pt-1">
                          {[
                            { label: "FOCUS", val: selected.current_focus },
                            { label: "VIEW", val: selected.market_view },
                            { label: "ACTIVITY", val: selected.recent_activity },
                          ].map(({ label, val }) => (
                            <div key={label} className="rounded-lg p-2.5"
                              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                              <p className="text-[9px] font-mono tracking-widest mb-0.5" style={{ color: selected.color }}>{label}</p>
                              <p className="text-[11px] text-[#CBD5E1] leading-snug">{val}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      {selected.feeds && (
                        <div className="pt-2 border-t text-[10px] font-mono text-[#6B7280]"
                          style={{ borderColor: `rgba(${hexToRgb(selected.color)},0.15)` }}>
                          FEEDS → <span className="text-[#94A3B8]">{selected.feeds}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {tab === "report" && (
                    <ReportViewer agentId={selected.id} color={selected.color} />
                  )}
                  {tab === "chat" && (
                    <ChatPanel agent={selected} />
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col justify-center flex-1 p-4">
                <p className="text-[10px] font-mono tracking-widest text-[#374151] mb-1">SELECT AN AGENT</p>
                <p className="text-[11px] text-[#1F2937] mb-5">Click a node to inspect, view its report, or chat with it.</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {agents.map((a) => (
                    <button key={a.id} onClick={() => handleSelect(a)}
                      className="flex items-center gap-2 rounded-xl px-3 py-2 text-left transition-all cursor-pointer hover:border-opacity-60"
                      style={{
                        background: "rgba(255,255,255,0.02)",
                        border: `1px solid rgba(${hexToRgb(a.color)},0.2)`,
                      }}>
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: a.color }} />
                      <span className="text-[10px] text-[#6B7280] truncate">{a.name}</span>
                      {a.has_live_data && <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] ml-auto shrink-0" />}
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
