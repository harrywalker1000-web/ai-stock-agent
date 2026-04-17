"use client";

// Team page — "The Aurora" (Design 3)
// Background: 3 slow-drifting horizontal aurora bands (teal, indigo, gold)
// Emil skill: custom cubic-bezier (0.32,0.72,0,1), stagger, scale entries, panel slide-in
// Taste skill: double-bezel panel, node dimming via useMemo

import { useEffect, useState, useCallback, useMemo } from "react";

interface Agent {
  id: string; name: string; role: string; number: number;
  personality: string; accuracy: number; current_focus: string;
  market_view: string; recent_activity: string; color: string;
  has_live_data?: boolean; feeds?: string;
}
type Tab = "overview" | "report" | "chat";

function hexToRgb(hex: string) {
  return `${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)}`;
}

const LAYOUT: Record<string,{x:number;y:number}> = {
  macro:{x:120,y:110}, sector:{x:80,y:270}, institutional:{x:115,y:430}, news:{x:165,y:575},
  candidate:{x:370,y:340}, fundamental:{x:590,y:150}, quant:{x:640,y:340},
  sentiment:{x:590,y:520}, committee:{x:870,y:305}, executor:{x:870,y:500}, memory:{x:870,y:620},
};
const CONNECTIONS:[string,string][] = [
  ["macro","candidate"],["sector","candidate"],["institutional","candidate"],["news","candidate"],
  ["candidate","fundamental"],["candidate","quant"],["candidate","sentiment"],
  ["fundamental","committee"],["quant","committee"],["sentiment","committee"],
  ["committee","executor"],["executor","memory"],["macro","committee"],["news","committee"],
];
function nodeR(id:string){ return id==="committee"?50:id==="candidate"?42:36; }

function OrbitalNode({agent,x,y,selected,hovered,dimmed,onClick,onMouseEnter,onMouseLeave}:{
  agent:Agent;x:number;y:number;selected:boolean;hovered:boolean;dimmed:boolean;
  onClick:()=>void;onMouseEnter:()=>void;onMouseLeave:()=>void;
}) {
  const r=nodeR(agent.id); const rgb=hexToRgb(agent.color);
  const scale=hovered?1.13:selected?1.07:1;
  return (
    <g transform={`translate(${x},${y})`} onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
      style={{cursor:"pointer",opacity:dimmed?0.22:1,transition:"opacity 0.4s cubic-bezier(0.32,0.72,0,1)"}}>
      <g style={{transform:`scale(${scale})`,transformOrigin:"0 0",transition:"transform 0.28s cubic-bezier(0.32,0.72,0,1)"}}>
        <circle r={r+20} fill={`rgba(${rgb},${(hovered||selected)?0.12:0.04})`} style={{transition:"all 0.28s cubic-bezier(0.32,0.72,0,1)"}}/>
        {agent.has_live_data&&<circle r={r+28} fill="none" stroke={agent.color} strokeWidth="1" opacity="0" className="tm-pulse-ring"/>}
        <circle r={r+3} fill="none" stroke={agent.color} strokeWidth={(hovered||selected)?1.8:0.5} opacity={(hovered||selected)?0.8:0.14} style={{transition:"all 0.28s cubic-bezier(0.32,0.72,0,1)"}}/>
        <circle r={r} fill={`rgba(${rgb},${selected?0.26:hovered?0.17:0.09})`}
          stroke={selected?agent.color:`rgba(${rgb},0.6)`} strokeWidth={selected?2.5:1}
          style={{filter:(hovered||selected)?`drop-shadow(0 0 ${hovered?22:15}px rgba(${rgb},0.8))`:"none",transition:"all 0.28s cubic-bezier(0.32,0.72,0,1)"}}/>
        <text textAnchor="middle" dy="-5" fill={agent.color} fontSize={agent.id==="committee"?13:11} fontFamily="var(--font-fira-code)" fontWeight="700" opacity="0.92">
          {String(agent.number).padStart(2,"0")}
        </text>
        <text textAnchor="middle" dy="10" fill="#E8EDF2" fontSize={agent.id==="committee"?9:8} fontFamily="var(--font-space-grotesk)" fontWeight="600" opacity="0.75">
          {agent.name.split(" ")[0].toUpperCase()}
        </text>
        {agent.has_live_data&&<circle cx={r-5} cy={-(r-5)} r="4" fill="#10B981" stroke="#060A12" strokeWidth="1.5" className="tm-live-dot"/>}
      </g>
      <text textAnchor="middle" y={r+18} fill={selected||hovered?"#CBD5E1":"#374151"} fontSize="9"
        fontFamily="var(--font-space-grotesk)" style={{transition:"fill 0.25s ease",letterSpacing:"0.05em"}}>
        {agent.name.toUpperCase()}
      </text>
    </g>
  );
}

