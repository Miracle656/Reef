"use client";

/**
 * Animated emojis — Telegram-style motion. Renders each emoji as Google's
 * **Noto Animated Emoji** (animated WebP, auto-plays + loops in every browser),
 * so emojis look consistent + alive across platforms instead of the OS's static
 * set. Falls back to the native unicode emoji when a glyph has no animated form.
 *
 * No Lottie/runtime dependency — just an <img> off the gstatic CDN.
 */

import { useState, type ReactNode } from "react";

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

export function AnimatedEmoji({ char, size = 20 }: { char: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span style={{ fontSize: size * 0.95, lineHeight: 1 }}>{char}</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${NOTO}/${codepointsFor(char)}/512.webp`}
      alt={char}
      loading="lazy"
      draggable={false}
      className="inline-block select-none align-[-0.18em]"
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  );
}

/** Split a string into nodes, replacing emoji with animated Noto emoji. */
export function renderEmoji(text: string, size = 20): ReactNode[] {
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

/** How many emoji are in the string (for jumbo detection). */
export function emojiCount(text: string): number {
  return (text.match(EMOJI_RE) ?? []).length;
}

/** True when the message is only emoji (+ whitespace) — render them big/jumbo. */
export function isOnlyEmoji(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return t.replace(EMOJI_RE, "").trim().length === 0;
}
