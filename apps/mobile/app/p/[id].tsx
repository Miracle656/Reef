import { useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { buildCreatePostTx, type Post } from "@umbra/core";
import { palette } from "@umbra/ui";
import { imgUrl, umbraConfig } from "@/lib/config";
import { useAuth } from "@/lib/auth";
import { useGasless } from "@/lib/gasless";
import { trpc } from "@/lib/trpc";
import { Avatar, MONO, Spinner } from "@/components/ui";
import { PostCard, PredictEmbed, detectPredictMarket } from "@/components/post-card";
import { ActionBar } from "@/components/action-bar";
import { RemoteImage } from "@/components/remote-image";
import { BottomNav } from "@/components/bottom-nav";
import { RichText } from "@/components/rich-text";
import { QuoteCard } from "@/components/quote-card";
import { isOnlyEmoji } from "@/lib/emoji";

const bold = { fontFamily: "Expose-Bold" } as const;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Design screen 6 — post page: hero post, mono meta line, replies, reply bar. */
export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { address } = useAuth();
  const run = useGasless();
  const qc = useQueryClient();

  const post = useQuery({ queryKey: ["post", id], queryFn: () => trpc.post.query({ id: id! }), enabled: Boolean(id) });
  const replies = useQuery({ queryKey: ["replies", id], queryFn: () => trpc.repliesForPost.query({ postId: id! }), enabled: Boolean(id) });
  const author = useQuery({
    queryKey: ["profile-by-addr", post.data?.author],
    queryFn: () => trpc.profileByAddress.query({ address: post.data!.author }),
    enabled: Boolean(post.data),
  });
  const me = useQuery({
    queryKey: ["profile-by-addr", address],
    queryFn: () => trpc.profileByAddress.query({ address: address! }),
    enabled: Boolean(address),
  });

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

  const a = author.data;
  const p = post.data;
  // Same embed rules as the feed: /m/<id> → market card, /p/<id> → quote card.
  const market = p?.text ? detectPredictMarket(p.text) : null;
  const quoteId = p?.text?.match(/(?:https?:\/\/[^\s]+)?\/p\/(0x[0-9a-fA-F]+)/)?.[1] ?? null;
  let bodyText = p?.text ?? "";
  if (market) bodyText = bodyText.replace(/\/m\/[A-Za-z0-9_-]+(?:\?strike=[0-9.]+)?/, "");
  if (quoteId) bodyText = bodyText.replace(/(?:https?:\/\/[^\s]+)?\/p\/0x[0-9a-fA-F]+/, "");
  bodyText = bodyText.trim();
  const when = p
    ? `${new Date(p.createdAtMs).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} · ${new Date(p.createdAtMs).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
    : "";

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      {/* header */}
      <View className="flex-row items-center border-b border-border" style={{ gap: 14, paddingHorizontal: 20, paddingBottom: 12, paddingTop: 4 }}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={20} color={palette.light.ink} />
        </Pressable>
        <Text style={{ fontFamily: "Expose-Black", fontSize: 18 }} className="text-ink">Post</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <FlatList
          className="flex-1"
          data={replies.data ?? []}
          keyExtractor={(r: Post) => r.id}
          renderItem={({ item }) => <PostCard post={item} />}
          contentContainerStyle={{ paddingBottom: 90 }}
          ListHeaderComponent={
            <View>
              {post.isLoading ? (
                <View className="items-center py-10"><Spinner /></View>
              ) : !p ? (
                <Text className="py-10 text-center text-ink-soft">Post not found.</Text>
              ) : (
                <View className="border-b border-border" style={{ paddingHorizontal: 20, paddingVertical: 18 }}>
                  {/* author row */}
                  <Pressable
                    onPress={() => a && router.push(`/u/${a.handle}` as never)}
                    className="flex-row items-center"
                    style={{ gap: 12 }}
                  >
                    <Avatar name={a?.handle ?? p.author} uri={a?.avatarBlobId ? imgUrl(a.avatarBlobId) : null} size={48} />
                    <View>
                      <View className="flex-row items-center" style={{ gap: 5 }}>
                        <Text style={[bold, { fontSize: 15 }]} className="text-ink">{a?.displayName || a?.handle || "Someone"}</Text>
                        {a?.suinsName ? <Ionicons name="shield-checkmark" size={14} color={palette.light.accent} /> : null}
                      </View>
                      <Text style={{ fontFamily: MONO, fontSize: 12, color: palette.light.inkFaint }}>
                        @{a?.handle ?? short(p.author)}.reef
                      </Text>
                    </View>
                  </Pressable>

                  {/* body */}
                  {bodyText ? (
                    <Text style={{ marginVertical: 14, fontSize: 18, lineHeight: isOnlyEmoji(bodyText) ? 52 : 26 }} className="text-ink">
                      <RichText text={bodyText} emojiSize={isOnlyEmoji(bodyText) ? 44 : 22} />
                    </Text>
                  ) : (
                    <View style={{ height: 14 }} />
                  )}
                  {p.media.length > 0 ? (
                    <View className="mb-3 flex-row" style={{ gap: 5, borderRadius: 14, overflow: "hidden" }}>
                      {p.media.slice(0, 4).map((blob) => (
                        <RemoteImage
                          key={blob}
                          uri={imgUrl(blob)}
                          style={{ flex: 1, height: p.media.length > 1 ? 170 : 230, borderRadius: 14, backgroundColor: palette.light.surfaceMuted }}
                        />
                      ))}
                    </View>
                  ) : null}

                  {quoteId && quoteId !== p.id ? <View style={{ marginBottom: 12 }}><QuoteCard id={quoteId} /></View> : null}
                  {market ? <View style={{ marginBottom: 12 }}><PredictEmbed id={market.id} strike={market.strike} /></View> : null}

                  {/* meta line */}
                  <Text
                    style={{ fontFamily: MONO, fontSize: 11.5, color: palette.light.inkFaint, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: palette.light.border }}
                  >
                    {when} · <Text style={{ color: palette.light.ink, fontWeight: "700" }}>testnet</Text> post
                  </Text>

                  {/* actions (live counts) */}
                  <ActionBar post={p} />
                </View>
              )}

              <Text
                style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 1 }}
                className="px-5 pb-1 pt-3 uppercase text-ink-faint"
              >
                {replies.data?.length ? `${replies.data.length} replies` : "Replies"}
              </Text>
            </View>
          }
          ListEmptyComponent={p ? <Text className="py-8 text-center text-ink-soft">No replies yet. Be the first.</Text> : null}
        />

        {/* reply bar */}
        {address && p ? (
          <View
            className="flex-row items-center border-t border-border bg-background"
            style={{ gap: 11, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14 }}
          >
            <Avatar name={me.data?.handle ?? "?"} uri={me.data?.avatarBlobId ? imgUrl(me.data.avatarBlobId) : null} size={34} />
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Post your reply…"
              placeholderTextColor={palette.light.inkFaint}
              maxLength={560}
              multiline
              className="flex-1 text-ink"
              style={{ fontFamily: "Expose", fontSize: 14, maxHeight: 90, paddingVertical: 4 }}
            />
            <Pressable
              onPress={() => reply.mutate()}
              disabled={reply.isPending || text.trim().length === 0}
              style={{
                backgroundColor: palette.light.accent,
                borderRadius: 100,
                paddingHorizontal: 18,
                paddingVertical: 8,
                opacity: reply.isPending || text.trim().length === 0 ? 0.5 : 1,
              }}
            >
              <Text style={[bold, { fontSize: 13, color: "#fff" }]}>{reply.isPending ? "…" : "Reply"}</Text>
            </Pressable>
          </View>
        ) : null}
      </KeyboardAvoidingView>
      {!address ? <BottomNav /> : null}
    </SafeAreaView>
  );
}
