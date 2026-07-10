import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { MONO, Spinner } from "@/components/ui";
import { Keypad, applyKey } from "@/components/keypad";
import { CoinIcon } from "@/components/market-select";
import { Sparkline } from "@/components/price-chart";
import { OrderBook } from "@/components/order-book";
import { PAIRS, fetchMid, fetchOrderBook } from "@/lib/deepbook";

const black = { fontFamily: "Expose-Black" } as const;
const bold = { fontFamily: "Expose-Bold" } as const;

// Design screen 2 — dark pair terminal palette. Shared by /trade and /asset/[key].
export const D = {
  bg: "#0b0b0e",
  text: "#EAE7DF",
  faint: "#9A9AA6",
  panel: "#15151A",
  hair: "rgba(234,231,223,.1)",
  chip: "rgba(234,231,223,.1)",
  teal: "#7CFCD8",
  line: "#18C2C2",
  accent: "#0A84FF",
};

const NAMES: Record<string, string> = {
  SUI: "Sui",
  DEEP: "DeepBook",
  DBUSDC: "USD Coin",
  DBUSDT: "Tether",
  WAL: "Walrus",
  DBTC: "Bitcoin",
  SULTAN: "Sultan Coin",
};

const TIMEFRAMES = ["1H", "1D", "1W", "ALL"] as const;

const fmtPrice = (p: number) => (p === 0 ? "—" : p < 1 ? p.toPrecision(4) : p.toLocaleString(undefined, { maximumFractionDigits: 4 }));
const fmtNum = (n: number) =>
  n === 0 ? "0" : n < 1 ? Number(n.toPrecision(4)).toString() : n.toLocaleString(undefined, { maximumFractionDigits: 4 });

