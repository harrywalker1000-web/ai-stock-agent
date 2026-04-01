"use client";

// 10 logo concepts for HAZ CAPITAL — dark finance dashboard aesthetic

// 1. Candle H — two tall green candle bodies as H pillars, blue crossbar
function L1() {
  return (
    <svg width="48" height="40" viewBox="0 0 48 40" fill="none">
      <line x1="8" y1="2" x2="8" y2="38" stroke="#10B981" strokeWidth="1.2" strokeLinecap="round"/>
      <rect x="4" y="8" width="8" height="24" rx="1" fill="#10B981"/>
      <rect x="16" y="17" width="16" height="6" rx="1.5" fill="#0EA5E9"/>
      <line x1="40" y1="2" x2="40" y2="38" stroke="#10B981" strokeWidth="1.2" strokeLinecap="round"/>
      <rect x="36" y="8" width="8" height="24" rx="1" fill="#10B981"/>
    </svg>
  );
}

// 2. Arrow Candle — single fat upward candle, wick becomes an arrowhead
function L2() {
  return (
    <svg width="40" height="44" viewBox="0 0 40 44" fill="none">
      <rect x="12" y="18" width="16" height="22" rx="1.5" fill="#10B981"/>
      <line x1="20" y1="18" x2="20" y2="4" stroke="#10B981" strokeWidth="2" strokeLinecap="round"/>
      <polyline points="13,10 20,2 27,10" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <line x1="20" y1="40" x2="20" y2="44" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
    </svg>
  );
}

// 3. Three Bars — ascending bar chart, bold and minimal, institutional
function L3() {
  return (
    <svg width="44" height="36" viewBox="0 0 44 36" fill="none">
      <line x1="6" y1="18" x2="6" y2="28" stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round"/>
      <rect x="2" y="22" width="8" height="13" rx="1" fill="#EF4444"/>
      <line x1="22" y1="10" x2="22" y2="22" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round"/>
      <rect x="18" y="14" width="8" height="21" rx="1" fill="#10B981"/>
      <line x1="38" y1="2" x2="38" y2="14" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round"/>
      <rect x="34" y="5" width="8" height="30" rx="1" fill="#10B981"/>
    </svg>
  );
}

// 4. Diamond Chart — rotated square outline, price line inside
function L4() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
      <path d="M22 3 L41 22 L22 41 L3 22 Z" stroke="#0EA5E9" strokeWidth="1.5" fill="none"/>
      <polyline points="10,26 16,20 22,24 28,14 34,18" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="28" cy="14" r="2" fill="#10B981"/>
    </svg>
  );
}

// 5. Hexagon — hex border, minimal candle chart inside
function L5() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
      <path d="M22 3 L39 12.5 L39 31.5 L22 41 L5 31.5 L5 12.5 Z" stroke="#0EA5E9" strokeWidth="1.5" fill="none" strokeLinejoin="round"/>
      <rect x="13" y="25" width="4" height="8" rx="0.5" fill="#EF4444"/>
      <line x1="15" y1="21" x2="15" y2="25" stroke="#EF4444" strokeWidth="1" strokeLinecap="round"/>
      <line x1="15" y1="33" x2="15" y2="36" stroke="#EF4444" strokeWidth="1" strokeLinecap="round"/>
      <rect x="20" y="18" width="4" height="11" rx="0.5" fill="#10B981"/>
      <line x1="22" y1="13" x2="22" y2="18" stroke="#10B981" strokeWidth="1" strokeLinecap="round"/>
      <line x1="22" y1="29" x2="22" y2="33" stroke="#10B981" strokeWidth="1" strokeLinecap="round"/>
      <rect x="27" y="12" width="4" height="14" rx="0.5" fill="#10B981"/>
      <line x1="29" y1="8" x2="29" y2="12" stroke="#10B981" strokeWidth="1" strokeLinecap="round"/>
      <line x1="29" y1="26" x2="29" y2="30" stroke="#10B981" strokeWidth="1" strokeLinecap="round"/>
    </svg>
  );
}

// 6. Crown — three upward candles arranged like a crown, centre tallest
function L6() {
  return (
    <svg width="48" height="40" viewBox="0 0 48 40" fill="none">
      <line x1="8" y1="14" x2="8" y2="26" stroke="#10B981" strokeWidth="1.2" strokeLinecap="round"/>
      <rect x="4" y="18" width="8" height="18" rx="1" fill="#10B981"/>
      <line x1="24" y1="4" x2="24" y2="16" stroke="#10B981" strokeWidth="1.2" strokeLinecap="round"/>
      <rect x="20" y="8" width="8" height="28" rx="1" fill="#10B981"/>
      <line x1="40" y1="14" x2="40" y2="26" stroke="#10B981" strokeWidth="1.2" strokeLinecap="round"/>
      <rect x="36" y="18" width="8" height="18" rx="1" fill="#10B981"/>
      <line x1="4" y1="36" x2="44" y2="36" stroke="#0EA5E9" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
    </svg>
  );
}

