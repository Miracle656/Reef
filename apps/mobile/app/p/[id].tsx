import { useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { buildCreatePostTx, type Post } from "@umbra/core";
import { palette } from "@umbra/ui";
import { umbraConfig } from "@/lib/config";
import { useAuth } from "@/lib/auth";
import { useGasless } from "@/lib/gasless";
import { trpc } from "@/lib/trpc";
import { Button, Field, Spinner } from "@/components/ui";
import { PostCard } from "@/components/post-card";
import { BottomNav } from "@/components/bottom-nav";

export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { address } = useAuth();
  const run = useGasless();
  const qc = useQueryClient();

  const post = useQuery({ queryKey: ["post", id], queryFn: () => trpc.post.query({ id: id! }), enabled: Boolean(id) });
  const replies = useQuery({ queryKey: ["replies", id], queryFn: () => trpc.repliesForPost.query({ postId: id! }), enabled: Boolean(id) });

  const [text, setText] = useState("");
  const reply = useMutation({
    mutationFn: async () => {
      await run(buildCreatePostTx(umbraConfig, { text: text.trim(), media: [], replyTo: id! }));
    },
    onSuccess: () => {
      setText("");
      const bump = () => {
        qc.invalidateQueries({ queryKey: ["replies", id] });
        qc.invalidateQueries({ queryKey: ["post-actions", id] });
      };
      bump();
      setTimeout(bump, 4500);
    },
  });

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="flex-row items-center gap-2 border-b border-border px-4 pb-2 pt-1">
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text className="text-2xl text-ink">‹</Text>
        </Pressable>
        <Text style={{ fontFamily: "Expose-Bold" }} className="text-lg text-ink">Thread</Text>
      </View>

      <FlatList
        className="flex-1"
        data={replies.data ?? []}
        keyExtractor={(p: Post) => p.id}
        renderItem={({ item }) => <PostCard post={item} />}
        contentContainerStyle={{ paddingBottom: 110 }}
        ListHeaderComponent={
          <View>
            {post.isLoading ? (
              <View className="items-center py-10"><Spinner /></View>
            ) : !post.data ? (
              <Text className="py-10 text-center text-ink-soft">Post not found.</Text>
            ) : (
              <PostCard post={post.data} />
            )}

            {address ? (
              <View className="border-b border-border px-4 pb-3 pt-2">
                <Field
                  value={text}
                  onChangeText={setText}
                  placeholder="Post your reply"
                  multiline
                  maxLength={560}
                  style={{ minHeight: 48, borderRadius: 16, borderWidth: 0, backgroundColor: palette.light.surfaceMuted }}
                />
                <View className="mt-2 flex-row justify-end">
                  <Button label="Reply" variant="accent" onPress={() => reply.mutate()} loading={reply.isPending} disabled={text.trim().length === 0} />
                </View>
              </View>
            ) : null}

            <Text className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">
              {replies.data?.length ? `${replies.data.length} replies` : "Replies"}
            </Text>
          </View>
        }
        ListEmptyComponent={post.data ? <Text className="py-8 text-center text-ink-soft">No replies yet. Be the first.</Text> : null}
      />
      <BottomNav />
    </SafeAreaView>
  );
}
