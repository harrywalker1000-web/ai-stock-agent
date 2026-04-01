"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/reports", label: "Daily Reports" },
  { href: "/team", label: "Meet the Team" },
  { href: "/settings", label: "Settings" },
  { href: "/about", label: "About" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Don't show navbar on login page
  if (pathname === "/login") return null;

  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-50 glass-nav"
        style={{ height: "64px" }}
      >
        <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div
              className="flex items-center justify-center flex-shrink-0 transition-all duration-300 group-hover:drop-shadow-[0_0_8px_rgba(14,165,233,0.7)]"
            >
              {/* Upward-trending candlestick chart logo — 4 candles, ascending left to right */}
              <svg width="44" height="36" viewBox="0 0 44 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Candle 1 — small bearish (realism) */}
                <line x1="5" y1="20" x2="5" y2="34" stroke="#EF4444" strokeWidth="1.2" strokeLinecap="round"/>
                <rect x="3" y="23" width="4" height="8" rx="0.5" fill="#EF4444"/>

                {/* Candle 2 — medium bullish */}
                <line x1="16" y1="14" x2="16" y2="30" stroke="#10B981" strokeWidth="1.2" strokeLinecap="round"/>
                <rect x="14" y="17" width="4" height="10" rx="0.5" fill="#10B981"/>

                {/* Candle 3 — tall bullish */}
                <line x1="27" y1="8" x2="27" y2="25" stroke="#10B981" strokeWidth="1.2" strokeLinecap="round"/>
                <rect x="25" y="11" width="4" height="11" rx="0.5" fill="#10B981"/>

                {/* Candle 4 — tallest bullish (anchor) */}
                <line x1="38" y1="2" x2="38" y2="19" stroke="#10B981" strokeWidth="1.2" strokeLinecap="round"/>
                <rect x="36" y="5" width="4" height="12" rx="0.5" fill="#10B981"/>
              </svg>
            </div>
            <div className="hidden sm:block">
              <span className="font-display text-sm font-bold text-[#E8EDF2] tracking-tight leading-none block">
                HAZ CAPITAL
              </span>
              <span className="text-[10px] text-[#6B7280] uppercase tracking-widest leading-none">
                Management
              </span>
            </div>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((link) => {
              const isActive =
                link.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "text-[#0EA5E9] bg-[#0EA5E9]/10"
                      : "text-[#6B7280] hover:text-[#E8EDF2] hover:bg-white/5"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          {/* Status indicator + mobile menu */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/08">
              <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
              <span className="text-xs text-[#6B7280] font-medium">Paper Trading</span>
            </div>

            {/* Mobile hamburger */}
            <button
              className="md:hidden p-2 rounded-lg hover:bg-white/5 transition-colors"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle menu"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2">
                {mobileOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <>
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </>
                )}
              </svg>
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden pt-16">
          <div
            className="absolute inset-0 bg-[#080C10]/90"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative glass-nav border-t border-white/06 px-6 py-4 space-y-1">
            {NAV_LINKS.map((link) => {
              const isActive =
                link.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={`block px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "text-[#0EA5E9] bg-[#0EA5E9]/10"
                      : "text-[#6B7280] hover:text-[#E8EDF2] hover:bg-white/5"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Spacer to push content below fixed nav */}
      <div style={{ height: "64px" }} />
    </>
  );
}
