import { useState } from "react";
import { FlatList, Image, Modal, Pressable, Text, View } from "react-native";
import { palette } from "@umbra/ui";
import { PAIRS } from "@/lib/deepbook";

const SUI_IMG = require("../assets/sui.png");
const DEEP_IMG = require("../assets/deep.webp");
const WAL_IMG = require("../assets/wal.png");
const USDC_IMG = require("../assets/usdc.png");
const USDT_IMG = require("../assets/usdt.png");
const BTC_IMG = require("../assets/btc.png");

/** Placeholder coin colors (used only when there's no logo image). */
const COIN_COLORS: Record<string, string> = {
  SULTAN: "#7c3aed",
  ETH: "#627eea",
  SOL: "#9945ff",
};

/** Logo for a symbol. `contain` = transparent mark that needs a white badge. */
function logoFor(symbol: string): { src: number; contain?: boolean } | null {
  if (symbol === "SUI") return { src: SUI_IMG, contain: true };
  if (/usdc/i.test(symbol)) return { src: USDC_IMG };
  if (/usdt/i.test(symbol)) return { src: USDT_IMG };
  if (/btc/i.test(symbol)) return { src: BTC_IMG };
  if (symbol === "DEEP") return { src: DEEP_IMG };
  if (symbol === "WAL") return { src: WAL_IMG };
  return null;
}

export function CoinIcon({ symbol, size = 24 }: { symbol: string; size?: number }) {
  const logo = logoFor(symbol);

  // Transparent mark (Sui droplet) → white badge with contain so it stays visible.
  if (logo?.contain) {
    return (
      <View
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: "#fff", padding: Math.round(size * 0.14) }}
        className="items-center justify-center overflow-hidden"
      >
        <Image source={logo.src} style={{ width: "100%", height: "100%" }} resizeMode="contain" />
      </View>
    );
  }

  // Full circular logo (DEEP / USDC / WAL) → render edge-to-edge.
  if (logo) {
    return <Image source={logo.src} style={{ width: size, height: size, borderRadius: size / 2 }} resizeMode="cover" />;
  }

  // Fallback: colored letter circle.
  const bg = COIN_COLORS[symbol] ?? "#9aa0ac";
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg }} className="items-center justify-center">
      <Text className="font-bold text-white" style={{ fontSize: size * 0.42 }}>
        {symbol.slice(0, 1)}
      </Text>
    </View>
  );
}

export function PairIcons({ base, quote, size = 24 }: { base: string; quote: string; size?: number }) {
  return (
    <View className="flex-row items-center">
      <CoinIcon symbol={base} size={size} />
      <View style={{ marginLeft: -size * 0.35 }}>
        <CoinIcon symbol={quote} size={size} />
      </View>
    </View>
  );
}

export function MarketSelect({ value, onChange, dark }: { value: string; onChange: (key: string) => void; dark?: boolean }) {
  const [open, setOpen] = useState(false);
  const cur = PAIRS.find((p) => p.key === value) ?? PAIRS[0]!;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={
          dark
            ? { backgroundColor: "rgba(234,231,223,.1)", borderRadius: 999 }
            : { borderWidth: 1, borderColor: palette.light.border, borderRadius: 999 }
        }
        className={`flex-row items-center gap-2.5 px-3.5 py-2 ${dark ? "" : "bg-surface"}`}
      >
        <PairIcons base={cur.base} quote={cur.quote} />
        <Text className="font-semibold" style={{ color: dark ? "#EAE7DF" : palette.light.ink }}>
          {cur.base} <Text style={{ color: "#9A9AA6" }}>/</Text> {cur.quote}
        </Text>
        <Text style={{ color: "#9A9AA6" }}> ▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setOpen(false)}>
          <Pressable
            style={{ borderTopWidth: 2, borderColor: palette.light.borderStrong }}
            className="max-h-[70%] rounded-t-2xl bg-surface px-2 pb-8 pt-3"
            onPress={() => {}}
          >
            <Text className="px-2 pb-2 text-sm font-bold uppercase tracking-wide text-ink-faint">Select market</Text>
            <FlatList
              data={PAIRS}
              keyExtractor={(p) => p.key}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    onChange(item.key);
                    setOpen(false);
                  }}
                  className={`flex-row items-center gap-3 rounded-xl px-3 py-3 ${item.key === value ? "bg-surface-muted" : ""}`}
                >
                  <PairIcons base={item.base} quote={item.quote} size={22} />
                  <Text className="font-medium text-ink">
                    {item.base} <Text className="text-ink-faint">/</Text> {item.quote}
                  </Text>
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
