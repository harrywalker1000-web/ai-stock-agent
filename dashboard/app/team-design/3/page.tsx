"use client";

// Design 3 — "Spotlight Theater"
// Same orbital SVG as D1 — but full-screen, no persistent sidebar.
// Click a node → backdrop dims, centered glass modal rises up (scale 0.95 → 1).
// Background: living canvas with stars + gold glow + cyan grid floor (from homepage).
// Emil: scale(0.95) entries, custom cubic-bezier, asymmetric timing, stagger in modal.
// Taste: OLED black, double-bezel modal, cinematic corona on selected node, full-bleed.

import { useEffect, useState, useCallback, useMemo, useRef } from "react";

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

// Living canvas — stars + gold top glow + animated cyan grid floor
function StarCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize(); window.addEventListener("resize", resize);
    type Star = { x: number; y: number; r: number; p: number };
    const stars: Star[] = Array.from({length:280},()=>({x:Math.random(),y:Math.random()*0.72,r:Math.random()*0.9+0.2,p:Math.random()*Math.PI*2}));
    let t = 0; let frame: number;
    const draw = () => {
      t += 0.005; ctx.clearRect(0,0,canvas.width,canvas.height);
      const W=canvas.width, H=canvas.height;
      stars.forEach(s=>{ctx.globalAlpha=0.08+0.12*Math.abs(Math.sin(t+s.p));ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(s.x*W,s.y*H,s.r,0,Math.PI*2);ctx.fill();});
      // Gold top glow
      const gg=ctx.createRadialGradient(W/2,0,0,W/2,0,W*0.5);
      gg.addColorStop(0,"rgba(245,166,35,0.1)");gg.addColorStop(1,"transparent");
      ctx.globalAlpha=1;ctx.fillStyle=gg;ctx.fillRect(0,0,W,H);
      // Cyan grid floor (bottom 30%)
      const gy=H*0.7; ctx.strokeStyle="rgba(0,212,255,0.1)";ctx.lineWidth=1;
      for(let i=-22;i<=22;i++){ctx.beginPath();ctx.moveTo(W/2+i*60,H);ctx.lineTo(W/2,gy);ctx.stroke();}
      for(let j=0;j<8;j++){
        const prog=((j/8)+t*0.18)%1; const y=gy+(H-gy)*prog; const spread=(y-gy)/(H-gy);
        ctx.globalAlpha=spread*0.35;ctx.beginPath();ctx.moveTo(W/2-spread*W*0.75,y);ctx.lineTo(W/2+spread*W*0.75,y);ctx.stroke();
      }
      ctx.globalAlpha=1; frame=requestAnimationFrame(draw);
    };
    draw();
    return ()=>{cancelAnimationFrame(frame);window.removeEventListener("resize",resize);};
  },[]);
  return <canvas ref={ref} className="fixed inset-0 w-full h-full pointer-events-none" aria-hidden/>;
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
function nodeR(id:string){ return id==="committee"?52:id==="candidate"?44:38; }

