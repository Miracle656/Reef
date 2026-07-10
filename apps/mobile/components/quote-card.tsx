/**
 * Compact embedded post — the card shown inside a quote post. Deliberately
 * light (no action bar, no nested quote embeds) so quoting a quote never
 * recurses. Mirrors web components/quote-card.tsx.
 */

import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { palette } from "@umbra/ui";
import { imgUrl } from "@/lib/config";
import { trpc } from "@/lib/trpc";
import { Avatar, MONO } from "@/components/ui";
import { RichText } from "@/components/rich-text";
import { RemoteImage } from "@/components/remote-image";
import { timeAgo } from "@/components/post-card";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Strip any /p/<id> refs from the quoted text so embeds never chain. */
function stripPostRefs(text: string): string {
  return text.replace(/(?:https?:\/\/[^\s]+)?\/p\/0x[0-9a-fA-F]+/g, "").replace(/[ \t]+/g, " ").trim();
}

export function QuoteCard({ id }: { id: string }) {
  const router = useRouter();
  const post = useQuery({ queryKey: ["post", id], queryFn: () => trpc.post.query({ id }) });
  const author = useQuery({
    queryKey: ["profile-by-addr", post.data?.author],
    queryFn: () => trpc.profileByAddress.query({ address: post.data!.author }),
    enabled: Boolean(post.data),
  });

  const p = post.data;
  const a = author.data;
  const frame = {
    marginTop: 10,
    borderWidth: 1,
    borderColor: palette.light.border,
    borderRadius: 18,
    padding: 13,
    backgroundColor: "#fff",
  } as const;

  if (post.isLoading) {
    return (
      <View style={frame}>
        <Text style={{ fontSize: 13, color: palette.light.inkFaint }}>Loading post…</Text>
      </View>
    );
  }
  if (!p) {
    return (
      <View style={frame}>
        <Text style={{ fontSize: 13, color: palette.light.inkFaint }}>This post is gone.</Text>
      </View>
    );
  }

  const text = stripPostRefs(p.text);
  return (
    <Pressable style={frame} onPress={() => router.push(`/p/${p.id}` as never)}>
      <View className="flex-row items-center" style={{ gap: 7 }}>
        <Avatar name={a?.handle ?? p.author} uri={a?.avatarBlobId ? imgUrl(a.avatarBlobId) : null} size={22} />
        <Text numberOfLines={1} style={{ fontFamily: "Expose-Bold", fontSize: 13 }} className="text-ink">
          {a?.displayName ?? "Someone"}
        </Text>
        <Text numberOfLines={1} style={{ fontFamily: MONO, fontSize: 11, color: palette.light.inkFaint }}>
          @{a?.handle ?? short(p.author)} · {timeAgo(p.createdAtMs)}
        </Text>
      </View>
      {text ? (
        <Text numberOfLines={4} style={{ marginTop: 6, fontSize: 13.5, lineHeight: 19, color: "#26262c" }}>
          <RichText text={text} emojiSize={15} />
        </Text>
      ) : null}
      {p.media.length > 0 ? (
        <RemoteImage
          uri={imgUrl(p.media[0]!)}
          style={{ marginTop: 8, height: 150, borderRadius: 12, backgroundColor: palette.light.surfaceMuted }}
        />
      ) : null}
    </Pressable>
  );
}
