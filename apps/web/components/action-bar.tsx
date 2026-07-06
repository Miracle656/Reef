"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canonicalReactionBytes, type Post, type ReactionMessage } from "@umbra/core";
import { useSocialAccount } from "@/lib/account";
import { useEnokiSignPersonalMessage } from "@/lib/gasless";
import { trpc } from "@/lib/trpc";
import { ComposeForm } from "./compose-box";
import { toast } from "./toaster";

type Kind = "like" | "repost" | "bookmark";

export function ActionBar({ post }: { post: Post }) {
  const account = useSocialAccount();
  const sign = useEnokiSignPersonalMessage();
  const qc = useQueryClient();
  const [repostMenu, setRepostMenu] = useState(false);
  const [quoting, setQuoting] = useState(false);

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
      const { signature } = await sign(canonicalReactionBytes(message));
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
    <>
      {repostMenu ? <div className="fixed inset-0 z-20" onClick={() => setRepostMenu(false)} /> : null}
      {quoting ? (
        <div className="fixed inset-0 z-50 grid place-items-start justify-center bg-ink/40 p-4 pt-[12vh]" onClick={() => setQuoting(false)}>
          <div
            className="w-full max-w-lg rounded-3xl border border-[color:var(--glass-border)] bg-surface p-5 shadow-[var(--shadow-glass-lg)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-base font-black tracking-tight">Quote post</h3>
              <button type="button" onClick={() => setQuoting(false)} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full text-ink-soft hover:bg-surface-muted">
                ✕
              </button>
            </div>
            <ComposeForm autoFocus quote={post} placeholder="Add your take…" onPosted={() => setQuoting(false)} />
          </div>
        </div>
      ) : null}
      <div className="mt-3 flex max-w-sm items-center justify-between text-ink-soft">
      <Link href={`/p/${post.id}`} className="group inline-flex items-center gap-1.5 text-sm transition-colors hover:text-accent" aria-label="Comments">
        <Icon name="comment" />
        <span>{d?.replyCount ?? 0}</span>
      </Link>

      <div className="relative">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setRepostMenu((v) => !v);
          }}
          disabled={busy}
          className={`inline-flex items-center gap-1.5 text-sm transition-colors hover:text-emerald-500 disabled:opacity-50 ${d?.reposted ? "text-emerald-500" : ""}`}
          aria-pressed={d?.reposted}
          aria-label="Repost or quote"
        >
          <Icon name="repost" />
          <span>{d?.reposts ?? 0}</span>
        </button>
        {repostMenu ? (
          <div className="absolute bottom-full left-0 z-30 mb-2 w-44 rounded-2xl border border-[color:var(--glass-border)] bg-surface p-1 shadow-[var(--shadow-glass-lg)]" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => {
                setRepostMenu(false);
                toggle.mutate({ kind: "repost", active: d?.reposted ?? false });
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-surface-muted"
            >
              <Icon name="repost" />
              {d?.reposted ? "Undo repost" : "Repost"}
            </button>
            <button
              type="button"
              onClick={() => {
                setRepostMenu(false);
                setQuoting(true);
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-surface-muted"
            >
              <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
              Quote
            </button>
          </div>
        ) : null}
      </div>

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
    </>
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
