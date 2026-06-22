"use client";

import { useEffect, useRef, useState } from "react";
import { ColorType, type IChartApi, type ISeriesApi, type UTCTimestamp, createChart } from "lightweight-charts";
import { deepbook } from "@umbra/core";
import { useDeepBook } from "@/lib/deepbook";

/**
 * Live mid-price area chart. DeepBook has no cheap OHLC, so we poll the mid
 * price and grow an area series in real time (same approach as iwallet).
 */
export function PriceChart({ poolKey, pollMs = 5000 }: { poolKey: string; pollMs?: number }) {
  const db = useDeepBook();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const dataRef = useRef<{ time: UTCTimestamp; value: number }[]>([]);
  const [mid, setMid] = useState<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#9a9aa6", attributionLogo: false },
      grid: { vertLines: { color: "rgba(22,22,26,0.05)" }, horzLines: { color: "rgba(22,22,26,0.05)" } },
      rightPriceScale: { borderColor: "rgba(22,22,26,0.08)" },
      timeScale: { borderColor: "rgba(22,22,26,0.08)", timeVisible: true, secondsVisible: false },
      height: 240,
      autoSize: true,
    });
    const series = chart.addAreaSeries({
      lineColor: "#0a84ff",
      topColor: "rgba(10,132,255,0.22)",
      bottomColor: "rgba(10,132,255,0)",
      lineWidth: 2,
    });
    chartRef.current = chart;
    seriesRef.current = series;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // reset on pair change
  useEffect(() => {
    dataRef.current = [];
    seriesRef.current?.setData([]);
    setMid(null);
  }, [poolKey]);

  // poll mid + append
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      const m = await deepbook.getMidPrice(db, poolKey).catch(() => 0);
      if (!alive || !m) return;
      setMid(m);
      const time = Math.floor(Date.now() / 1000) as UTCTimestamp;
      const last = dataRef.current[dataRef.current.length - 1];
      if (last && last.time === time) {
        last.value = m;
        seriesRef.current?.update(last);
      } else {
        const point = { time, value: m };
        dataRef.current.push(point);
        if (dataRef.current.length > 600) dataRef.current.shift();
        seriesRef.current?.update(point);
      }
    };
    void tick();
    const id = setInterval(tick, pollMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [db, poolKey, pollMs]);

  return (
    <div className="relative h-[240px] w-full">
      {mid == null ? (
        <p className="absolute inset-0 grid place-items-center text-sm text-ink-faint">Waiting for price…</p>
      ) : null}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
