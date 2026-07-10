import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { palette } from "@umbra/ui";
import { trpc } from "@/lib/trpc";
import { imgUrl } from "@/lib/config";
import { PAIRS, fetchMid, type Pair } from "@/lib/deepbook";
import { Avatar, MONO } from "@/components/ui";
import { PairIcons } from "@/components/market-select";
import { BottomNav } from "@/components/bottom-nav";

const bold = { fontFamily: "Expose-Bold" } as const;

const TABS = ["all", "people", "pairs"] as const;
type Tab = (typeof TABS)[number];

/** Design screen 5 — pill search, mono filter chips, PEOPLE + TOKEN PAIRS sections. */
export default function Search() {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("all");

  useEffect(() => {
    const t = setTimeout(() => setQ(raw.trim()), 250);
    return () => clearTimeout(t);
  }, [raw]);

  const people = useQuery({
    queryKey: ["search-profiles", q],
    queryFn: () => trpc.searchProfiles.query({ q }),
    enabled: tab !== "pairs" && q.length >= 1,
  });

  const ql = q.toLowerCase();
  const markets = q ? PAIRS.filter((p) => `${p.base} ${p.quote} ${p.key}`.toLowerCase().includes(ql)) : PAIRS;

  const showPeople = tab !== "pairs";
  const showPairs = tab !== "people";

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View style={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 14 }}>
        {/* white pill search */}
        <View
          className="flex-row items-center"
          style={{
            gap: 10,
            backgroundColor: "#fff",
            borderWidth: 1,
            borderColor: "rgba(21,21,26,.12)",
            borderRadius: 100,
            paddingHorizontal: 16,
            paddingVertical: 4,
          }}
        >
          <Ionicons name="search" size={18} color={palette.light.accent} />
          <TextInput
            autoFocus
            value={raw}
            onChangeText={setRaw}
            placeholder="People, tokens or pairs…"
            placeholderTextColor={palette.light.inkFaint}
            className="flex-1 text-ink"
            style={{ fontFamily: "Expose", fontSize: 15, paddingVertical: 8 }}
          />
          {raw ? (
            <Pressable onPress={() => setRaw("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={palette.light.inkFaint} />
            </Pressable>
          ) : null}
        </View>

        {/* mono filter chips */}
        <View className="flex-row" style={{ gap: 8, marginTop: 12 }}>
          {TABS.map((t) => {
            const active = tab === t;
            return (
              <Pressable
                key={t}
                onPress={() => setTab(t)}
                style={{
                  paddingHorizontal: 13,
                  paddingVertical: 6,
                  borderRadius: 100,
                  backgroundColor: active ? palette.light.ink : "transparent",
                  borderWidth: active ? 0 : 1,
                  borderColor: "rgba(21,21,26,.2)",
                }}
              >
                <Text style={{ fontFamily: MONO, fontSize: 11.5, color: active ? "#fff" : palette.light.ink, textTransform: "capitalize" }}>
                  {t}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 110 }}
        keyboardShouldPersistTaps="handled"
      >
        {showPeople ? (
          <>
            <SectionLabel>People</SectionLabel>
            {q.length < 1 ? (
              <Empty>Search a handle or name to find people.</Empty>
            ) : people.isLoading ? (
              <View className="items-center py-6"><ActivityIndicator color={palette.light.accent} /></View>
            ) : !people.data?.length ? (
              <Empty>No people match “{q}”.</Empty>
            ) : (
              people.data.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => router.push(`/u/${p.handle}` as never)}
                  className="flex-row items-center"
                  style={{ gap: 12, paddingVertical: 11 }}
                >
                  <Avatar name={p.handle} uri={p.avatarBlobId ? imgUrl(p.avatarBlobId) : null} size={44} />
                  <View className="flex-1" style={{ minWidth: 0 }}>
                    <View className="flex-row items-center" style={{ gap: 5 }}>
                      <Text style={[bold, { fontSize: 14.5 }]} className="text-ink" numberOfLines={1}>
                        {p.displayName || p.handle}
                      </Text>
                      {p.suinsName ? <Ionicons name="shield-checkmark" size={13} color={palette.light.accent} /> : null}
                    </View>
                    <Text style={{ fontFamily: MONO, fontSize: 11.5, color: palette.light.inkFaint }} numberOfLines={1}>
                      @{p.handle}.reef
                    </Text>
                  </View>
                  <View style={{ backgroundColor: palette.light.ink, borderRadius: 100, paddingHorizontal: 16, paddingVertical: 7 }}>
                    <Text style={[bold, { fontSize: 12.5, color: "#fff" }]}>View</Text>
                  </View>
                </Pressable>
              ))
            )}
          </>
        ) : null}

        {showPairs ? (
          <>
            <SectionLabel style={{ marginTop: showPeople ? 18 : 0 }}>Token pairs</SectionLabel>
            {!markets.length ? (
              <Empty>No markets match “{q}”.</Empty>
            ) : (
              markets.map((p) => <PairRow key={p.key} pair={p} onPress={() => router.push(`/asset/${p.key}` as never)} />)
            )}
          </>
        ) : null}
      </ScrollView>

      <BottomNav />
    </SafeAreaView>
  );
}

function PairRow({ pair, onPress }: { pair: Pair; onPress: () => void }) {
  const mid = useQuery({ queryKey: ["mid", pair.key], queryFn: () => fetchMid(pair.key), refetchInterval: 20000 });
  const price = mid.data;
  return (
    <Pressable onPress={onPress} className="flex-row items-center" style={{ gap: 12, paddingVertical: 11 }}>
      <PairIcons base={pair.base} quote={pair.quote} size={34} />
      <View className="flex-1">
        <Text style={[bold, { fontSize: 14.5 }]} className="text-ink">
          {pair.base} <Text style={{ color: palette.light.inkFaint }}>/</Text> {pair.quote}
        </Text>
        <Text style={{ fontFamily: MONO, fontSize: 11.5, color: palette.light.inkFaint }}>DeepBook market</Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ fontFamily: MONO, fontWeight: "700", fontSize: 13.5 }} className="text-ink">
          {price != null && price > 0
            ? price < 1
              ? price.toPrecision(4)
              : price.toLocaleString(undefined, { maximumFractionDigits: 2 })
            : "—"}
        </Text>
        <Text style={{ fontFamily: MONO, fontSize: 11.5, color: palette.light.inkFaint }}>{pair.quote}</Text>
      </View>
    </Pressable>
  );
}

function SectionLabel({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <Text
      style={[{ fontFamily: MONO, fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", color: "#565660", marginTop: 12, marginBottom: 6 }, style]}
    >
      {children}
    </Text>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <Text style={{ paddingVertical: 24, textAlign: "center", color: palette.light.inkSoft, fontSize: 13.5 }}>{children}</Text>;
}
