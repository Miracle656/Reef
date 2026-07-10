import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { MarketSelect } from "@/components/market-select";
import { TradeTerminal, D } from "@/components/trade-terminal";
import { PredictFeed } from "@/components/predict-feed";
import { BottomNav } from "@/components/bottom-nav";
import { PAIRS } from "@/lib/deepbook";

const bold = { fontFamily: "Expose-Bold" } as const;

/** Design screen 3 — the Trade tab IS the dark terminal; Predict is its sibling. */
export default function TradeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<"trade" | "predict">("trade");
  const [pairKey, setPairKey] = useState(PAIRS[0]!.key);

  const nav = (floating: boolean) => (
    <View
      pointerEvents="box-none"
      style={floating ? { position: "absolute", top: insets.top + 6, left: 0, right: 0, zIndex: 20 } : undefined}
      className="flex-row items-center justify-between px-4 pb-2 pt-1"
    >
      <Pressable onPress={() => router.back()} hitSlop={10}>
        <Ionicons name="chevron-back" size={24} color={D.text} />
      </Pressable>
      <View className="flex-row gap-1 rounded-full p-1" style={{ backgroundColor: floating ? "rgba(0,0,0,.4)" : D.panel }}>
        {(["trade", "predict"] as const).map((m) => (
          <Pressable
            key={m}
            onPress={() => setMode(m)}
            className="rounded-full px-4 py-1.5"
            style={mode === m ? { backgroundColor: "#fff" } : undefined}
          >
            <Text style={[bold, { fontSize: 13, textTransform: "capitalize", color: mode === m ? "#15151A" : "rgba(255,255,255,.7)" }]}>
              {m}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={{ width: 24 }} />
    </View>
  );

  if (mode === "predict") {
    return (
      <View className="flex-1 bg-black">
        <StatusBar style="light" />
        <PredictFeed />
        {nav(true)}
        <BottomNav />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: D.bg }} edges={["top"]}>
      <StatusBar style="light" />
      {nav(false)}
      <View className="items-center" style={{ paddingBottom: 10 }}>
        <MarketSelect value={pairKey} onChange={setPairKey} dark />
      </View>
      <TradeTerminal pairKey={pairKey} />
      <BottomNav />
    </SafeAreaView>
  );
}
