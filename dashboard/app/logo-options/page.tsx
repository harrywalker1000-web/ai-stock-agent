// Logo picker — 10 candlestick-H options. Visit /logo-options to preview.
export default function LogoOptions() {
  const options = [
    {
      id: "A",
      label: "Option A — Bullish Run",
      desc: "Candles rise left→right, green dominant, realistic chart feel",
      svg: (
        <svg width="90" height="54" viewBox="0 0 90 54" fill="none">
          <line x1="0" y1="18" x2="90" y2="18" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" strokeDasharray="3,4"/>
          <line x1="0" y1="36" x2="90" y2="36" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" strokeDasharray="3,4"/>
          {/* Left bar: ascending candles */}
          <line x1="5" y1="2" x2="5" y2="52" stroke="#EF4444" strokeWidth="1" strokeLinecap="round"/>
          <rect x="2" y="28" width="6" height="20" rx="0.5" fill="#EF4444"/>
          <line x1="14" y1="2" x2="14" y2="50" stroke="#10B981" strokeWidth="1" strokeLinecap="round"/>
          <rect x="11" y="18" width="6" height="24" rx="0.5" fill="#10B981"/>
          <line x1="23" y1="2" x2="23" y2="50" stroke="#10B981" strokeWidth="1" strokeLinecap="round"/>
          <rect x="20" y="6" width="6" height="32" rx="0.5" fill="#10B981"/>
          {/* Crossbar: flat short candles */}
          <line x1="36" y1="19" x2="36" y2="35" stroke="#EF4444" strokeWidth="1" strokeLinecap="round"/>
          <rect x="33" y="22" width="6" height="8" rx="0.5" fill="#EF4444"/>
          <line x1="46" y1="18" x2="46" y2="34" stroke="#10B981" strokeWidth="1" strokeLinecap="round"/>
          <rect x="43" y="21" width="6" height="8" rx="0.5" fill="#10B981"/>
          {/* Right bar: further ascending */}
          <line x1="59" y1="4" x2="59" y2="52" stroke="#10B981" strokeWidth="1" strokeLinecap="round"/>
          <rect x="56" y="12" width="6" height="28" rx="0.5" fill="#10B981"/>
          <line x1="68" y1="2" x2="68" y2="50" stroke="#10B981" strokeWidth="1" strokeLinecap="round"/>
          <rect x="65" y="4" width="6" height="34" rx="0.5" fill="#10B981"/>
          <line x1="77" y1="2" x2="77" y2="50" stroke="#EF4444" strokeWidth="1" strokeLinecap="round"/>
          <rect x="74" y="8" width="6" height="30" rx="0.5" fill="#EF4444"/>
        </svg>
      ),
    },
    {
      id: "B",
      label: "Option B — Volatile Market",
      desc: "Alternating red/green, varied wick lengths, chaotic energy",
      svg: (
        <svg width="90" height="54" viewBox="0 0 90 54" fill="none">
          <line x1="0" y1="18" x2="90" y2="18" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" strokeDasharray="3,4"/>
          <line x1="0" y1="36" x2="90" y2="36" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" strokeDasharray="3,4"/>
          <line x1="5" y1="1" x2="5" y2="53" stroke="#10B981" strokeWidth="1" strokeLinecap="round"/>
          <rect x="2" y="8" width="6" height="32" rx="0.5" fill="#10B981"/>
          <line x1="14" y1="3" x2="14" y2="51" stroke="#EF4444" strokeWidth="1" strokeLinecap="round"/>
          <rect x="11" y="12" width="6" height="28" rx="0.5" fill="#EF4444"/>
          <line x1="23" y1="1" x2="23" y2="52" stroke="#10B981" strokeWidth="1" strokeLinecap="round"/>
          <rect x="20" y="5" width="6" height="36" rx="0.5" fill="#10B981"/>
          <line x1="36" y1="20" x2="36" y2="34" stroke="#EF4444" strokeWidth="1" strokeLinecap="round"/>
          <rect x="33" y="23" width="6" height="7" rx="0.5" fill="#EF4444"/>
          <line x1="46" y1="18" x2="46" y2="36" stroke="#10B981" strokeWidth="1" strokeLinecap="round"/>
          <rect x="43" y="21" width="6" height="9" rx="0.5" fill="#10B981"/>
          <line x1="59" y1="2" x2="59" y2="52" stroke="#EF4444" strokeWidth="1" strokeLinecap="round"/>
          <rect x="56" y="10" width="6" height="30" rx="0.5" fill="#EF4444"/>
          <line x1="68" y1="1" x2="68" y2="53" stroke="#10B981" strokeWidth="1" strokeLinecap="round"/>
          <rect x="65" y="3" width="6" height="36" rx="0.5" fill="#10B981"/>
          <line x1="77" y1="3" x2="77" y2="51" stroke="#EF4444" strokeWidth="1" strokeLinecap="round"/>
          <rect x="74" y="14" width="6" height="22" rx="0.5" fill="#EF4444"/>
        </svg>
      ),
    },
    {
      id: "C",
      label: "Option C — Recovery Pattern",
      desc: "Left side dips down, right side rallies up — classic V-recovery",
      svg: (
        <svg width="90" height="54" viewBox="0 0 90 54" fill="none">
          <line x1="0" y1="18" x2="90" y2="18" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" strokeDasharray="3,4"/>
          <line x1="0" y1="36" x2="90" y2="36" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" strokeDasharray="3,4"/>
          <line x1="5" y1="4" x2="5" y2="44" stroke="#10B981" strokeWidth="1" strokeLinecap="round"/>
          <rect x="2" y="8" width="6" height="22" rx="0.5" fill="#10B981"/>
          <line x1="14" y1="6" x2="14" y2="52" stroke="#EF4444" strokeWidth="1" strokeLinecap="round"/>
          <rect x="11" y="14" width="6" height="30" rx="0.5" fill="#EF4444"/>
          <line x1="23" y1="8" x2="23" y2="53" stroke="#EF4444" strokeWidth="1" strokeLinecap="round"/>
          <rect x="20" y="18" width="6" height="32" rx="0.5" fill="#EF4444"/>
          <line x1="36" y1="20" x2="36" y2="34" stroke="#10B981" strokeWidth="1" strokeLinecap="round"/>
          <rect x="33" y="23" width="6" height="7" rx="0.5" fill="#10B981"/>
          <line x1="46" y1="19" x2="46" y2="35" stroke="#EF4444" strokeWidth="1" strokeLinecap="round"/>
          <rect x="43" y="22" width="6" height="8" rx="0.5" fill="#EF4444"/>
          <line x1="59" y1="8" x2="59" y2="52" stroke="#10B981" strokeWidth="1" strokeLinecap="round"/>
          <rect x="56" y="18" width="6" height="28" rx="0.5" fill="#10B981"/>
          <line x1="68" y1="4" x2="68" y2="48" stroke="#10B981" strokeWidth="1" strokeLinecap="round"/>
          <rect x="65" y="10" width="6" height="22" rx="0.5" fill="#10B981"/>
          <line x1="77" y1="2" x2="77" y2="44" stroke="#10B981" strokeWidth="1" strokeLinecap="round"/>
          <rect x="74" y="6" width="6" height="18" rx="0.5" fill="#10B981"/>
        </svg>
      ),
    },
    {
      id: "D",
      label: "Option D — Bold / Thick",
      desc: "Wider, fatter candle bodies — strong and legible at small sizes",
      svg: (
        <svg width="90" height="54" viewBox="0 0 90 54" fill="none">
          <line x1="5" y1="1" x2="5" y2="53" stroke="#10B981" strokeWidth="1.2" strokeLinecap="round"/>
          <rect x="1" y="5" width="8" height="34" rx="1" fill="#10B981"/>
          <line x1="16" y1="2" x2="16" y2="52" stroke="#EF4444" strokeWidth="1.2" strokeLinecap="round"/>
          <rect x="12" y="8" width="8" height="28" rx="1" fill="#EF4444"/>
          <line x1="27" y1="1" x2="27" y2="53" stroke="#10B981" strokeWidth="1.2" strokeLinecap="round"/>
          <rect x="23" y="4" width="8" height="36" rx="1" fill="#10B981"/>
          <line x1="40" y1="19" x2="40" y2="35" stroke="#EF4444" strokeWidth="1.2" strokeLinecap="round"/>
          <rect x="36" y="22" width="8" height="9" rx="1" fill="#EF4444"/>
          <line x1="51" y1="18" x2="51" y2="36" stroke="#10B981" strokeWidth="1.2" strokeLinecap="round"/>
          <rect x="47" y="21" width="8" height="10" rx="1" fill="#10B981"/>
          <line x1="64" y1="2" x2="64" y2="52" stroke="#EF4444" strokeWidth="1.2" strokeLinecap="round"/>
          <rect x="60" y="6" width="8" height="32" rx="1" fill="#EF4444"/>
          <line x1="75" y1="1" x2="75" y2="53" stroke="#10B981" strokeWidth="1.2" strokeLinecap="round"/>
          <rect x="71" y="3" width="8" height="38" rx="1" fill="#10B981"/>
          <line x1="86" y1="2" x2="86" y2="52" stroke="#10B981" strokeWidth="1.2" strokeLinecap="round"/>
          <rect x="82" y="7" width="8" height="30" rx="1" fill="#10B981"/>
        </svg>
      ),
    },
    {
      id: "E",
      label: "Option E — Minimal Wicks",
      desc: "Short wicks, prominent bodies, cleaner/more modern look",
      svg: (
        <svg width="90" height="54" viewBox="0 0 90 54" fill="none">
          <line x1="0" y1="18" x2="90" y2="18" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" strokeDasharray="3,4"/>
          <line x1="0" y1="36" x2="90" y2="36" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" strokeDasharray="3,4"/>
          <line x1="5" y1="4" x2="5" y2="48" stroke="#10B981" strokeWidth="0.8" strokeLinecap="round"/>
          <rect x="2" y="6" width="6" height="28" rx="0.5" fill="#10B981"/>
          <line x1="14" y1="6" x2="14" y2="46" stroke="#EF4444" strokeWidth="0.8" strokeLinecap="round"/>
          <rect x="11" y="9" width="6" height="24" rx="0.5" fill="#EF4444"/>
          <line x1="23" y1="3" x2="23" y2="49" stroke="#10B981" strokeWidth="0.8" strokeLinecap="round"/>
          <rect x="20" y="5" width="6" height="32" rx="0.5" fill="#10B981"/>
          <line x1="36" y1="21" x2="36" y2="33" stroke="#10B981" strokeWidth="0.8" strokeLinecap="round"/>
          <rect x="33" y="23" width="6" height="7" rx="0.5" fill="#10B981"/>
          <line x1="46" y1="20" x2="46" y2="34" stroke="#EF4444" strokeWidth="0.8" strokeLinecap="round"/>
          <rect x="43" y="22" width="6" height="8" rx="0.5" fill="#EF4444"/>
          <line x1="59" y1="4" x2="59" y2="48" stroke="#EF4444" strokeWidth="0.8" strokeLinecap="round"/>
          <rect x="56" y="7" width="6" height="28" rx="0.5" fill="#EF4444"/>
          <line x1="68" y1="3" x2="68" y2="50" stroke="#10B981" strokeWidth="0.8" strokeLinecap="round"/>
          <rect x="65" y="5" width="6" height="36" rx="0.5" fill="#10B981"/>
          <line x1="77" y1="5" x2="77" y2="47" stroke="#10B981" strokeWidth="0.8" strokeLinecap="round"/>
          <rect x="74" y="8" width="6" height="26" rx="0.5" fill="#10B981"/>
        </svg>
      ),
    },
    {
      id: "F",
      label: "Option F — Mostly Green",
      desc: "Bullish bias — 6 green / 2 red. Optimistic fund feel.",
      svg: (
        <svg width="90" height="54" viewBox="0 0 90 54" fill="none">
          <line x1="0" y1="18" x2="90" y2="18" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" strokeDasharray="3,4"/>
          <line x1="0" y1="36" x2="90" y2="36" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" strokeDasharray="3,4"/>
          <line x1="5" y1="1" x2="5" y2="53" stroke="#10B981" strokeWidth="1" strokeLinecap="round"/>
          <rect x="2" y="4" width="6" height="34" rx="0.5" fill="#10B981"/>
          <line x1="14" y1="3" x2="14" y2="51" stroke="#EF4444" strokeWidth="1" strokeLinecap="round"/>
          <rect x="11" y="14" width="6" height="24" rx="0.5" fill="#EF4444"/>
          <line x1="23" y1="2" x2="23" y2="52" stroke="#10B981" strokeWidth="1" strokeLinecap="round"/>
          <rect x="20" y="5" width="6" height="38" rx="0.5" fill="#10B981"/>
          <line x1="36" y1="19" x2="36" y2="35" stroke="#10B981" strokeWidth="1" strokeLinecap="round"/>
          <rect x="33" y="22" width="6" height="8" rx="0.5" fill="#10B981"/>
          <line x1="46" y1="18" x2="46" y2="36" stroke="#EF4444" strokeWidth="1" strokeLinecap="round"/>
          <rect x="43" y="21" width="6" height="9" rx="0.5" fill="#EF4444"/>
          <line x1="59" y1="2" x2="59" y2="52" stroke="#10B981" strokeWidth="1" strokeLinecap="round"/>
          <rect x="56" y="6" width="6" height="36" rx="0.5" fill="#10B981"/>
          <line x1="68" y1="1" x2="68" y2="53" stroke="#10B981" strokeWidth="1" strokeLinecap="round"/>
          <rect x="65" y="3" width="6" height="40" rx="0.5" fill="#10B981"/>
          <line x1="77" y1="2" x2="77" y2="52" stroke="#10B981" strokeWidth="1" strokeLinecap="round"/>
          <rect x="74" y="6" width="6" height="32" rx="0.5" fill="#10B981"/>
        </svg>
      ),
    },
    {
      id: "G",
      label: "Option G — Staircase",
      desc: "Left bar steps up, right bar steps down — classic double top / stable",
      svg: (
        <svg width="90" height="54" viewBox="0 0 90 54" fill="none">
          <line x1="0" y1="18" x2="90" y2="18" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" strokeDasharray="3,4"/>
          <line x1="0" y1="36" x2="90" y2="36" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" strokeDasharray="3,4"/>
          <line x1="5" y1="10" x2="5" y2="50" stroke="#EF4444" strokeWidth="1" strokeLinecap="round"/>
          <rect x="2" y="20" width="6" height="20" rx="0.5" fill="#EF4444"/>
          <line x1="14" y1="5" x2="14" y2="50" stroke="#10B981" strokeWidth="1" strokeLinecap="round"/>
          <rect x="11" y="12" width="6" height="28" rx="0.5" fill="#10B981"/>
          <line x1="23" y1="2" x2="23" y2="50" stroke="#10B981" strokeWidth="1" strokeLinecap="round"/>
          <rect x="20" y="5" width="6" height="36" rx="0.5" fill="#10B981"/>
          <line x1="36" y1="19" x2="36" y2="35" stroke="#10B981" strokeWidth="1" strokeLinecap="round"/>
          <rect x="33" y="22" width="6" height="7" rx="0.5" fill="#10B981"/>
          <line x1="46" y1="19" x2="46" y2="35" stroke="#EF4444" strokeWidth="1" strokeLinecap="round"/>
          <rect x="43" y="22" width="6" height="7" rx="0.5" fill="#EF4444"/>
          <line x1="59" y1="2" x2="59" y2="50" stroke="#10B981" strokeWidth="1" strokeLinecap="round"/>
          <rect x="56" y="5" width="6" height="36" rx="0.5" fill="#10B981"/>
          <line x1="68" y1="5" x2="68" y2="50" stroke="#EF4444" strokeWidth="1" strokeLinecap="round"/>
          <rect x="65" y="12" width="6" height="28" rx="0.5" fill="#EF4444"/>
          <line x1="77" y1="10" x2="77" y2="50" stroke="#10B981" strokeWidth="1" strokeLinecap="round"/>
          <rect x="74" y="20" width="6" height="20" rx="0.5" fill="#10B981"/>
        </svg>
      ),
    },
    {
      id: "H",
      label: "Option H — Narrow/Condensed",
      desc: "10 candles, tighter spacing, denser chart look",
      svg: (
        <svg width="90" height="54" viewBox="0 0 90 54" fill="none">
          <line x1="0" y1="18" x2="90" y2="18" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" strokeDasharray="3,4"/>
          <line x1="0" y1="36" x2="90" y2="36" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" strokeDasharray="3,4"/>
          <line x1="4"  y1="2"  x2="4"  y2="52" stroke="#10B981" strokeWidth="0.8" strokeLinecap="round"/>
          <rect x="2"  y="6"  width="4" height="30" rx="0.5" fill="#10B981"/>
          <line x1="10" y1="3"  x2="10" y2="51" stroke="#EF4444" strokeWidth="0.8" strokeLinecap="round"/>
          <rect x="8"  y="10" width="4" height="26" rx="0.5" fill="#EF4444"/>
          <line x1="16" y1="1"  x2="16" y2="53" stroke="#10B981" strokeWidth="0.8" strokeLinecap="round"/>
          <rect x="14" y="4"  width="4" height="36" rx="0.5" fill="#10B981"/>
          <line x1="22" y1="3"  x2="22" y2="51" stroke="#10B981" strokeWidth="0.8" strokeLinecap="round"/>
          <rect x="20" y="8"  width="4" height="28" rx="0.5" fill="#10B981"/>
          <line x1="32" y1="20" x2="32" y2="34" stroke="#EF4444" strokeWidth="0.8" strokeLinecap="round"/>
          <rect x="30" y="22" width="4" height="8"  rx="0.5" fill="#EF4444"/>
          <line x1="38" y1="19" x2="38" y2="35" stroke="#10B981" strokeWidth="0.8" strokeLinecap="round"/>
          <rect x="36" y="21" width="4" height="9"  rx="0.5" fill="#10B981"/>
          <line x1="48" y1="2"  x2="48" y2="52" stroke="#10B981" strokeWidth="0.8" strokeLinecap="round"/>
          <rect x="46" y="5"  width="4" height="34" rx="0.5" fill="#10B981"/>
          <line x1="54" y1="3"  x2="54" y2="51" stroke="#EF4444" strokeWidth="0.8" strokeLinecap="round"/>
          <rect x="52" y="9"  width="4" height="28" rx="0.5" fill="#EF4444"/>
          <line x1="60" y1="1"  x2="60" y2="53" stroke="#10B981" strokeWidth="0.8" strokeLinecap="round"/>
          <rect x="58" y="3"  width="4" height="38" rx="0.5" fill="#10B981"/>
          <line x1="66" y1="2"  x2="66" y2="52" stroke="#10B981" strokeWidth="0.8" strokeLinecap="round"/>
          <rect x="64" y="6"  width="4" height="32" rx="0.5" fill="#10B981"/>
        </svg>
      ),
    },
    {
      id: "I",
      label: "Option I — Sky Blue accent",
      desc: "Green/blue palette — left bar blue, crossbar mixed, right bar green",
      svg: (
        <svg width="90" height="54" viewBox="0 0 90 54" fill="none">
          <line x1="0" y1="18" x2="90" y2="18" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" strokeDasharray="3,4"/>
          <line x1="0" y1="36" x2="90" y2="36" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" strokeDasharray="3,4"/>
          <line x1="5"  y1="2"  x2="5"  y2="52" stroke="#0EA5E9" strokeWidth="1" strokeLinecap="round"/>
          <rect x="2"  y="6"  width="6" height="32" rx="0.5" fill="#0EA5E9"/>
          <line x1="14" y1="1"  x2="14" y2="53" stroke="#0EA5E9" strokeWidth="1" strokeLinecap="round"/>
          <rect x="11" y="4"  width="6" height="36" rx="0.5" fill="#0EA5E9"/>
          <line x1="23" y1="3"  x2="23" y2="51" stroke="#3B82F6" strokeWidth="1" strokeLinecap="round"/>
          <rect x="20" y="8"  width="6" height="28" rx="0.5" fill="#3B82F6"/>
          <line x1="36" y1="19" x2="36" y2="35" stroke="#EF4444" strokeWidth="1" strokeLinecap="round"/>
          <rect x="33" y="22" width="6" height="7"  rx="0.5" fill="#EF4444"/>
          <line x1="46" y1="18" x2="46" y2="36" stroke="#10B981" strokeWidth="1" strokeLinecap="round"/>
          <rect x="43" y="21" width="6" height="9"  rx="0.5" fill="#10B981"/>
          <line x1="59" y1="2"  x2="59" y2="52" stroke="#10B981" strokeWidth="1" strokeLinecap="round"/>
          <rect x="56" y="5"  width="6" height="36" rx="0.5" fill="#10B981"/>
          <line x1="68" y1="1"  x2="68" y2="53" stroke="#10B981" strokeWidth="1" strokeLinecap="round"/>
          <rect x="65" y="3"  width="6" height="40" rx="0.5" fill="#10B981"/>
          <line x1="77" y1="3"  x2="77" y2="51" stroke="#10B981" strokeWidth="1" strokeLinecap="round"/>
          <rect x="74" y="7"  width="6" height="28" rx="0.5" fill="#10B981"/>
        </svg>
      ),
    },
    {
      id: "J",
      label: "Option J — Wide H (current + polished)",
      desc: "Original 3+2+3 pattern but with organic height variation and longer wicks",
      svg: (
        <svg width="90" height="54" viewBox="0 0 90 54" fill="none">
          <line x1="0" y1="18" x2="90" y2="18" stroke="rgba(255,255,255,0.07)" strokeWidth="0.5" strokeDasharray="2,3"/>
          <line x1="0" y1="36" x2="90" y2="36" stroke="rgba(255,255,255,0.07)" strokeWidth="0.5" strokeDasharray="2,3"/>
          <line x1="5"  y1="1"  x2="5"  y2="53" stroke="#10B981" strokeWidth="1.2" strokeLinecap="round"/>
          <rect x="2"  y="4"  width="6" height="42" rx="0.5" fill="#10B981"/>
          <line x1="16" y1="2"  x2="16" y2="52" stroke="#EF4444" strokeWidth="1.2" strokeLinecap="round"/>
          <rect x="13" y="8"  width="6" height="30" rx="0.5" fill="#EF4444"/>
          <line x1="27" y1="1"  x2="27" y2="53" stroke="#10B981" strokeWidth="1.2" strokeLinecap="round"/>
          <rect x="24" y="3"  width="6" height="44" rx="0.5" fill="#10B981"/>
          <line x1="40" y1="16" x2="40" y2="38" stroke="#EF4444" strokeWidth="1.2" strokeLinecap="round"/>
          <rect x="37" y="20" width="6" height="10" rx="0.5" fill="#EF4444"/>
          <line x1="51" y1="15" x2="51" y2="39" stroke="#10B981" strokeWidth="1.2" strokeLinecap="round"/>
          <rect x="48" y="19" width="6" height="12" rx="0.5" fill="#10B981"/>
          <line x1="64" y1="1"  x2="64" y2="53" stroke="#EF4444" strokeWidth="1.2" strokeLinecap="round"/>
          <rect x="61" y="5"  width="6" height="38" rx="0.5" fill="#EF4444"/>
          <line x1="75" y1="2"  x2="75" y2="52" stroke="#10B981" strokeWidth="1.2" strokeLinecap="round"/>
          <rect x="72" y="4"  width="6" height="44" rx="0.5" fill="#10B981"/>
          <line x1="86" y1="2"  x2="86" y2="52" stroke="#10B981" strokeWidth="1.2" strokeLinecap="round"/>
          <rect x="83" y="7"  width="6" height="32" rx="0.5" fill="#10B981"/>
        </svg>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-[#080C10] py-12 px-6">
      <div className="max-w-5xl mx-auto">
        <h1 className="font-display text-3xl font-bold text-[#E8EDF2] mb-2">Logo Options</h1>
        <p className="text-[#6B7280] mb-10 text-sm">
          10 candlestick-H logo variations. Each forms the letter H from OHLC candles with wicks.<br/>
          Let me know which one you want and I&apos;ll drop it in the navbar.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
          {options.map((o) => (
            <div key={o.id} className="rounded-2xl border border-white/08 bg-white/03 p-5 flex flex-col items-center gap-3 hover:border-[#0EA5E9]/40 transition-all">
              <div className="rounded-xl bg-[#0A0F14] p-4 flex items-center justify-center" style={{ width: 130, height: 80 }}>
                {o.svg}
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-[#E8EDF2]">{o.label}</p>
                <p className="text-xs text-[#6B7280] mt-1 leading-snug">{o.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-[#4B5563] mt-10">
          This page is for internal use only — visit <span className="text-[#6B7280]">/logo-options</span> in the browser.
        </p>
      </div>
    </div>
  );
}