// 7. Wave — a price/sine wave that rises left to right, with a dot at peak
function L7() {
  return (
    <svg width="48" height="36" viewBox="0 0 48 36" fill="none">
      <path d="M4 28 C10 28 10 20 16 20 C22 20 22 28 28 28 C34 28 34 8 40 8" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
      <circle cx="40" cy="8" r="3" fill="#10B981"/>
      <line x1="4" y1="33" x2="44" y2="33" stroke="#E8EDF2" strokeWidth="0.8" opacity="0.2"/>
    </svg>
  );
}

// 8. Shield — shield outline with upward candle inside
function L8() {
  return (
    <svg width="40" height="46" viewBox="0 0 40 46" fill="none">
      <path d="M20 3 L37 10 L37 26 C37 35 20 43 20 43 C20 43 3 35 3 26 L3 10 Z" stroke="#0EA5E9" strokeWidth="1.5" fill="none" strokeLinejoin="round"/>
      <line x1="20" y1="13" x2="20" y2="20" stroke="#10B981" strokeWidth="1.2" strokeLinecap="round"/>
      <rect x="16" y="20" width="8" height="12" rx="1" fill="#10B981"/>
      <line x1="20" y1="32" x2="20" y2="36" stroke="#10B981" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

// 9. Monogram H — geometric letter H, clean sans-serif weight, accent corners
function L9() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
      <rect x="4" y="4" width="10" height="32" rx="2" fill="#E8EDF2" fillOpacity="0.9"/>
      <rect x="26" y="4" width="10" height="32" rx="2" fill="#E8EDF2" fillOpacity="0.9"/>
      <rect x="4" y="16" width="32" height="8" rx="2" fill="#0EA5E9"/>
      <rect x="4" y="4" width="3" height="3" rx="0.5" fill="#10B981"/>
      <rect x="33" y="4" width="3" height="3" rx="0.5" fill="#10B981"/>
      <rect x="4" y="33" width="3" height="3" rx="0.5" fill="#10B981"/>
      <rect x="33" y="33" width="3" height="3" rx="0.5" fill="#10B981"/>
    </svg>
  );
}

// 10. Orbit — two concentric arcs (bull/bear) with a candle body at centre
function L10() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
      <path d="M8 22 A14 14 0 0 1 36 22" stroke="#10B981" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
      <path d="M36 22 A14 14 0 0 1 8 22" stroke="#EF4444" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
      <line x1="22" y1="14" x2="22" y2="18" stroke="#E8EDF2" strokeWidth="1.2" strokeLinecap="round"/>
      <rect x="18" y="18" width="8" height="8" rx="1" fill="#0EA5E9"/>
      <line x1="22" y1="26" x2="22" y2="30" stroke="#E8EDF2" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

const LOGOS = [
  { id: 1, name: "Candle H", desc: "Two green candle bodies form the H pillars, blue crossbar.", C: L1 },
  { id: 2, name: "Arrow Candle", desc: "Single bold candle, wick becomes an upward arrow.", C: L2 },
  { id: 3, name: "Three Bars", desc: "Ascending bar chart — red, green, green. Classic and institutional.", C: L3 },
  { id: 4, name: "Diamond", desc: "Rotated square border with a rising price line and peak dot inside.", C: L4 },
  { id: 5, name: "Hexagon", desc: "Hex border enclosing three candles. Tech-finance hybrid.", C: L5 },
  { id: 6, name: "Crown", desc: "Three candles as a crown, centre tallest. Blue baseline.", C: L6 },
  { id: 7, name: "Wave", desc: "Rising sine wave with a glowing peak dot. Fluid and modern.", C: L7 },
  { id: 8, name: "Shield", desc: "Shield outline with a candle inside. Trust and authority.", C: L8 },
  { id: 9, name: "Monogram H", desc: "Bold geometric H with blue crossbar and green corner accents.", C: L9 },
  { id: 10, name: "Orbit", desc: "Bull/bear arcs orbiting a blue candle centre.", C: L10 },
];

export default function LogoPreviewPage() {
  return (
    <div className="min-h-screen bg-[#080C10] pb-24">
      <div className="max-w-5xl mx-auto px-6 pt-12">
        <h1 className="font-display text-3xl font-bold text-[#E8EDF2] mb-2">Logo Options</h1>
        <p className="text-[#6B7280] text-sm mb-10">10 concepts. Reply with the number to apply it.</p>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {LOGOS.map(({ id, name, desc, C }) => (
            <div key={id} className="card p-5 flex flex-col items-center gap-4 hover:border-[#0EA5E9]/40 transition-colors cursor-default">
              {/* Large preview */}
              <div className="w-24 h-24 flex items-center justify-center rounded-xl bg-white/[0.03] border border-white/06">
                <div style={{ transform: "scale(1.8)", transformOrigin: "center" }}>
                  <C />
                </div>
              </div>
              {/* Small inline + label */}
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <C />
                </div>
                <p className="text-[10px] font-mono text-[#0EA5E9] mb-0.5">#{id}</p>
                <p className="text-xs font-bold text-[#E8EDF2]">{name}</p>
                <p className="text-[10px] text-[#6B7280] mt-1 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-center text-[#6B7280] text-xs mt-10">Tell me the number and I'll swap it into the navbar.</p>
      </div>
    </div>
  );
}