function OrbitalNode({agent,x,y,selected,hovered,dimmed,onClick,onMouseEnter,onMouseLeave}:{
  agent:Agent;x:number;y:number;selected:boolean;hovered:boolean;dimmed:boolean;
  onClick:()=>void;onMouseEnter:()=>void;onMouseLeave:()=>void;
}) {
  const r=nodeR(agent.id); const rgb=hexToRgb(agent.color);
  const scale=hovered?1.15:selected?1.1:1;
  return (
    <g transform={`translate(${x},${y})`} onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
      style={{cursor:"pointer",opacity:dimmed?0.18:1,transition:"opacity 0.45s cubic-bezier(0.32,0.72,0,1)"}}>
      <g style={{transform:`scale(${scale})`,transformOrigin:"0 0",transition:"transform 0.3s cubic-bezier(0.32,0.72,0,1)"}}>
        {/* Massive corona for selected */}
        {selected&&<circle r={r+38} fill="none" stroke={agent.color} strokeWidth="1" opacity="0.08"/>}
        {selected&&<circle r={r+26} fill={`rgba(${rgb},0.08)`} style={{filter:`blur(2px)`}}/>}
        <circle r={r+18} fill={`rgba(${rgb},${(hovered||selected)?0.12:0.04})`} style={{transition:"all 0.3s cubic-bezier(0.32,0.72,0,1)"}}/>
        {agent.has_live_data&&<circle r={r+28} fill="none" stroke={agent.color} strokeWidth="1" opacity="0" className="d3-pulse-ring"/>}
        <circle r={r+3} fill="none" stroke={agent.color} strokeWidth={selected?2.2:(hovered?1.6:0.5)} opacity={selected?0.9:(hovered?0.7:0.14)} style={{transition:"all 0.3s cubic-bezier(0.32,0.72,0,1)"}}/>
        <circle r={r} fill={`rgba(${rgb},${selected?0.3:hovered?0.18:0.1})`}
          stroke={selected?agent.color:`rgba(${rgb},0.6)`} strokeWidth={selected?2.5:1}
          style={{filter:selected?`drop-shadow(0 0 28px rgba(${rgb},0.9))`:(hovered?`drop-shadow(0 0 16px rgba(${rgb},0.65))`:"none"),transition:"all 0.3s cubic-bezier(0.32,0.72,0,1)"}}/>
        <text textAnchor="middle" dy="-5" fill={agent.color} fontSize={agent.id==="committee"?14:12} fontFamily="var(--font-fira-code)" fontWeight="700" opacity="0.95">
          {String(agent.number).padStart(2,"0")}
        </text>
        <text textAnchor="middle" dy="11" fill="#E8EDF2" fontSize={agent.id==="committee"?9:8} fontFamily="var(--font-space-grotesk)" fontWeight="600" opacity="0.75">
          {agent.name.split(" ")[0].toUpperCase()}
        </text>
        {agent.has_live_data&&<circle cx={r-5} cy={-(r-5)} r="4.5" fill="#10B981" stroke="#030005" strokeWidth="1.5" className="d3-live-dot"/>}
      </g>
      <text textAnchor="middle" y={r+20} fill={selected?"#E8EDF2":(hovered?"#CBD5E1":"#374151")} fontSize="9"
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
      <path d={d} fill="none" stroke={`rgba(${rgb},0.06)`} strokeWidth="1.5"/>
      <path d={d} fill="none" stroke={active?color:`rgba(${rgb},0.18)`} strokeWidth={active?2.5:0.8}
        strokeDasharray="5 9" opacity={active?1:0.4} className="d3-signal"
        style={{transition:"stroke 0.35s cubic-bezier(0.32,0.72,0,1),stroke-width 0.35s,opacity 0.35s"}}/>
    </g>
  );
}

