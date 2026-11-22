/**
 * Shared UI primitives — every page builds from these (DESIGN_DIRECTION.md).
 * Tokens only: no hex values, no one-off radii, no glows.
 */
import Link from "next/link";
import type { ReactNode, ButtonHTMLAttributes } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/* ── Button ─────────────────────────────────────────────────────────────── */
type ButtonVariant = "primary" | "secondary" | "ghost";
const BTN: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent/90 border border-accent",
  secondary: "bg-transparent text-ink-1 border border-line-strong hover:border-ink-3 hover:bg-raised",
  ghost: "bg-transparent text-ink-2 border border-transparent hover:text-ink-1 hover:bg-raised",
};
const BTN_SIZE = { sm: "h-8 px-3 text-label", md: "h-10 px-4 text-body" };

export function Button({
  variant = "secondary", size = "md", className, href, children, ...rest
}: { variant?: ButtonVariant; size?: "sm" | "md"; href?: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = cx(
    "pressable inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap",
    "disabled:opacity-50 disabled:pointer-events-none",
    BTN[variant], BTN_SIZE[size], className,
  );
  if (href) return <Link href={href} className={cls}>{children}</Link>;
  return <button className={cls} {...rest}>{children}</button>;
}

/* ── Page header: title, one-line description, actions on the right ───── */
export function PageHeader({ title, description, actions, meta }: {
  title: ReactNode; description?: ReactNode; actions?: ReactNode; meta?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 pb-8">
      <div className="min-w-0 max-w-2xl">
        <h1 className="font-serif text-h1 font-medium text-ink-1">{title}</h1>
        {description && <p className="mt-2 text-lead text-ink-2">{description}</p>}
        {meta && <div className="mt-3 text-label text-ink-3">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/* ── Panel: the single container. Radius 12; children use 4 with 8 padding. */
export function Panel({ children, className, as: As = "section", padded = true }: {
  children: ReactNode; className?: string; as?: "section" | "div" | "article"; padded?: boolean;
}) {
  return <As className={cx("rounded-lg border border-line bg-surface", padded && "p-6", className)}>{children}</As>;
}

/* ── Section heading inside a panel or page ───────────────────────────── */
export function SectionTitle({ children, description, action, source }: {
  children: ReactNode; description?: ReactNode; action?: ReactNode; source?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
      <div className="min-w-0">
        <h2 className="font-serif text-h3 font-medium text-ink-1">{children}</h2>
        {description && <p className="mt-1 text-label text-ink-3">{description}</p>}
      </div>
      {(action || source) && (
        <div className="flex items-center gap-3">
          {source && <span className="text-micro text-ink-3">{source}</span>}
          {action}
        </div>
      )}
    </div>
  );
}

/* ── Stat: label above a tabular value; tone only for signed P&L ──────── */
export type Tone = "gain" | "loss" | "caution" | "accent" | "neutral";
const TONE_TEXT: Record<Tone, string> = {
  gain: "text-gain", loss: "text-loss", caution: "text-caution", accent: "text-accent", neutral: "text-ink-1",
};
export const toneOf = (n: number | null | undefined): Tone =>
  n == null || n === 0 ? "neutral" : n > 0 ? "gain" : "loss";

export function Stat({ label, value, sub, tone = "neutral", size = "md", className }: {
  label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: Tone; size?: "md" | "lg" | "xl"; className?: string;
}) {
  const valueCls = size === "xl" ? "font-serif text-figure font-medium" : size === "lg" ? "font-serif text-h2 font-medium" : "text-h3 font-medium";
  return (
    <div className={cx("min-w-0", className)}>
      <dt className="text-label text-ink-3">{label}</dt>
      <dd className={cx("mt-1 tabular", valueCls, TONE_TEXT[tone])}>{value}</dd>
      {sub && <dd className="mt-0.5 text-label text-ink-3 tabular">{sub}</dd>}
    </div>
  );
}

/* KpiRail: stats separated by hairlines, not boxes (checklist 8) */
export function KpiRail({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <dl className={cx(
      "grid grid-cols-2 gap-y-5 sm:flex sm:flex-wrap sm:gap-y-4",
      "[&>*]:pr-6 sm:[&>*]:border-l sm:[&>*]:border-line sm:[&>*]:pl-6 sm:[&>*:first-child]:border-l-0 sm:[&>*:first-child]:pl-0",
      className,
    )}>
      {children}
    </dl>
  );
}

/* ── Badge: status information only (never decoration) ───────────────── */
const BADGE: Record<Tone, string> = {
  gain: "text-gain bg-gain/12", loss: "text-loss bg-loss/12", caution: "text-caution bg-caution/12",
  accent: "text-accent bg-accent/12", neutral: "text-ink-2 bg-raised",
};
export function Badge({ tone = "neutral", children, title, className }: { tone?: Tone; children: ReactNode; title?: string; className?: string }) {
  return (
    <span title={title} className={cx("inline-flex items-center gap-1 rounded-sm px-1.5 py-px text-micro font-medium whitespace-nowrap", BADGE[tone], className)}>
      {children}
    </span>
  );
}

/* AI estimate marker — your rule: LLM figures stay, clearly labelled */
export function AIEstimate({ children, note }: { children?: ReactNode; note?: string }) {
  return (
    <span title={note ?? "Estimated by the AI model — not reported data"}
      className="inline-flex items-center gap-1 rounded-sm border border-dashed border-caution/60 px-1.5 text-micro font-medium text-caution">
      {children ?? "AI estimate"}
    </span>
  );
}

/* ── Segmented control (periods, modes) ───────────────────────────────── */
export function Segmented<T extends string>({ options, value, onChange, label, size = "sm" }: {
  options: readonly T[] | { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; label: string; size?: "sm" | "md";
}) {
  const opts = (options as (T | { value: T; label: ReactNode })[]).map((o) =>
    typeof o === "string" ? { value: o, label: o } : o);
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-line bg-canvas p-0.5">
      {opts.map((o) => {
        const active = o.value === value;
        return (
          <button key={o.value} role="radio" aria-checked={active} onClick={() => onChange(o.value)}
            className={cx(
              "pressable rounded-sm font-medium",
              size === "sm" ? "h-7 px-2.5 text-label" : "h-8 px-3 text-body",
              active ? "bg-raised text-ink-1 shadow-[inset_0_-2px_0_rgb(var(--accent))]" : "text-ink-3 hover:text-ink-1",
            )}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Skeleton & empty state ───────────────────────────────────────────── */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cx("skeleton block", className)} />;
}

export function EmptyState({ title, children, action, className }: {
  title: ReactNode; children?: ReactNode; action?: ReactNode; className?: string;
}) {
  return (
    <div className={cx("tex-dots flex flex-col items-start justify-center gap-2 rounded-md border border-dashed border-line px-6 py-10", className)}>
      <p className="font-serif text-h3 text-ink-1">{title}</p>
      {children && <p className="max-w-prose text-body text-ink-2">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Alert({ tone = "caution", title, children }: { tone?: "caution" | "loss" | "neutral"; title: ReactNode; children?: ReactNode }) {
  const bar = tone === "loss" ? "border-loss" : tone === "caution" ? "border-caution" : "border-line-strong";
  return (
    <div role="alert" className={cx("rounded-md border-l-2 bg-surface px-4 py-3", bar)}>
      <p className={cx("text-body font-medium", tone === "loss" ? "text-loss" : tone === "caution" ? "text-caution" : "text-ink-1")}>{title}</p>
      {children && <p className="mt-0.5 text-label text-ink-2">{children}</p>}
    </div>
  );
}

/* Ticker symbol — the only mono text in the product */
export function Ticker({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("font-mono font-medium tracking-tight text-ink-1", className)}>{children}</span>;
}

/* Signed figure helpers (tabular, with sign, tone-coloured) */
export function Signed({ value, suffix = "%", digits = 2, className }: { value: number | null | undefined; suffix?: string; digits?: number; className?: string }) {
  if (value == null || !isFinite(value)) return <span className={cx("text-ink-3", className)}>—</span>;
  return <span className={cx("tabular", TONE_TEXT[toneOf(value)], className)}>{value > 0 ? "+" : value < 0 ? "−" : ""}{Math.abs(value).toFixed(digits)}{suffix}</span>;
}
