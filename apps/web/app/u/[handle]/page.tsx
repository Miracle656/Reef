"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { walrus } from "@umbra/core";
import { AppNav } from "@/components/app-nav";
import { FollowButton } from "@/components/follow-button";
import { PostCard } from "@/components/post-card";
import { Avatar, Card, Spinner } from "@/components/ui";
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

  return (
    <>
      <AppNav />
      <main className="mx-auto max-w-2xl px-4 py-6 pb-28">
        {profile.isLoading ? (
          <div className="grid place-items-center py-12"><Spinner /></div>
        ) : !p ? (
          <p className="py-12 text-center text-sm text-ink-soft">@{handle} not found.</p>
        ) : (
          <>
            <Card className="p-5">
              <div className="flex items-start justify-between">
                <Avatar
                  name={p.handle}
                  src={p.avatarBlobId ? walrus.urlFor(umbraConfig, p.avatarBlobId) : null}
                  size={72}
                />
                <FollowButton target={p.owner} />
              </div>
              <h1 className="mt-3 text-xl font-bold">{p.displayName}</h1>
              <p className="text-sm text-ink-soft">@{p.handle}</p>
              {p.suinsName ? <p className="font-mono text-xs text-accent">{p.suinsName}</p> : null}
              {p.bio ? <p className="mt-2 text-[15px]">{p.bio}</p> : null}
              <div className="mt-3 flex gap-4 text-sm">
                <span><b>{p.followingCount}</b> <span className="text-ink-soft">Following</span></span>
                <span><b>{p.followersCount}</b> <span className="text-ink-soft">Followers</span></span>
              </div>
            </Card>

            <div className="mt-4 space-y-3">
              {posts.data?.length ? (
                posts.data.map((post) => <PostCard key={post.id} post={post} />)
              ) : (
                <p className="py-8 text-center text-sm text-ink-soft">No posts yet.</p>
              )}
            </div>
          </>
        )}
      </main>
    </>
  );
}
