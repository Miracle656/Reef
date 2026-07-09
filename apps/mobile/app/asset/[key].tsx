import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { palette } from "@umbra/ui";
import { Button, Spinner } from "@/components/ui";
import { CoinIcon } from "@/components/market-select";
import { PriceChart } from "@/components/price-chart";
import { OrderBook } from "@/components/order-book";
import { BottomNav } from "@/components/bottom-nav";
import { PAIRS, fetchOrderBook } from "@/lib/deepbook";

const black = { fontFamily: "Expose-Black" } as const;
const bold = { fontFamily: "Expose-Bold" } as const;

const NAMES: Record<string, string> = {
  SUI: "Sui",
  DEEP: "DeepBook",
  DBUSDC: "USD Coin",
  DBUSDT: "Tether",
  WAL: "Walrus",
  DBTC: "Bitcoin",
  SULTAN: "Sultan Coin",
};

const TIMEFRAMES = ["1H", "1D", "1W", "1M", "1Y", "All"] as const;

const fmtPrice = (p: number) => (p === 0 ? "—" : p < 1 ? p.toPrecision(4) : p.toLocaleString(undefined, { maximumFractionDigits: 4 }));
const fmtQty = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(2)}K` : n.toLocaleString(undefined, { maximumFractionDigits: 2 }));

export default function AssetDetail() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const router = useRouter();
  const pair = PAIRS.find((p) => p.key === key) ?? PAIRS[0]!;

  const [tf, setTf] = useState<(typeof TIMEFRAMES)[number]>("1D");
  const [activity, setActivity] = useState<"trades" | "orders">("orders");

  const book = useQuery({
    queryKey: ["orderbook", pair.key],
    queryFn: () => fetchOrderBook(pair.key),
    refetchInterval: 6000,
  });
  const data = book.data;
  const mid = data?.mid ?? 0;
  const bestBid = data?.bids?.[0]?.price ?? 0;
  const bestAsk = data?.asks?.[0]?.price ?? 0;
  const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0;
  const liquidity =
    (data?.bids ?? []).reduce((s, l) => s + l.size * l.price, 0) + (data?.asks ?? []).reduce((s, l) => s + l.size * l.price, 0);

  const name = NAMES[pair.base] ?? pair.base;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      {/* header */}
      <View className="flex-row items-center justify-between border-b border-border px-4 pb-2">
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={palette.light.ink} />
        </Pressable>
        <View className="flex-row items-center gap-2">
          <CoinIcon symbol={pair.base} size={28} />
          <Text style={bold} className="text-lg text-ink">{pair.base}</Text>
          <Ionicons name="checkmark-circle" size={16} color={palette.light.accent} />
        </View>
        <View className="flex-row items-center gap-4">
          <Ionicons name="star-outline" size={22} color={palette.light.inkSoft} />
          <Ionicons name="ellipsis-horizontal" size={22} color={palette.light.inkSoft} />
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 150 }} showsVerticalScrollIndicator={false}>
        {/* price */}
        <View className="px-4 pt-4">
          <Text style={bold} className="text-2xl text-ink">{name}</Text>
          <Text style={black} className="mt-1 text-4xl text-ink">
            {mid > 0 ? `${fmtPrice(mid)} ` : "— "}
            <Text className="text-xl text-ink-soft">{pair.quote}</Text>
          </Text>
          <View className="mt-1 flex-row items-center gap-1.5">
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: palette.light.accent }} />
            <Text className="text-sm text-ink-soft">live · testnet mid price</Text>
          </View>
        </View>

        {/* chart */}
        <View className="mt-3 px-2">
          <PriceChart poolKey={pair.key} />
        </View>

        {/* timeframe tabs */}
        <View className="mt-2 flex-row items-center justify-between px-4">
          <View className="flex-row gap-1">
            {TIMEFRAMES.map((t) => (
              <Pressable key={t} onPress={() => setTf(t)} className={`rounded-full px-3 py-1.5 ${tf === t ? "bg-surface-muted" : ""}`}>
                <Text className={`text-sm ${tf === t ? "font-bold text-ink" : "text-ink-faint"}`}>{t}</Text>
              </Pressable>
            ))}
          </View>
          <View className="rounded-full border border-border p-2">
            <Ionicons name="stats-chart-outline" size={16} color={palette.light.inkSoft} />
          </View>
        </View>

        {/* balance */}
        <View className="mx-4 mt-4 rounded-2xl bg-surface-muted px-4 py-4">
          <Text style={black} className="text-2xl text-ink">$0.00</Text>
          <Text className="text-sm text-ink-faint">0 {pair.base}</Text>
        </View>

        {/* stats */}
        <View className="mt-6 px-4">
          <Text style={bold} className="mb-2 text-xl text-ink">Stats</Text>
          <StatRow label="Mid price" value={mid > 0 ? `${fmtPrice(mid)} ${pair.quote}` : "—"} />
          <StatRow label="Best bid" value={bestBid > 0 ? fmtPrice(bestBid) : "—"} />
          <StatRow label="Best ask" value={bestAsk > 0 ? fmtPrice(bestAsk) : "—"} />
          <StatRow label="Spread" value={spread > 0 ? fmtPrice(spread) : "—"} />
          <StatRow label="Book liquidity" value={liquidity > 0 ? `${fmtQty(liquidity)} ${pair.quote}` : "—"} />
          <StatRow label="Pair" value={`${pair.base} / ${pair.quote}`} last />
        </View>

        {/* activity */}
        <View className="mt-6 px-4">
          <Text style={bold} className="mb-3 text-xl text-ink">Activity</Text>
          <View className="flex-row rounded-full bg-surface-muted p-1">
            {(["trades", "orders"] as const).map((a) => (
              <Pressable
                key={a}
                onPress={() => setActivity(a)}
                style={activity === a ? { backgroundColor: palette.light.surface, shadowColor: "#16161A", shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 } : undefined}
                className="flex-1 items-center rounded-full py-2.5"
              >
                <Text style={bold} className={`capitalize ${activity === a ? "text-ink" : "text-ink-faint"}`}>{a}</Text>
              </Pressable>
            ))}
          </View>

          <View className="mt-3">
            {activity === "orders" ? (
              book.isLoading ? (
                <View className="items-center py-10"><Spinner /></View>
              ) : (
                <OrderBook book={data} base={pair.base} quote={pair.quote} />
              )
            ) : (
              <View className="items-center py-12">
                <Ionicons name="pulse-outline" size={28} color={palette.light.inkFaint} />
                <Text style={bold} className="mt-2 text-lg text-ink">No recent trades</Text>
                <Text className="mt-1 text-sm text-ink-faint">Fills for this market will show up here.</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* sticky buy */}
      <View className="absolute bottom-0 left-0 right-0 border-t border-border bg-surface px-4 pb-7 pt-3">
        <Button label={`Trade ${pair.base}`} variant="accent" onPress={() => router.push("/trade")} />
        <Text className="mt-1.5 text-center text-xs text-ink-faint">Order placement needs a funded wallet — wiring next.</Text>
      </View>

      <BottomNav />
    </SafeAreaView>
  );
}

function StatRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View className={`flex-row items-center justify-between py-3 ${last ? "" : "border-b border-border"}`}>
      <Text className="text-ink-soft">{label}</Text>
      <Text style={bold} className="text-ink">{value}</Text>
    </View>
  );
}