function AnimatedEdge({x1,y1,x2,y2,color,active}:{x1:number;y1:number;x2:number;y2:number;color:string;active:boolean}) {
  const cx1=x1+(x2-x1)*0.4,cx2=x1+(x2-x1)*0.6;
  const d=`M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`;
  const rgb=hexToRgb(color);
  return (
    <g>
      <path d={d} fill="none" stroke={`rgba(${rgb},0.06)`} strokeWidth="2"/>
      <path d={d} fill="none" stroke={active?color:`rgba(${rgb},0.2)`} strokeWidth={active?2.2:0.8}
        strokeDasharray="5 9" opacity={active?1:0.45} className="tm-signal"
        style={{transition:"stroke 0.35s cubic-bezier(0.32,0.72,0,1),stroke-width 0.35s,opacity 0.35s"}}/>
    </g>
  );
}

function ReportViewer({agentId,color}:{agentId:string;color:string}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [report,setReport]=useState<any>(null); const [loading,setLoading]=useState(true);
  const rgb=hexToRgb(color);
  useEffect(()=>{setLoading(true);setReport(null);fetch(`/api/agent-report/${agentId}`).then(r=>r.ok?r.json():Promise.reject()).then(d=>{setReport(d);setLoading(false);}).catch(()=>setLoading(false));},[agentId]);
  if(loading) return <p className="text-[11px] text-[#1F2937] font-mono py-8 text-center tracking-widest">LOADING...</p>;
  if(!report) return <p className="text-[11px] text-[#1F2937] py-4 text-center">No report available.</p>;
  return (
    <div className="space-y-2">
      {report.generated_at&&<p className="text-[9px] font-mono text-[#1F2937] mb-3">GENERATED {new Date(report.generated_at).toLocaleString()}</p>}
      {Object.keys(report).filter(k=>k!=="generated_at"&&k!=="error").slice(0,8).map((key,i)=>{
        const v=report[key];
        const txt=Array.isArray(v)?v.slice(0,4).map((x:unknown)=>(typeof x==="object"?JSON.stringify(x):String(x)).slice(0,90)).join("\n"):String(typeof v==="object"?JSON.stringify(v):v).slice(0,200);
        return (
          <div key={key} className="rounded-xl p-3 tm-stagger" style={{background:`rgba(${rgb},0.05)`,border:`1px solid rgba(${rgb},0.12)`,animationDelay:`${i*40}ms`}}>
            <p className="text-[9px] font-mono tracking-widest mb-1 uppercase" style={{color}}>{key.replace(/_/g," ")}</p>
            <p className="text-[10px] text-[#9CA3AF] leading-relaxed whitespace-pre-wrap">{txt}</p>
          </div>
        );
      })}
    </div>
  );
}

function ChatPanel({agent}:{agent:Agent}) {
  const [msgs,setMsgs]=useState<{role:"user"|"agent";text:string}[]>([]);
  const [input,setInput]=useState(""); const [sending,setSending]=useState(false);
  const rgb=hexToRgb(agent.color);
  const send=async()=>{
    if(!input.trim()||sending)return;
    const msg=input.trim();setInput("");setMsgs(p=>[...p,{role:"user",text:msg}]);setSending(true);
    try{const res=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({agentId:agent.id,message:msg})});const d=await res.json();setMsgs(p=>[...p,{role:"agent",text:d.reply??"No response."}]);}
    catch{setMsgs(p=>[...p,{role:"agent",text:"Error."}]);}
    setSending(false);
  };
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-2 mb-3 min-h-[120px] max-h-[200px]">
        {msgs.length===0&&<p className="text-[10px] text-[#1F2937] text-center py-8">Ask {agent.name.split(" ")[0]} anything.</p>}
        {msgs.map((m,i)=>(
          <div key={i} className={`flex ${m.role==="user"?"justify-end":"justify-start"}`}>
            <div className="rounded-xl px-3 py-2 text-[11px] max-w-[85%]"
              style={{background:m.role==="user"?`rgba(${rgb},0.18)`:"rgba(255,255,255,0.04)",border:`1px solid rgba(${rgb},${m.role==="user"?0.4:0.1})`,color:m.role==="user"?agent.color:"#CBD5E1"}}>
              {m.text}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input className="flex-1 rounded-xl px-3 py-2 text-[11px] outline-none"
          style={{background:"rgba(255,255,255,0.04)",border:`1px solid rgba(${rgb},0.2)`,color:"#E8EDF2"}}
          placeholder={`Message ${agent.name.split(" ")[0]}...`} value={input}
          onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()}/>
        <button onClick={send} disabled={!input.trim()||sending}
          className="rounded-xl px-4 py-2 text-[11px] font-bold cursor-pointer disabled:opacity-40"
          style={{background:`rgba(${rgb},0.18)`,border:`1px solid rgba(${rgb},0.35)`,color:agent.color,transition:"transform 160ms cubic-bezier(0.32,0.72,0,1)"}}
          onMouseDown={e=>(e.currentTarget as HTMLElement).style.transform="scale(0.95)"}
          onMouseUp={e=>(e.currentTarget as HTMLElement).style.transform="scale(1)"}>
          {sending?"...":"↑"}
        </button>
      </div>
    </div>
  );
}

