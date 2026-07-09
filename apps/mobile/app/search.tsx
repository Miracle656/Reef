import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { palette } from "@umbra/ui";
import { trpc } from "@/lib/trpc";
import { imgUrl } from "@/lib/config";
import { PAIRS } from "@/lib/deepbook";
import { Avatar, MONO } from "@/components/ui";
import { PairIcons } from "@/components/market-select";
import { BottomNav } from "@/components/bottom-nav";

const bold = { fontFamily: "Expose-Bold" } as const;
const black = { fontFamily: "Expose-Black" } as const;

export default function Search() {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"people" | "markets">("people");

  useEffect(() => {
    const t = setTimeout(() => setQ(raw.trim()), 250);
    return () => clearTimeout(t);
  }, [raw]);

  const people = useQuery({
    queryKey: ["search-profiles", q],
    queryFn: () => trpc.searchProfiles.query({ q }),
    enabled: tab === "people" && q.length >= 1,
  });

  const ql = q.toLowerCase();
  const markets = q ? PAIRS.filter((p) => `${p.base} ${p.quote} ${p.key}`.toLowerCase().includes(ql)) : PAIRS;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="px-4 pb-2 pt-1">
        <Text style={black} className="mb-3 text-2xl text-ink">Search</Text>

        <View className="flex-row items-center gap-2 rounded-2xl bg-surface-muted px-3.5 py-3">
          <Ionicons name="search" size={18} color={palette.light.inkFaint} />
          <TextInput
            autoFocus
            value={raw}
            onChangeText={setRaw}
            placeholder="People, tokens or pairs…"
            placeholderTextColor={palette.light.inkFaint}
            className="flex-1 text-ink"
            style={{ fontFamily: "Expose" }}
          />
          {raw ? (
            <Pressable onPress={() => setRaw("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={palette.light.inkFaint} />
            </Pressable>
          ) : null}
        </View>

        <View className="mt-3 flex-row rounded-full bg-surface-muted p-1">
          {(["people", "markets"] as const).map((t) => (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              style={tab === t ? { backgroundColor: palette.light.surface, shadowColor: "#16161A", shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 } : undefined}
              className="flex-1 items-center rounded-full py-2"
            >
              <Text style={bold} className={`capitalize ${tab === t ? "text-ink" : "text-ink-faint"}`}>{t}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 110, paddingTop: 6, gap: 6 }} keyboardShouldPersistTaps="handled">
        {tab === "people" ? (
          q.length < 1 ? (
            <Empty>Search a handle or name to find people to follow.</Empty>
          ) : people.isLoading ? (
            <View className="items-center py-10"><ActivityIndicator color={palette.light.accent} /></View>
          ) : !people.data?.length ? (
            <Empty>No people match “{q}”.</Empty>
          ) : (
            people.data.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => router.push(`/u/${p.handle}` as never)}
                className="flex-row items-center gap-3 rounded-2xl px-2 py-2.5 active:bg-surface-muted"
              >
                <Avatar name={p.handle} uri={p.avatarBlobId ? imgUrl(p.avatarBlobId) : null} size={46} />
                <View className="flex-1">
                  <Text style={bold} className="text-ink" numberOfLines={1}>{p.displayName || p.handle}</Text>
                  <Text style={{ fontFamily: MONO, fontSize: 12 }} className="text-ink-faint" numberOfLines={1}>@{p.handle}.reef</Text>
                </View>
                <View className="rounded-full bg-accent px-4 py-1.5">
                  <Text style={bold} className="text-sm text-on-accent">View</Text>
                </View>
              </Pressable>
            ))
          )
        ) : !markets.length ? (
          <Empty>No markets match “{q}”.</Empty>
        ) : (
          markets.map((p) => (
            <Pressable
              key={p.key}
              onPress={() => router.push(`/asset/${p.key}` as never)}
              className="flex-row items-center gap-3 rounded-2xl px-2 py-2.5 active:bg-surface-muted"
            >
              <PairIcons base={p.base} quote={p.quote} size={34} />
              <View className="flex-1">
                <Text style={bold} className="text-ink">
                  {p.base} <Text className="text-ink-faint">/</Text> {p.quote}
                </Text>
                <Text style={{ fontFamily: MONO, fontSize: 11.5 }} className="text-ink-faint">DeepBook market</Text>
              </View>
              <View className="rounded-full bg-surface-muted px-4 py-1.5">
                <Text style={bold} className="text-sm text-ink">Trade</Text>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>

      <BottomNav />
    </SafeAreaView>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <Text className="py-12 text-center text-ink-soft">{children}</Text>;
}
