import { Pressable, Text, View } from "react-native";
import { Link } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { type Post } from "@umbra/core";
import { palette } from "@umbra/ui";
import { imgUrl } from "@/lib/config";
import { trpc } from "@/lib/trpc";
import { PAIRS, fetchMid, type Pair } from "@/lib/deepbook";
import { Avatar, MONO } from "./ui";
import { RemoteImage } from "./remote-image";
import { CoinIcon } from "./market-select";
import { ActionBar } from "./action-bar";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function timeAgo(ms: number): string {
  const s = Math.max(1, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** Post references a known trading pair ("WAL/SUI", "WAL → DEEP", …)? */
function detectPair(text: string): Pair | null {
  const up = text.toUpperCase();
  const sep = "\\s*(?:→|->|\\/|\\s+TO\\s+)\\s*";
  for (const p of PAIRS) {
    const a = new RegExp(`\\b${p.base}\\b${sep}\\b${p.quote}\\b`);
    const b = new RegExp(`\\b${p.quote}\\b${sep}\\b${p.base}\\b`);
    if (a.test(up) || b.test(up)) return p;
  }
  return null;
}

export function PostCard({ post }: { post: Post }) {
  const author = useQuery({
    queryKey: ["profile-by-addr", post.author],
    queryFn: () => trpc.profileByAddress.query({ address: post.author }),
  });
  const a = author.data;
  const href = (a ? `/u/${a.handle}` : "/") as never;
  const pair = post.text ? detectPair(post.text) : null;

  return (
    <View className="flex-row border-b border-border" style={{ paddingHorizontal: 20, paddingVertical: 16, gap: 12 }}>
      <Link href={href} asChild>
        <Pressable>
          <Avatar name={a?.handle ?? post.author} uri={a?.avatarBlobId ? imgUrl(a.avatarBlobId) : null} size={44} />
        </Pressable>
      </Link>
      <View className="flex-1" style={{ minWidth: 0 }}>
        <View className="flex-row flex-wrap items-center" style={{ gap: 6 }}>
          <Link href={href} asChild>
            <Pressable>
              <Text style={{ fontFamily: "Expose-Bold", fontSize: 14.5 }} className="text-ink">
                {a?.displayName ?? "Someone"}
              </Text>
            </Pressable>
          </Link>
          <Text style={{ fontFamily: MONO, fontSize: 11.5, color: palette.light.inkFaint }}>
            @{a?.handle ?? short(post.author)} · {timeAgo(post.createdAtMs)}
          </Text>
        </View>
        {post.text ? (
          <Text style={{ marginTop: 5, fontSize: 14.5, lineHeight: 21, color: "#26262c" }}>{post.text}</Text>
        ) : null}
        {post.media.length > 0 ? (
          <View className="mt-2.5 flex-row" style={{ gap: 5, borderRadius: 14, overflow: "hidden" }}>
            {post.media.slice(0, 4).map((blob) => (
              <RemoteImage
                key={blob}
                uri={imgUrl(blob)}
                style={{ flex: 1, height: post.media.length > 1 ? 150 : 200, borderRadius: 14, backgroundColor: palette.light.surfaceMuted }}
              />
            ))}
          </View>
        ) : null}
        {pair ? <TradeEmbed pair={pair} /> : null}
        <ActionBar post={post} />
      </View>
    </View>
  );
}

/** Inline trade card (design: white card, coin icon, mono pair, bold price). */
function TradeEmbed({ pair }: { pair: Pair }) {
  const mid = useQuery({ queryKey: ["mid", pair.key], queryFn: () => fetchMid(pair.key), refetchInterval: 20000 });
  const price = mid.data;
  return (
    <Link href={"/trade" as never} asChild>
      <Pressable
        className="mt-2.5 flex-row items-center"
        style={{
          gap: 11,
          borderWidth: 1,
          borderColor: "rgba(21,21,26,.12)",
          borderRadius: 16,
          padding: 13,
          backgroundColor: "#fff",
        }}
      >
        <CoinIcon symbol={pair.base} size={34} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: MONO, fontSize: 10.5, color: palette.light.inkFaint }}>
            {pair.base} → {pair.quote}
          </Text>
          <Text style={{ fontFamily: "Expose-Bold", fontSize: 16 }} className="text-ink">
            {price != null ? (price < 1 ? price.toPrecision(4) : price.toLocaleString(undefined, { maximumFractionDigits: 2 })) : "—"}{" "}
            <Text style={{ fontFamily: "Expose-Medium", fontSize: 12, color: palette.light.inkSoft }}>{pair.quote}</Text>
          </Text>
        </View>
        <View style={{ backgroundColor: palette.light.accent, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 }}>
          <Text style={{ fontFamily: "Expose-Bold", fontSize: 12, color: "#fff" }}>Trade</Text>
        </View>
      </Pressable>
    </Link>
  );
}
