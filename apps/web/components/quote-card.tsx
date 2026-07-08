"use client";

/**
 * Compact embedded post — the card shown inside a quote post (and the preview
 * inside the quote composer). Deliberately light: no action bar, no nested
 * quote embeds, so quoting a quote never recurses.
 */

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { walrus } from "@umbra/core";
import { umbraConfig } from "@/lib/config";
import { trpc } from "@/lib/trpc";
import { shortAddr, timeAgo } from "@/lib/utils";
import { RichText } from "./rich-text";
import { Avatar } from "./ui";

/** Strip any /p/<id> refs from the quoted text so embeds never chain. */
function stripPostRefs(text: string): string {
  return text.replace(/(?:https?:\/\/[^\s]+)?\/p\/0x[0-9a-fA-F]+/g, "").replace(/[ \t]+/g, " ").trim();
}

export function QuoteCard({ id, linkable = true }: { id: string; linkable?: boolean }) {
  const router = useRouter();
  const post = useQuery({ queryKey: ["post", id], queryFn: () => trpc.post.query({ id }) });
  const author = useQuery({
    queryKey: ["profile-by-addr", post.data?.author],
    queryFn: () => trpc.profileByAddress.query({ address: post.data!.author }),
    enabled: Boolean(post.data),
  });

  const p = post.data;
  const a = author.data;
  const frame = "mt-3 overflow-hidden rounded-[18px] border border-[color:var(--glass-border)] bg-surface-glass";

  if (post.isLoading) return <div className={`${frame} p-4 text-sm text-ink-faint`}>Loading post…</div>;
  if (!p) return <div className={`${frame} p-4 text-sm text-ink-faint`}>This post is gone.</div>;

  const text = stripPostRefs(p.text);
  return (
    <div
      className={`${frame} p-4 ${linkable ? "cursor-pointer transition-colors hover:bg-surface-muted" : ""}`}
      onClick={
        linkable
          ? (e) => {
              e.stopPropagation();
              router.push(`/p/${p.id}`);
            }
          : undefined
      }
    >
      <div className="flex items-center gap-2">
        <Avatar name={a?.handle ?? p.author} src={a?.avatarBlobId ? walrus.urlFor(umbraConfig, a.avatarBlobId) : null} size={22} />
        <span className="truncate text-[13.5px] font-bold">{a?.displayName ?? "Someone"}</span>
        <span className="truncate font-mono text-[11.5px] text-ink-faint">@{a?.handle ?? shortAddr(p.author)}</span>
        <span className="whitespace-nowrap font-mono text-[11.5px] text-ink-faint">· {timeAgo(p.createdAtMs)}</span>
      </div>
      {text ? (
        <p className="mt-1.5 line-clamp-4 whitespace-pre-wrap break-words text-[14px] leading-[1.45] text-[#26262c]">
          <RichText text={text} emojiSize={17} />
        </p>
      ) : null}
      {p.media.length > 0 ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={walrus.urlFor(umbraConfig, p.media[0]!)} alt="" className="mt-2 max-h-56 w-full rounded-xl object-cover" />
      ) : null}
    </div>
  );
}
