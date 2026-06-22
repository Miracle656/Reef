import { FlatList, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { buildFollowTx, buildUnfollowTx, walrus, type Post } from "@umbra/core";
import { umbraConfig } from "@/lib/config";
import { useAuth } from "@/lib/auth";
import { useGasless } from "@/lib/gasless";
import { getFollowSetId } from "@/lib/objects";
import { trpc } from "@/lib/trpc";
import { Avatar, Button, Card, Spinner } from "@/components/ui";
import { PostCard } from "@/components/post-card";

export default function Profile() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const insets = useSafeAreaInsets();
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

  const isFollowing = p ? following.data?.includes(p.owner) ?? false : false;
  const isSelf = address === p?.owner;

  const toggle = useMutation({
    mutationFn: async () => {
      if (!address || !p) throw new Error("Sign in first");
      const setId = await getFollowSetId(address);
      if (!setId) throw new Error("No follow set — finish onboarding");
      await run(isFollowing ? buildUnfollowTx(umbraConfig, setId, p.owner) : buildFollowTx(umbraConfig, setId, p.owner));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["following", address] }),
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

  return (
    <FlatList
      className="flex-1 bg-background"
      data={posts.data ?? []}
      keyExtractor={(post: Post) => post.id}
      renderItem={({ item }) => <PostCard post={item} />}
      contentContainerStyle={{ padding: 16, paddingTop: insets.top + 16 }}
      ListHeaderComponent={
        <Card className="mb-4">
          <View className="flex-row items-start justify-between">
            <Avatar name={p.handle} uri={p.avatarBlobId ? walrus.urlFor(umbraConfig, p.avatarBlobId) : null} size={64} />
            {!isSelf ? (
              <Button
                label={isFollowing ? "Following" : "Follow"}
                variant={isFollowing ? "outline" : "accent"}
                onPress={() => toggle.mutate()}
                loading={toggle.isPending}
                disabled={!address}
              />
            ) : null}
          </View>
          <Text className="mt-3 text-xl font-bold text-ink">{p.displayName}</Text>
          <Text className="text-ink-soft">@{p.handle}</Text>
          {p.suinsName ? <Text className="text-accent">{p.suinsName}</Text> : null}
          {p.bio ? <Text className="mt-2 text-ink">{p.bio}</Text> : null}
          <View className="mt-3 flex-row gap-4">
            <Text className="text-ink">
              <Text className="font-bold">{p.followingCount}</Text> <Text className="text-ink-soft">Following</Text>
            </Text>
            <Text className="text-ink">
              <Text className="font-bold">{p.followersCount}</Text> <Text className="text-ink-soft">Followers</Text>
            </Text>
          </View>
        </Card>
      }
      ListEmptyComponent={<Text className="py-8 text-center text-ink-soft">No posts yet.</Text>}
    />
  );
}