function AgentModal({agent,tab,onTabChange,onClose}:{agent:Agent;tab:Tab;onTabChange:(t:Tab)=>void;onClose:()=>void}) {
  const rgb=hexToRgb(agent.color);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [report,setReport]=useState<any>(null); const [reportLoading,setReportLoading]=useState(false);
  const [msgs,setMsgs]=useState<{role:"user"|"agent";text:string}[]>([]); const [input,setInput]=useState(""); const [sending,setSending]=useState(false);

  useEffect(()=>{
    if(tab==="report"){setReportLoading(true);setReport(null);fetch(`/api/agent-report/${agent.id}`).then(r=>r.ok?r.json():Promise.reject()).then(d=>{setReport(d);setReportLoading(false);}).catch(()=>setReportLoading(false));}
  },[tab,agent.id]);

  const send=async()=>{
    if(!input.trim()||sending)return;
    const msg=input.trim();setInput("");setMsgs(p=>[...p,{role:"user",text:msg}]);setSending(true);
    try{const res=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({agentId:agent.id,message:msg})});const d=await res.json();setMsgs(p=>[...p,{role:"agent",text:d.reply??"No response."}]);}
    catch{setMsgs(p=>[...p,{role:"agent",text:"Error."}]);}
    setSending(false);
  };

  return (
    <>
      {/* Backdrop — fast fade in, slightly slower fade out handled by key change */}
      <div className="fixed inset-0 z-40" style={{background:"rgba(3,0,5,0.75)",backdropFilter:"blur(6px)",WebkitBackdropFilter:"blur(6px)",animation:"d3-backdrop 0.25s ease forwards"}} onClick={onClose}/>
      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none">
        <div className="w-full max-w-[600px] max-h-[82vh] pointer-events-auto flex flex-col rounded-[2rem] p-1.5"
          style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",boxShadow:"0 0 120px rgba(0,0,0,0.8)",animation:"d3-modal 0.38s cubic-bezier(0.32,0.72,0,1) forwards"}}>
          {/* Double-bezel inner */}
          <div className="flex flex-col flex-1 min-h-0 rounded-[calc(2rem-6px)] overflow-hidden"
            style={{background:`rgba(${rgb},0.06)`,border:`1px solid rgba(${rgb},0.22)`,boxShadow:"inset 0 1px 1px rgba(255,255,255,0.07)"}}>
            {/* Header */}
            <div className="px-6 pt-5 pb-4 border-b shrink-0" style={{borderColor:`rgba(${rgb},0.14)`}}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                    style={{background:`rgba(${rgb},0.15)`,border:`1px solid rgba(${rgb},0.3)`,boxShadow:`0 0 20px rgba(${rgb},0.2)`}}>
                    <span className="font-mono text-sm font-bold" style={{color:agent.color}}>{String(agent.number).padStart(2,"0")}</span>
                  </div>
                  <div>
                    {agent.has_live_data&&<span className="text-[9px] font-mono text-[#10B981] tracking-widest">● LIVE</span>}
                    <h2 className="text-2xl font-bold text-[#E8EDF2] leading-tight" style={{fontFamily:"var(--font-syne)"}}>{agent.name}</h2>
                    <p className="text-[12px] text-[#6B7280] mt-0.5">{agent.role}</p>
                  </div>
                </div>
                <button onClick={onClose} className="text-[#374151] hover:text-[#9CA3AF] text-2xl cursor-pointer leading-none"
                  style={{transition:"color 0.15s ease,transform 120ms cubic-bezier(0.32,0.72,0,1)"}}
                  onMouseDown={e=>(e.currentTarget as HTMLElement).style.transform="scale(0.85)"}
                  onMouseUp={e=>(e.currentTarget as HTMLElement).style.transform="scale(1)"}>×</button>
              </div>
              <div className="flex gap-1.5">
                {(["overview","report","chat"] as const).map(t=>(
                  <button key={t} onClick={()=>onTabChange(t)} className="px-4 py-1.5 rounded-lg text-[9px] font-mono tracking-widest uppercase cursor-pointer"
                    style={{background:tab===t?`rgba(${rgb},0.2)`:"transparent",color:tab===t?agent.color:"#374151",border:`1px solid ${tab===t?`rgba(${rgb},0.4)`:"transparent"}`,transition:"all 0.22s cubic-bezier(0.32,0.72,0,1)"}}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5">
              {tab==="overview"&&(
                <div className="space-y-4">
                  <p className="text-[12px] text-[#94A3B8] leading-relaxed d3-stagger" style={{animationDelay:"0ms"}}>{agent.personality}</p>
                  {agent.has_live_data&&(
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {[{label:"CURRENT FOCUS",val:agent.current_focus},{label:"MARKET VIEW",val:agent.market_view},{label:"RECENT ACTIVITY",val:agent.recent_activity}].map(({label,val},i)=>(
                        <div key={label} className="rounded-xl p-3 d3-stagger" style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",animationDelay:`${(i+1)*60}ms`}}>
                          <p className="text-[9px] font-mono tracking-widest mb-1" style={{color:agent.color}}>{label}</p>
                          <p className="text-[11px] text-[#CBD5E1] leading-snug">{val}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {agent.feeds&&<p className="text-[10px] font-mono text-[#374151] d3-stagger" style={{animationDelay:"240ms"}}>FEEDS → <span className="text-[#6B7280]">{agent.feeds}</span></p>}
                </div>
              )}
              {tab==="report"&&(
                reportLoading?<p className="text-[11px] text-[#1F2937] font-mono py-8 text-center tracking-widest">LOADING REPORT...</p>:
                !report?<p className="text-[11px] text-[#374151] py-4 text-center">No report available.</p>:
                <div className="space-y-2">
                  {report.generated_at&&<p className="text-[9px] font-mono text-[#1F2937] mb-3">GENERATED {new Date(report.generated_at).toLocaleString()}</p>}
                  {Object.keys(report).filter(k=>k!=="generated_at"&&k!=="error").slice(0,8).map((key,i)=>{
                    const v=report[key];
                    const txt=Array.isArray(v)?v.slice(0,4).map((x:unknown)=>(typeof x==="object"?JSON.stringify(x):String(x)).slice(0,100)).join("\n"):String(typeof v==="object"?JSON.stringify(v):v).slice(0,220);
                    return (
                      <div key={key} className="rounded-xl p-3 d3-stagger" style={{background:`rgba(${rgb},0.05)`,border:`1px solid rgba(${rgb},0.12)`,animationDelay:`${i*45}ms`}}>
                        <p className="text-[9px] font-mono tracking-widest mb-1 uppercase" style={{color:agent.color}}>{key.replace(/_/g," ")}</p>
                        <p className="text-[10px] text-[#9CA3AF] leading-relaxed whitespace-pre-wrap">{txt}</p>
                      </div>
                    );
                  })}
                </div>
              )}
              {tab==="chat"&&(
                <div className="flex flex-col h-full min-h-[200px]">
                  <div className="flex-1 overflow-y-auto space-y-2 mb-3">
                    {msgs.length===0&&<p className="text-[11px] text-[#1F2937] text-center py-8">Ask {agent.name.split(" ")[0]} about its analysis or approach.</p>}
                    {msgs.map((m,i)=>(
                      <div key={i} className={`flex ${m.role==="user"?"justify-end":"justify-start"}`}>
                        <div className="rounded-xl px-3 py-2 text-[11px] max-w-[80%]"
                          style={{background:m.role==="user"?`rgba(${rgb},0.18)`:"rgba(255,255,255,0.04)",border:`1px solid rgba(${rgb},${m.role==="user"?0.4:0.1})`,color:m.role==="user"?agent.color:"#CBD5E1"}}>
                          {m.text}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input className="flex-1 rounded-xl px-3 py-2.5 text-[11px] outline-none"
                      style={{background:"rgba(255,255,255,0.04)",border:`1px solid rgba(${rgb},0.2)`,color:"#E8EDF2"}}
                      placeholder={`Message ${agent.name.split(" ")[0]}...`} value={input}
                      onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()}/>
                    <button onClick={send} disabled={!input.trim()||sending}
                      className="rounded-xl px-5 py-2.5 text-[11px] font-bold cursor-pointer disabled:opacity-40"
                      style={{background:`rgba(${rgb},0.18)`,border:`1px solid rgba(${rgb},0.35)`,color:agent.color,transition:"transform 160ms cubic-bezier(0.32,0.72,0,1)"}}
                      onMouseDown={e=>(e.currentTarget as HTMLElement).style.transform="scale(0.94)"}
                      onMouseUp={e=>(e.currentTarget as HTMLElement).style.transform="scale(1)"}>
                      {sending?"...":"↑"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function TeamDesign3() {
  const [agents,setAgents]=useState<Agent[]>([]); const [selected,setSelected]=useState<Agent|null>(null);
  const [hovered,setHovered]=useState<string|null>(null); const [tab,setTab]=useState<Tab>("overview");
  const [loading,setLoading]=useState(true);

  useEffect(()=>{fetch("/api/agents").then(r=>r.json()).then((d:Agent[])=>{setAgents(d);setLoading(false);}).catch(()=>setLoading(false));},[]);

  const connectedToSelected=useMemo(()=>{
    if(!selected)return new Set<string>();
    const s=new Set([selected.id]);
    CONNECTIONS.forEach(([a,b])=>{if(a===selected.id)s.add(b);if(b===selected.id)s.add(a);});
    return s;
  },[selected]);

  const byId=useCallback((id:string)=>agents.find(a=>a.id===id),[agents]);

  if(loading) return (
    <div className="flex items-center justify-center min-h-[100dvh]" style={{background:"#030005"}}>
      <p className="text-[#1F2937] font-mono text-sm tracking-widest">INITIALISING AGENTS...</p>
    </div>
  );

  return (
    <>
      <style>{`
        @keyframes d3-dash{to{stroke-dashoffset:-28}} .d3-signal{animation:d3-dash 2s linear infinite}
        @keyframes d3-dot{0%,100%{r:4.5;opacity:1}50%{r:7;opacity:0.4}} .d3-live-dot{animation:d3-dot 2.2s ease-in-out infinite}
        @keyframes d3-ring{0%{r:52;opacity:0.5}100%{r:88;opacity:0}} .d3-pulse-ring{animation:d3-ring 3s ease-out infinite}
        @keyframes d3-backdrop{from{opacity:0}to{opacity:1}}
        @keyframes d3-modal{from{opacity:0;transform:scale(0.95) translateY(12px)}to{opacity:1;transform:scale(1) translateY(0)}}
        @keyframes d3-up{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        .d3-stagger{opacity:0;animation:d3-up 0.32s cubic-bezier(0.32,0.72,0,1) forwards}
      `}</style>

      {/* Living canvas background */}
      <div style={{background:"#030005"}} className="fixed inset-0"/>
      <StarCanvas/>

      <div className="relative min-h-[100dvh] flex flex-col pt-16 z-10">
        {/* Header — minimal, floats above the SVG */}
        <div className="px-8 pt-6 pb-2 flex items-center justify-between">
          <div>
            <p className="text-[9px] tracking-[0.22em] text-[#1F2937] font-mono mb-1">HAZ CAPITAL MANAGEMENT</p>
            <h1 className="text-[28px] font-bold tracking-tight text-[#E8EDF2]" style={{fontFamily:"var(--font-syne)"}}>
              Agent Intelligence Map
            </h1>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-mono text-[#1F2937] tracking-widest">{agents.filter(a=>a.has_live_data).length}/{agents.length} LIVE</p>
            <p className="text-[9px] font-mono text-[#111827] mt-0.5">CLICK ANY NODE</p>
          </div>
        </div>

        {/* Full-bleed SVG */}
        <div className="flex-1 px-2 pb-20">
          <svg viewBox="0 0 1060 720" className="w-full h-full" style={{maxHeight:"calc(100vh - 140px)"}}>
            {[...Array(10)].map((_,row)=>[...Array(15)].map((_,col)=>(
              <circle key={`${row}-${col}`} cx={col*76+14} cy={row*78+14} r="0.8" fill="#ffffff05"/>
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

        {/* Bottom pill strip — quick agent access */}
        <div className="fixed bottom-0 left-0 right-0 z-30 pb-5 px-6 flex justify-center">
          <div className="flex gap-1.5 overflow-x-auto px-4 py-3 rounded-full"
            style={{background:"rgba(3,0,5,0.88)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",border:"1px solid rgba(255,255,255,0.06)"}}>
            {agents.map(a=>(
              <button key={a.id} onClick={()=>{setSelected(p=>p?.id===a.id?null:a);setTab("overview");}}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-mono uppercase whitespace-nowrap cursor-pointer"
                style={{background:selected?.id===a.id?`rgba(${hexToRgb(a.color)},0.2)`:"transparent",border:`1px solid ${selected?.id===a.id?a.color:"transparent"}`,color:selected?.id===a.id?a.color:"#374151",transition:"all 0.22s cubic-bezier(0.32,0.72,0,1)"}}>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{background:a.color}}/>
                {a.name.split(" ")[0]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Modal — rendered outside layout so it floats above everything */}
      {selected&&(
        <AgentModal key={selected.id} agent={selected} tab={tab} onTabChange={setTab} onClose={()=>setSelected(null)}/>
      )}
    </>
  );
}
