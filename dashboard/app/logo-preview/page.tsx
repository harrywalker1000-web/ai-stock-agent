"use client";

// 10 logos — navigation, AI, scanning, agent themes

// 1. Compass Refined — cleaner version of the one you liked, sharper north arrow
function L1() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
      <circle cx="22" cy="22" r="19" stroke="#E8EDF2" strokeWidth="1" opacity="0.15"/>
      <circle cx="22" cy="22" r="13" stroke="#0EA5E9" strokeWidth="1" opacity="0.3"/>
      <line x1="22" y1="4" x2="22" y2="40" stroke="#E8EDF2" strokeWidth="0.6" opacity="0.2"/>
      <line x1="4" y1="22" x2="40" y2="22" stroke="#E8EDF2" strokeWidth="0.6" opacity="0.2"/>
      {/* North — green */}
      <polygon points="22,5 25.5,22 22,19 18.5,22" fill="#10B981"/>
      {/* South — dim */}
      <polygon points="22,39 18.5,22 22,25 25.5,22" fill="#E8EDF2" opacity="0.25"/>
      {/* East / West nubs */}
      <polygon points="39,22 22,18.5 25,22 22,25.5" fill="#E8EDF2" opacity="0.25"/>
      <polygon points="5,22 22,25.5 19,22 22,18.5" fill="#E8EDF2" opacity="0.25"/>
      <circle cx="22" cy="22" r="2.5" fill="#0EA5E9"/>
      {/* Tick marks */}
      <line x1="22" y1="9" x2="22" y2="12" stroke="#E8EDF2" strokeWidth="1" opacity="0.5"/>
      <line x1="22" y1="32" x2="22" y2="35" stroke="#E8EDF2" strokeWidth="1" opacity="0.3"/>
      <line x1="9" y1="22" x2="12" y2="22" stroke="#E8EDF2" strokeWidth="1" opacity="0.3"/>
      <line x1="32" y1="22" x2="35" y2="22" stroke="#E8EDF2" strokeWidth="1" opacity="0.3"/>
    </svg>
  );
}

// 2. Radar Sweep — sonar/radar circle with a rotating sweep line and blips
function L2() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
      <circle cx="22" cy="22" r="18" stroke="#10B981" strokeWidth="1" opacity="0.3"/>
      <circle cx="22" cy="22" r="12" stroke="#10B981" strokeWidth="0.8" opacity="0.2"/>
      <circle cx="22" cy="22" r="6" stroke="#10B981" strokeWidth="0.8" opacity="0.2"/>
      <line x1="22" y1="4" x2="22" y2="40" stroke="#E8EDF2" strokeWidth="0.5" opacity="0.15"/>
      <line x1="4" y1="22" x2="40" y2="22" stroke="#E8EDF2" strokeWidth="0.5" opacity="0.15"/>
      {/* Sweep wedge */}
      <path d="M22 22 L38 10 A18 18 0 0 1 40 22 Z" fill="#10B981" fillOpacity="0.12"/>
      <line x1="22" y1="22" x2="38" y2="10" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round" opacity="0.8"/>
      {/* Blips */}
      <circle cx="32" cy="16" r="2" fill="#10B981" opacity="0.9"/>
      <circle cx="14" cy="28" r="1.5" fill="#10B981" opacity="0.5"/>
      <circle cx="29" cy="30" r="1" fill="#10B981" opacity="0.3"/>
      <circle cx="22" cy="22" r="2" fill="#0EA5E9"/>
    </svg>
  );
}

