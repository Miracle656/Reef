"use client";

import Link from "next/link";
import { useSignPersonalMessage } from "@mysten/dapp-kit";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canonicalReactionBytes, type Post, type ReactionMessage } from "@umbra/core";
import { useSocialAccount } from "@/lib/account";
import { trpc } from "@/lib/trpc";
import { toast } from "./toaster";

type Kind = "like" | "repost" | "bookmark";

export function ActionBar({ post }: { post: Post }) {
  const account = useSocialAccount();
  const { mutateAsync: sign } = useSignPersonalMessage();
  const qc = useQueryClient();

  const s = useQuery({
    queryKey: ["post-actions", post.id, account?.address],
    queryFn: () => trpc.postActions.query({ postId: post.id, viewer: account?.address }),
  });
  const d = s.data;

  const toggle = useMutation({
    mutationFn: async ({ kind, active }: { kind: Kind; active: boolean }) => {
      if (!account) throw new Error("Sign in first");
      const message: ReactionMessage = {
        kind,
        postId: post.id,
        reactor: account.address,
        timestamp: Date.now(),
        value: (active ? 0 : 1) as 0 | 1,
      };
      const { signature } = await sign({ message: canonicalReactionBytes(message), account });
      return trpc.addReaction.mutate({ message, signature });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["post-actions", post.id] }),
    onError: (e) => toast(e instanceof Error ? e.message : "Something went wrong"),
  });

  const share = async () => {
    const url = `${location.origin}/p/${post.id}`;
    try {
      if (navigator.share) await navigator.share({ url, title: "ReeF" });
      else {
        await navigator.clipboard.writeText(url);
        toast("Link copied ✓");
      }
    } catch {
      /* user dismissed share sheet */
    }
  };

  const busy = toggle.isPending || !account;

  return (
    <div className="mt-3 flex max-w-sm items-center justify-between text-ink-soft">
      <Link href={`/p/${post.id}`} className="group inline-flex items-center gap-1.5 text-sm transition-colors hover:text-accent" aria-label="Comments">
        <Icon name="comment" />
        <span>{d?.replyCount ?? 0}</span>
      </Link>

      <button
        type="button"
        onClick={() => toggle.mutate({ kind: "repost", active: d?.reposted ?? false })}
        disabled={busy}
        className={`inline-flex items-center gap-1.5 text-sm transition-colors hover:text-emerald-500 disabled:opacity-50 ${d?.reposted ? "text-emerald-500" : ""}`}
        aria-pressed={d?.reposted}
        aria-label="Repost"
      >
        <Icon name="repost" />
        <span>{d?.reposts ?? 0}</span>
      </button>

      <button
        type="button"
        onClick={() => toggle.mutate({ kind: "like", active: d?.liked ?? false })}
        disabled={busy}
        className={`inline-flex items-center gap-1.5 text-sm transition-colors hover:text-accent disabled:opacity-50 ${d?.liked ? "text-accent" : ""}`}
        aria-pressed={d?.liked}
        aria-label="Like"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/sui.png" alt="" className={`h-4 w-4 transition ${d?.liked ? "" : "opacity-40 grayscale"}`} />
        <span>{d?.likes ?? 0}</span>
      </button>

      <button
        type="button"
        onClick={() => toggle.mutate({ kind: "bookmark", active: d?.bookmarked ?? false })}
        disabled={busy}
        className={`inline-flex items-center gap-1.5 text-sm transition-colors hover:text-amber-500 disabled:opacity-50 ${d?.bookmarked ? "text-amber-500" : ""}`}
        aria-pressed={d?.bookmarked}
        aria-label="Bookmark"
      >
        <Icon name="bookmark" filled={d?.bookmarked} />
        <span>{d?.bookmarks ?? 0}</span>
      </button>

      <button type="button" onClick={share} className="inline-flex items-center text-sm transition-colors hover:text-ink" aria-label="Share">
        <Icon name="share" />
      </button>
    </div>
  );
}

function Icon({ name, filled }: { name: "comment" | "repost" | "bookmark" | "share"; filled?: boolean }) {
  const common = { className: "h-[18px] w-[18px]", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "comment")
    return (
      <svg {...common}>
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    );
  if (name === "repost")
    return (
      <svg {...common}>
        <path d="m17 1 4 4-4 4" />
        <path d="M3 11V9a4 4 0 0 1 4-4h14" />
        <path d="m7 23-4-4 4-4" />
        <path d="M21 13v2a4 4 0 0 1-4 4H3" />
      </svg>
    );
  if (name === "bookmark")
    return (
      <svg {...common} fill={filled ? "currentColor" : "none"}>
        <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" x2="12" y1="2" y2="15" />
    </svg>
  );
}
