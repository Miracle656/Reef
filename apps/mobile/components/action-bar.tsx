import { Image, Pressable, Share, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { canonicalReactionBytes, type Post, type ReactionMessage } from "@umbra/core";
import { palette } from "@umbra/ui";
import { useAuth } from "@/lib/auth";
import { enokiFlow } from "@/lib/enoki";
import { NETWORK } from "@/lib/config";
import { trpc } from "@/lib/trpc";
import { MONO } from "./ui";

type Kind = "like" | "repost" | "bookmark";
const REPOST = "#16c784";
const BOOKMARK = "#f59e0b";
const SUI_IMG = require("../assets/sui.png");

export function ActionBar({ post }: { post: Post }) {
  const { address } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();

  const s = useQuery({
    queryKey: ["post-actions", post.id, address],
    queryFn: () => trpc.postActions.query({ postId: post.id, viewer: address ?? undefined }),
  });
  const d = s.data;

  const toggle = useMutation({
    mutationFn: async ({ kind, active }: { kind: Kind; active: boolean }) => {
      if (!address) throw new Error("Sign in first");
      const message: ReactionMessage = { kind, postId: post.id, reactor: address, timestamp: Date.now(), value: (active ? 0 : 1) as 0 | 1 };
      const keypair = await enokiFlow.getKeypair({ network: NETWORK });
      const { signature } = await keypair.signPersonalMessage(canonicalReactionBytes(message));
      return trpc.addReaction.mutate({ message, signature });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["post-actions", post.id] }),
  });

  const share = () => {
    void Share.share({ message: `${post.text || "A post on ReeF"}\n\nvia ReeF` }).catch(() => {});
  };

  const busy = toggle.isPending || !address;

  return (
    <View className="mt-2.5 flex-row items-center justify-between pr-8">
      <Action icon="chatbubble-outline" count={d?.replyCount} onPress={() => router.push(`/p/${post.id}` as never)} />
      <Action
        icon={d?.reposted ? "repeat" : "repeat-outline"}
        count={d?.reposts}
        color={d?.reposted ? REPOST : undefined}
        disabled={busy}
        onPress={() => toggle.mutate({ kind: "repost", active: d?.reposted ?? false })}
      />
      <Pressable
        onPress={() => toggle.mutate({ kind: "like", active: d?.liked ?? false })}
        disabled={busy}
        hitSlop={8}
        className="flex-row items-center gap-1.5"
        style={{ opacity: busy ? 0.6 : 1 }}
      >
        <Image
          source={SUI_IMG}
          style={{ width: 17, height: 17, opacity: d?.liked ? 1 : 0.5 }}
          resizeMode="contain"
          tintColor={d?.liked ? undefined : palette.light.inkFaint}
        />
        <Text style={{ fontFamily: MONO, fontSize: 11.5, color: d?.liked ? palette.light.accent : palette.light.inkFaint }}>{d?.likes ?? 0}</Text>
      </Pressable>
      <Action
        icon={d?.bookmarked ? "bookmark" : "bookmark-outline"}
        count={d?.bookmarks}
        color={d?.bookmarked ? BOOKMARK : undefined}
        disabled={busy}
        onPress={() => toggle.mutate({ kind: "bookmark", active: d?.bookmarked ?? false })}
      />
      <Action icon="share-social-outline" onPress={share} />
    </View>
  );
}

function Action({
  icon,
  count,
  color,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  count?: number;
  color?: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const c = color ?? palette.light.inkFaint;
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={8} className="flex-row items-center gap-1.5" style={{ opacity: disabled ? 0.6 : 1 }}>
      <Ionicons name={icon} size={17} color={c} />
      {typeof count === "number" ? <Text style={{ fontFamily: MONO, fontSize: 11.5, color: c }}>{count}</Text> : null}
    </Pressable>
  );
}
