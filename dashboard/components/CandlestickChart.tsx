"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type Candle = { time: number; open: number; high: number; low: number; close: number };

const TIMEFRAMES = ["15m", "1h", "1D", "1W", "YTD"] as const;
type TF = (typeof TIMEFRAMES)[number];

export interface TradeEvent {
  date: string;           // "YYYY-MM-DD"
  decision: string;       // raw action: enter_long | enter_short | increase | decrease | exit | hold | skip
  size_pct?: number | null;
}

interface Props {
  ticker: string;
  entryPrice?: number;
  currentPrice?: number;
  tradeEvents?: TradeEvent[];
}

// Visual language: up = capital added (entry or increase), down = capital removed (trim or exit).
// Entry keeps the same amber used for the "Entry" price line so the two visually pair up.
const EVENT_STYLE: Record<string, { color: string; shape: "arrowUp" | "arrowDown"; position: "belowBar" | "aboveBar"; label: string } | undefined> = {
  enter_long:  { color: "#F59E0B", shape: "arrowUp",   position: "belowBar", label: "Entry" },
  enter_short: { color: "#F59E0B", shape: "arrowDown", position: "aboveBar", label: "Entry" },
  increase:    { color: "#10B981", shape: "arrowUp",   position: "belowBar", label: "Add" },
  decrease:    { color: "#F97316", shape: "arrowDown", position: "aboveBar", label: "Trim" },
  exit:        { color: "#EF4444", shape: "arrowDown", position: "aboveBar", label: "Exit" },
};

function dateToUnixSeconds(dateStr: string): number | null {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const t = Math.floor(d.getTime() / 1000);
  return Number.isNaN(t) ? null : t;
}

