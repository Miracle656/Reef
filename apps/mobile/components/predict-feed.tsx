import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, FlatList, type LayoutChangeEvent, Pressable, Share, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Defs, Ellipse, RadialGradient, Stop } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { MONO } from "@/components/ui";
import { getOracleState, listMarkets, toUsd, type OracleSummary } from "@/lib/predict";
import { Sparkline } from "./price-chart";

// Design screen 3 — full-bleed dark predict cards.
const D = {
  bg: "#08080a",
  teal: "#7CFCD8",
  tealDeep: "#18C2C2",
  tealInk: "#04302f",
  orange: "#FF8A5B",
  faint: "rgba(255,255,255,.6)",
};

const MODEL_VOL = 0.6;

function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}
export function impliedUpProb(forward: number, strike: number, ms: number): number {
  if (forward <= 0 || strike <= 0 || ms <= 0) return 0.5;
  const T = ms / (365.25 * 24 * 3600 * 1000);
  const sigT = MODEL_VOL * Math.sqrt(Math.max(T, 1e-9));
  const d2 = (Math.log(forward / strike) - 0.5 * MODEL_VOL * MODEL_VOL * T) / sigT;
  return Math.min(0.98, Math.max(0.02, normCdf(d2)));
}
const usd0 = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
export const usdK = (n: number) => (n >= 1000 ? `$${Math.round(n / 1000)}k` : usd0(n));
const black = { fontFamily: "Expose-Black" } as const;
const bold = { fontFamily: "Expose-Bold" } as const;

