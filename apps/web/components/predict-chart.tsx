"use client";

import { useEffect, useRef } from "react";
import { ColorType, LineStyle, type IChartApi, type ISeriesApi, type UTCTimestamp, createChart } from "lightweight-charts";
import { toUsd, type PriceUpdate } from "@/lib/predict";

/** Area chart of an oracle's BTC spot history, with the strike marked. */
export function PredictChart({ prices, strike, height = 240 }: { prices: PriceUpdate[]; strike?: number; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#9a9aa6", attributionLogo: false },
      grid: { vertLines: { color: "rgba(22,22,26,0.04)" }, horzLines: { color: "rgba(22,22,26,0.04)" } },
      rightPriceScale: { borderColor: "rgba(22,22,26,0.08)" },
      timeScale: { borderColor: "rgba(22,22,26,0.08)", timeVisible: true, secondsVisible: false },
      height,
      autoSize: true,
    });
    const series = chart.addAreaSeries({ lineColor: "#0a84ff", topColor: "rgba(10,132,255,0.2)", bottomColor: "rgba(10,132,255,0)", lineWidth: 2 });
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
    const byTime = new Map<number, number>();
    for (const p of prices) {
      const t = Math.floor((p.checkpoint_timestamp_ms ?? 0) / 1000);
      if (t > 0) byTime.set(t, toUsd(p.spot));
    }
    seriesRef.current.setData([...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([time, value]) => ({ time: time as UTCTimestamp, value })));
    chartRef.current?.timeScale().fitContent();
  }, [prices]);

  useEffect(() => {
    if (!seriesRef.current || strike == null) return;
    const line = seriesRef.current.createPriceLine({ price: strike, color: "#9a9aa6", lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: "strike" });
    return () => {
      try {
        seriesRef.current?.removePriceLine(line);
      } catch {
        /* chart torn down */
      }
    };
  }, [strike]);

  return <div ref={ref} className="h-full w-full" style={{ minHeight: height }} />;
}