export default function CandlestickChart({ ticker, entryPrice, currentPrice, tradeEvents }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<unknown>(null);
  const seriesRef = useRef<unknown>(null);
  const [tf, setTf] = useState<TF>("1D");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const loadedTfRef = useRef<TF | null>(null);

  const fetchAndRender = useCallback(async (timeframe: TF) => {
    if (!seriesRef.current) return;
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/chart/${ticker}?tf=${timeframe}`);
      const json = await res.json();
      const candles: Candle[] = json.candles ?? [];
      if (candles.length === 0) {
        setError(true);
      } else {
        // @ts-expect-error -- series ref typed as unknown
        seriesRef.current.setData(candles);
        // @ts-expect-error -- chart ref typed as unknown
        chartRef.current?.timeScale().fitContent();
      }
    } catch {
      setError(true);
    }
    setLoading(false);
    loadedTfRef.current = timeframe;
  }, [ticker]);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let chart: any;

    (async () => {
      try {
        // lightweight-charts v5: import CandlestickSeries class alongside createChart
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lc = await import("lightweight-charts") as any;
        if (cancelled) return;
        const el = containerRef.current;
        if (!el) return;

        chart = lc.createChart(el, {
          width: el.offsetWidth,
          height: 260,
          layout: { background: { color: "transparent" }, textColor: "#6B7280" },
          grid: {
            vertLines: { color: "rgba(255,255,255,0.04)" },
            horzLines: { color: "rgba(255,255,255,0.04)" },
          },
          crosshair: {
            vertLine: { color: "rgba(255,255,255,0.2)", labelBackgroundColor: "#1F2937" },
            horzLine: { color: "rgba(255,255,255,0.2)", labelBackgroundColor: "#1F2937" },
          },
          rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
          timeScale: { borderColor: "rgba(255,255,255,0.08)", timeVisible: true, secondsVisible: false },
          handleScroll: true,
          handleScale: true,
        });

        // v5 API: addSeries(SeriesClass, options) — v4 addCandlestickSeries() was removed
        let series: unknown;
        const seriesOpts = {
          upColor: "#10B981", downColor: "#EF4444",
          borderUpColor: "#10B981", borderDownColor: "#EF4444",
          wickUpColor: "#10B981", wickDownColor: "#EF4444",
          // The library's automatic last-bar price line/label reflects whatever the
          // most recent loaded candle is — history endpoints (Yahoo) can lag the live
          // quote by days, which reads as a wrong "current price" floating on the axis
          // with no label explaining what it is. We draw our own explicit "Current"
          // line below from the same live (Alpaca) source as the rest of the page,
          // so suppress both the default line AND its axis label — priceLineVisible
          // alone only hides the line, lastValueVisible is a separate flag for the
          // floating number badge and was the one actually still leaking through.
          priceLineVisible: false,
          lastValueVisible: false,
        };
        if (typeof lc.CandlestickSeries !== "undefined") {
          // v5
          series = chart.addSeries(lc.CandlestickSeries, seriesOpts);
        } else {
          // v4 fallback
          series = chart.addCandlestickSeries(seriesOpts);
        }

        const LineStyle = lc.LineStyle;
        if (entryPrice) {
          (series as { createPriceLine: (o: unknown) => void }).createPriceLine({
            price: entryPrice,
            color: "#F59E0B",
            lineWidth: 1,
            lineStyle: LineStyle?.Dashed ?? 2,
            axisLabelVisible: true,
            title: "Entry",
          });
        }
        if (currentPrice) {
          (series as { createPriceLine: (o: unknown) => void }).createPriceLine({
            price: currentPrice,
            color: "#10B981",
            lineWidth: 1,
            lineStyle: LineStyle?.Dashed ?? 2,
            axisLabelVisible: true,
            title: "Current",
          });
        }

        // Trade-event annotations: entered / expanded / trimmed markers at their
        // actual dates, from decision_log — complements the Entry/Current lines
        // (which only show price, not when each capital move happened).
        if (tradeEvents && tradeEvents.length > 0 && typeof lc.createSeriesMarkers === "function") {
          const markers = tradeEvents
            .map((ev) => {
              const style = EVENT_STYLE[ev.decision];
              const time = style ? dateToUnixSeconds(ev.date) : null;
              if (!style || time == null) return null;
              const pct = ev.size_pct != null ? ` ${ev.size_pct.toFixed(0)}%` : "";
              return {
                time,
                position: style.position,
                color: style.color,
                shape: style.shape,
                text: `${style.label}${pct}`,
              };
            })
            .filter((m): m is NonNullable<typeof m> => m !== null)
            .sort((a, b) => a.time - b.time);
          if (markers.length > 0) {
            lc.createSeriesMarkers(series, markers);
          }
        }

        chartRef.current = chart;
        seriesRef.current = series;

        const onResize = () => {
          if (el) chart?.applyOptions({ width: el.offsetWidth });
        };
        window.addEventListener("resize", onResize);

        if (!cancelled) await fetchAndRender("1D");

        return () => window.removeEventListener("resize", onResize);
      } catch (err) {
        console.error("Chart init error:", err);
        setLoading(false);
        setError(true);
      }
    })();

    return () => {
      cancelled = true;
      chart?.remove();
      chartRef.current = null;
      seriesRef.current = null;
      loadedTfRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, entryPrice, currentPrice, tradeEvents]);

  useEffect(() => {
    if (tf !== loadedTfRef.current && seriesRef.current) {
      fetchAndRender(tf);
    }
  }, [tf, fetchAndRender]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#F59E0B]" />
            <span className="text-xs text-[#6B7280]">Entry</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#10B981]" />
            <span className="text-xs text-[#6B7280]">Current</span>
          </div>
          {tradeEvents && tradeEvents.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-[#4B5563]">▲▼ Entry / Add / Trim</span>
            </div>
          )}
        </div>
        <div className="flex gap-1">
          {TIMEFRAMES.map((t) => (
            <button
              key={t}
              onClick={() => setTf(t)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                tf === t
                  ? "bg-[#0EA5E9]/20 text-[#0EA5E9]"
                  : "text-[#6B7280] hover:text-[#E8EDF2] hover:bg-white/5"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="relative rounded-xl overflow-hidden" style={{ height: 260 }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#080C10]/80 z-10">
            <div className="flex items-center gap-2 text-xs text-[#6B7280]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0EA5E9] animate-pulse" />
              Loading {ticker} chart...
            </div>
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#080C10]/60 z-10">
            <p className="text-xs text-[#6B7280]">Chart data unavailable — try a different timeframe</p>
          </div>
        )}
        <div ref={containerRef} className="w-full h-full" />
      </div>
    </div>
  );
}
