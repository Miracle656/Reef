import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Line as SvgLine, Path, Stop } from "react-native-svg";
import { palette } from "@umbra/ui";
import { fetchMid } from "@/lib/deepbook";

/**
 * Lightweight area sparkline. Coordinates live in a 0..100 viewBox and the SVG
 * stretches to its container (preserveAspectRatio="none"); strokes use
 * non-scaling-stroke so they stay crisp regardless of the x/y scale.
 */
export function Sparkline({
  values,
  color = palette.light.accent,
  height = 120,
  strike,
}: {
  values: number[];
  color?: string;
  height?: number;
  strike?: number;
}) {
  if (values.length < 2) {
    return (
      <View style={{ height }} className="items-center justify-center">
        <Text className="text-xs text-ink-faint">collecting prices…</Text>
      </View>
    );
  }

  const W = 100;
  const H = 100;
  // Range from the price series only, then pad ~22% so the line floats in the
  // middle instead of hugging an edge. The strike is drawn as a reference and
  // clamped into view if it sits outside the padded window.
  const vlo = Math.min(...values);
  const vhi = Math.max(...values);
  const pad = (vhi - vlo || vhi * 0.002 || 1) * 0.22;
  const lo = vlo - pad;
  const hi = vhi + pad;
  const range = hi - lo || 1;
  const x = (i: number) => (i / (values.length - 1)) * W;
  const clampY = (v: number) => Math.max(2, Math.min(98, v));
  const y = (v: number) => clampY(H - ((v - lo) / range) * H);

  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  const strikeY = strike != null ? y(strike) : null;

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <Defs>
        <LinearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.35} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={area} fill="url(#spark)" />
      <Path d={line} stroke={color} strokeWidth={1.5} fill="none" vectorEffect="non-scaling-stroke" />
      {strikeY != null ? (
        <SvgLine x1="0" y1={strikeY} x2={W} y2={strikeY} stroke={palette.light.inkFaint} strokeWidth={0.75} strokeDasharray="2,2" vectorEffect="non-scaling-stroke" />
      ) : null}
    </Svg>
  );
}

/** Polls the pool mid-price (~5s) and renders the accumulated history. */
export function PriceChart({ poolKey }: { poolKey: string }) {
  const [pts, setPts] = useState<number[]>([]);

  useEffect(() => {
    let alive = true;
    setPts([]);
    const tick = async () => {
      const m = await fetchMid(poolKey).catch(() => 0);
      if (alive && m > 0) setPts((p) => [...p.slice(-47), m]);
    };
    void tick();
    const id = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [poolKey]);

  return <Sparkline values={pts} height={130} />;
}
