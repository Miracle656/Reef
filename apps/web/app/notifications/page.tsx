"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { walrus } from "@umbra/core";
import { AppShell } from "@/components/app-shell";
import { RightSidebar } from "@/components/right-sidebar";
import { Avatar } from "@/components/ui";
import { useSocialAccount } from "@/lib/account";
import { umbraConfig } from "@/lib/config";
import { trpc } from "@/lib/trpc";
import { shortAddr, timeAgo } from "@/lib/utils";

type Notif = Awaited<ReturnType<typeof trpc.notifications.query>>[number];

const VERB: Record<Notif["type"], string> = {
  follow: "followed you",
  like: "liked your post",
  repost: "reposted your post",
  reply: "replied to your post",
};

export default function NotificationsPage() {
  const account = useSocialAccount();
  const qc = useQueryClient();
  const notifs = useQuery({
    queryKey: ["notifications", account?.address],
    queryFn: () => trpc.notifications.query({ address: account!.address, limit: 40 }),
    enabled: Boolean(account),
    refetchInterval: 30_000,
  });

  // Opening the page clears the unread badge: record "seen now" and re-run the
  // shared notifications query so the nav badge recomputes to zero.
  useEffect(() => {
    if (!account) return;
    localStorage.setItem(`reef:notif-seen:${account.address}`, String(Date.now()));
    qc.invalidateQueries({ queryKey: ["notifications", account.address] });
  }, [account, qc]);

  const list = notifs.data ?? [];

  return (
    <AppShell flush title="Notifications" right={<RightSidebar />}>
      {!account ? (
        <Empty>Sign in to see your notifications.</Empty>
      ) : notifs.isLoading ? (
        <Empty>Loading…</Empty>
      ) : !list.length ? (
        <Empty>No notifications yet — when someone follows, likes, or replies to you, it shows up here.</Empty>
      ) : (
        <ul>
          {list.map((n, i) => (
            <NotifRow key={`${n.type}-${n.actor.address}-${n.postId ?? ""}-${i}`} n={n} />
          ))}
        </ul>
      )}
    </AppShell>
  );
}

/**
 * Post previews hide raw Predict market links (`/m/<oracleId>[?strike=…]`)
 * the same way the feed does — the feed swaps them for an embed card; here we
 * just drop them. A post that was ONLY a market link previews as a label.
 */
function cleanPreview(text: string | undefined): string {
  if (!text) return "";
  const stripped = text.replace(/\/m\/[A-Za-z0-9_-]+(\?strike=[0-9.]+)?/g, "").replace(/\s+/g, " ").trim();
  return stripped || "Prediction market";
}

function NotifRow({ n }: { n: Notif }) {
  const name = n.actor.displayName || n.actor.handle || shortAddr(n.actor.address);
  const profileHref = n.actor.handle ? `/u/${n.actor.handle}` : "#";
  const href = n.postId ? `/p/${n.postId}` : profileHref;
  const avatarUrl = n.actor.avatarBlobId ? walrus.urlFor(umbraConfig, n.actor.avatarBlobId) : null;
  const preview = cleanPreview(n.preview);

  return (
    <li className="border-b border-[color:var(--glass-border)]">
      <Link href={href} className="flex items-start gap-3.5 px-5 py-4 transition-colors hover:bg-[color:color-mix(in_srgb,var(--accent)_3%,transparent)]">
        <span className="relative shrink-0">
          <Avatar name={n.actor.handle ?? n.actor.address} src={avatarUrl} size={44} />
          <NotifBadge type={n.type} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-snug">
            <span className="font-bold">{name}</span>{" "}
            <span className="text-ink-soft">{VERB[n.type]}</span>{" "}
            <span className="whitespace-nowrap font-mono text-[12.5px] text-ink-faint">· {timeAgo(n.createdAtMs)}</span>
          </p>
          {preview ? <p className="mt-0.5 truncate text-[14px] text-ink-soft">{preview}</p> : null}
        </div>
      </Link>
    </li>
  );
}

/** The little corner badge on the actor's avatar — unique per notification type. */
function NotifBadge({ type }: { type: Notif["type"] }) {
  const wrap = "absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full ring-2 ring-[color:var(--surface)]";
  if (type === "like")
    // Likes are Sui-flavored — show the Sui mark itself (matches the like button).
    return (
      <span className={`${wrap} bg-white`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/sui.png" alt="" className="h-3 w-3" />
      </span>
    );
  if (type === "repost")
    return (
      <span className={`${wrap} bg-emerald-500 text-white`}>
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m17 1 4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="m7 23-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
        </svg>
      </span>
    );
  if (type === "reply")
    return (
      <span className={`${wrap} bg-accent text-on-accent`}>
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-7.9 8.4 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 16.99 0z" />
        </svg>
      </span>
    );
  // follow
  return (
    <span className={`${wrap} bg-violet-500 text-white`}>
      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="8" r="3.2" /><path d="M3.5 20c0-3 2.5-4.6 5.5-4.6M17 8v6M20 11h-6" />
      </svg>
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-6 py-16 text-center text-sm text-ink-soft">{children}</p>;
}
