"use client";

// Agents page — a blueprint-style schematic of the pipeline (DESIGN_DIRECTION.md).
// Neutral graphite nodes; brass marks only the committee and the selected agent.
// Motion only answers the user (select / hover); no ambient loops.

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
  const r=nodeR(agent.id); const c=(selected||hovered)?"#C8A15A":agent.color; const rgb=hexToRgb(c);
  const scale=hovered?1.13:selected?1.07:1;
  return (
    <g transform={`translate(${x},${y})`} onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
      style={{cursor:"pointer",opacity:dimmed?0.22:1,transition:"opacity 0.4s cubic-bezier(0.32,0.72,0,1)"}}>
      <g style={{transform:`scale(${scale})`,transformOrigin:"0 0",transition:"transform 0.28s cubic-bezier(0.32,0.72,0,1)"}}>
        <circle r={r+20} fill={`rgba(${rgb},${(hovered||selected)?0.12:0.04})`} style={{transition:"all 0.28s cubic-bezier(0.32,0.72,0,1)"}}/>
        <circle r={r+3} fill="none" stroke={c} strokeWidth={(hovered||selected)?1.8:0.5} opacity={(hovered||selected)?0.8:0.14} style={{transition:"all 0.28s cubic-bezier(0.32,0.72,0,1)"}}/>
        <circle r={r} fill={`rgba(${rgb},${selected?0.26:hovered?0.17:0.09})`}
          stroke={selected?c:`rgba(${rgb},0.6)`} strokeWidth={selected?2.5:1}
          style={{transition:"fill 0.2s cubic-bezier(0.23,1,0.32,1), stroke 0.2s cubic-bezier(0.23,1,0.32,1)"}}/>
        <text textAnchor="middle" dy="5" fill={c} fontSize={agent.id==="committee"?16:14} fontFamily="var(--font-sans)" fontWeight="700" opacity="0.92">
          {String(agent.number).padStart(2,"0")}
        </text>
        {agent.has_live_data&&<circle cx={r-5} cy={-(r-5)} r="3.5" fill="#4DB887" stroke="#171A1D" strokeWidth="1.5"/>}
      </g>
      <text textAnchor="middle" y={r+20} fill={selected||hovered?"#ECEDEE":"#B3B8BE"} fontSize="12"
        fontFamily="var(--font-sans)" style={{transition:"fill 0.2s ease"}}>
        {agent.name}
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

// Readable rendering of an agent's report: text as text, numbers as numbers, lists as
// "N items" with their key fields — never raw JSON.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function describeItem(x: any): string {
  if (x == null) return "—";
  if (typeof x !== "object") return String(x);
  const label = x.ticker ?? x.symbol ?? x.sector ?? x.name ?? x.theme ?? x.title ?? x.headline ?? x.catalyst ?? x.fund_name ?? x.item;
  const extras: string[] = [];
  for (const k of ["action", "direction", "score", "composite_score", "conviction", "rank", "confidence", "shares", "price", "reason", "rationale", "summary", "description"]) {
    const v = x[k];
    if (v == null || typeof v === "object" || k === "name") continue;
    extras.push(typeof v === "number" ? `${k.replace(/_/g, " ")} ${v}` : String(v).slice(0, 90));
    if (extras.length >= 2) break;
  }
  return [label != null ? String(label) : null, ...extras].filter(Boolean).join(" · ") || "(item)";
}

const HIDDEN_KEYS = new Set(["generated_at", "error", "raw_data", "signal_confidence", "weights_used", "portfolio_construction"]);