// 3. Eye Scanner — the eye you liked, with horizontal scan lines
function L3() {
  return (
    <svg width="48" height="36" viewBox="0 0 48 36" fill="none">
      <path d="M4 18 C10 5 38 5 44 18 C38 31 10 31 4 18 Z" stroke="#0EA5E9" strokeWidth="1.5" fill="none"/>
      <circle cx="24" cy="18" r="8" stroke="#E8EDF2" strokeWidth="0.8" fill="none" opacity="0.3"/>
      <circle cx="24" cy="18" r="5" fill="#0EA5E9" opacity="0.9"/>
      <circle cx="26" cy="16" r="1.5" fill="#E8EDF2" opacity="0.8"/>
      {/* Scan lines */}
      <line x1="8" y1="14" x2="40" y2="14" stroke="#0EA5E9" strokeWidth="0.6" opacity="0.35"/>
      <line x1="5" y1="18" x2="43" y2="18" stroke="#0EA5E9" strokeWidth="0.6" opacity="0.35"/>
      <line x1="8" y1="22" x2="40" y2="22" stroke="#0EA5E9" strokeWidth="0.6" opacity="0.35"/>
      {/* Corner brackets */}
      <path d="M2 12 L2 6 L8 6" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <path d="M46 12 L46 6 L40 6" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <path d="M2 24 L2 30 L8 30" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <path d="M46 24 L46 30 L40 30" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

// 4. Neural Net — connected nodes in a layered network pattern
function L4() {
  return (
    <svg width="48" height="40" viewBox="0 0 48 40" fill="none">
      {/* Connections */}
      <line x1="8" y1="10" x2="24" y2="8" stroke="#0EA5E9" strokeWidth="0.8" opacity="0.4"/>
      <line x1="8" y1="20" x2="24" y2="8" stroke="#0EA5E9" strokeWidth="0.8" opacity="0.4"/>
      <line x1="8" y1="20" x2="24" y2="20" stroke="#0EA5E9" strokeWidth="0.8" opacity="0.4"/>
      <line x1="8" y1="30" x2="24" y2="20" stroke="#0EA5E9" strokeWidth="0.8" opacity="0.4"/>
      <line x1="8" y1="30" x2="24" y2="32" stroke="#0EA5E9" strokeWidth="0.8" opacity="0.4"/>
      <line x1="8" y1="10" x2="24" y2="20" stroke="#0EA5E9" strokeWidth="0.8" opacity="0.2"/>
      <line x1="24" y1="8" x2="40" y2="14" stroke="#10B981" strokeWidth="0.8" opacity="0.5"/>
      <line x1="24" y1="20" x2="40" y2="14" stroke="#10B981" strokeWidth="0.8" opacity="0.5"/>
      <line x1="24" y1="20" x2="40" y2="26" stroke="#10B981" strokeWidth="0.8" opacity="0.5"/>
      <line x1="24" y1="32" x2="40" y2="26" stroke="#10B981" strokeWidth="0.8" opacity="0.5"/>
      {/* Input nodes */}
      <circle cx="8" cy="10" r="3" fill="#E8EDF2" opacity="0.7"/>
      <circle cx="8" cy="20" r="3" fill="#E8EDF2" opacity="0.7"/>
      <circle cx="8" cy="30" r="3" fill="#E8EDF2" opacity="0.7"/>
      {/* Hidden nodes */}
      <circle cx="24" cy="8" r="3.5" fill="#0EA5E9"/>
      <circle cx="24" cy="20" r="3.5" fill="#0EA5E9"/>
      <circle cx="24" cy="32" r="3.5" fill="#0EA5E9"/>
      {/* Output nodes */}
      <circle cx="40" cy="14" r="3" fill="#10B981"/>
      <circle cx="40" cy="26" r="3" fill="#10B981"/>
    </svg>
  );
}

// 5. Crosshair Target — precision targeting reticle with data ticks
function L5() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
      <circle cx="22" cy="22" r="16" stroke="#EF4444" strokeWidth="1.2" fill="none"/>
      <circle cx="22" cy="22" r="8" stroke="#EF4444" strokeWidth="1" fill="none" opacity="0.6"/>
      <circle cx="22" cy="22" r="2.5" fill="#EF4444"/>
      <line x1="22" y1="4" x2="22" y2="14" stroke="#E8EDF2" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="22" y1="30" x2="22" y2="40" stroke="#E8EDF2" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="4" y1="22" x2="14" y2="22" stroke="#E8EDF2" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="30" y1="22" x2="40" y2="22" stroke="#E8EDF2" strokeWidth="1.5" strokeLinecap="round"/>
      {/* Tick marks on outer ring */}
      <line x1="22" y1="6" x2="22" y2="9" stroke="#EF4444" strokeWidth="1" opacity="0.5"/>
      <line x1="38" y1="22" x2="35" y2="22" stroke="#EF4444" strokeWidth="1" opacity="0.5"/>
    </svg>
  );
}

