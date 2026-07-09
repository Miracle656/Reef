import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, FlatList, type LayoutChangeEvent, Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { palette } from "@umbra/ui";
import { getOraclePrices, getOracleState, listMarkets, toUsd, type OracleSummary } from "@/lib/predict";
import { CoinIcon } from "./market-select";
import { Sparkline } from "./price-chart";

const UP = "#16c784";
const DOWN = "#f6465d";
const MODEL_VOL = 0.6;

function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}
function impliedUpProb(forward: number, strike: number, ms: number): number {
  if (forward <= 0 || strike <= 0 || ms <= 0) return 0.5;
  const T = ms / (365.25 * 24 * 3600 * 1000);
  const sigT = MODEL_VOL * Math.sqrt(Math.max(T, 1e-9));
  const d2 = (Math.log(forward / strike) - 0.5 * MODEL_VOL * MODEL_VOL * T) / sigT;
  return Math.min(0.98, Math.max(0.02, normCdf(d2)));
}
const usd0 = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const pct = (p: number) => `${Math.round(p * 100)}%`;
const black = { fontFamily: "Expose-Black" } as const;
const bold = { fontFamily: "Expose-Bold" } as const;

export function PredictFeed() {
  const markets = useQuery({ queryKey: ["predict-markets"], queryFn: () => listMarkets(10), refetchInterval: 60000 });
  // Measure the actual area the feed gets (screen minus the floating nav). Each
  // card is exactly this tall, so one swipe = one market and nothing peeks.
  const [vh, setVh] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    if (h && h !== vh) setVh(h);
  };

  if (markets.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-black">
        <ActivityIndicator color={palette.light.accent} />
        <Text className="mt-3 text-sm text-white/40">Loading BTC markets…</Text>
      </View>
    );
  }
  if (markets.isError) return <View className="flex-1 items-center justify-center bg-black"><Text className="text-sm text-white/60">Couldn&apos;t reach the Predict server.</Text></View>;
  const list = markets.data ?? [];
  if (list.length === 0) return <View className="flex-1 items-center justify-center bg-black"><Text className="text-sm text-white/40">No active markets right now.</Text></View>;

  return (
    <View className="flex-1 bg-black" onLayout={onLayout}>
      {vh > 0 ? (
        <FlatList
          data={list}
          keyExtractor={(o) => o.oracle_id}
          renderItem={({ item, index }) => <PredictCard oracle={item} index={index} height={vh} />}
          pagingEnabled
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, index) => ({ length: vh, offset: vh * index, index })}
        />
      ) : null}
    </View>
  );
}

type Pop = { id: number; dir: "up" | "down" };

