import { useEffect } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { palette } from "@umbra/ui";
import { imgUrl } from "@/lib/config";
import { markNotificationsSeen, useNotifications, type Notification } from "@/lib/notifications";
import { Avatar, MONO, Spinner } from "@/components/ui";
import { timeAgo } from "@/components/post-card";

function verbFor(n: Notification): string {
  const target = n.targetIsReply ? "comment" : "post";
  switch (n.type) {
    case "follow": return "followed you";
    case "like": return `liked your ${target}`;
    case "repost": return `reposted your ${target}`;
    case "reply": return `replied to your ${target}`;
    case "mention": return "mentioned you";
  }
}

const badgeFor: Record<Notification["type"], { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  follow: { icon: "person", color: palette.light.accent },
  like: { icon: "heart", color: "#EF4444" },
  repost: { icon: "repeat", color: "#10B981" },
  reply: { icon: "chatbubble", color: "#8B5CF6" },
  mention: { icon: "at", color: "#0EA5E9" },
};

export default function Notifications() {
  const router = useRouter();
  const notifs = useNotifications();

  useEffect(() => {
    markNotificationsSeen();
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="flex-row items-center gap-2 border-b border-border px-4 pb-2 pt-1">
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={palette.light.ink} />
        </Pressable>
        <Text style={{ fontFamily: "Expose-Black" }} className="text-2xl text-ink">Notifications</Text>
      </View>

      {notifs.isLoading ? (
        <View className="flex-1 items-center justify-center"><Spinner /></View>
      ) : !notifs.data?.length ? (
        <View className="flex-1 items-center justify-center px-10">
          <Ionicons name="notifications-off-outline" size={36} color={palette.light.inkFaint} />
          <Text className="mt-3 text-center text-ink-soft">
            Nothing yet — when someone follows, likes or replies to you, it shows up here.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
          {notifs.data.map((n, i) => {
            const badge = badgeFor[n.type];
            const name = n.actor.displayName || n.actor.handle || `${n.actor.address.slice(0, 8)}…`;
            const go = () => {
              if (n.type === "follow") {
                if (n.actor.handle) router.push(`/u/${n.actor.handle}` as never);
              } else if (n.postId) {
                router.push(`/p/${n.postId}` as never);
              }
            };
            return (
              <Pressable
                key={`${n.type}-${n.createdAtMs}-${i}`}
                onPress={go}
                className="flex-row gap-3 border-b border-border px-4 py-3.5 active:bg-surface-muted"
              >
                <View>
                  <Avatar
                    name={n.actor.handle ?? "?"}
                    uri={n.actor.avatarBlobId ? imgUrl(n.actor.avatarBlobId) : null}
                    size={42}
                  />
                  <View
                    style={{
                      position: "absolute",
                      bottom: -2,
                      right: -2,
                      width: 18,
                      height: 18,
                      borderRadius: 9,
                      backgroundColor: badge.color,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 2,
                      borderColor: palette.light.background,
                    }}
                  >
                    <Ionicons name={badge.icon} size={9} color="#fff" />
                  </View>
                </View>
                <View className="flex-1">
                  <Text className="text-ink" style={{ fontSize: 14, lineHeight: 20 }}>
                    <Text style={{ fontFamily: "Expose-Bold" }}>{name}</Text> {verbFor(n)}
                  </Text>
                  {n.preview ? (
                    <Text numberOfLines={2} className="mt-0.5 text-sm text-ink-soft">{n.preview}</Text>
                  ) : null}
                  <Text style={{ fontFamily: MONO, fontSize: 11 }} className="mt-1 text-ink-faint">
                    {timeAgo(n.createdAtMs)}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
