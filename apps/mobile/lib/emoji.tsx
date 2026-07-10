/**
 * Animated emojis — same treatment as web: every emoji renders as Google's
 * **Noto Animated Emoji** (animated WebP off the gstatic CDN, played by
 * expo-image on both platforms), falling back to the plain unicode glyph if a
 * character has no animated form.
 */

import { useState, type ReactNode } from "react";
import { Text } from "react-native";
import { Image } from "expo-image";

const NOTO = "https://fonts.gstatic.com/s/e/notoemoji/latest";

/** Emoji + attached modifiers (skin tone, ZWJ sequences, variation selector). */
const EMOJI_RE =
  /\p{Extended_Pictographic}(?:‍\p{Extended_Pictographic}|[️\u{1F3FB}-\u{1F3FF}])*/gu;

/** Noto filename codepoints: hex, underscore-joined, variation-selector dropped. */
function codepointsFor(emoji: string): string {
  return [...emoji]
    .map((c) => c.codePointAt(0)!.toString(16))
    .filter((cp) => cp !== "fe0f")
    .join("_");
}

export function AnimatedEmoji({ char, size = 18 }: { char: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <Text style={{ fontSize: size * 0.92 }}>{char}</Text>;
  return (
    <Image
      source={{ uri: `${NOTO}/${codepointsFor(char)}/512.webp` }}
      style={{ width: size, height: size, transform: [{ translateY: size * 0.16 }] }}
      contentFit="contain"
      onError={() => setFailed(true)}
    />
  );
}

/** Split a string into nodes, replacing emoji with animated Noto emoji.
 *  The result must be rendered inside a <Text> (images embed inline). */
export function renderEmoji(text: string, size = 18): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(EMOJI_RE)) {
    const i = m.index ?? 0;
    if (i > last) out.push(text.slice(last, i));
    out.push(<AnimatedEmoji key={`e${key++}`} char={m[0]} size={size} />);
    last = i + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** True when the message is only emoji (+ whitespace) — render them big/jumbo. */
export function isOnlyEmoji(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return t.replace(EMOJI_RE, "").trim().length === 0;
}
