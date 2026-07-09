import { Image, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePathname, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { palette } from "@umbra/ui";
import { useAuth } from "@/lib/auth";
import { trpc } from "@/lib/trpc";
import { imgUrl } from "@/lib/config";
import { useMessaging } from "@/lib/messaging/provider";

export function BottomNav() {
  const { address } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { state } = useMessaging();
  const unreadMessages = state.chats.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);

  const profile = useQuery({
    queryKey: ["profile-by-addr", address],
    queryFn: () => trpc.profileByAddress.query({ address: address! }),
    enabled: Boolean(address),
  });

  if (pathname === "/onboarding") return null;

  const profileHref = profile.data ? `/u/${profile.data.handle}` : "/onboarding";
  const avatarUri = profile.data?.avatarBlobId ? imgUrl(profile.data.avatarBlobId) : null;

  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", left: 16, right: 16, bottom: Math.max(insets.bottom, 14) + 8, zIndex: 50, elevation: 50 }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-around",
          height: 62,
          borderRadius: 24,
          paddingHorizontal: 14,
          backgroundColor: "rgba(255,255,255,0.94)",
          borderWidth: 1,
          borderColor: "rgba(21,21,26,.1)",
          shadowColor: "#15151A",
          shadowOffset: { width: 0, height: 14 },
          shadowOpacity: 0.25,
          shadowRadius: 34,
          elevation: 14,
        }}
      >
        <Tab icon="home-outline" iconActive="home" active={pathname === "/"} onPress={() => router.push("/")} />
        <Tab icon="search-outline" iconActive="search" active={pathname.startsWith("/search")} onPress={() => router.push("/search")} />
        <Tab
          icon="stats-chart-outline"
          iconActive="stats-chart"
          active={pathname.startsWith("/trade") || pathname.startsWith("/asset")}
          onPress={() => router.push("/trade")}
        />

        <Pressable
          onPress={() => router.push((address ? "/compose" : "/") as never)}
          style={{
            width: 44,
            height: 44,
            borderRadius: 15,
            marginHorizontal: 4,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: palette.light.accent,
            shadowColor: palette.light.accent,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.6,
            shadowRadius: 18,
            elevation: 8,
          }}
        >
          <Ionicons name="add" size={26} color="#fff" />
        </Pressable>

        <Tab
          icon="chatbubbles-outline"
          iconActive="chatbubbles"
          active={pathname.startsWith("/messages")}
          onPress={() => router.push("/messages")}
          dot={unreadMessages > 0}
        />

        {avatarUri ? (
          <Pressable onPress={() => router.push(profileHref as never)} style={{ padding: 6 }}>
            <Image
              source={{ uri: avatarUri }}
              style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: pathname.startsWith("/u/") ? palette.light.accent : "transparent" }}
            />
          </Pressable>
        ) : (
          <Tab icon="person-outline" iconActive="person" active={pathname.startsWith("/u/")} onPress={() => router.push(profileHref as never)} />
        )}
      </View>
    </View>
  );
}

function Tab({
  icon,
  iconActive,
  active,
  onPress,
  dot,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
  dot?: boolean;
}) {
  return (
    <Pressable onPress={onPress} hitSlop={6} style={{ padding: 8 }}>
      <Ionicons name={active ? iconActive : icon} size={25} color={active ? palette.light.accent : palette.light.inkFaint} />
      {dot ? (
        <View
          style={{
            position: "absolute",
            top: 7,
            right: 6,
            width: 9,
            height: 9,
            borderRadius: 5,
            backgroundColor: palette.light.accent,
            borderWidth: 1.5,
            borderColor: "#fff",
          }}
        />
      ) : null}
    </Pressable>
  );
}
