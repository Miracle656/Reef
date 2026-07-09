import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { palette } from "@umbra/ui";
import { useAuth } from "@/lib/auth";
import { imgUrl, NETWORK } from "@/lib/config";
import { trpc } from "@/lib/trpc";
import { Avatar, Button, MONO } from "@/components/ui";
import { BottomNav } from "@/components/bottom-nav";
import { CopyButton } from "@/components/copy-button";

const short = (a: string) => `${a.slice(0, 10)}…${a.slice(-6)}`;

export default function Settings() {
  const router = useRouter();
  const { address, signOut } = useAuth();

  const profile = useQuery({
    queryKey: ["profile-by-addr", address],
    queryFn: () => trpc.profileByAddress.query({ address: address! }),
    enabled: Boolean(address),
  });
  const p = profile.data;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="flex-row items-center gap-2 border-b border-border px-4 pb-2 pt-1">
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={palette.light.ink} />
        </Pressable>
        <Text style={{ fontFamily: "Expose-Black" }} className="text-2xl text-ink">Settings</Text>
      </View>

      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingTop: 16, paddingBottom: 120, gap: 14 }}>
        {/* zkLogin account card */}
        <View className="rounded-3xl bg-surface-muted p-4">
          <Text style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: 1.2 }} className="uppercase text-ink-faint">
            zkLogin account
          </Text>
          <View className="mt-3 flex-row items-center gap-3">
            <Avatar name={p?.handle ?? "?"} uri={p?.avatarBlobId ? imgUrl(p.avatarBlobId) : null} size={52} />
            <View className="flex-1">
              <Text style={{ fontFamily: "Expose-Bold" }} className="text-ink">{p?.displayName || p?.handle || "Your account"}</Text>
              <Text style={{ fontFamily: MONO, fontSize: 11.5 }} className="text-ink-faint">
                self-custodial · via Google
              </Text>
              {address ? (
                <View className="mt-1 flex-row items-center gap-2">
                  <Text selectable style={{ fontFamily: MONO, fontSize: 11.5 }} className="text-ink-soft">{short(address)}</Text>
                  <CopyButton value={address} size={15} />
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* link an external wallet (design: Sui Wallet / Suiet / Phantom) */}
        <View className="rounded-3xl p-4" style={{ borderWidth: 1, borderColor: palette.light.border }}>
          <Text style={{ fontFamily: "Expose-Bold", fontSize: 15 }} className="text-ink">Link an external wallet</Text>
          <Text className="mt-1 text-sm leading-5 text-ink-soft">
            Connect a Sui wallet to move assets. Linking proves ownership with a signed message.
          </Text>
          <View className="mt-3" style={{ gap: 8 }}>
            {["Sui Wallet", "Suiet", "Phantom"].map((w) => (
              <View
                key={w}
                className="flex-row items-center justify-between rounded-2xl bg-surface px-4 py-3"
                style={{ borderWidth: 1, borderColor: palette.light.border, opacity: 0.75 }}
              >
                <Text style={{ fontFamily: "Expose-Medium" }} className="text-ink">{w}</Text>
                <Text style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: 1 }} className="text-ink-faint">SOON — LINK ON WEB</Text>
              </View>
            ))}
          </View>
        </View>

        <Row icon="create-outline" label="Edit profile" onPress={() => router.push("/onboarding")} />
        <Row icon="globe-outline" label="Network" value={NETWORK} />
        <Row icon="information-circle-outline" label="App" value="ReeF · v0.1.0" />

        <View className="mt-2">
          <Button label="Sign out" variant="danger" onPress={() => { signOut(); router.replace("/"); }} />
        </View>
        <Text className="text-center text-xs text-ink-faint">Signing out clears this device&apos;s saved session.</Text>
      </ScrollView>

      <BottomNav />
    </SafeAreaView>
  );
}

function Row({
  icon,
  label,
  value,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className="flex-row items-center gap-3 rounded-2xl bg-surface px-4 py-3.5"
      style={{ borderWidth: 1, borderColor: palette.light.border }}
    >
      <Ionicons name={icon} size={20} color={palette.light.inkSoft} />
      <Text className="flex-1 text-ink">{label}</Text>
      {value ? <Text className="text-ink-faint">{value}</Text> : null}
      {onPress ? <Ionicons name="chevron-forward" size={18} color={palette.light.inkFaint} /> : null}
    </Pressable>
  );
}