function ReportViewer({agentId,color}:{agentId:string;color:string}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [report,setReport]=useState<any>(null); const [loading,setLoading]=useState(true); const [err,setErr]=useState<string|null>(null);
  const rgb=hexToRgb(color);
  useEffect(()=>{setLoading(true);setReport(null);setErr(null);fetch(`/api/agent-report/${agentId}`).then(async r=>{const d=await r.json().catch(()=>null); if(!r.ok) throw new Error(d?.error ?? `HTTP ${r.status}`); setReport(d);}).catch(e=>setErr(String(e?.message ?? e))).finally(()=>setLoading(false));},[agentId]);
  if(loading) return <p className="text-micro text-ink-3 py-8 text-center">LOADING...</p>;
  if(!report) return <p className="text-micro text-ink-3 py-4 text-center">Report unavailable{err ? ` — ${err}` : ""}.</p>;
  const keys = Object.keys(report).filter(k=>!HIDDEN_KEYS.has(k));
  return (
    <div className="space-y-2">
      {report.generated_at&&<p className="text-micro text-ink-3 mb-3">GENERATED {String(report.generated_at)}</p>}
      {keys.map((key,i)=>{
        const v=report[key];
        let body: React.ReactNode;
        if (Array.isArray(v)) {
          body = v.length === 0 ? <span className="text-ink-3">None</span> : (
            <>
              <span className="text-ink-3">{v.length} item{v.length!==1?"s":""}</span>
              <ul className="mt-1 space-y-0.5">{v.slice(0,6).map((x,j)=><li key={j}>• {describeItem(x)}</li>)}</ul>
              {v.length>6&&<span className="text-ink-3">+{v.length-6} more</span>}
            </>
          );
        } else if (v && typeof v === "object") {
          const flat = Object.entries(v).filter(([,x])=>x==null||typeof x!=="object");
          body = flat.length ? flat.slice(0,8).map(([k,x])=><div key={k}>{k.replace(/_/g," ")}: {x==null?"—":String(x)}</div>) : <span className="text-ink-3">{Object.keys(v).length} fields</span>;
        } else {
          body = String(v ?? "—");
        }
        return (
          <div key={key} className="rounded-xl p-3 tm-stagger" style={{background:`rgba(${rgb},0.05)`,border:`1px solid rgba(${rgb},0.12)`,animationDelay:`${i*40}ms`}}>
            <p className="text-micro mb-1" style={{color}}>{key.charAt(0).toUpperCase()+key.slice(1).replace(/_/g," ")}</p>
            <div className="text-micro text-ink-2 leading-relaxed whitespace-pre-wrap">{body}</div>
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
    const msg=input.trim();setInput("");
    const nextMsgs=[...msgs,{role:"user" as const,text:msg}];
    setMsgs(nextMsgs);setSending(true);
    try{const res=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({agentId:agent.id,message:msg,history:nextMsgs.slice(-8)})});const d=await res.json();setMsgs(p=>[...p,{role:"agent" as const,text:d.reply??"No response."}]);}
    catch{setMsgs(p=>[...p,{role:"agent" as const,text:"Error connecting to agent."}]);}
    setSending(false);
  };
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-2 mb-3 min-h-[120px] max-h-[360px]">
        {msgs.length===0&&<p className="text-micro text-ink-3 text-center py-8">Ask {agent.name.split(" ")[0]} anything.</p>}
        {msgs.map((m,i)=>(
          <div key={i} className={`flex ${m.role==="user"?"justify-end":"justify-start"}`}>
            <div className="rounded-xl px-3 py-2 text-[12px] leading-relaxed whitespace-pre-wrap max-w-[85%]"
              style={{background:m.role==="user"?`rgba(${rgb},0.18)`:"rgba(255,255,255,0.04)",border:`1px solid rgba(${rgb},${m.role==="user"?0.4:0.1})`,color:m.role==="user"?agent.color:"#ECEDEE"}}>
              {m.text}
            </div>
          </div>
        ))}
        {sending&&<p className="text-micro text-ink-3 pl-1">{agent.name.split(" ")[0]} is thinking…</p>}
      </div>
      <div className="flex gap-2">
        <input className="flex-1 rounded-xl px-3 py-2 text-micro outline-none"
          style={{background:"rgba(255,255,255,0.04)",border:`1px solid rgba(${rgb},0.2)`,color:"#ECEDEE"}}
          placeholder={`Message ${agent.name.split(" ")[0]}...`} value={input}
          onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()}/>
        <button onClick={send} disabled={!input.trim()||sending}
          className="rounded-xl px-4 py-2 text-micro font-bold cursor-pointer disabled:opacity-40"
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

  useEffect(()=>{fetch("/api/agents").then(r=>r.json()).then((d:Agent[])=>{
    // One accent: the committee (where decisions are made) is brass; every other agent is graphite
    setAgents(d.map(a=>({...a,color:a.id==="committee"?"#C8A15A":"#8E959D"})));setLoading(false);}).catch(()=>setLoading(false));},[]);

  const connectedToSelected=useMemo(()=>{
    if(!selected) return new Set<string>();
    const s=new Set([selected.id]);
    CONNECTIONS.forEach(([a,b])=>{if(a===selected.id)s.add(b);if(b===selected.id)s.add(a);});
    return s;
  },[selected]);

  const byId=useCallback((id:string)=>agents.find(a=>a.id===id),[agents]);

  if(loading) return (
    <div className="flex items-center justify-center min-h-[100dvh]" style={{background:"#060A12"}}>
      <p className="text-ink-3 text-sm">INITIALISING AGENTS...</p>
    </div>
  );

  return (
    <>
      <style>{`
        @keyframes tm-panel{from{opacity:0;transform:translateX(16px) scale(0.98)}to{opacity:1;transform:translateX(0) scale(1)}}
        .tm-panel-in{animation:tm-panel 0.38s cubic-bezier(0.32,0.72,0,1) forwards}
        @keyframes tm-up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .tm-stagger{opacity:0;animation:tm-up 0.3s cubic-bezier(0.32,0.72,0,1) forwards}
      `}</style>

      <main className="relative flex min-h-[calc(100dvh-56px)] flex-col">
        <header className="mx-auto flex w-full max-w-[1280px] flex-wrap items-end justify-between gap-6 px-4 pb-4 pt-10 sm:px-6">
          <div className="max-w-2xl">
            <h1 className="font-serif text-h1 font-medium text-ink-1">How the agents work together</h1>
            <p className="mt-2 text-lead text-ink-2">Eleven agents pass their findings along this pipeline every weekday. Select one to see what it found, read its latest report, or ask it a question.</p>
          </div>
          <dl className="flex items-center gap-5 text-label text-ink-3">
            <div className="flex items-center gap-2"><span aria-hidden className="h-2 w-2 rounded-full bg-gain" /><dt className="sr-only">Status</dt><dd>Reported today</dd></div>
            <div className="flex items-center gap-2"><span aria-hidden className="w-5 border-t border-dashed border-ink-3" /><dd>Passes findings to</dd></div>
            <div><dd className="tabular">{agents.filter(a=>a.has_live_data).length} of {agents.length} reported</dd></div>
          </dl>
        </header>

        <div className="mx-auto flex w-full max-w-[1280px] min-h-0 flex-1 flex-col gap-6 px-4 pb-10 sm:px-6 lg:flex-row">
          <div className="tex-dots relative flex-1 rounded-lg border border-line">
            <svg viewBox="0 0 1060 720" className="w-full h-full" style={{maxHeight:"calc(100vh - 160px)"}}>
              {[{x:38,y:58,label:"1  Market context"},{x:300,y:290,label:"2  Shortlist"},{x:520,y:95,label:"3  Analysis"},{x:790,y:240,label:"4  Decision"},{x:800,y:458,label:"5  Execution"}].map(({x,y,label})=>(
                <text key={label} x={x} y={y} fill="#8E959D" fontSize="12" fontFamily="var(--font-sans)">{label}</text>
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
              <div key={selected.id} className="tm-panel-in flex flex-col" style={{height:"calc(100vh - 220px)"}}>
                <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-line bg-surface">
                  <div className="px-5 pt-4 pb-3 border-b" style={{borderColor:`rgba(${hexToRgb(selected.color)},0.12)`}}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <span className="text-micro" style={{color:selected.color}}>
                          AGENT {String(selected.number).padStart(2,"0")}
                          {selected.has_live_data&&<span className="ml-2 text-gain">● LIVE</span>}
                        </span>
                        <h2 className="text-xl font-bold text-ink-1 mt-0.5" style={{fontFamily:"var(--font-serif)"}}>{selected.name}</h2>
                        <p className="text-micro text-ink-3">{selected.role}</p>
                      </div>
                      <button onClick={()=>setSelected(null)} className="text-ink-3 hover:text-ink-2 text-xl cursor-pointer leading-none mt-1"
                        style={{transition:"color 0.15s ease,transform 120ms cubic-bezier(0.32,0.72,0,1)"}}
                        onMouseDown={e=>(e.currentTarget as HTMLElement).style.transform="scale(0.88)"}
                        onMouseUp={e=>(e.currentTarget as HTMLElement).style.transform="scale(1)"}>×</button>
                    </div>
                    <div className="flex gap-1">
                      {(["overview","report","chat"] as const).map(t=>(
                        <button key={t} onClick={()=>setTab(t)} className="px-3 py-1 rounded-lg text-micro cursor-pointer"
                          style={{background:tab===t?`rgba(${hexToRgb(selected.color)},0.18)`:"transparent",color:tab===t?selected.color:"#8E959D",border:`1px solid ${tab===t?`rgba(${hexToRgb(selected.color)},0.35)`:"transparent"}`,transition:"all 0.22s cubic-bezier(0.32,0.72,0,1)"}}>
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4">
                    {tab==="overview"&&(
                      <div className="space-y-3">
                        <p className="text-micro text-ink-2 leading-relaxed">{selected.personality}</p>
                        {selected.has_live_data&&(
                          <div className="space-y-2">
                            {[{label:"FOCUS",val:selected.current_focus},{label:"VIEW",val:selected.market_view},{label:"ACTIVITY",val:selected.recent_activity}].map(({label,val},i)=>(
                              <div key={label} className="rounded-xl p-3 tm-stagger" style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",animationDelay:`${i*55}ms`}}>
                                <p className="text-micro mb-0.5" style={{color:selected.color}}>{label}</p>
                                <p className="text-micro text-ink-1 leading-snug">{val}</p>
                              </div>
                            ))}
                          </div>
                        )}
                        {selected.feeds&&<div className="pt-2 border-t text-micro text-ink-3" style={{borderColor:`rgba(${hexToRgb(selected.color)},0.12)`}}>FEEDS → <span className="text-ink-3">{selected.feeds}</span></div>}
                      </div>
                    )}
                    {tab==="report"&&<ReportViewer agentId={selected.id} color={selected.color}/>}
                    {tab==="chat"&&<ChatPanel agent={selected}/>}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col py-2">
                <h2 className="font-serif text-h3 text-ink-1">Select an agent</h2>
                <p className="mb-5 mt-1 text-label text-ink-3">Choose a node on the map or from this list.</p>
                <ul className="divide-y divide-line border-y border-line">
                  {agents.map((a)=>(
                    <li key={a.id}>
                      <button onClick={()=>{setSelected(a);setTab("overview");}}
                        className="flex w-full items-center gap-3 px-1 py-2.5 text-left transition-colors duration-fast hover:bg-raised/60">
                        <span className="w-5 text-micro text-ink-3 tabular">{a.number}</span>
                        <span className={`flex-1 truncate text-body ${a.id==="committee"?"text-accent":"text-ink-1"}`}>{a.name}</span>
                        {a.has_live_data&&<span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gain" aria-label="Reported today"/>}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
