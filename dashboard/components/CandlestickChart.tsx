"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type Candle = { time: number; open: number; high: number; low: number; close: number };

const TIMEFRAMES = ["15m", "1h", "1D", "1W", "YTD"] as const;
type TF = (typeof TIMEFRAMES)[number];

interface Props {
  ticker: string;
  entryPrice?: number;
}

export default function CandlestickChart({ ticker, entryPrice }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<unknown>(null);
  const seriesRef = useRef<unknown>(null);
  const [tf, setTf] = useState<TF>("1D");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Track what timeframe is currently loaded so tf changes can re-fetch
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

  // Build chart once on mount — fetch initial data from inside init so we know series is ready
  useEffect(() => {
    if (!containerRef.current) return;
    let chart: unknown;
    let cancelled = false;

    (async () => {
      const { createChart, LineStyle } = await import("lightweight-charts");
      if (cancelled) return;
      const el = containerRef.current;
      if (!el) return;

      chart = createChart(el, {
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

      // @ts-expect-error -- dynamic import typing lacks series method definitions
      const series = chart.addCandlestickSeries({
        upColor: "#10B981", downColor: "#EF4444",
        borderUpColor: "#10B981", borderDownColor: "#EF4444",
        wickUpColor: "#10B981", wickDownColor: "#EF4444",
      });

      if (entryPrice) {
        series.createPriceLine({
          price: entryPrice,
          color: "#F59E0B",
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: "Entry",
        });
      }

      chartRef.current = chart;
      seriesRef.current = series;

      const onResize = () => {
        if (el) {
          // @ts-expect-error -- dynamic import lacks typed applyOptions
          chart?.applyOptions({ width: el.offsetWidth });
        }
      };
      window.addEventListener("resize", onResize);

      // Chart is ready — fetch initial data immediately
      if (!cancelled) await fetchAndRender("1D");

      // Cleanup resize listener (returned from IIFE — not from useEffect cleanup)
      return () => window.removeEventListener("resize", onResize);
    })();

    return () => {
      cancelled = true;
      // @ts-expect-error -- dynamic import lacks typed remove method
      chart?.remove();
      chartRef.current = null;
      seriesRef.current = null;
      loadedTfRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, entryPrice]);

  // Re-fetch when user changes timeframe (chart already initialized)
  useEffect(() => {
    if (tf !== loadedTfRef.current && seriesRef.current) {
      fetchAndRender(tf);
    }
  }, [tf, fetchAndRender]);

  return (
    <div>
      {/* Timeframe selector */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#F59E0B]" />
          <span className="text-xs text-[#6B7280]">Dotted = entry price</span>
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

      {/* Chart container */}
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
            <p className="text-xs text-[#6B7280]">Chart data unavailable — try a different timeframe or check your connection</p>
          </div>
        )}
        <div ref={containerRef} className="w-full h-full" />
      </div>
    </div>
  );
}
