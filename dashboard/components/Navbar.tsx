"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/brand";
import { IconMenu, IconCross } from "@/components/ui/icons";

const NAV_LINKS = [
  { href: "/dashboard", label: "Portfolio", exact: false },
  { href: "/reports/adhoc", label: "Research", exact: false },
  { href: "/reports", label: "Daily reports", exact: true },
  { href: "/team", label: "Agents", exact: false },
  { href: "/settings", label: "Settings", exact: false },
  { href: "/about", label: "About", exact: false },
];

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (pathname === "/login") return null;
  const isActive = (l: (typeof NAV_LINKS)[number]) => (l.exact ? pathname === l.href : pathname.startsWith(l.href) && !(l.href === "/reports" && pathname.startsWith("/reports/adhoc")));

  return (
    <>
      <nav aria-label="Main" className="fixed inset-x-0 top-0 z-40 h-14 border-b border-line bg-canvas/95 backdrop-blur-sm">
        <div className="mx-auto flex h-full max-w-[1280px] items-center justify-between gap-6 px-4 sm:px-6">
          <Link href="/" aria-label="Haz Capital — home" className="shrink-0 rounded-sm">
            <Wordmark />
          </Link>

          <ul className="hidden h-full items-stretch gap-1 md:flex">
            {NAV_LINKS.map((l) => {
              const active = isActive(l);
              return (
                <li key={l.href} className="flex">
                  <Link href={l.href} aria-current={active ? "page" : undefined}
                    className={`relative flex items-center px-3 text-body font-medium transition-colors duration-fast ${
                      active ? "text-ink-1" : "text-ink-3 hover:text-ink-1"}`}>
                    {l.label}
                    {/* active marker: brass underline sitting on the nav hairline */}
                    <span aria-hidden className={`absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent transition-opacity duration-base ${active ? "opacity-100" : "opacity-0"}`} />
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center gap-4">
            <span className="hidden items-center gap-2 text-label text-ink-3 sm:inline-flex" title="Orders go to Alpaca's paper-trading account — no real money">
              <span className="h-1.5 w-1.5 rounded-full bg-gain" aria-hidden />
              Paper account
            </span>
            <button className="pressable -mr-2 rounded-md p-2 text-ink-2 hover:bg-raised hover:text-ink-1 md:hidden"
              onClick={() => setOpen((o) => !o)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="mobile-nav">
              {open ? <IconCross size={20} /> : <IconMenu size={20} />}
            </button>
          </div>
        </div>
      </nav>

      {open && (
        <div id="mobile-nav" className="fixed inset-x-0 bottom-0 top-14 z-30 bg-canvas md:hidden">
          <ul className="flex flex-col px-4 py-3">
            {NAV_LINKS.map((l) => {
              const active = isActive(l);
              return (
                <li key={l.href}>
                  <Link href={l.href} aria-current={active ? "page" : undefined}
                    className={`flex items-center justify-between border-b border-line py-4 font-serif text-h3 ${active ? "text-ink-1" : "text-ink-2"}`}>
                    {l.label}
                    {active && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div aria-hidden className="h-14" />
    </>
  );
}
