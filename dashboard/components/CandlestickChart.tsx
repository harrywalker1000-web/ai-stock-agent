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
  enter_long:  { color: "#E39A57", shape: "arrowUp",   position: "belowBar", label: "Entry" },
  enter_short: { color: "#E39A57", shape: "arrowDown", position: "aboveBar", label: "Entry" },
  increase:    { color: "#4DB887", shape: "arrowUp",   position: "belowBar", label: "Add" },
  decrease:    { color: "#E39A57", shape: "arrowDown", position: "aboveBar", label: "Trim" },
  exit:        { color: "#E2706A", shape: "arrowDown", position: "aboveBar", label: "Exit" },
};

// NY calendar date of a unix-seconds timestamp
function nyDay(t: number): string {
  return new Date(t * 1000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

/**
 * Snap each trade event (a NY calendar date) onto the candle that contains it:
 *  - intraday / daily: the first candle on that date
 *  - weekly: the last candle starting on or before that date (the week it falls in)
 * Events outside the loaded window are dropped instead of being pinned to the first bar.
 */
function buildMarkers(events: TradeEvent[], candles: Candle[], tf: TF) {
  if (!candles.length) return [];
  const days = candles.map((c) => nyDay(c.time));
  const firstDay = days[0];
  const lastDay = days[days.length - 1];
  const out: { time: number; position: string; color: string; shape: string; text: string }[] = [];
  for (const ev of events) {
    const style = EVENT_STYLE[ev.decision];
    if (!style || !/^\d{4}-\d{2}-\d{2}$/.test(ev.date)) continue;
    let idx = -1;
    if (tf === "1W") {
      if (ev.date < firstDay) continue;
      for (let i = 0; i < days.length; i++) { if (days[i] <= ev.date) idx = i; else break; }
      // beyond the last weekly bar's week → not loaded
      if (idx === days.length - 1 && (new Date(`${ev.date}T12:00:00Z`).getTime() - candles[idx].time * 1000) > 7 * 86400_000) idx = -1;
    } else {
      if (ev.date < firstDay || ev.date > lastDay) continue;
      idx = days.indexOf(ev.date);
    }
    if (idx < 0) continue;
    const pct = ev.size_pct != null ? ` ${ev.size_pct.toFixed(0)}%` : "";
    out.push({ time: candles[idx].time, position: style.position, color: style.color, shape: style.shape, text: `${style.label}${pct}` });
  }
  return out.sort((a, b) => a.time - b.time);
}

export default function CandlestickChart({ ticker, entryPrice, currentPrice, tradeEvents }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<unknown>(null);
  const seriesRef = useRef<unknown>(null);
  const [tf, setTf] = useState<TF>("1D");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const loadedTfRef = useRef<TF | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any>(null);
  const requestIdRef = useRef(0);
  const eventsRef = useRef<TradeEvent[]>(tradeEvents ?? []);
  eventsRef.current = tradeEvents ?? [];

  const fetchAndRender = useCallback(async (timeframe: TF) => {
    if (!seriesRef.current) return;
    const reqId = ++requestIdRef.current; // a newer click supersedes this one
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/chart/${ticker}?tf=${timeframe}`);
      const json = await res.json();
      if (reqId !== requestIdRef.current || !seriesRef.current) return;
      const candles: Candle[] = json.candles ?? [];
      if (candles.length === 0) {
        setError(true);
      } else {
        // @ts-expect-error -- series ref typed as unknown
        seriesRef.current.setData(candles);
        markersRef.current?.setMarkers(buildMarkers(eventsRef.current, candles, timeframe));
        // @ts-expect-error -- chart ref typed as unknown
        chartRef.current?.timeScale().fitContent();
      }
    } catch {
      if (reqId !== requestIdRef.current) return;
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
    let onResize: (() => void) | null = null;

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
          layout: { background: { color: "transparent" }, textColor: "#8E959D" },
          grid: {
            vertLines: { color: "rgba(255,255,255,0.04)" },
            horzLines: { color: "rgba(255,255,255,0.04)" },
          },
          crosshair: {
            vertLine: { color: "rgba(255,255,255,0.2)", labelBackgroundColor: "#2A2F35" },
            horzLine: { color: "rgba(255,255,255,0.2)", labelBackgroundColor: "#2A2F35" },
          },
          rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
          timeScale: { borderColor: "rgba(255,255,255,0.08)", timeVisible: true, secondsVisible: false },
          handleScroll: true,
          handleScale: true,
        });

        // v5 API: addSeries(SeriesClass, options) — v4 addCandlestickSeries() was removed
        let series: unknown;
        const seriesOpts = {
          upColor: "#4DB887", downColor: "#E2706A",
          borderUpColor: "#4DB887", borderDownColor: "#E2706A",
          wickUpColor: "#4DB887", wickDownColor: "#E2706A",
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
            color: "#E39A57",
            lineWidth: 1,
            lineStyle: LineStyle?.Dashed ?? 2,
            axisLabelVisible: true,
            title: "Entry",
          });
        }
        if (currentPrice) {
          (series as { createPriceLine: (o: unknown) => void }).createPriceLine({
            price: currentPrice,
            color: "#4DB887",
            lineWidth: 1,
            lineStyle: LineStyle?.Dashed ?? 2,
            axisLabelVisible: true,
            title: "Current",
          });
        }

        // Trade-event markers: positions are computed per timeframe after each data
        // load (buildMarkers), so they always sit on the candle containing the event.
        if (typeof lc.createSeriesMarkers === "function") {
          markersRef.current = lc.createSeriesMarkers(series, []);
        }

        chartRef.current = chart;
        seriesRef.current = series;

        onResize = () => {
          if (el) chart?.applyOptions({ width: el.offsetWidth });
        };
        window.addEventListener("resize", onResize);

        if (!cancelled) await fetchAndRender("1D");
      } catch (err) {
        console.error("Chart init error:", err);
        setLoading(false);
        setError(true);
      }
    })();

    return () => {
      cancelled = true;
      if (onResize) window.removeEventListener("resize", onResize);
      markersRef.current = null;
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
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-caution" />
            <span className="text-xs text-ink-3">Entry</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-gain" />
            <span className="text-xs text-ink-3">Current</span>
          </div>
          {tradeEvents && tradeEvents.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-ink-3">▲▼ Entry / Add / Trim</span>
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
 ?"bg-accent/20 text-accent"
 :"text-ink-3 hover:text-ink-1 hover:bg-raised/50"
 }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="relative rounded-xl overflow-hidden" style={{ height: 260 }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-canvas/80 z-10">
            <div className="flex items-center gap-2 text-xs text-ink-3">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              Loading {ticker} chart...
            </div>
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-canvas/60 z-10">
            <p className="text-xs text-ink-3">Chart data unavailable — try a different timeframe</p>
          </div>
        )}
        <div ref={containerRef} className="w-full h-full" />
      </div>
    </div>
  );
}