// 6. Atom / Orbital — three elliptical orbits around a nucleus dot
function L6() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
      <ellipse cx="22" cy="22" rx="18" ry="7" stroke="#0EA5E9" strokeWidth="1.2" fill="none"/>
      <ellipse cx="22" cy="22" rx="18" ry="7" stroke="#0EA5E9" strokeWidth="1.2" fill="none" transform="rotate(60 22 22)"/>
      <ellipse cx="22" cy="22" rx="18" ry="7" stroke="#0EA5E9" strokeWidth="1.2" fill="none" transform="rotate(120 22 22)"/>
      <circle cx="22" cy="22" r="3.5" fill="#E8EDF2"/>
      {/* Electron dots */}
      <circle cx="40" cy="22" r="2" fill="#10B981"/>
      <circle cx="13" cy="8" r="2" fill="#10B981"/>
      <circle cx="13" cy="36" r="2" fill="#10B981"/>
    </svg>
  );
}

// 7. Signal / Pulse — wifi-style arc signal emanating from a centre point
function L7() {
  return (
    <svg width="44" height="36" viewBox="0 0 44 44" fill="none">
      {/* Outer arc */}
      <path d="M6 32 A22 22 0 0 1 38 32" stroke="#0EA5E9" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
      {/* Mid arc */}
      <path d="M12 32 A14 14 0 0 1 32 32" stroke="#0EA5E9" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.6"/>
      {/* Inner arc */}
      <path d="M17 32 A8 8 0 0 1 27 32" stroke="#10B981" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
      {/* Origin dot */}
      <circle cx="22" cy="32" r="3" fill="#10B981"/>
    </svg>
  );
}

// 8. Fingerprint — concentric irregular arcs forming abstract fingerprint
function L8() {
  return (
    <svg width="40" height="44" viewBox="0 0 40 44" fill="none">
      <path d="M20 42 C6 42 2 34 2 26 C2 14 10 6 20 6 C30 6 38 14 38 26 C38 34 34 42 20 42 Z" stroke="#E8EDF2" strokeWidth="1" fill="none" opacity="0.2"/>
      <path d="M20 36 C10 36 7 30 7 24 C7 17 13 12 20 12 C27 12 33 17 33 24 C33 30 30 36 20 36 Z" stroke="#0EA5E9" strokeWidth="1" fill="none" opacity="0.5"/>
      <path d="M20 30 C14 30 12 26 12 22 C12 18 15 15 20 15 C25 15 28 18 28 22 C28 26 26 30 20 30 Z" stroke="#0EA5E9" strokeWidth="1" fill="none" opacity="0.7"/>
      <path d="M20 24 C17 24 16 22 16 20 C16 18 17.5 17 20 17 C22.5 17 24 18 24 20 C24 22 23 24 20 24 Z" stroke="#10B981" strokeWidth="1.2" fill="none"/>
      <circle cx="20" cy="20" r="2" fill="#10B981"/>
      {/* Break lines suggesting unique pattern */}
      <line x1="2" y1="26" x2="6" y2="26" stroke="#080C10" strokeWidth="2"/>
      <line x1="12" y1="38" x2="14" y2="34" stroke="#080C10" strokeWidth="2"/>
      <line x1="30" y1="10" x2="32" y2="14" stroke="#080C10" strokeWidth="2"/>
    </svg>
  );
}

