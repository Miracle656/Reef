import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { palette } from "@umbra/ui";
import { Button } from "@/components/ui";
import { MarketSelect, CoinIcon } from "@/components/market-select";
import { PredictFeed } from "@/components/predict-feed";
import { BottomNav } from "@/components/bottom-nav";
import { PAIRS, fetchOrderBook } from "@/lib/deepbook";

const black = { fontFamily: "Expose-Black" } as const;
const bold = { fontFamily: "Expose-Bold" } as const;

const fmtNum = (n: number) =>
  n === 0 ? "0" : n < 1 ? Number(n.toPrecision(4)).toString() : n.toLocaleString(undefined, { maximumFractionDigits: 4 });

export default function TradeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<"trade" | "predict">("trade");

  const nav = (floating: boolean) => (
    <View
      pointerEvents="box-none"
      style={floating ? { position: "absolute", top: insets.top + 6, left: 0, right: 0, zIndex: 20 } : undefined}
      className="flex-row items-center justify-between px-4 pb-2 pt-1"
    >
      <Pressable onPress={() => router.back()} hitSlop={10}>
        <Text className={`text-2xl ${floating ? "text-white" : "text-ink"}`}>‹</Text>
      </Pressable>
      <View className={`flex-row gap-1 rounded-full p-1 ${floating ? "bg-black/40" : "bg-surface-muted"}`}>
        {(["trade", "predict"] as const).map((m) => (
          <Pressable key={m} onPress={() => setMode(m)} className={`rounded-full px-4 py-1.5 ${mode === m ? (floating ? "bg-white" : "bg-ink") : ""}`}>
            <Text
              className={`text-sm font-semibold capitalize ${
                mode === m ? (floating ? "text-black" : "text-on-ink") : floating ? "text-white/70" : "text-ink-soft"
              }`}
            >
              {m}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={{ width: 16 }} />
    </View>
  );

  if (mode === "predict") {
    return (
      <View className="flex-1 bg-black">
        <PredictFeed />
        {nav(true)}
        <BottomNav />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      {nav(false)}
      <Swap />
      <BottomNav />
    </SafeAreaView>
  );
}

/** Apply a keypad press to a numeric string. */
function applyKey(cur: string, key: string): string {
  if (key === "⌫") {
    const next = cur.slice(0, -1);
    return next === "" ? "0" : next;
  }
  if (key === ".") return cur.includes(".") ? cur : `${cur}.`;
  if (cur === "0") return key; // replace leading zero
  return `${cur}${key}`;
}

function Swap() {
  const router = useRouter();
  const [pairKey, setPairKey] = useState(PAIRS[0]!.key);
  const pair = PAIRS.find((p) => p.key === pairKey) ?? PAIRS[0]!;
  const openDetail = () => router.push(`/asset/${pairKey}` as never);

  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("0");
  const [limitPrice, setLimitPrice] = useState("0");
  const [editing, setEditing] = useState<"amount" | "price" | null>(null);

  const book = useQuery({
    queryKey: ["orderbook", pairKey],
    queryFn: () => fetchOrderBook(pairKey),
    refetchInterval: 6000,
  });
  const mid = book.data?.mid ?? 0;
  const price = orderType === "limit" && Number(limitPrice) > 0 ? Number(limitPrice) : mid;

  // buy = pay quote, receive base; sell = pay base, receive quote.
  const payToken = side === "buy" ? pair.quote : pair.base;
  const recvToken = side === "buy" ? pair.base : pair.quote;
  const amt = Number(amount) || 0;
  const recv = price > 0 ? (side === "buy" ? amt / price : amt * price) : 0;
  const rate = side === "buy" ? (price > 0 ? 1 / price : 0) : price;

  const onKey = (k: string) => {
    if (editing === "amount") setAmount((c) => applyKey(c, k));
    else if (editing === "price") setLimitPrice((c) => applyKey(c, k));
  };

  return (
    <View className="flex-1">
      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 130, gap: 12 }} keyboardShouldPersistTaps="handled">
        {/* market selector */}
        <View className="items-center pt-1">
          <MarketSelect value={pairKey} onChange={setPairKey} />
        </View>

        {/* Market / Limit */}
        <View className="flex-row rounded-full bg-surface-muted p-1">
          {(["market", "limit"] as const).map((t) => (
            <Pressable
              key={t}
              onPress={() => setOrderType(t)}
              style={orderType === t ? { backgroundColor: palette.light.surface, shadowColor: "#16161A", shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 } : undefined}
              className="flex-1 items-center rounded-full py-2.5"
            >
              <Text style={bold} className={`text-base capitalize ${orderType === t ? "text-accent" : "text-ink-faint"}`}>
                {t}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Pay card */}
        <View className="rounded-3xl bg-surface-muted p-4">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <CoinIcon symbol={payToken} size={32} />
              <Text style={bold} className="text-lg text-ink">{payToken}</Text>
            </View>
            <View className="flex-row gap-1.5">
              {["50%", "75%", "Max"].map((c) => (
                <View key={c} className="rounded-full bg-surface px-3 py-1">
                  <Text className="text-xs font-semibold text-ink-soft">{c}</Text>
                </View>
              ))}
            </View>
          </View>
          <Pressable onPress={() => setEditing("amount")} className="items-center py-3">
            <Text style={black} className={`text-5xl ${editing === "amount" ? "text-accent" : "text-ink"}`}>
              {amount}
            </Text>
            <Text className="mt-1 text-sm text-ink-faint">≈ {fmtNum(recv)} {recvToken}</Text>
          </Pressable>
          <Text className="text-center text-xs text-ink-faint">Balance 0 {payToken}</Text>
        </View>

        {/* swap direction */}
        <View className="items-center" style={{ marginVertical: -8, zIndex: 5 }}>
          <Pressable
            onPress={() => setSide((s) => (s === "buy" ? "sell" : "buy"))}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: palette.light.surface, borderWidth: 1, borderColor: palette.light.border }}
            className="items-center justify-center shadow-sm"
          >
            <Ionicons name="arrow-down" size={20} color={palette.light.accent} />
          </Pressable>
        </View>

        {/* Receive card → tap the token to open its detail page */}
        <Pressable onPress={openDetail} className="flex-row items-center justify-between rounded-3xl bg-surface-muted p-4">
          <View className="flex-row items-center gap-2">
            <CoinIcon symbol={recvToken} size={32} />
            <Text style={bold} className="text-lg text-ink">{recvToken}</Text>
            <Text className="text-ink-faint">›</Text>
          </View>
          <Text style={bold} className="text-2xl text-ink">{fmtNum(recv)}</Text>
        </Pressable>

        {/* limit price OR market rate (tap rate to open chart + detail) */}
        {orderType === "limit" ? (
          <Pressable onPress={() => setEditing("price")} className="flex-row items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3">
            <Text className="text-sm text-ink-soft">Limit price ({pair.quote})</Text>
            <Text style={bold} className={`text-base ${editing === "price" ? "text-accent" : "text-ink"}`}>{limitPrice}</Text>
          </Pressable>
        ) : (
          <Pressable onPress={openDetail} className="flex-row items-center justify-between rounded-2xl bg-surface-muted px-4 py-3">
            <Text className="text-sm text-ink-soft">
              1 {payToken} ≈ <Text style={bold} className="text-ink">{fmtNum(rate)}</Text> {recvToken}
            </Text>
            <Text className="text-ink-faint">›</Text>
          </Pressable>
        )}

        <Button label="Continue" variant="accent" disabled onPress={() => {}} />
        <Text className="text-center text-xs text-ink-faint">
          Order placement needs a linked funded wallet + BalanceManager — wiring next (same as web).
        </Text>
      </ScrollView>

      {/* in-app keypad sheet */}
      <Keypad visible={editing !== null} onKey={onKey} onDone={() => setEditing(null)} />
    </View>
  );
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"];

function Keypad({ visible, onKey, onDone }: { visible: boolean; onKey: (k: string) => void; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDone}>
      <Pressable className="flex-1" onPress={onDone} />
      <View style={{ paddingBottom: Math.max(insets.bottom, 12) }} className="rounded-t-3xl border-t border-border bg-surface px-4 pt-3">
        <View className="mb-1 flex-row items-center justify-between">
          <View />
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: palette.light.border }} />
          <Pressable onPress={onDone} className="rounded-full bg-accent px-4 py-1.5">
            <Text style={bold} className="text-sm text-on-accent">Done</Text>
          </Pressable>
        </View>
        <View className="flex-row flex-wrap">
          {KEYS.map((k) => (
            <Pressable key={k} onPress={() => onKey(k)} style={{ width: "33.33%" }} className="items-center justify-center py-4">
              <Text style={black} className="text-2xl text-ink">{k}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}

