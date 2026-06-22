"use client";

import { useEffect, useRef } from "react";
import { ColorType, type CandlestickData, type IChartApi, type ISeriesApi, type UTCTimestamp, createChart } from "lightweight-charts";
import type { Candle } from "@/lib/oracle";

/** Candlestick chart of an oracle asset's OHLC (from GMX). */
export function CandleChart({ candles, height = 220 }: { candles: Candle[]; height?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#9a9aa6", attributionLogo: false },
      grid: { vertLines: { color: "rgba(22,22,26,0.04)" }, horzLines: { color: "rgba(22,22,26,0.04)" } },
      rightPriceScale: { borderColor: "rgba(22,22,26,0.08)" },
      timeScale: { borderColor: "rgba(22,22,26,0.08)", timeVisible: true, secondsVisible: false },
      height,
      autoSize: true,
    });
    const series = chart.addCandlestickSeries({
      upColor: "#0a84ff",
      downColor: "#e2554a",
      borderVisible: false,
      wickUpColor: "#0a84ff",
      wickDownColor: "#e2554a",
    });
    chartRef.current = chart;
    seriesRef.current = series;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height]);

  useEffect(() => {
    if (!seriesRef.current) return;
    seriesRef.current.setData(
      candles.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close }) satisfies CandlestickData),
    );
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  return <div ref={containerRef} className="h-full w-full" style={{ minHeight: height }} />;
}
