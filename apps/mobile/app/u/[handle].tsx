import { useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { buildFollowTx, buildUnfollowTx, type Post } from "@umbra/core";
import { palette } from "@umbra/ui";
import { imgUrl, umbraConfig } from "@/lib/config";
import { useAuth } from "@/lib/auth";
import { useGasless } from "@/lib/gasless";
import { getFollowSetId } from "@/lib/objects";
import { trpc } from "@/lib/trpc";
import { Avatar, MONO, Spinner } from "@/components/ui";
import { BottomNav } from "@/components/bottom-nav";
import { PostCard } from "@/components/post-card";

export default function Profile() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { address } = useAuth();
  const run = useGasless();
  const qc = useQueryClient();

  const profile = useQuery({
    queryKey: ["profile-by-handle", handle],
    queryFn: () => trpc.profileByHandle.query({ handle: handle! }),
    enabled: Boolean(handle),
  });
  const p = profile.data;

  const posts = useQuery({
    queryKey: ["posts-by-author", p?.owner],
    queryFn: () => trpc.postsByAuthor.query({ address: p!.owner }),
    enabled: Boolean(p),
  });
  const following = useQuery({
    queryKey: ["following", address],
    queryFn: async () => (await trpc.following.query({ address: address! })).map((r) => r.followee),
    enabled: Boolean(address),
  });
  const coins = useQuery({
    queryKey: ["creator-coins", p?.owner],
    queryFn: () => trpc.creatorCoins.query({ owner: p!.owner }),
    enabled: Boolean(p),
  });
  const reposts = useQuery({
    queryKey: ["reacted", "repost", p?.owner],
    queryFn: () => trpc.reactedPosts.query({ address: p!.owner, kind: "repost" }),
    enabled: Boolean(p),
  });
  const bookmarks = useQuery({
    queryKey: ["reacted", "bookmark", p?.owner],
    queryFn: () => trpc.reactedPosts.query({ address: p!.owner, kind: "bookmark" }),
    enabled: Boolean(p),
  });
  const [tab, setTab] = useState<"posts" | "reposts" | "bookmarks">("posts");

  const isFollowing = p ? following.data?.includes(p.owner) ?? false : false;
  const isSelf = address === p?.owner;
  const coin = coins.data?.[0];

  const toggle = useMutation({
    mutationFn: async () => {
      if (!address || !p) throw new Error("Sign in first");
      const setId = await getFollowSetId(address);
      if (!setId) throw new Error("No follow set — finish onboarding");
      await run(isFollowing ? buildUnfollowTx(umbraConfig, setId, p.owner) : buildFollowTx(umbraConfig, setId, p.owner));
    },
    onSuccess: () => {
      // The indexer is a few seconds behind the on-chain Followed event, so
      // refresh the follow graph, feed and profile counts now AND again shortly.
      const bump = () =>
        ["following", "feed", "profile-by-handle", "profile-by-addr", "posts-by-author"].forEach((k) =>
          qc.invalidateQueries({ queryKey: [k] }),
        );
      bump();
      setTimeout(bump, 3500);
      setTimeout(bump, 8000);
    },
  });

  if (profile.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Spinner />
      </View>
    );
  }
  if (!p) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-ink-soft">@{handle} not found.</Text>
      </View>
    );
  }

  const postList = posts.data ?? [];
  const data = tab === "posts" ? postList : tab === "reposts" ? reposts.data ?? [] : bookmarks.data ?? [];

  return (
    <View className="flex-1 bg-background">
    <FlatList
      className="flex-1 bg-background"
      data={data}
      key={tab}
      keyExtractor={(post: Post) => post.id}
      contentContainerStyle={{ paddingBottom: 110 }}
      renderItem={({ item }) => <PostCard post={item} />}
      ListHeaderComponent={
        <View className="pb-1">
          {/* banner with floating back + settings */}
          <LinearGradient
            colors={["#7CFCD8", "#18C2C2", "#0A84FF"]}
            locations={[0, 0.45, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0.9 }}
            style={{ height: 150 }}
          >
            <View className="flex-row items-center justify-between px-4" style={{ marginTop: insets.top + 6 }}>
              <Pressable
                onPress={() => router.back()}
                hitSlop={10}
                style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,.3)", alignItems: "center", justifyContent: "center" }}
              >
                <Ionicons name="arrow-back" size={18} color="#fff" />
              </Pressable>
              {isSelf ? (
                <Pressable
                  onPress={() => router.push("/settings")}
                  hitSlop={10}
                  style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,.3)", alignItems: "center", justifyContent: "center" }}
                >
                  <Ionicons name="settings-outline" size={18} color="#fff" />
                </Pressable>
              ) : null}
            </View>
          </LinearGradient>

          <View style={{ paddingHorizontal: 20 }}>
            {/* overlapping avatar + follow/edit */}
            <View className="flex-row items-end justify-between" style={{ marginTop: -42 }}>
              <View style={{ borderWidth: 4, borderColor: palette.light.background, borderRadius: 48 }}>
                <Avatar name={p.handle} uri={p.avatarBlobId ? imgUrl(p.avatarBlobId) : null} size={88} />
              </View>
              <View style={{ marginBottom: 6 }}>
                {isSelf ? (
                  <Pressable
                    onPress={() => router.push("/onboarding")}
                    style={{ borderWidth: 1, borderColor: palette.light.border, borderRadius: 100, paddingHorizontal: 22, paddingVertical: 9, backgroundColor: palette.light.surface }}
                  >
                    <Text style={{ fontFamily: "Expose-Bold", fontSize: 13.5 }} className="text-ink">Edit profile</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => toggle.mutate()}
                    disabled={!address || toggle.isPending}
                    style={{
                      borderRadius: 100,
                      paddingHorizontal: 22,
                      paddingVertical: 9,
                      backgroundColor: isFollowing ? palette.light.surface : palette.light.ink,
                      borderWidth: isFollowing ? 1 : 0,
                      borderColor: palette.light.border,
                      opacity: !address || toggle.isPending ? 0.6 : 1,
                    }}
                  >
                    <Text style={{ fontFamily: "Expose-Bold", fontSize: 13.5, color: isFollowing ? palette.light.ink : "#fff" }}>
                      {toggle.isPending ? "…" : isFollowing ? "Following" : "Follow"}
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>

            {/* name + verified + mono handle */}
            <View className="flex-row items-center" style={{ gap: 6, marginTop: 12 }}>
              <Text style={{ fontFamily: "Expose-Black", fontSize: 22, letterSpacing: -0.4 }} className="text-ink">
                {p.displayName || p.handle}
              </Text>
              {p.suinsName ? <Ionicons name="shield-checkmark" size={16} color={palette.light.accent} /> : null}
            </View>
            <Text style={{ fontFamily: MONO, fontSize: 12.5, color: palette.light.inkFaint }}>@{p.handle}.reef</Text>
            {p.bio ? <Text style={{ marginTop: 11, fontSize: 14, lineHeight: 21, color: "#26262c" }}>{p.bio}</Text> : null}

            {/* following / followers */}
            <View className="flex-row" style={{ gap: 20, marginTop: 12 }}>
              <Text style={{ fontSize: 13.5 }} className="text-ink">
                <Text style={{ fontFamily: "Expose-Bold" }}>{p.followingCount}</Text>
                <Text style={{ color: palette.light.inkFaint }}> Following</Text>
              </Text>
              <Text style={{ fontSize: 13.5 }} className="text-ink">
                <Text style={{ fontFamily: "Expose-Bold" }}>{p.followersCount}</Text>
                <Text style={{ color: palette.light.inkFaint }}> Followers</Text>
              </Text>
            </View>
          </View>

          {/* creator coin market card */}
          {coin ? (
            <View
              style={{
                marginTop: 16,
                marginHorizontal: 20,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: "#E6E8EE",
                flexDirection: "row",
                overflow: "hidden",
              }}
            >
              <View className="flex-1 items-center py-4">
                <Text className="text-xs text-ink-faint">Market cap</Text>
                <Text style={{ fontFamily: "Expose-Bold" }} className="mt-1 text-xl text-ink">
                  $0
                </Text>
              </View>
              <View style={{ width: 1, backgroundColor: "#E6E8EE" }} />
              <View className="flex-1 items-center py-4">
                <Text className="text-xs text-ink-faint">Coin</Text>
                <Text style={{ fontFamily: "Expose-Bold" }} className="mt-1 text-xl text-ink">
                  ${coin.symbol}
                </Text>
              </View>
            </View>
          ) : null}

          {/* posts / reposts / bookmarks tabs (design: text tabs, accent underline) */}
          <View
            className="flex-row border-b border-border"
            style={{ gap: 26, paddingHorizontal: 20, paddingTop: 16, marginTop: 14 }}
          >
            {(["posts", "reposts", "bookmarks"] as const).map((t) => {
              const active = tab === t;
              return (
                <Pressable
                  key={t}
                  onPress={() => setTab(t)}
                  style={{ paddingBottom: 12, borderBottomWidth: 2.5, borderBottomColor: active ? palette.light.accent : "transparent" }}
                >
                  <Text
                    style={{
                      fontFamily: active ? "Expose-Bold" : "Expose-Medium",
                      fontSize: 14,
                      color: active ? palette.light.ink : palette.light.inkFaint,
                      textTransform: "capitalize",
                    }}
                  >
                    {t}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      }
      ListEmptyComponent={
        <Text className="py-12 text-center text-ink-soft">
          {tab === "posts" ? "No posts yet." : tab === "reposts" ? "No reposts yet." : "No bookmarks yet."}
        </Text>
      }
    />
    <BottomNav />
    </View>
  );
}
