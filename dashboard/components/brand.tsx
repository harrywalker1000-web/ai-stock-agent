/**
 * Brand marks.
 * ContourMark — primary: three nested topographic rings rising to a summit point.
 *   Echoes the contour-line material used across the product (DESIGN_DIRECTION.md §1).
 * CompassMark — the original compass logo, kept as the backup mark (owner's request).
 */

export function ContourMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden className={className}>
      <path d="M16 3.5c6.3 0 11.6 4.4 12.3 10.3.8 6.6-4.6 13.9-12.1 14.6C8.6 29.1 3.2 23.4 3.6 16.6 4 9.6 9.3 3.5 16 3.5z"
        stroke="rgb(var(--accent))" strokeOpacity=".45" strokeWidth="1.25" />
      <path d="M16.4 8.2c4 .2 7.3 3.3 7.4 7.3.2 4.6-3.6 8.6-8 8.4-4.1-.2-7.1-3.6-6.8-7.6.3-4.5 3.4-8.3 7.4-8.1z"
        stroke="rgb(var(--accent))" strokeOpacity=".75" strokeWidth="1.25" />
      <path d="M16.6 12.6c2 .1 3.4 1.8 3.2 3.8-.2 2.1-2 3.6-4 3.3-1.8-.3-3-2-2.7-3.8.3-2 1.7-3.4 3.5-3.3z"
        stroke="rgb(var(--accent))" strokeWidth="1.25" />
      <circle cx="16.4" cy="16.2" r="1.3" fill="rgb(var(--accent))" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <ContourMark />
      <span className="font-serif text-[19px] font-medium leading-none tracking-tight text-ink-1">Haz Capital</span>
    </span>
  );
}

/** Original compass logo — backup mark, not currently used. */
export function CompassMark({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none" aria-hidden>
      <circle cx="22" cy="22" r="19" stroke="#ECEDEE" strokeWidth="1" opacity="0.15" />
      <circle cx="22" cy="22" r="13" stroke="#C8A15A" strokeWidth="1" opacity="0.3" />
      <line x1="22" y1="4" x2="22" y2="40" stroke="#ECEDEE" strokeWidth="0.6" opacity="0.2" />
      <line x1="4" y1="22" x2="40" y2="22" stroke="#ECEDEE" strokeWidth="0.6" opacity="0.2" />
      <polygon points="22,5 25.5,22 22,19 18.5,22" fill="#4DB887" />
      <polygon points="22,39 18.5,22 22,25 25.5,22" fill="#ECEDEE" opacity="0.25" />
      <polygon points="39,22 22,18.5 25,22 22,25.5" fill="#ECEDEE" opacity="0.25" />
      <polygon points="5,22 22,25.5 19,22 22,18.5" fill="#ECEDEE" opacity="0.25" />
      <circle cx="22" cy="22" r="2.5" fill="#C8A15A" />
    </svg>
  );
}