/** The dark trade terminal (price head → chart → swap panel → order book). */
export function TradeTerminal({ pairKey, header }: { pairKey: string; header?: React.ReactNode }) {
  const pair = PAIRS.find((p) => p.key === pairKey) ?? PAIRS[0]!;

  const [tf, setTf] = useState<(typeof TIMEFRAMES)[number]>("1H");

  const book = useQuery({
    queryKey: ["orderbook", pair.key],
    queryFn: () => fetchOrderBook(pair.key),
    refetchInterval: 6000,
  });
  const mid = book.data?.mid ?? 0;

  // Accumulated live mid history — drives the chart AND the change chip.
  const [pts, setPts] = useState<number[]>([]);
  useEffect(() => {
    let alive = true;
    setPts([]);
    const tick = async () => {
      const m = await fetchMid(pair.key).catch(() => 0);
      if (alive && m > 0) setPts((p) => [...p.slice(-47), m]);
    };
    void tick();
    const id = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [pair.key]);
  const change = pts.length >= 2 && pts[0]! > 0 ? ((pts[pts.length - 1]! - pts[0]!) / pts[0]!) * 100 : null;
  const up = (change ?? 0) >= 0;

  // Swap state: sell base → receive quote, flippable.
  const [payBase, setPayBase] = useState(true);
  const [amount, setAmount] = useState("0");
  const [editing, setEditing] = useState(false);
  const payToken = payBase ? pair.base : pair.quote;
  const recvToken = payBase ? pair.quote : pair.base;
  const amt = Number(amount) || 0;
  const recv = mid > 0 ? (payBase ? amt * mid : amt / mid) : 0;

  const name = NAMES[pair.base] ?? pair.base;

  return (
    <>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 150 }} showsVerticalScrollIndicator={false}>
        {header}

        {/* price head */}
        <View className="flex-row items-center" style={{ gap: 13, marginTop: 8 }}>
          <CoinIcon symbol={pair.base} size={48} />
          <View>
            <Text style={{ fontFamily: MONO, fontSize: 11, color: D.faint }}>{name}</Text>
            <Text style={[black, { fontSize: 30, letterSpacing: -0.6, color: D.text }]}>
              {mid > 0 ? fmtPrice(mid) : "—"} <Text style={{ fontSize: 16, color: D.faint, fontFamily: "Expose-Medium" }}>{pair.quote}</Text>
            </Text>
          </View>
          <View
            style={{
              marginLeft: "auto",
              backgroundColor: up ? "rgba(124,252,216,.12)" : "rgba(255,138,91,.12)",
              paddingHorizontal: 11,
              paddingVertical: 5,
              borderRadius: 100,
            }}
          >
            <Text style={{ fontFamily: MONO, fontWeight: "700", fontSize: 14, color: up ? D.teal : "#FF8A5B" }}>
              {change == null ? "live" : `${up ? "+" : ""}${change.toFixed(1)}%`}
            </Text>
          </View>
        </View>

        {/* chart */}
        <View style={{ marginTop: 20, marginBottom: 10, height: 150 }}>
          {pts.length < 2 ? (
            <View className="flex-1 items-center justify-center">
              <Text style={{ fontFamily: MONO, fontSize: 11, color: D.faint }}>collecting live prices…</Text>
            </View>
          ) : (
            <Sparkline values={pts} color={D.line} height={150} />
          )}
        </View>

        {/* timeframe chips */}
        <View className="flex-row" style={{ gap: 7, marginBottom: 22 }}>
          {TIMEFRAMES.map((t) => (
            <Pressable
              key={t}
              onPress={() => setTf(t)}
              style={{ flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: 10, backgroundColor: tf === t ? D.chip : "transparent" }}
            >
              <Text style={{ fontFamily: MONO, fontSize: 12, color: tf === t ? "#fff" : D.faint }}>{t}</Text>
            </Pressable>
          ))}
        </View>

        {/* swap panel */}
        <View style={{ backgroundColor: D.panel, borderRadius: 20, padding: 6 }}>
          <Pressable onPress={() => setEditing(true)} style={{ padding: 16 }} className="flex-row items-center justify-between">
            <View>
              <Text style={{ fontFamily: MONO, fontSize: 10.5, color: D.faint, marginBottom: 5 }}>YOU PAY</Text>
              <Text style={[bold, { fontSize: 26, color: editing ? D.accent : D.text }]}>{amount}</Text>
            </View>
            <View className="flex-row items-center" style={{ gap: 8, backgroundColor: D.chip, paddingVertical: 7, paddingLeft: 7, paddingRight: 12, borderRadius: 100 }}>
              <CoinIcon symbol={payToken} size={26} />
              <Text style={[bold, { fontSize: 15, color: D.text }]}>{payToken}</Text>
            </View>
          </Pressable>

          <View style={{ height: 1, backgroundColor: D.hair, marginHorizontal: 12 }} />

          <View style={{ padding: 16 }} className="flex-row items-center justify-between">
            <View>
              <Text style={{ fontFamily: MONO, fontSize: 10.5, color: D.faint, marginBottom: 5 }}>YOU RECEIVE</Text>
              <Text style={[bold, { fontSize: 26, color: D.teal }]}>{fmtNum(recv)}</Text>
            </View>
            <View className="flex-row items-center" style={{ gap: 8, backgroundColor: D.chip, paddingVertical: 7, paddingLeft: 7, paddingRight: 12, borderRadius: 100 }}>
              <CoinIcon symbol={recvToken} size={26} />
              <Text style={[bold, { fontSize: 15, color: D.text }]}>{recvToken}</Text>
            </View>
          </View>

          {/* flip */}
          <Pressable
            onPress={() => setPayBase((v) => !v)}
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: [{ translateX: -19 }, { translateY: -19 }],
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: D.accent,
              borderWidth: 4,
              borderColor: D.bg,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="swap-vertical" size={17} color="#fff" />
          </Pressable>
        </View>

        {/* rate + gas */}
        <View className="flex-row justify-between" style={{ paddingVertical: 14, paddingHorizontal: 4 }}>
          <Text style={{ fontFamily: MONO, fontSize: 11, color: D.faint }}>
            1 {payToken} = {mid > 0 ? fmtNum(payBase ? mid : 1 / mid) : "—"} {recvToken}
          </Text>
          <View className="flex-row items-center" style={{ gap: 5 }}>
            <Ionicons name="flash" size={12} color={D.teal} />
            <Text style={{ fontFamily: MONO, fontSize: 11, color: D.teal }}>gas sponsored</Text>
          </View>
        </View>

        {/* CTA */}
        <Pressable
          style={{ width: "100%", backgroundColor: D.accent, paddingVertical: 17, borderRadius: 18, alignItems: "center", opacity: amt > 0 ? 1 : 0.55 }}
          disabled
        >
          <Text style={[bold, { fontSize: 17, color: "#fff" }]}>Swap · gasless</Text>
        </Pressable>
        <Text style={{ fontFamily: MONO, fontSize: 10.5, color: D.faint, textAlign: "center", paddingTop: 10 }}>
          order placement wires up next — same DeepBook path as web
        </Text>

        {/* live order book */}
        <View style={{ marginTop: 26 }}>
          <Text style={[bold, { fontSize: 18, color: D.text, marginBottom: 12 }]}>Order book</Text>
          {book.isLoading ? (
            <View className="items-center py-10"><Spinner /></View>
          ) : (
            <OrderBook book={book.data} base={pair.base} quote={pair.quote} dark />
          )}
        </View>
      </ScrollView>

      <Keypad visible={editing} onKey={(k) => setAmount((c) => applyKey(c, k))} onDone={() => setEditing(false)} />
    </>
  );
}
