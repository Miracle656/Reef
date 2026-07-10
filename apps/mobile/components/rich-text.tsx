/**
 * Rich post text — same rules as web:
 *   · https://… / www.… links open in the browser
 *   · @handle mentions link to that person's profile
 *   · everything else goes through the animated-emoji renderer
 *
 * Render the result inside a parent <Text> (all fragments are inline).
 */

import type { ReactNode } from "react";
import { Linking, Text } from "react-native";
import { useRouter } from "expo-router";
import { palette } from "@umbra/ui";
import { renderEmoji } from "@/lib/emoji";

// URL first (so "@" inside a URL never reads as a mention), then mention.
// Mentions match the on-chain handle alphabet: [a-z0-9_], 3–20 chars, and must
// not be glued to a preceding word character (so emails don't light up).
const TOKEN_RE = /(https?:\/\/[^\s<>()]+[^\s<>().,!?;:'"]|www\.[^\s<>()]+[^\s<>().,!?;:'"])|(^|[^\w@])@([a-z0-9_]{3,20})\b/gi;

/** Shorten a URL for display: drop the protocol, cap the length. */
function prettyUrl(url: string): string {
  const bare = url.replace(/^https?:\/\//i, "");
  return bare.length > 34 ? bare.slice(0, 33) + "…" : bare;
}

export function RichText({ text, emojiSize = 18 }: { text: string; emojiSize?: number }) {
  const router = useRouter();
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  const plain = (s: string) => {
    if (s) out.push(<Text key={`t${key++}`}>{renderEmoji(s, emojiSize)}</Text>);
  };

  for (const m of text.matchAll(TOKEN_RE)) {
    const i = m.index ?? 0;
    const [full, url, lead, handle] = m;
    if (url) {
      plain(text.slice(last, i));
      const href = url.startsWith("www.") ? `https://${url}` : url;
      out.push(
        <Text
          key={`u${key++}`}
          style={{ color: palette.light.accentInk }}
          onPress={() => void Linking.openURL(href)}
        >
          {prettyUrl(url)}
        </Text>,
      );
      last = i + full.length;
    } else if (handle) {
      // keep whatever character preceded the "@" as plain text
      plain(text.slice(last, i) + (lead ?? ""));
      const h = handle.toLowerCase();
      out.push(
        <Text
          key={`m${key++}`}
          style={{ fontFamily: "Expose-Bold", color: palette.light.accentInk }}
          onPress={() => router.push(`/u/${h}` as never)}
        >
          @{handle}
        </Text>,
      );
      last = i + full.length;
    }
  }
  plain(text.slice(last));
  return <>{out}</>;
}