export default function TeamPage() {
  const [agents,setAgents]=useState<Agent[]>([]); const [selected,setSelected]=useState<Agent|null>(null);
  const [hovered,setHovered]=useState<string|null>(null); const [tab,setTab]=useState<Tab>("overview");
  const [loading,setLoading]=useState(true);

  useEffect(()=>{fetch("/api/agents").then(r=>r.json()).then((d:Agent[])=>{setAgents(d);setLoading(false);}).catch(()=>setLoading(false));},[]);

  const connectedToSelected=useMemo(()=>{
    if(!selected) return new Set<string>();
    const s=new Set([selected.id]);
    CONNECTIONS.forEach(([a,b])=>{if(a===selected.id)s.add(b);if(b===selected.id)s.add(a);});
    return s;
  },[selected]);

  const byId=useCallback((id:string)=>agents.find(a=>a.id===id),[agents]);

  if(loading) return (
    <div className="flex items-center justify-center min-h-[100dvh]" style={{background:"#060A12"}}>
      <p className="text-[#1F2937] font-mono text-sm tracking-widest">INITIALISING AGENTS...</p>
    </div>
  );

  return (
    <>
      <style>{`
        @keyframes tm-dash{to{stroke-dashoffset:-28}} .tm-signal{animation:tm-dash 2s linear infinite}
        @keyframes tm-dot{0%,100%{r:4;opacity:1}50%{r:6;opacity:0.5}} .tm-live-dot{animation:tm-dot 2s ease-in-out infinite}
        @keyframes tm-ring{0%{r:46;opacity:0.4}100%{r:76;opacity:0}} .tm-pulse-ring{animation:tm-ring 2.8s ease-out infinite}
        @keyframes tm-aurora-a{0%,100%{transform:translateY(0) scaleY(1)}50%{transform:translateY(-28px) scaleY(1.35)}}
        @keyframes tm-aurora-b{0%,100%{transform:translateY(0)}45%{transform:translateY(22px)}}
        @keyframes tm-aurora-c{0%,100%{transform:translateY(0)}62%{transform:translateY(-16px)}}
        @keyframes tm-panel{from{opacity:0;transform:translateX(16px) scale(0.98)}to{opacity:1;transform:translateX(0) scale(1)}}
        .tm-panel-in{animation:tm-panel 0.38s cubic-bezier(0.32,0.72,0,1) forwards}
        @keyframes tm-up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .tm-stagger{opacity:0;animation:tm-up 0.3s cubic-bezier(0.32,0.72,0,1) forwards}
      `}</style>

      {/* Aurora background — fixed, GPU-safe: transform only */}
      <div className="fixed inset-0 pointer-events-none" aria-hidden style={{background:"#060A12"}}/>
      <div className="fixed pointer-events-none" aria-hidden style={{
        top:"38%",left:"-15%",right:"-15%",height:"140px",
        background:"linear-gradient(90deg,transparent 0%,rgba(0,210,180,0.11) 35%,rgba(0,210,180,0.14) 50%,rgba(0,210,180,0.11) 65%,transparent 100%)",
        filter:"blur(55px)",animation:"tm-aurora-a 20s ease-in-out infinite"
      }}/>
      <div className="fixed pointer-events-none" aria-hidden style={{
        top:"58%",left:"-15%",right:"-15%",height:"100px",
        background:"linear-gradient(90deg,transparent 0%,rgba(99,102,241,0.1) 30%,rgba(99,102,241,0.13) 55%,rgba(99,102,241,0.08) 75%,transparent 100%)",
        filter:"blur(48px)",animation:"tm-aurora-b 26s ease-in-out infinite"
      }}/>
      <div className="fixed pointer-events-none" aria-hidden style={{
        top:"18%",left:"-15%",right:"-15%",height:"80px",
        background:"linear-gradient(90deg,transparent 0%,rgba(245,166,35,0.07) 40%,rgba(245,166,35,0.1) 55%,rgba(245,166,35,0.06) 70%,transparent 100%)",
        filter:"blur(60px)",animation:"tm-aurora-c 32s ease-in-out infinite"
      }}/>

      <div className="relative min-h-[100dvh] flex flex-col pt-16 z-10">
        <div className="px-8 pt-8 pb-4 flex items-end justify-between">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-3 text-[10px] font-mono tracking-[0.18em]"
              style={{background:"rgba(0,210,180,0.07)",border:"1px solid rgba(0,210,180,0.13)",color:"#F5A623"}}>
              HAZ CAPITAL MANAGEMENT
            </div>
            <h1 className="text-[34px] font-bold tracking-tight text-[#E8EDF2]" style={{fontFamily:"var(--font-syne)"}}>
              Agent Intelligence Map
            </h1>
            <p className="text-[10px] tracking-[0.22em] text-[#1F2937] font-mono mt-1">11 AGENTS — ONE PORTFOLIO</p>
          </div>
          <div className="flex gap-5 text-[10px] font-mono text-[#2D3748] items-center">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#10B981]"/>LIVE</span>
            <span className="flex items-center gap-1.5"><span className="w-5 border-t border-dashed border-[#1F2937]"/>SIGNAL</span>
            <span>{agents.filter(a=>a.has_live_data).length}/{agents.length} ONLINE</span>
          </div>
        </div>

        <div className="flex-1 flex flex-col lg:flex-row gap-0 px-4 pb-8 min-h-0">
          <div className="flex-1 relative">
            <svg viewBox="0 0 1060 720" className="w-full h-full" style={{maxHeight:"calc(100vh - 160px)"}}>
              {[...Array(10)].map((_,row)=>[...Array(15)].map((_,col)=>(
                <circle key={`${row}-${col}`} cx={col*76+14} cy={row*78+14} r="0.7" fill="#ffffff04"/>
              )))}
              {[{x:38,y:58,label:"PHASE 1 — INTAKE"},{x:300,y:290,label:"FILTER"},{x:520,y:95,label:"PHASE 2 — ANALYSIS"},{x:790,y:252,label:"COMMITTEE"},{x:800,y:458,label:"EXECUTION"}].map(({x,y,label})=>(
                <text key={label} x={x} y={y} fill="#1A202C" fontSize="9" fontFamily="var(--font-fira-code)" letterSpacing="3">{label}</text>
              ))}
              {CONNECTIONS.map(([from,to])=>{
                const a=byId(from);const pA=LAYOUT[from];const pB=LAYOUT[to];
                if(!a||!pA||!pB)return null;
                return <AnimatedEdge key={`${from}-${to}`} x1={pA.x} y1={pA.y} x2={pB.x} y2={pB.y} color={a.color} active={!!selected&&(from===selected.id||to===selected.id)}/>;
              })}
              {agents.map(agent=>{
                const pos=LAYOUT[agent.id];if(!pos)return null;
                return (
                  <OrbitalNode key={agent.id} agent={agent} x={pos.x} y={pos.y}
                    selected={selected?.id===agent.id} hovered={hovered===agent.id}
                    dimmed={!!selected&&!connectedToSelected.has(agent.id)}
                    onClick={()=>{setSelected(p=>p?.id===agent.id?null:agent);setTab("overview");}}
                    onMouseEnter={()=>setHovered(agent.id)} onMouseLeave={()=>setHovered(null)}/>
                );
              })}
            </svg>
          </div>

          <div className="w-full lg:w-[355px] shrink-0 py-4 pr-2">
            {selected ? (
              <div key={selected.id} className="tm-panel-in flex flex-col rounded-[1.6rem] p-1.5"
                style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",height:"calc(100vh - 200px)",boxShadow:"0 0 100px rgba(0,0,0,0.7)"}}>
                <div className="flex flex-col flex-1 rounded-[calc(1.6rem-6px)] overflow-hidden"
                  style={{background:`rgba(${hexToRgb(selected.color)},0.05)`,border:`1px solid rgba(${hexToRgb(selected.color)},0.2)`,boxShadow:"inset 0 1px 1px rgba(255,255,255,0.06)"}}>
                  <div className="px-5 pt-4 pb-3 border-b" style={{borderColor:`rgba(${hexToRgb(selected.color)},0.12)`}}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <span className="text-[9px] font-mono tracking-widest" style={{color:selected.color}}>
                          AGENT {String(selected.number).padStart(2,"0")}
                          {selected.has_live_data&&<span className="ml-2 text-[#10B981]">● LIVE</span>}
                        </span>
                        <h2 className="text-xl font-bold text-[#E8EDF2] mt-0.5" style={{fontFamily:"var(--font-syne)"}}>{selected.name}</h2>
                        <p className="text-[11px] text-[#6B7280]">{selected.role}</p>
                      </div>
                      <button onClick={()=>setSelected(null)} className="text-[#2D3748] hover:text-[#9CA3AF] text-xl cursor-pointer leading-none mt-1"
                        style={{transition:"color 0.15s ease,transform 120ms cubic-bezier(0.32,0.72,0,1)"}}
                        onMouseDown={e=>(e.currentTarget as HTMLElement).style.transform="scale(0.88)"}
                        onMouseUp={e=>(e.currentTarget as HTMLElement).style.transform="scale(1)"}>×</button>
                    </div>
                    <div className="flex gap-1">
                      {(["overview","report","chat"] as const).map(t=>(
                        <button key={t} onClick={()=>setTab(t)} className="px-3 py-1 rounded-lg text-[9px] font-mono tracking-widest uppercase cursor-pointer"
                          style={{background:tab===t?`rgba(${hexToRgb(selected.color)},0.18)`:"transparent",color:tab===t?selected.color:"#374151",border:`1px solid ${tab===t?`rgba(${hexToRgb(selected.color)},0.35)`:"transparent"}`,transition:"all 0.22s cubic-bezier(0.32,0.72,0,1)"}}>
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4">
                    {tab==="overview"&&(
                      <div className="space-y-3">
                        <p className="text-[11px] text-[#94A3B8] leading-relaxed">{selected.personality}</p>
                        {selected.has_live_data&&(
                          <div className="space-y-2">
                            {[{label:"FOCUS",val:selected.current_focus},{label:"VIEW",val:selected.market_view},{label:"ACTIVITY",val:selected.recent_activity}].map(({label,val},i)=>(
                              <div key={label} className="rounded-xl p-3 tm-stagger" style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",animationDelay:`${i*55}ms`}}>
                                <p className="text-[9px] font-mono tracking-widest mb-0.5" style={{color:selected.color}}>{label}</p>
                                <p className="text-[11px] text-[#CBD5E1] leading-snug">{val}</p>
                              </div>
                            ))}
                          </div>
                        )}
                        {selected.feeds&&<div className="pt-2 border-t text-[10px] font-mono text-[#2D3748]" style={{borderColor:`rgba(${hexToRgb(selected.color)},0.12)`}}>FEEDS → <span className="text-[#6B7280]">{selected.feeds}</span></div>}
                      </div>
                    )}
                    {tab==="report"&&<ReportViewer agentId={selected.id} color={selected.color}/>}
                    {tab==="chat"&&<ChatPanel agent={selected}/>}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col py-6 px-2">
                <p className="text-[10px] font-mono tracking-widest text-[#111827] mb-1">SELECT AN AGENT</p>
                <p className="text-[11px] text-[#0D1117] mb-6">Click any node to inspect it.</p>
                <div className="grid grid-cols-2 gap-2">
                  {agents.map((a,i)=>(
                    <button key={a.id} onClick={()=>{setSelected(a);setTab("overview");}}
                      className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-left cursor-pointer tm-stagger"
                      style={{background:"rgba(255,255,255,0.02)",border:`1px solid rgba(${hexToRgb(a.color)},0.13)`,animationDelay:`${i*35}ms`,transition:"border-color 0.22s ease,background 0.22s ease"}}
                      onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background=`rgba(${hexToRgb(a.color)},0.08)`;(e.currentTarget as HTMLElement).style.borderColor=`rgba(${hexToRgb(a.color)},0.35)`;}}
                      onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.02)";(e.currentTarget as HTMLElement).style.borderColor=`rgba(${hexToRgb(a.color)},0.13)`;}}>
                      <span className="w-2 h-2 rounded-full shrink-0" style={{background:a.color}}/>
                      <span className="text-[10px] text-[#4B5563] truncate">{a.name}</span>
                      {a.has_live_data&&<span className="w-1.5 h-1.5 rounded-full bg-[#10B981] ml-auto shrink-0"/>}
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
