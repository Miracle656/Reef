import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { MONO } from "@/components/ui";
import { Sparkline } from "@/components/price-chart";
import { countdownFor, impliedUpProb, usdK } from "@/components/predict-feed";
import { getOraclePrices, getOracleState, toUsd } from "@/lib/predict";

// Design screen 7 — dark predict market detail.
const D = {
  bg: "#0b0b0e",
  text: "#EAE7DF",
  faint: "#9A9AA6",
  panel: "#15151A",
  teal: "#7CFCD8",
  tealDeep: "#18C2C2",
  tealInk: "#04302f",
  orange: "#FF8A5B",
};

const black = { fontFamily: "Expose-Black" } as const;
const bold = { fontFamily: "Expose-Bold" } as const;
const usd0 = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default function PredictDetail() {
  const { id, strike: strikeParam, expiry: expiryParam } = useLocalSearchParams<{ id: string; strike?: string; expiry?: string }>();
  const router = useRouter();
  const strike = Number(strikeParam) || 0;
  const expiry = Number(expiryParam) || 0;

  const state = useQuery({ queryKey: ["oracle-state", id], queryFn: () => getOracleState(id!), refetchInterval: 8000, enabled: Boolean(id) });
  const prices = useQuery({ queryKey: ["oracle-prices", id], queryFn: () => getOraclePrices(id!, 120), refetchInterval: 20000, enabled: Boolean(id) });

  const spot = state.data?.latest_price ? toUsd(state.data.latest_price.spot) : 0;
  const fwd = state.data?.latest_price ? toUsd(state.data.latest_price.forward || state.data.latest_price.spot) : 0;
  const priceSeries = (prices.data ?? []).map((p) => toUsd(p.spot)).filter((n) => n > 0);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, expiry - now);
  const upProb = strike > 0 ? impliedUpProb(fwd, strike, left) : 0.5;
  const yesPct = Math.round(upProb * 100);

  const settles = new Date(expiry);
  const settleDay = settles.toLocaleDateString(undefined, { weekday: "long" });
  const settleTime = settles.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  const [side, setSide] = useState<"yes" | "no">("yes");

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: D.bg }} edges={["top"]}>
      <StatusBar style="light" />

      {/* header */}
      <View className="flex-row items-center" style={{ gap: 14, paddingHorizontal: 20, paddingVertical: 10 }}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={D.text} />
        </Pressable>
        <Text style={[bold, { fontSize: 15, color: D.text }]}>BTC binary</Text>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        {/* label */}
        <View className="flex-row items-center" style={{ gap: 6, marginTop: 4 }}>
          <Ionicons name="locate-outline" size={12} color={D.orange} />
          <Text style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: D.orange }}>
            Predict · DeepBook
          </Text>
        </View>

        {/* headline */}
        <Text style={[black, { fontSize: 26, lineHeight: 29, letterSpacing: -0.5, color: D.text, marginTop: 12 }]}>
          BTC &gt; {strike > 0 ? usdK(strike) : "…"} by {settleDay} {settleTime}?
        </Text>

        {/* probability */}
        <View className="flex-row items-end" style={{ gap: 8, marginTop: 20, marginBottom: 6 }}>
          <Text style={[black, { fontSize: 56, lineHeight: 46, color: D.teal }]}>{yesPct}</Text>
          <Text style={{ fontFamily: MONO, fontSize: 13, color: D.faint, marginBottom: 4 }}>% YES</Text>
        </View>

        {/* chart */}
        <View style={{ height: 150, marginVertical: 14 }}>
          {priceSeries.length < 2 ? (
            <View className="flex-1 items-center justify-center">
              <Text style={{ fontFamily: MONO, fontSize: 11, color: D.faint }}>loading prices…</Text>
            </View>
          ) : (
            <Sparkline values={priceSeries} strike={strike || undefined} color={D.tealDeep} height={150} />
          )}
        </View>

        <View className="flex-row justify-between" style={{ marginBottom: 18 }}>
          <Text style={{ fontFamily: MONO, fontSize: 11, color: D.faint }}>spot {spot > 0 ? usd0(spot) : "—"}</Text>
          <Text style={{ fontFamily: MONO, fontSize: 11, color: D.faint }}>closes {countdownFor(expiry, now)}</Text>
        </View>

        {/* BUY YES / BUY NO */}
        <View className="flex-row" style={{ gap: 11 }}>
          <Pressable
            onPress={() => setSide("yes")}
            style={{
              flex: 1,
              backgroundColor: D.panel,
              borderWidth: 1,
              borderColor: side === "yes" ? "rgba(24,194,194,.4)" : "transparent",
              borderRadius: 16,
              padding: 16,
            }}
          >
            <Text style={{ fontFamily: MONO, fontSize: 10.5, color: D.faint, marginBottom: 6 }}>BUY YES</Text>
            <Text style={[black, { fontSize: 24, color: D.teal }]}>{upProb.toFixed(2)}</Text>
          </Pressable>
          <Pressable
            onPress={() => setSide("no")}
            style={{
              flex: 1,
              backgroundColor: D.panel,
              borderWidth: 1,
              borderColor: side === "no" ? "rgba(255,138,91,.4)" : "transparent",
              borderRadius: 16,
              padding: 16,
            }}
          >
            <Text style={{ fontFamily: MONO, fontSize: 10.5, color: D.faint, marginBottom: 6 }}>BUY NO</Text>
            <Text style={[black, { fontSize: 24, color: D.orange }]}>{(1 - upProb).toFixed(2)}</Text>
          </Pressable>
        </View>

        {/* CTA */}
        <Pressable
          disabled
          style={{
            width: "100%",
            marginTop: 14,
            backgroundColor: side === "yes" ? D.tealDeep : D.orange,
            paddingVertical: 15,
            borderRadius: 16,
            alignItems: "center",
            opacity: 0.9,
          }}
        >
          <Text style={[bold, { fontSize: 16, color: side === "yes" ? D.tealInk : "#3a1607" }]}>
            Bet {side.toUpperCase()} · gasless
          </Text>
        </Pressable>
        <Text style={{ fontFamily: MONO, fontSize: 10.5, color: D.teal, textAlign: "center", padding: 12 }}>
          ⛽ settled by the orderbook
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
