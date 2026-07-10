import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { TradeTerminal, D } from "@/components/trade-terminal";
import { BottomNav } from "@/components/bottom-nav";
import { PAIRS } from "@/lib/deepbook";

const bold = { fontFamily: "Expose-Bold" } as const;

/** Design screen 2 — dark pair terminal for a single market. */
export default function AssetDetail() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const router = useRouter();
  const pair = PAIRS.find((p) => p.key === key) ?? PAIRS[0]!;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: D.bg }} edges={["top"]}>
      <StatusBar style="light" />

      {/* header */}
      <View className="flex-row items-center justify-between px-5 pb-2 pt-1">
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={D.text} />
        </Pressable>
        <Text style={[bold, { fontSize: 16, color: D.text }]}>
          {pair.base} / {pair.quote}
        </Text>
        <Ionicons name="star-outline" size={22} color={D.faint} />
      </View>

      <TradeTerminal pairKey={pair.key} />
      <BottomNav />
    </SafeAreaView>
  );
}