function PredictCard({ oracle, index, height }: { oracle: OracleSummary; index: number; height: number }) {
  const id = oracle.oracle_id;
  const state = useQuery({ queryKey: ["oracle-state", id], queryFn: () => getOracleState(id), refetchInterval: 8000 });
  const prices = useQuery({ queryKey: ["oracle-prices", id], queryFn: () => getOraclePrices(id, 120), refetchInterval: 20000 });

  const spot = state.data?.latest_price ? toUsd(state.data.latest_price.spot) : 0;
  const fwd = state.data?.latest_price ? toUsd(state.data.latest_price.forward || state.data.latest_price.spot) : 0;

  const offsets = [0, -1000, 1000, -2000, 2000, -3000, 3000, 5000];
  const [strike, setStrike] = useState(0);
  useEffect(() => {
    if (strike === 0 && fwd > 0) {
      const base = Math.round(fwd / 1000) * 1000;
      setStrike(Math.max(1000, base + (offsets[index % offsets.length] ?? 0)));
    }
  }, [fwd, strike, index]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, oracle.expiry - now);
  const hh = Math.floor(left / 3_600_000);
  const mm = Math.floor((left % 3_600_000) / 60_000);
  const ss = Math.floor((left % 60_000) / 1000);
  const countdown = hh > 0 ? `${hh}h ${mm}m` : `${mm}:${String(ss).padStart(2, "0")}`;

  const upProb = strike > 0 ? impliedUpProb(fwd, strike, left) : 0.5;
  const upFav = upProb >= 0.5;
  const priceSeries = (prices.data ?? []).map((p) => toUsd(p.spot)).filter((n) => n > 0);

  // live pop animation when you tap a side
  const [picked, setPicked] = useState<"up" | "down" | null>(null);
  const [pops, setPops] = useState<Pop[]>([]);
  const idRef = useRef(0);
  const spawn = (dir: "up" | "down") => {
    setPicked(dir);
    const pid = idRef.current++;
    setPops((p) => [...p, { id: pid, dir }]);
    setTimeout(() => setPops((p) => p.filter((q) => q.id !== pid)), 1600);
  };

  return (
    <View
      style={{ height, overflow: "hidden", backgroundColor: upFav ? "#0b1a16" : "#170b0e", paddingTop: 96, paddingBottom: 104 }}
      className="px-5"
    >
      {/* glow */}
      <View pointerEvents="none" style={{ position: "absolute", top: -80, right: -60, width: 280, height: 280, borderRadius: 200, backgroundColor: (upFav ? UP : DOWN) + "20" }} />

      {/* pops */}
      {pops.map((p, i) => (
        <Pop key={p.id} dir={p.dir} offset={i} />
      ))}

      {/* top pills */}
      <View className="flex-row items-center justify-between">
        <View className="flex-row gap-2">
          <View style={{ backgroundColor: "rgba(255,255,255,0.12)" }} className="rounded-full px-3 py-1">
            <Text style={[bold, { color: UP }]} className="text-[11px] uppercase tracking-wider">Crypto</Text>
          </View>
          <View style={{ backgroundColor: "rgba(255,255,255,0.08)" }} className="rounded-full px-3 py-1">
            <Text className="text-[11px] text-white/70">2 options</Text>
          </View>
        </View>
        <View className="flex-row items-center gap-1.5">
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: UP }} />
          <Text className="text-[11px] text-white/60">live</Text>
        </View>
      </View>

      {/* spot + headline */}
      <View className="mt-6 flex-row items-center gap-3">
        <CoinIcon symbol="BTC" size={40} />
        <Text style={black} className="text-3xl text-white">{spot > 0 ? usd0(spot) : "—"}</Text>
        <View style={{ backgroundColor: (upFav ? UP : DOWN) + "33" }} className="rounded-md px-2 py-0.5">
          <Text style={[bold, { color: upFav ? UP : DOWN }]} className="text-xs">{upFav ? "▲ spot" : "▼ spot"}</Text>
        </View>
      </View>
      <Text style={black} className="mt-3 text-[2rem] leading-tight text-white">
        BTC ABOVE {strike > 0 ? usd0(strike) : "…"}
      </Text>
      <Text className="mt-1 text-sm text-white/55">
        BTC · settles {new Date(oracle.expiry).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {countdown}
      </Text>

      {/* chart fills the middle */}
      <View className="my-4 flex-1 justify-center">
        {prices.isLoading ? (
          <View className="h-full items-center justify-center">
            <Text className="text-xs text-white/40">Loading prices…</Text>
          </View>
        ) : (
          <Sparkline values={priceSeries} strike={strike || undefined} height={Math.min(260, height * 0.34)} color={upFav ? UP : DOWN} />
        )}
      </View>

      {/* option chips */}
      <View className="flex-row gap-3">
        <OptionChip label="Up" prob={upProb} color={UP} fav={upFav} active={picked === "up"} onPress={() => spawn("up")} />
        <OptionChip label="Down" prob={1 - upProb} color={DOWN} fav={!upFav} active={picked === "down"} onPress={() => spawn("down")} />
      </View>

      <Text className="mt-3 text-center text-[11px] text-white/45">
        live odds preview · swipe up for the next market
      </Text>
    </View>
  );
}

function OptionChip({ label, prob, color, fav, active, onPress }: { label: string; prob: number; color: string; fav: boolean; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        borderRadius: 18,
        overflow: "hidden",
        borderWidth: 1.5,
        borderColor: active ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.12)",
        backgroundColor: "rgba(0,0,0,0.28)",
        paddingVertical: 14,
        paddingHorizontal: 16,
      }}
    >
      <View style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${prob * 100}%`, backgroundColor: color, opacity: 0.18 }} />
      <View className="flex-row items-center justify-between">
        <Text style={bold} className="text-white">{label}</Text>
        <Text style={[black, { color }]} className="text-lg">{pct(prob)}</Text>
      </View>
      {fav ? <Text style={bold} className="mt-0.5 text-[10px] uppercase tracking-wide text-white/45">favored</Text> : null}
    </Pressable>
  );
}

function Pop({ dir, offset }: { dir: "up" | "down"; offset: number }) {
  const y = useRef(new Animated.Value(0)).current;
  const op = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(y, { toValue: -180, duration: 1500, useNativeDriver: true }),
      Animated.timing(op, { toValue: 0, duration: 1500, useNativeDriver: true }),
    ]).start();
  }, [y, op]);
  return (
    <Animated.Text
      pointerEvents="none"
      style={[
        black,
        {
          position: "absolute",
          bottom: 150,
          left: `${30 + offset * 12 + Math.random() * 30}%`,
          fontSize: 26,
          color: dir === "up" ? UP : DOWN,
          opacity: op,
          transform: [{ translateY: y }],
          zIndex: 10,
        },
      ]}
    >
      {dir === "up" ? "▲" : "▼"}
    </Animated.Text>
  );
}
