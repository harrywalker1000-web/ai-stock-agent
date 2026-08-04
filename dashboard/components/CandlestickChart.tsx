"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type Candle = { time: number; open: number; high: number; low: number; close: number };

const TIMEFRAMES = ["15m", "1h", "1D", "1W", "YTD"] as const;
type TF = (typeof TIMEFRAMES)[number];

interface Props {
  ticker: string;
  entryPrice?: number;
  currentPrice?: number;
}

export default function CandlestickChart({ ticker, entryPrice, currentPrice }: Props) {
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
          // The library's automatic last-bar price line reflects whatever the most
          // recent loaded candle is — history endpoints (Yahoo) can lag the live
          // quote by a day or more, which reads as a wrong "current price". We draw
          // our own "Current" line below from the same live source as the rest of
          // the page instead, so suppress the default one to avoid two conflicting
          // numbers on screen.
          priceLineVisible: false,
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
  }, [ticker, entryPrice, currentPrice]);

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
