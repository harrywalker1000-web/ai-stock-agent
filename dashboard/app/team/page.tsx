"use client";

import { useEffect, useState, useRef } from "react";

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
}

interface AgentWeights {
  fundamental: number;
  quant: number;
  sentiment: number;
  active: boolean;
  closed_trade_count: number;
  win_rates_pct?: { fundamental: number; quant: number; sentiment: number };
  computed_at?: string;
}

// Agent avatar
function AgentAvatar({ agent, size = 48 }: { agent: Agent; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/agents/${agent.id}.png`}
      alt={agent.name}
      width={size}
      height={size}
      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
      style={{ width: size, height: size, objectFit: "cover", borderRadius: "6px" }}
    />
  );
}

// Hex to rgb helper for backgrounds
function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

// ─── Pipeline node ──────────────────────────────────────────────────────────

function PipelineNode({
  agent,
  onClick,
  onChat,
  isCenter = false,
}: {
  agent: Agent;
  onClick: () => void;
  onChat: () => void;
  isCenter?: boolean;
}) {
  const size = isCenter ? 88 : 76;
  const imgSize = isCenter ? 48 : 40;

  return (
    <div
      className="relative flex flex-col items-center gap-2 cursor-pointer group"
      onClick={onClick}
    >
      {/* Glow ring */}
      <div className="relative" style={{ width: size, height: size }}>
        <div
          className="absolute inset-0 rounded-2xl transition-all duration-300 group-hover:scale-110"
          style={{
            background: `rgba(${hexToRgb(agent.color)},0.10)`,
            border: `1px solid ${agent.color}50`,
            boxShadow: `0 0 24px ${agent.color}20, inset 0 0 12px ${agent.color}08`,
          }}
        />
        <div
          className="absolute inset-0 rounded-2xl flex items-center justify-center transition-all duration-300 group-hover:scale-110"
        >
          <AgentAvatar agent={agent} size={imgSize} />
        </div>

        {/* Live data dot */}
        {agent.has_live_data && (
          <div
            className="absolute top-1 right-1 w-2 h-2 rounded-full"
            style={{ background: "#10B981", boxShadow: "0 0 6px #10B98180" }}
          />
        )}

        {/* Chat button */}
        <button
          className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 z-10 opacity-0 group-hover:opacity-100"
          style={{ background: agent.color, boxShadow: `0 0 8px ${agent.color}80` }}
          onClick={(e) => { e.stopPropagation(); onChat(); }}
          title={`Chat with ${agent.name}`}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="white">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
          </svg>
        </button>
      </div>

      <div className="text-center" style={{ width: 80 }}>
        <p className="text-xs font-semibold text-[#E8EDF2] leading-tight truncate">
          {agent.name.split(" ").slice(0, 2).join(" ")}
        </p>
        <p className="text-[10px] leading-tight mt-0.5" style={{ color: `${agent.color}CC` }}>
          {agent.role}
        </p>
      </div>
    </div>
  );
}

// ─── Animated flow arrow ────────────────────────────────────────────────────

function FlowArrow() {
  return (
    <div className="flex justify-center my-1">
      <div className="flex flex-col items-center gap-0">
        <div
          className="w-px"
          style={{
            height: 28,
            background: "linear-gradient(to bottom, rgba(245,166,35,0.5), rgba(245,166,35,0.05))",
          }}
        />
        <svg width="10" height="6" viewBox="0 0 10 6" fill="#F5A623" opacity="0.5">
          <path d="M0 0 L5 6 L10 0 Z" />
        </svg>
      </div>
    </div>
  );
}

// ─── Chat panel ─────────────────────────────────────────────────────────────

function ChatPanel({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const [messages, setMessages] = useState<Array<{ role: "user" | "agent"; content: string }>>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [notify, setNotify] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const msg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: msg }]);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: agent.id, message: msg, notifyAgent: notify }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "agent", content: data.reply || "No response." }]);
    } catch {
      setMessages((prev) => [...prev, { role: "agent", content: "Connection error. Please try again." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed right-0 top-0 bottom-0 w-full sm:w-[400px] z-50 flex flex-col"
      style={{
        background: "rgba(4,8,14,0.98)",
        borderLeft: `1px solid ${agent.color}30`,
        backdropFilter: "blur(20px)",
        boxShadow: `-20px 0 60px rgba(0,0,0,0.6)`,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-5 border-b border-white/06">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: `${agent.color}18`, border: `1px solid ${agent.color}40` }}
        >
          <AgentAvatar agent={agent} size={28} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[#E8EDF2] text-sm">{agent.name}</p>
          <p className="text-xs" style={{ color: agent.color }}>{agent.role}</p>
        </div>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/05 transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" stroke="#6B7280" strokeWidth="2" fill="none">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-10">
            <div
              className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
              style={{ background: `${agent.color}15`, border: `1px solid ${agent.color}30` }}
            >
              <AgentAvatar agent={agent} size={36} />
            </div>
            <p className="text-sm font-semibold text-[#E8EDF2] mb-1">{agent.name}</p>
            <p className="text-xs text-[#6B7280] italic max-w-[280px] mx-auto leading-relaxed">
              &ldquo;{agent.personality}&rdquo;
            </p>
            <p className="text-xs text-[#4B5563] mt-4">Ask me about the market, my latest analysis, or any position.</p>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                m.role === "user" ? "text-white rounded-br-sm" : "text-[#E8EDF2] rounded-bl-sm"
              }`}
              style={
                m.role === "user"
                  ? { background: `linear-gradient(135deg, ${agent.color} 0%, ${agent.color}99 100%)` }
                  : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }
              }
            >
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-white/06 border border-white/08">
              <div className="flex gap-1.5 items-center">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full bg-[#6B7280] animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Notify toggle */}
      <div className="px-5 py-3 border-t border-white/06 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-[#E8EDF2]">Notify Agent</p>
          <p className="text-[10px] text-[#4B5563] mt-0.5">Your message influences tomorrow&apos;s pipeline run</p>
        </div>
        <button
          onClick={() => setNotify(!notify)}
          className="relative w-10 h-5 rounded-full transition-all flex-shrink-0"
          style={{ background: notify ? agent.color : "rgba(255,255,255,0.12)" }}
        >
          <span
            className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-sm"
            style={{ left: notify ? "calc(100% - 18px)" : "2px" }}
          />
        </button>
      </div>

      {/* Input */}
      <div className="p-4 border-t border-white/06">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={`Ask ${agent.name.split(" ")[0]}...`}
            className="flex-1 bg-white/06 border border-white/12 rounded-xl px-4 py-2.5 text-sm text-[#E8EDF2] placeholder-[#4B5563]
                       focus:outline-none focus:border-opacity-60 transition-all"
            style={{ "--tw-border-opacity": "0.2" } as React.CSSProperties}
          />
          <button
            onClick={send}
            disabled={!input.trim() || loading}
            className="px-4 py-2.5 rounded-xl text-white font-semibold text-sm transition-all hover:scale-105 active:scale-95 disabled:opacity-30 flex-shrink-0"
            style={{ background: agent.color }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Agent detail card (flip) ────────────────────────────────────────────────

function AgentCard({
  agent,
  flipped,
  onFlip,
  onChat,
  cardRef,
}: {
  agent: Agent;
  flipped: boolean;
  onFlip: () => void;
  onChat: () => void;
  cardRef: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div
      ref={cardRef}
      className="relative cursor-pointer"
      style={{ perspective: "1200px", height: 260 }}
      onClick={onFlip}
    >
      <div
        className="relative w-full h-full transition-all duration-500"
        style={{
          transformStyle: "preserve-3d",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* Front */}
        <div
          className="absolute inset-0 rounded-2xl p-5 flex flex-col"
          style={{
            backfaceVisibility: "hidden",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)",
            boxShadow: `0 0 40px ${agent.color}0A`,
          }}
        >
          {/* Agent number badge */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${agent.color}15`, border: `1px solid ${agent.color}30` }}
              >
                <AgentAvatar agent={agent} size={36} />
              </div>
              <div>
                <p className="font-semibold text-[#E8EDF2] text-sm leading-tight">{agent.name}</p>
                <p className="text-[11px] mt-0.5" style={{ color: agent.color }}>{agent.role}</p>
                <p className="text-[10px] text-[#4B5563] mt-0.5">Agent {agent.number}</p>
              </div>
            </div>
            {agent.has_live_data && (
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                <span className="text-[10px] text-[#10B981]">Live</span>
              </div>
            )}
          </div>

          {/* Personality quote */}
          <p className="text-xs text-[#6B7280] italic leading-relaxed flex-1 line-clamp-3">
            &ldquo;{agent.personality}&rdquo;
          </p>

          {/* Bottom */}
          <div className="mt-auto pt-4 border-t border-white/05 flex items-center justify-between">
            <p className="text-[10px] text-[#4B5563]">Click to see details</p>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4B5563" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </div>
        </div>

        {/* Back */}
        <div
          className="absolute inset-0 rounded-2xl p-5 flex flex-col overflow-hidden"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            background: `linear-gradient(135deg, rgba(${hexToRgb(agent.color)},0.08) 0%, rgba(255,255,255,0.02) 100%)`,
            border: `1px solid ${agent.color}25`,
          }}
        >
          <div className="flex items-center gap-2 mb-4">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: `${agent.color}20` }}
            >
              <AgentAvatar agent={agent} size={22} />
            </div>
            <p className="font-semibold text-[#E8EDF2] text-sm">{agent.name}</p>
          </div>

          <div className="space-y-3 flex-1 overflow-hidden">
            <div>
              <p className="text-[10px] font-semibold text-[#4B5563] uppercase tracking-wider mb-1">
                Current Focus
              </p>
              <p className="text-xs text-[#C9D0DA] line-clamp-2 leading-relaxed">{agent.current_focus}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-[#4B5563] uppercase tracking-wider mb-1">
                Market View
              </p>
              <p className="text-xs text-[#C9D0DA] line-clamp-2 leading-relaxed">{agent.market_view}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-[#4B5563] uppercase tracking-wider mb-1">
                Recent Activity
              </p>
              <p className="text-xs text-[#6B7280] line-clamp-1">{agent.recent_activity}</p>
            </div>
          </div>

          <button
            className="mt-3 w-full text-xs font-semibold px-3 py-2 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{ background: `${agent.color}20`, color: agent.color, border: `1px solid ${agent.color}30` }}
            onClick={(e) => { e.stopPropagation(); onChat(); }}
          >
            Chat with {agent.name.split(" ")[0]} →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Pipeline layout ─────────────────────────────────────────────────────────

const PIPELINE_LEVELS = [
  { label: "Phase 1 — Market Intelligence", ids: ["macro", "sector", "institutional", "news"] },
  { label: "Candidate Generator", ids: ["candidate"], isCenter: true },
  { label: "Phase 2 — Deep Analysis", ids: ["fundamental", "quant", "sentiment"] },
  { label: "Investment Committee", ids: ["committee"], isCenter: true },
  { label: "Execution & Memory", ids: ["executor", "memory"] },
];

// ─── Main page ───────────────────────────────────────────────────────────────

export default function TeamPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [chatAgent, setChatAgent] = useState<Agent | null>(null);
  const [flipped, setFlipped] = useState<string | null>(null);
  const [agentWeights, setAgentWeights] = useState<AgentWeights | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    fetch("/api/agents").then((r) => r.json()).then(setAgents).catch(() => {});
    fetch("/api/agent-weights").then((r) => r.json()).then(setAgentWeights).catch(() => {});
  }, []);

  const getAgent = (id: string) => agents.find((a) => a.id === id);

  const scrollToCard = (id: string) => {
    cardRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="min-h-screen bg-[#080C10] pb-20 relative">
      {/* Chat overlay backdrop */}
      {chatAgent && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={() => setChatAgent(null)} />
          <ChatPanel agent={chatAgent} onClose={() => setChatAgent(null)} />
        </>
      )}

      <div className={`max-w-6xl mx-auto px-6 pt-10 transition-all duration-300 ${chatAgent ? "blur-sm pointer-events-none" : ""}`}>

        {/* Header */}
        <div className="mb-12">
          <p className="text-xs font-semibold text-[#F5A623] uppercase tracking-widest mb-2">
            The Team
          </p>
          <h1 className="font-display text-4xl font-bold text-[#E8EDF2] leading-tight">
            11 Agents. One Portfolio.
          </h1>
          <p className="text-[#6B7280] text-sm mt-2 max-w-xl leading-relaxed">
            Each agent specialises in one domain. They debate, they challenge, they reach consensus.
            No position enters the book without the full committee&apos;s agreement.
          </p>
        </div>

        {/* ── Pipeline diagram ── */}
        <div
          className="mb-12 rounded-2xl p-8"
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div className="text-center mb-8">
            <p className="text-[10px] font-semibold text-[#4B5563] uppercase tracking-widest mb-1">
              Daily Pipeline
            </p>
            <h2 className="font-display text-xl font-bold text-[#E8EDF2]">How decisions are made</h2>
          </div>

          <div className="space-y-0">
            {PIPELINE_LEVELS.map((level, li) => {
              const levelAgents = level.ids.map((id) => getAgent(id)).filter(Boolean) as Agent[];

              return (
                <div key={li}>
                  {/* Level label */}
                  <p className="text-[10px] font-semibold text-[#4B5563] uppercase tracking-widest text-center mb-4">
                    {level.label}
                  </p>

                  {/* Agents row */}
                  <div className="flex items-start justify-center gap-8 flex-wrap">
                    {levelAgents.length > 0 ? (
                      levelAgents.map((agent) => (
                        <PipelineNode
                          key={agent.id}
                          agent={agent}
                          isCenter={level.isCenter}
                          onClick={() => scrollToCard(agent.id)}
                          onChat={() => setChatAgent(agent)}
                        />
                      ))
                    ) : (
                      // Loading skeletons
                      level.ids.map((id) => (
                        <div key={id} className="flex flex-col items-center gap-2">
                          <div className="w-[76px] h-[76px] rounded-2xl bg-white/05 animate-pulse" />
                          <div className="w-16 h-3 rounded bg-white/05 animate-pulse" />
                        </div>
                      ))
                    )}
                  </div>

                  {li < PIPELINE_LEVELS.length - 1 && <FlowArrow />}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-4 mt-8 pt-6 border-t border-white/05">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
              <span className="text-[10px] text-[#4B5563]">Live data</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="white" opacity="0.3">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
              </svg>
              <span className="text-[10px] text-[#4B5563]">Hover node to chat</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#4B5563" strokeWidth="2">
                <path d="M12 5v14M5 12l7 7 7-7" />
              </svg>
              <span className="text-[10px] text-[#4B5563]">Click to jump to profile</span>
            </div>
          </div>
        </div>

        {/* ── Dynamic Agent Weighting ── */}
        {agentWeights && (
          <div
            className="mb-10 rounded-2xl p-6"
            style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="font-display text-lg font-bold text-[#E8EDF2]">Dynamic Agent Weighting</h2>
                <p className="text-xs text-[#6B7280] mt-1">
                  {agentWeights.active
                    ? `Live — calibrated from ${agentWeights.closed_trade_count} closed trades`
                    : `Dormant — activates after 20 closed trades (${agentWeights.closed_trade_count ?? 0} so far)`}
                </p>
              </div>
              <span
                className="text-xs font-bold px-3 py-1.5 rounded-lg"
                style={{
                  background: agentWeights.active ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.05)",
                  color: agentWeights.active ? "#10B981" : "#6B7280",
                  border: agentWeights.active ? "1px solid rgba(16,185,129,0.25)" : "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {agentWeights.active ? "Live" : "Dormant"}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {(["fundamental", "quant", "sentiment"] as const).map((key) => {
                const weight = agentWeights[key] ?? (key === "sentiment" ? 0.30 : 0.35);
                const winRate = agentWeights.win_rates_pct?.[key];
                const color = weight >= 0.37 ? "#10B981" : weight >= 0.30 ? "#F5A623" : "#F59E0B";
                const labels: Record<string, string> = { fundamental: "Fundamental", quant: "Quant", sentiment: "Sentiment" };
                return (
                  <div key={key} className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)" }}>
                    <p className="text-[10px] font-semibold text-[#4B5563] uppercase tracking-wider mb-2">
                      {labels[key]}
                    </p>
                    <div className="flex items-end gap-2 mb-3">
                      <span className="text-2xl font-bold font-mono" style={{ color }}>
                        {(weight * 100).toFixed(0)}%
                      </span>
                      {agentWeights.active && winRate != null && (
                        <span className="text-xs text-[#6B7280] mb-1">WR: {winRate}%</span>
                      )}
                    </div>
                    <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${weight * 200}%`, background: color }} />
                    </div>
                  </div>
                );
              })}
            </div>
            {agentWeights.computed_at && (
              <p className="text-[10px] text-[#4B5563] mt-4 text-right">
                Last updated: {agentWeights.computed_at}
              </p>
            )}
          </div>
        )}

        {/* ── Agent profile cards ── */}
        <div className="mb-6">
          <p className="text-[10px] font-semibold text-[#4B5563] uppercase tracking-widest mb-1">Profiles</p>
          <h2 className="font-display text-xl font-bold text-[#E8EDF2]">Agent Files</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.length > 0
            ? agents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  flipped={flipped === agent.id}
                  onFlip={() => setFlipped(flipped === agent.id ? null : agent.id)}
                  onChat={() => { setChatAgent(agent); setFlipped(null); }}
                  cardRef={(el) => { cardRefs.current[agent.id] = el; }}
                />
              ))
            : Array.from({ length: 11 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-2xl animate-pulse"
                  style={{ height: 260, background: "rgba(255,255,255,0.03)" }}
                />
              ))}
        </div>
      </div>
    </div>
  );
}
