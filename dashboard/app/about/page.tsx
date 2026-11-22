import Link from "next/link";
import { IconExternal } from "@/components/ui/icons";

const PRINCIPLES = [
  {
    title: "Where is the stock going, not where has it been",
    body: "Every agent must produce at least one forward-looking signal — mean-reversion scores, dislocation flags, leading versus lagging sentiment — so the committee argues about the future, not the chart it already knows.",
  },
  {
    title: "Disagreement is surfaced, not averaged away",
    body: "Eleven agents form independent views before the Investment Committee decides. When Fundamental says buy and Quant says wait, the committee challenges the dissenter and both views appear in the final rationale.",
  },
  {
    title: "Cash is a valid position",
    body: "There are no trade quotas. A day with no new positions is correct behaviour if nothing clears the conviction threshold.",
  },
  {
    title: "Every decision is remembered",
    body: "Each decision is stored with its full reasoning. Closed trades get a post-mortem, and the signals that proved predictive are weighted more heavily in future decisions.",
  },
];

const MODES = [
  { name: "Auto", note: "Default", phaseA: "Macro, News, Quant, Sentiment — plus Fundamental when a holding reports earnings within 3 days", cost: "Medium" },
  { name: "Lite", note: null, phaseA: "Macro, News, Quant", cost: "Low" },
  { name: "Standard", note: null, phaseA: "Macro, News, Quant, Sentiment", cost: "Medium" },
  { name: "Full", note: null, phaseA: "Every agent, including Fundamental, on every run", cost: "High" },
];

const STACK: [string, string][] = [
  ["Reasoning", "Anthropic Claude, with OpenAI as an automatic fallback"],
  ["Market data", "yfinance, Alpha Vantage, Finnhub, FRED, NewsAPI"],
  ["Fundamentals", "SEC EDGAR filings (the ground truth for revenue and EPS)"],
  ["Execution", "Alpaca paper-trading API"],
  ["Runtime", "Python 3.11 on GitHub Actions, weekdays at 10:30 New York"],
  ["This dashboard", "Next.js on Vercel"],
];

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-[1280px] px-4 pb-24 pt-14 sm:px-6">
      <div className="max-w-[72ch]">
        <h1 className="font-serif text-[44px] font-medium leading-[1.08] tracking-tight text-ink-1 sm:text-[52px]">
          A research desk run by AI agents, trading on paper
        </h1>
        <p className="mt-6 text-lead text-ink-2">
          Haz Capital is an autonomous investment system built by Harry Walker with Claude Code. Every weekday at
          10:30 New York time, eleven specialised agents research the market, debate the evidence, and place trades in
          an Alpaca paper account — real prices and real order logic, with no real money at risk.
        </p>
      </div>

      <div className="mt-20 grid gap-x-16 gap-y-16 lg:grid-cols-[220px_minmax(0,72ch)] [&>*]:min-w-0">
        <h2 className="font-serif text-h2 text-ink-1">How it works</h2>
        <div className="space-y-4 text-lead text-ink-2">
          <p>
            The pipeline mirrors an institutional research desk: macro context first, then sector rotation,
            institutional flow and news, then a shortlist of candidates. Each candidate gets fundamental, quantitative
            and sentiment analysis before the Investment Committee weighs the evidence and sizes the position.
          </p>
          <p>
            Every decision is saved with its reasoning — which agents flagged it, what drove the conviction, and how
            each later review compares with the original thesis. The goal is twenty or more consecutive clean daily
            runs before live trading is even considered.
          </p>
        </div>

        <h2 className="font-serif text-h2 text-ink-1">Principles</h2>
        <dl className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {PRINCIPLES.map((p) => (
            <div key={p.title} className="border-t border-line pt-4">
              <dt className="font-serif text-h3 text-ink-1">{p.title}</dt>
              <dd className="mt-2 text-body text-ink-2">{p.body}</dd>
            </div>
          ))}
        </dl>

        <div>
          <h2 className="font-serif text-h2 text-ink-1">Analysis modes</h2>
          <p className="mt-2 text-label text-ink-3">Chosen in <Link href="/settings" className="text-accent hover:text-ink-1">Settings</Link></p>
        </div>
        <div>
          <p className="mb-5 text-body text-ink-2">
            Each run has two phases: reviewing the positions already held, then researching new opportunities. The mode
            sets how deep the review goes; new-opportunity research always runs the full set of agents.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-body">
              <thead>
                <tr className="border-b border-line text-left text-label text-ink-3">
                  <th scope="col" className="py-2 pr-4 font-medium">Mode</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Agents used to review held positions</th>
                  <th scope="col" className="py-2 font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {MODES.map((m) => (
                  <tr key={m.name} className="border-b border-line align-top">
                    <td className="py-3 pr-4 text-ink-1">{m.name}{m.note && <span className="ml-2 text-label text-ink-3">{m.note}</span>}</td>
                    <td className="py-3 pr-4 text-ink-2">{m.phaseA}</td>
                    <td className="py-3 text-ink-2">{m.cost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <h2 className="font-serif text-h2 text-ink-1">Built with</h2>
        <dl className="divide-y divide-line border-y border-line">
          {STACK.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[140px_1fr] gap-4 py-3">
              <dt className="text-label text-ink-3">{k}</dt>
              <dd className="text-body text-ink-1">{v}</dd>
            </div>
          ))}
        </dl>

        <h2 className="font-serif text-h2 text-ink-1">Source</h2>
        <div>
          <a href="https://github.com/harrywalker1000-web/ai-stock-agent" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-body font-medium text-accent hover:text-ink-1">
            View the code on GitHub <IconExternal size={16} />
          </a>
          <p className="mt-10 text-label text-ink-3">Paper trading only. Nothing on this site is financial advice.</p>
        </div>
      </div>
    </main>
  );
}
