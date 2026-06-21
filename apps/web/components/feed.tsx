"use client";

import { useCurrentAccount } from "@mysten/dapp-kit";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { PostCard } from "./post-card";
import { Spinner } from "./ui";

export function Feed() {
  const account = useCurrentAccount();
  const feed = useQuery({
    queryKey: ["feed", account?.address],
    queryFn: () => trpc.feed.query({ address: account!.address }),
    enabled: Boolean(account),
  });

  if (!account) return null;
  if (feed.isLoading) return <div className="grid place-items-center py-12"><Spinner /></div>;
  if (feed.isError)
    return <p className="py-8 text-center text-sm text-ink-soft">Couldn&apos;t reach the feed API. Is the indexer running?</p>;

  const posts = feed.data ?? [];
  if (posts.length === 0)
    return <p className="py-12 text-center text-sm text-ink-soft">Your feed is quiet. Follow people to fill it up.</p>;

  return (
    <div className="space-y-3">
      {posts.map((p) => (
        <PostCard key={p.id} post={p} />
      ))}
    </div>
  );
}
