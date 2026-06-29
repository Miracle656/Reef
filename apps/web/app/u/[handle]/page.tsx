"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { walrus } from "@umbra/core";
import { AppShell } from "@/components/app-shell";
import { RightSidebar } from "@/components/right-sidebar";
import { CoinIcon } from "@/components/market-select";
import { FollowButton } from "@/components/follow-button";
import { PostCard } from "@/components/post-card";
import { Avatar, Button, Card, Spinner } from "@/components/ui";
import { umbraConfig } from "@/lib/config";
import { trpc } from "@/lib/trpc";

export default function ProfilePage() {
  const params = useParams<{ handle: string }>();
  const handle = params.handle;

  const profile = useQuery({
    queryKey: ["profile-by-handle", handle],
    queryFn: () => trpc.profileByHandle.query({ handle }),
  });
  const p = profile.data;

  const posts = useQuery({
    queryKey: ["posts-by-author", p?.owner],
    queryFn: () => trpc.postsByAuthor.query({ address: p!.owner }),
    enabled: Boolean(p),
  });

  const coins = useQuery({
    queryKey: ["creator-coins", p?.owner],
    queryFn: () => trpc.creatorCoins.query({ owner: p!.owner }),
    enabled: Boolean(p),
  });
  const reposts = useQuery({
    queryKey: ["reacted", "repost", p?.owner],
    queryFn: () => trpc.reactedPosts.query({ address: p!.owner, kind: "repost" }),
    enabled: Boolean(p),
  });
  const bookmarks = useQuery({
    queryKey: ["reacted", "bookmark", p?.owner],
    queryFn: () => trpc.reactedPosts.query({ address: p!.owner, kind: "bookmark" }),
    enabled: Boolean(p),
  });
  const [tab, setTab] = useState<"posts" | "reposts" | "bookmarks">("posts");
  const tabData = tab === "posts" ? posts.data : tab === "reposts" ? reposts.data : bookmarks.data;

  if (profile.isLoading) {
    return (
      <AppShell flush title="Profile" back="/" right={<RightSidebar />}>
        <div className="grid place-items-center py-16"><Spinner /></div>
      </AppShell>
    );
  }
  if (!p) {
    return (
      <AppShell flush title="Profile" back="/" right={<RightSidebar />}>
        <p className="py-16 text-center text-sm text-ink-soft">@{handle} not found.</p>
      </AppShell>
    );
  }

  const verified = Boolean(p.suinsName);
  return (
    <AppShell flush title={p.displayName || p.handle} subtitle={`${p.followersCount} followers`} back="/" right={<RightSidebar />}>
      {/* banner */}
      <div className="h-[140px] bg-[linear-gradient(120deg,#7CFCD8,#18C2C2_45%,#0A84FF)]" />

      <div className="px-6">
        <div className="-mt-11 flex items-end justify-between">
          <span className="rounded-full ring-4 ring-[color:var(--background)]">
            <Avatar name={p.handle} src={p.avatarBlobId ? walrus.urlFor(umbraConfig, p.avatarBlobId) : null} size={96} />
          </span>
          <div className="mb-2">
            <FollowButton target={p.owner} />
          </div>
        </div>

        <div className="mt-3.5 flex items-center gap-1.5">
          <h2 className="text-[24px] font-black tracking-tight">{p.displayName || p.handle}</h2>
          {verified ? <SealCheck /> : null}
        </div>
        <div className="font-mono text-[13px] text-ink-faint">
          @{p.handle}
          {p.suinsName ? <span className="text-accent"> · {p.suinsName}</span> : null}
        </div>
        {p.bio ? <p className="mt-3 max-w-[480px] text-[15px] leading-[1.5] text-[#26262c]">{p.bio}</p> : null}
        <div className="mt-3.5 flex gap-5 text-[14.5px]">
          <span><b className="font-bold">{p.followingCount}</b> <span className="text-ink-faint">Following</span></span>
          <span><b className="font-bold">{p.followersCount}</b> <span className="text-ink-faint">Followers</span></span>
        </div>

        {coins.data && coins.data.length > 0 ? (
          <div className="mt-4 space-y-2">
            {coins.data.map((c) => (
              <Card key={c.coinType} className="flex items-center justify-between p-3">
                <div className="flex items-center gap-3">
                  <CoinIcon symbol={c.symbol} size={36} />
                  <div>
                    <p className="text-sm font-bold">${c.symbol}</p>
                    <p className="font-mono text-xs text-ink-faint">{c.name}</p>
                  </div>
                </div>
                <Link href="/trade"><Button size="sm" variant="accent">Trade</Button></Link>
              </Card>
            ))}
          </div>
        ) : null}
      </div>

      {/* tabs */}
      <div className="mt-4 flex gap-8 border-b border-[color:var(--glass-border)] px-6">
        {(["posts", "reposts", "bookmarks"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-[2.5px] pb-3 text-[15px] capitalize transition-colors ${
              tab === t ? "border-accent font-bold text-ink" : "border-transparent font-medium text-ink-faint hover:text-ink"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div>
        {tabData?.length ? (
          tabData.map((post) => <PostCard key={post.id} post={post} />)
        ) : (
          <p className="py-8 text-center text-sm text-ink-soft">
            {tab === "posts" ? "No posts yet." : tab === "reposts" ? "No reposts yet." : "No bookmarks yet."}
          </p>
        )}
      </div>
    </AppShell>
  );
}

function SealCheck() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="#0A84FF" aria-label="verified">
      <path d="M12 1l2.4 1.8 3 .2 1 2.8 2.4 1.8-.8 2.9.8 2.9-2.4 1.8-1 2.8-3 .2L12 23l-2.4-1.8-3-.2-1-2.8L3.2 16.4 4 13.5l-.8-2.9 2.4-1.8 1-2.8 3-.2z" />
      <path d="M9.5 12.5l1.8 1.8 3.5-3.8" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
