"use client";

import { useEffect, useState, useRef } from "react";
import { MOCK_AGENTS } from "@/lib/mock-data";

interface Agent {
  id: string; name: string; role: string; number: number; personality: string;
  accuracy: number; current_focus: string; market_view: string;
  recent_activity: string; color: string;
}

// AI-generated robot avatar for each agent
function AgentAvatar({ agent, size = 48 }: { agent: Agent; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/agents/${agent.id}.png`}
      alt={agent.name}
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: "cover", borderRadius: "6px" }}
    />
  );
}

// Pipeline flow diagram
function PipelineNode({ agent, onClick, onChat }: {
  agent: Agent; onClick: () => void; onChat: () => void;
}) {
  return (
    <div
      className="relative flex flex-col items-center gap-2 cursor-pointer group"
      onClick={onClick}
    >
      <div
        className="relative w-20 h-20 rounded-2xl flex items-center justify-center transition-all duration-300 group-hover:scale-105"
        style={{
          background: `rgba(${agent.color === "#0EA5E9" ? "14,165,233" : agent.color === "#06B6D4" ? "6,182,212" : agent.color === "#8B5CF6" ? "139,92,246" : agent.color === "#F59E0B" ? "245,158,11" : agent.color === "#10B981" ? "16,185,129" : agent.color === "#EF4444" ? "239,68,68" : "107,114,128"},0.12)`,
          border: `1px solid ${agent.color}40`,
          boxShadow: `0 0 20px ${agent.color}15`,
        }}
      >
        <AgentAvatar agent={agent} size={44} />

        {/* Chat button */}
        <button
          className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 z-10"
          style={{ background: agent.color, boxShadow: `0 0 8px ${agent.color}60` }}
          onClick={(e) => { e.stopPropagation(); onChat(); }}
          title="Chat with agent"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
          </svg>
        </button>
      </div>

      <div className="text-center">
        <p className="text-xs font-semibold text-[#E8EDF2] leading-tight">{agent.name.split(" ")[0]}</p>
        <p className="text-[10px] text-[#6B7280] leading-tight">{agent.name.split(" ").slice(1).join(" ")}</p>
      </div>
    </div>
  );
}

// Chat panel
function ChatPanel({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const [messages, setMessages] = useState<Array<{ role: "user" | "agent"; content: string }>>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [notify, setNotify] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-focus input when chat panel opens
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
      className="fixed right-0 top-0 bottom-0 w-full sm:w-96 z-50 flex flex-col shadow-2xl"
      style={{
        background: "rgba(4,6,10,0.98)",
        borderLeft: "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(20px)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-white/06">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: `${agent.color}20`, border: `1px solid ${agent.color}40` }}>
            <AgentAvatar agent={agent} size={28} />
          </div>
          <div>
            <p className="font-semibold text-[#E8EDF2] text-sm">{agent.name}</p>
            <p className="text-xs text-[#6B7280]">{agent.role}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-white/05 transition-colors"
          aria-label="Close chat"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" stroke="#6B7280" strokeWidth="2" fill="none">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center"
              style={{ background: `${agent.color}15`, border: `1px solid ${agent.color}30` }}>
              <AgentAvatar agent={agent} size={32} />
            </div>
            <p className="text-sm font-semibold text-[#E8EDF2] mb-1">{agent.name}</p>
            <p className="text-xs text-[#6B7280] italic">&ldquo;{agent.personality}&rdquo;</p>
            <p className="text-xs text-[#4B5563] mt-3">Ask me anything about the market or my analysis.</p>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                m.role === "user"
                  ? "text-white rounded-br-sm"
                  : "text-[#E8EDF2] rounded-bl-sm"
              }`}
              style={
                m.role === "user"
                  ? { background: `linear-gradient(135deg, ${agent.color} 0%, #06B6D4 100%)` }
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
              <div className="flex gap-1">
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
      <div className="px-4 py-2 border-t border-white/06 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-[#6B7280]">Notify Agent</p>
          <p className="text-[10px] text-[#4B5563]">When on, your message influences tomorrow&apos;s run</p>
        </div>
        <button
          onClick={() => setNotify(!notify)}
          className={`w-10 h-5 rounded-full transition-all relative ${notify ? "" : "bg-white/10"}`}
          style={notify ? { background: agent.color } : {}}
        >
          <span
            className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
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
            className="flex-1 bg-white border border-white/20 rounded-xl px-4 py-2.5 text-sm text-black placeholder-[#9CA3AF]
                       focus:outline-none focus:border-[#0EA5E9]/50 transition-all"
          />
          <button
            onClick={send}
            disabled={!input.trim() || loading}
            className="px-4 py-2.5 rounded-xl text-white font-semibold text-sm transition-all hover:scale-105 active:scale-95 disabled:opacity-40"
            style={{ background: `linear-gradient(135deg, ${agent.color} 0%, #06B6D4 100%)` }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
              <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// Pipeline levels layout
const PIPELINE_LEVELS = [
  { label: "Phase 1 — Market Intelligence", agents: ["macro", "sector", "institutional", "news"] },
  { label: "Candidate Generator", agents: ["candidate"], isCenter: true },
  { label: "Phase 2 — Deep Analysis", agents: ["fundamental", "quant", "sentiment"] },
  { label: "Investment Committee", agents: ["committee"], isCenter: true },
  { label: "Execution", agents: ["executor"] },
];

interface AgentWeights {
  fundamental: number;
  quant: number;
  sentiment: number;
  active: boolean;
  closed_trade_count: number;
  win_rates_pct?: { fundamental: number; quant: number; sentiment: number };
  computed_at?: string;
}

export default function TeamPage() {
  const [agents, setAgents] = useState<Agent[]>(MOCK_AGENTS);
  const [chatAgent, setChatAgent] = useState<Agent | null>(null);
  const [flipped, setFlipped] = useState<string | null>(null);
  const [agentWeights, setAgentWeights] = useState<AgentWeights | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then(setAgents)
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/agent-weights")
      .then((r) => r.json())
      .then(setAgentWeights)
      .catch(() => {});
  }, []);

  const getAgent = (id: string) => agents.find((a) => a.id === id);

  const scrollToCard = (id: string) => {
    const el = cardRefs.current[id];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-[#080C10] pb-16 relative">
      {/* Chat panel overlay */}
      {chatAgent && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setChatAgent(null)}
          />
          <ChatPanel agent={chatAgent} onClose={() => setChatAgent(null)} />
        </>
      )}

      <div className={`max-w-6xl mx-auto px-6 pt-8 transition-all ${chatAgent ? "blur-sm" : ""}`}>
        {/* Header */}
        <div className="mb-10">
          <h1 className="font-display text-3xl font-bold text-[#E8EDF2]">Meet the Team</h1>
          <p className="text-[#6B7280] text-sm mt-1">11 specialised AI agents. Each with a role, a view, and an opinion.</p>
        </div>

        {/* Pipeline diagram */}
        <div className="card p-8 mb-12">
          <h2 className="font-display text-lg font-bold text-[#E8EDF2] text-center mb-8">Daily Pipeline Flow</h2>

          <div className="space-y-4">
            {PIPELINE_LEVELS.map((level, li) => (
              <div key={li}>
                {/* Level label */}
                <p className="text-[10px] font-semibold text-[#4B5563] uppercase tracking-widest text-center mb-3">
                  {level.label}
                </p>

                {/* Agents in this level */}
                <div className="flex items-center justify-center gap-6 flex-wrap">
                  {level.agents.map((id) => {
                    const agent = getAgent(id);
                    if (!agent) return null;
                    return (
                      <PipelineNode
                        key={id}
                        agent={agent}
                        onClick={() => scrollToCard(id)}
                        onChat={() => setChatAgent(agent)}
                      />
                    );
                  })}
                </div>

                {/* Animated flow arrow between levels */}
                {li < PIPELINE_LEVELS.length - 1 && (
                  <div className="flex justify-center mt-4">
                    <div className="flex flex-col items-center gap-1">
                      <div className="w-px h-4 bg-gradient-to-b from-[#0EA5E9]/40 to-[#0EA5E9]/0" />
                      <svg width="10" height="6" viewBox="0 0 10 6" fill="#0EA5E9" opacity="0.4">
                        <path d="M0 0 L5 6 L10 0 Z" />
                      </svg>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Agent Weighting Panel */}
        {agentWeights && (
          <div className="card p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-display text-lg font-bold text-[#E8EDF2]">Dynamic Agent Weighting</h2>
                <p className="text-xs text-[#6B7280] mt-0.5">
                  {agentWeights.active
                    ? `Active — calibrated from ${agentWeights.closed_trade_count} closed trades`
                    : `Inactive — requires 20 closed trades (${agentWeights.closed_trade_count || 0} so far)`}
                </p>
              </div>
              <span className={`text-xs font-bold px-2 py-1 rounded-md ${agentWeights.active ? "bg-[#10B981]/15 text-[#10B981]" : "bg-white/05 text-[#6B7280]"}`}>
                {agentWeights.active ? "Live" : "Dormant"}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {(["fundamental", "quant", "sentiment"] as const).map((agent) => {
                const weight = agentWeights[agent] ?? (agent === "sentiment" ? 0.30 : 0.35);
                const winRate = agentWeights.win_rates_pct?.[agent];
                const color = weight >= 0.37 ? "#10B981" : weight >= 0.30 ? "#0EA5E9" : "#F59E0B";
                return (
                  <div key={agent} className="bg-white/03 rounded-xl p-4">
                    <p className="text-xs text-[#6B7280] uppercase tracking-wider mb-2 capitalize">{agent}</p>
                    <div className="flex items-end gap-2 mb-2">
                      <span className="text-2xl font-bold font-mono" style={{ color }}>{(weight * 100).toFixed(0)}%</span>
                      {agentWeights.active && winRate != null && (
                        <span className="text-xs text-[#6B7280] mb-0.5">WR: {winRate}%</span>
                      )}
                    </div>
                    <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${weight * 100 * 2}%`, background: color }} />
                    </div>
                  </div>
                );
              })}
            </div>
            {agentWeights.computed_at && (
              <p className="text-[10px] text-[#4B5563] mt-3 text-right">Updated: {agentWeights.computed_at}</p>
            )}
          </div>
        )}

        {/* Agent detail cards */}
        <h2 className="font-display text-xl font-bold text-[#E8EDF2] mb-6">Agent Profiles</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {agents.map((agent) => (
            <div
              key={agent.id}
              ref={(el) => { cardRefs.current[agent.id] = el; }}
              className="relative"
              style={{ perspective: "1000px", height: "220px" }}
            >
              <div
                className="relative w-full h-full transition-all duration-500 cursor-pointer"
                style={{
                  transformStyle: "preserve-3d",
                  transform: flipped === agent.id ? "rotateY(180deg)" : "rotateY(0deg)",
                }}
                onClick={() => setFlipped(flipped === agent.id ? null : agent.id)}
              >
                {/* Front */}
                <div
                  className="absolute inset-0 rounded-2xl p-5 flex flex-col"
                  style={{
                    backfaceVisibility: "hidden",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    boxShadow: `0 0 30px ${agent.color}10`,
                  }}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: `${agent.color}15`, border: `1px solid ${agent.color}30` }}
                    >
                      <AgentAvatar agent={agent} size={32} />
                    </div>
                    <div>
                      <p className="font-semibold text-[#E8EDF2] text-sm">{agent.name}</p>
                      <p className="text-xs text-[#6B7280]">Agent {agent.number}</p>
                    </div>
                    <div className="ml-auto text-right">
                      <p className="text-xs font-mono font-bold" style={{ color: agent.color }}>
                        {agent.accuracy}%
                      </p>
                      <p className="text-[10px] text-[#4B5563]">accuracy</p>
                    </div>
                  </div>

                  <p className="text-xs text-[#6B7280] italic mb-3">&ldquo;{agent.personality}&rdquo;</p>

                  <div className="mt-auto">
                    <div className="h-1 rounded-full bg-white/08 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${agent.accuracy}%`, background: agent.color }}
                      />
                    </div>
                    <p className="text-[10px] text-[#4B5563] mt-1">Click to see details →</p>
                  </div>
                </div>

                {/* Back */}
                <div
                  className="absolute inset-0 rounded-2xl p-5 flex flex-col"
                  style={{
                    backfaceVisibility: "hidden",
                    transform: "rotateY(180deg)",
                    background: `linear-gradient(135deg, ${agent.color}12 0%, rgba(255,255,255,0.03) 100%)`,
                    border: `1px solid ${agent.color}30`,
                  }}
                >
                  <p className="font-semibold text-[#E8EDF2] text-sm mb-3">{agent.name}</p>

                  <div className="space-y-2 flex-1 overflow-hidden">
                    <div>
                      <p className="text-[10px] text-[#6B7280] uppercase tracking-wider mb-0.5">Current Focus</p>
                      <p className="text-xs text-[#E8EDF2]">{agent.current_focus}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#6B7280] uppercase tracking-wider mb-0.5">Market View</p>
                      <p className="text-xs text-[#E8EDF2]">{agent.market_view}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#6B7280] uppercase tracking-wider mb-0.5">Recent</p>
                      <p className="text-xs text-[#6B7280] line-clamp-2">{agent.recent_activity}</p>
                    </div>
                  </div>

                  <button
                    className="mt-3 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all hover:scale-105"
                    style={{ background: `${agent.color}25`, color: agent.color }}
                    onClick={(e) => { e.stopPropagation(); setChatAgent(agent); setFlipped(null); }}
                  >
                    Chat with {agent.name.split(" ")[0]}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