export function countdownFor(expiry: number, now: number): string {
  const left = Math.max(0, expiry - now);
  const dd = Math.floor(left / 86_400_000);
  const hh = Math.floor((left % 86_400_000) / 3_600_000);
  const mm = Math.floor((left % 3_600_000) / 60_000);
  const ss = Math.floor((left % 60_000) / 1000);
  if (dd > 0) return `${dd}d ${hh}h`;
  if (hh > 0) return `${hh}h ${mm}m`;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

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
      <View style={{ flex: 1, backgroundColor: D.bg }} className="items-center justify-center">
        <ActivityIndicator color={D.tealDeep} />
        <Text style={{ fontFamily: MONO, fontSize: 11, color: D.faint, marginTop: 12 }}>loading BTC markets…</Text>
      </View>
    );
  }
  if (markets.isError)
    return (
      <View style={{ flex: 1, backgroundColor: D.bg }} className="items-center justify-center">
        <Text style={{ color: D.faint, fontSize: 13 }}>Couldn&apos;t reach the Predict server.</Text>
      </View>
    );
  const list = markets.data ?? [];
  if (list.length === 0)
    return (
      <View style={{ flex: 1, backgroundColor: D.bg }} className="items-center justify-center">
        <Text style={{ color: D.faint, fontSize: 13 }}>No active markets right now.</Text>
      </View>
    );

  return (
    <View style={{ flex: 1, backgroundColor: D.bg }} onLayout={onLayout}>
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
  const router = useRouter();
  const state = useQuery({ queryKey: ["oracle-state", id], queryFn: () => getOracleState(id), refetchInterval: 8000 });

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
  const countdown = countdownFor(oracle.expiry, now);
  const left = Math.max(0, oracle.expiry - now);

  const upProb = strike > 0 ? impliedUpProb(fwd, strike, left) : 0.5;
  const yesPct = Math.round(upProb * 100);
  const settles = new Date(oracle.expiry);
  const settleDay = settles.toLocaleDateString(undefined, { weekday: "long" });
  const settleTime = settles.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  // live pop animation when you tap a side
  const [pops, setPops] = useState<Pop[]>([]);
  const idRef = useRef(0);
  const spawn = (dir: "up" | "down") => {
    const pid = idRef.current++;
    setPops((p) => [...p, { id: pid, dir }]);
    setTimeout(() => setPops((p) => p.filter((q) => q.id !== pid)), 1600);
  };

  const openDetail = () =>
    router.push(`/predict/${id}?strike=${strike}&expiry=${oracle.expiry}` as never);

  return (
    <View style={{ height, overflow: "hidden", backgroundColor: D.bg, paddingHorizontal: 24, paddingBottom: 40, justifyContent: "center" }}>
      {/* radial glows: sunset above, ocean below */}
      <Svg pointerEvents="none" width="100%" height="100%" style={{ position: "absolute", top: 0, left: 0 }}>
        <Defs>
          <RadialGradient id="warm" cx="50%" cy="8%" rx="65%" ry="42%">
            <Stop offset="0" stopColor={D.orange} stopOpacity={0.34} />
            <Stop offset="1" stopColor={D.orange} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="cool" cx="50%" cy="100%" rx="65%" ry="38%">
            <Stop offset="0" stopColor="#0A84FF" stopOpacity={0.34} />
            <Stop offset="1" stopColor="#0A84FF" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx="50%" cy="8%" rx="65%" ry="42%" fill="url(#warm)" />
        <Ellipse cx="50%" cy="100%" rx="65%" ry="38%" fill="url(#cool)" />
      </Svg>

      {/* pops */}
      {pops.map((p, i) => (
        <PopArrow key={p.id} dir={p.dir} offset={i} />
      ))}

      {/* label */}
      <View className="flex-row items-center" style={{ gap: 8, marginBottom: 16 }}>
        <Ionicons name="locate-outline" size={14} color={D.orange} />
        <Text style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 1.8, textTransform: "uppercase", color: D.orange }}>
          Predict · DeepBook
        </Text>
      </View>

      {/* headline → detail */}
      <Pressable onPress={openDetail}>
        <Text style={[black, { fontSize: 38, lineHeight: 40, letterSpacing: -0.8, color: "#fff" }]}>
          BTC &gt; {strike > 0 ? usdK(strike) : "…"}{"\n"}by {settleDay}{"\n"}{settleTime}?
        </Text>
      </Pressable>

      {/* probability */}
      <View className="flex-row items-end" style={{ gap: 10, marginTop: 26, marginBottom: 12 }}>
        <Text style={[black, { fontSize: 84, lineHeight: 70, color: D.teal }]}>{yesPct}</Text>
        <Text style={{ fontFamily: MONO, fontSize: 15, color: "rgba(255,255,255,.7)", marginBottom: 6 }}>% say YES</Text>
      </View>
      <View style={{ height: 9, borderRadius: 10, backgroundColor: "rgba(255,255,255,.14)", overflow: "hidden", marginBottom: 8 }}>
        <LinearGradient colors={[D.teal, D.tealDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: `${yesPct}%`, height: "100%" }} />
      </View>
      <View className="flex-row justify-between" style={{ marginBottom: 26 }}>
        <Text style={{ fontFamily: MONO, fontSize: 11, color: D.faint }}>spot {spot > 0 ? usd0(spot) : "—"}</Text>
        <Text style={{ fontFamily: MONO, fontSize: 11, color: D.faint }}>closes in {countdown}</Text>
      </View>

      {/* YES / NO */}
      <View className="flex-row" style={{ gap: 12 }}>
        <Pressable
          onPress={() => spawn("up")}
          style={{ flex: 1, backgroundColor: D.tealDeep, paddingVertical: 16, borderRadius: 16, alignItems: "center" }}
        >
          <Text style={[bold, { fontSize: 17, color: D.tealInk }]}>YES · {upProb.toFixed(2)}</Text>
        </Pressable>
        <Pressable
          onPress={() => spawn("down")}
          style={{
            flex: 1,
            backgroundColor: "rgba(255,255,255,.12)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,.2)",
            paddingVertical: 16,
            borderRadius: 16,
            alignItems: "center",
          }}
        >
          <Text style={[bold, { fontSize: 17, color: "#fff" }]}>NO · {(1 - upProb).toFixed(2)}</Text>
        </Pressable>
      </View>

      {/* right action rail */}
      <View style={{ position: "absolute", right: 16, bottom: 150, gap: 22, alignItems: "center" }}>
        <RailAction icon="water" label={`${yesPct * 3 + 40}`} onPress={() => spawn("up")} />
        <RailAction icon="chatbubble" label="Chat" onPress={openDetail} />
        <RailAction
          icon="arrow-redo"
          label="Share"
          onPress={() =>
            Share.share({ message: `BTC > ${usdK(strike)} by ${settleDay} ${settleTime}? ${yesPct}% say YES — predict it on ReeF 🪸` }).catch(() => {})
          }
        />
      </View>

      {/* swipe hint */}
      <View style={{ position: "absolute", bottom: 46, left: 0, right: 0, alignItems: "center", gap: 4 }}>
        <Ionicons name="chevron-up" size={14} color="rgba(255,255,255,.55)" />
        <Text style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", color: "rgba(255,255,255,.55)" }}>
          swipe for next market
        </Text>
      </View>
    </View>
  );
}

function RailAction({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ alignItems: "center", gap: 5 }}>
      <Ionicons name={icon} size={30} color="#fff" />
      <Text style={{ fontFamily: MONO, fontSize: 10.5, color: "#fff" }}>{label}</Text>
    </Pressable>
  );
}

function PopArrow({ dir, offset }: { dir: "up" | "down"; offset: number }) {
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
          color: dir === "up" ? D.teal : D.orange,
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