// 9. Satellite — satellite dish pointing upward with signal arcs
function L9() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
      {/* Dish bowl */}
      <path d="M8 32 Q22 14 36 32" stroke="#E8EDF2" strokeWidth="2" strokeLinecap="round" fill="none"/>
      <line x1="22" y1="23" x2="22" y2="32" stroke="#E8EDF2" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
      {/* Base */}
      <line x1="16" y1="38" x2="28" y2="38" stroke="#E8EDF2" strokeWidth="2" strokeLinecap="round" opacity="0.6"/>
      <line x1="22" y1="32" x2="22" y2="38" stroke="#E8EDF2" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
      {/* Signal arcs */}
      <path d="M26 10 A8 8 0 0 1 34 18" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      <path d="M28 6 A13 13 0 0 1 38 22" stroke="#10B981" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.6"/>
      {/* Focus point */}
      <circle cx="22" cy="22" r="2.5" fill="#0EA5E9"/>
    </svg>
  );
}

// 10. Prism — triangular prism splitting white light into spectrum
function L10() {
  return (
    <svg width="48" height="40" viewBox="0 0 48 40" fill="none">
      {/* Prism triangle */}
      <path d="M24 4 L44 36 L4 36 Z" stroke="#E8EDF2" strokeWidth="1.5" fill="none" strokeLinejoin="round" opacity="0.8"/>
      {/* Input beam */}
      <line x1="4" y1="20" x2="16" y2="20" stroke="#E8EDF2" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
      {/* Output spectrum rays */}
      <line x1="28" y1="20" x2="44" y2="14" stroke="#EF4444" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="28" y1="20" x2="44" y2="18" stroke="#F59E0B" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="28" y1="20" x2="44" y2="22" stroke="#10B981" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="28" y1="20" x2="44" y2="26" stroke="#0EA5E9" strokeWidth="1.2" strokeLinecap="round"/>
      {/* Refraction dot */}
      <circle cx="22" cy="20" r="2" fill="#E8EDF2" opacity="0.6"/>
    </svg>
  );
}

const LOGOS = [
  { id: 1, name: "Compass+", desc: "Refined compass — sharper north arrow, tick marks, dual rings.", C: L1 },
  { id: 2, name: "Radar", desc: "Sonar sweep with a glowing wedge and target blips.", C: L2 },
  { id: 3, name: "Eye Scanner", desc: "Eye with scan lines and corner targeting brackets.", C: L3 },
  { id: 4, name: "Neural Net", desc: "3-layer connected nodes — input, hidden, output.", C: L4 },
  { id: 5, name: "Crosshair", desc: "Precision targeting reticle. Red and clean.", C: L5 },
  { id: 6, name: "Atom", desc: "Triple orbital rings with electron dots around a nucleus.", C: L6 },
  { id: 7, name: "Signal", desc: "Wifi-style arcs from a centre point. Green/blue.", C: L7 },
  { id: 8, name: "Fingerprint", desc: "Concentric arcs forming a unique identity mark.", C: L8 },
  { id: 9, name: "Satellite", desc: "Dish pointing up with green signal arcs.", C: L9 },
  { id: 10, name: "Prism", desc: "Triangle splitting light into a colour spectrum.", C: L10 },
];

export default function LogoPreviewPage() {
  return (
    <div className="min-h-screen bg-[#080C10] pb-24">
      <div className="max-w-5xl mx-auto px-6 pt-12">
        <h1 className="font-display text-3xl font-bold text-[#E8EDF2] mb-2">Logo Options</h1>
        <p className="text-[#6B7280] text-sm mb-10">Compass, scanning, AI, agent themes. Tell me the number to apply.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {LOGOS.map(({ id, name, desc, C }) => (
            <div key={id} className="card p-5 flex flex-col items-center gap-4 hover:border-[#0EA5E9]/40 transition-colors cursor-default">
              <div className="w-28 h-28 flex items-center justify-center rounded-xl bg-white/[0.03] border border-white/06">
                <div style={{ transform: "scale(2)", transformOrigin: "center" }}>
                  <C />
                </div>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-mono text-[#0EA5E9] mb-0.5">#{id}</p>
                <p className="text-xs font-bold text-[#E8EDF2]">{name}</p>
                <p className="text-[10px] text-[#6B7280] mt-1 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-center text-[#6B7280] text-xs mt-10">Reply with a number and I'll apply it to the navbar.</p>
      </div>
    </div>
  );
}
