/**
 * One icon set: 20px grid, 1.5px stroke, round caps. Replaces mixed inline SVGs
 * and text glyphs (⚠ ✓ ✗ ★). Decorative by default (aria-hidden).
 */
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 16) => ({
  width: size, height: size, viewBox: "0 0 20 20", fill: "none", stroke: "currentColor",
  strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true,
});

export const IconCheck = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M4.5 10.5l3.5 3.5 7.5-8" /></svg>;
export const IconCross = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M5.5 5.5l9 9M14.5 5.5l-9 9" /></svg>;
export const IconDash = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M5 10h10" /></svg>;
export const IconAlert = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M10 3.5l7 12.5H3l7-12.5z" /><path d="M10 8.5v3.5M10 14.4v.1" /></svg>;
export const IconChevronDown = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M5.5 8l4.5 4.5L14.5 8" /></svg>;
export const IconChevronRight = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M8 5.5l4.5 4.5L8 14.5" /></svg>;
export const IconArrowLeft = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M15.5 10h-11M9 5.5L4.5 10 9 14.5" /></svg>;
export const IconPlus = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M10 4.5v11M4.5 10h11" /></svg>;
export const IconExternal = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M11.5 4.5h4v4M15.5 4.5L9 11M13.5 11.5v3.5h-9v-9H8" /></svg>;
export const IconMenu = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M3.5 6h13M3.5 10h13M3.5 14h13" /></svg>;
export const IconTrash = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M4.5 6h11M8 6V4.5h4V6M6 6l.7 9.5h6.6L14 6" /></svg>;
export const IconChat = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M4 5h12v8H9l-3.5 2.5V13H4z" /></svg>;
export const IconPrint = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M6 8V3.5h8V8M6 14H4V8h12v6h-2M6 11.5h8v5H6z" /></svg>;
export const IconRefresh = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M15.5 8A5.75 5.75 0 004.6 7M4.5 12a5.75 5.75 0 0010.9 1M15.5 4v4h-4M4.5 16v-4h4" /></svg>;
