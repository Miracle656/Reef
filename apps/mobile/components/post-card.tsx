import { Image, Text, View } from "react-native";
import { Link } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { walrus, type Post } from "@umbra/core";
import { umbraConfig } from "@/lib/config";
import { trpc } from "@/lib/trpc";
import { Avatar, Card } from "./ui";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function PostCard({ post }: { post: Post }) {
  const author = useQuery({
    queryKey: ["profile-by-addr", post.author],
    queryFn: () => trpc.profileByAddress.query({ address: post.author }),
  });
  const likes = useQuery({
    queryKey: ["reactions", post.id],
    queryFn: () => trpc.reactionsForPost.query({ postId: post.id }),
  });
  const a = author.data;

  return (
    <Card className="mb-3">
      <View className="flex-row gap-3">
        <Avatar name={a?.handle ?? post.author} uri={a?.avatarBlobId ? walrus.urlFor(umbraConfig, a.avatarBlobId) : null} />
        <View className="flex-1">
          <View className="flex-row flex-wrap items-center gap-x-1">
            <Text className="font-semibold text-ink">{a?.displayName ?? "Someone"}</Text>
            <Link href={a ? `/u/${a.handle}` : "/"}>
              <Text className="text-ink-soft">@{a?.handle ?? short(post.author)}</Text>
            </Link>
          </View>
          {post.text ? <Text className="mt-1 text-ink">{post.text}</Text> : null}
          {post.media[0] ? (
            <Image
              source={{ uri: walrus.urlFor(umbraConfig, post.media[0]) }}
              style={{ height: 180, borderRadius: 10, marginTop: 8, borderWidth: 2, borderColor: "#1B1B1F" }}
            />
          ) : null}
          <Text className="mt-2 text-ink-soft">♥ {likes.data?.likes ?? 0}</Text>
        </View>
      </View>
    </Card>
  );
}
