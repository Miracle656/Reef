"use client";

/**
 * Rich post text — turns raw post text into real UI:
 *   · https://… / www.… links become clickable anchors (open in a new tab)
 *   · @handle mentions become links to that person's profile
 *   · everything else goes through the animated-emoji renderer
 *
 * Post bodies are often wrapped in a click-to-open-post container, so inner
 * anchors stopPropagation to keep "tap the link" and "tap the post" distinct.
 */

import Link from "next/link";
import type { ReactNode } from "react";
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

const stop = (e: React.MouseEvent) => e.stopPropagation();

export function RichText({ text, emojiSize = 20 }: { text: string; emojiSize?: number }) {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  const plain = (s: string) => {
    if (s) out.push(<span key={`t${key++}`}>{renderEmoji(s, emojiSize)}</span>);
  };

  for (const m of text.matchAll(TOKEN_RE)) {
    const i = m.index ?? 0;
    const [full, url, lead, handle] = m;
    if (url) {
      plain(text.slice(last, i));
      const href = url.startsWith("www.") ? `https://${url}` : url;
      out.push(
        <a key={`u${key++}`} href={href} target="_blank" rel="noopener noreferrer" onClick={stop} className="break-all text-accent-ink hover:underline">
          {prettyUrl(url)}
        </a>,
      );
      last = i + full.length;
    } else if (handle) {
      // keep whatever character preceded the "@" as plain text
      plain(text.slice(last, i) + (lead ?? ""));
      out.push(
        <Link key={`m${key++}`} href={`/u/${handle.toLowerCase()}`} onClick={stop} className="font-semibold text-accent-ink hover:underline">
          @{handle}
        </Link>,
      );
      last = i + full.length;
    }
  }
  plain(text.slice(last));
  return <>{out}</>;
}

/** Handles mentioned in a text — used by compose to know who got tagged. */
export function extractMentions(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(TOKEN_RE)) {
    if (m[3]) out.add(m[3].toLowerCase());
  }
  return [...out];
}
