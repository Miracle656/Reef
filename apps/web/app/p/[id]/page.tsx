"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSocialAccount } from "@/lib/account";
import { AppShell } from "@/components/app-shell";
import { RightSidebar } from "@/components/right-sidebar";
import { ComposeForm } from "@/components/compose-box";
import { PostCard } from "@/components/post-card";
import { Spinner } from "@/components/ui";
import { trpc } from "@/lib/trpc";

export default function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const account = useSocialAccount();

  const post = useQuery({ queryKey: ["post", id], queryFn: () => trpc.post.query({ id }) });
  const replies = useQuery({ queryKey: ["replies", id], queryFn: () => trpc.repliesForPost.query({ postId: id }) });

  // Thread context: walk the reply chain upwards so a comment shows what it
  // was replying to, all the way to the root post.
  const replyTo = post.data?.replyTo;
  const ancestors = useQuery({
    queryKey: ["thread-ancestors", replyTo],
    enabled: Boolean(replyTo),
    queryFn: async () => {
      const chain: NonNullable<typeof post.data>[] = [];
      let cur: string | null | undefined = replyTo;
      for (let i = 0; i < 8 && cur; i++) {
        const p = await trpc.post.query({ id: cur });
        if (!p) break;
        chain.unshift(p);
        cur = p.replyTo;
      }
      return chain;
    },
  });

  return (
    <AppShell title={replyTo ? "Thread" : "Post"} back="/" flush right={<RightSidebar />}>
      {post.isLoading ? (
        <div className="grid place-items-center py-12"><Spinner /></div>
      ) : !post.data ? (
        <p className="py-12 text-center text-ink-soft">Post not found.</p>
      ) : (
        <>
          {ancestors.data?.map((a) => (
            <PostCard key={a.id} post={a} />
          ))}
          <PostCard post={post.data} />

          {account ? (
            <div className="flex gap-3 border-b-[8px] border-[color:color-mix(in_srgb,var(--ink)_5%,transparent)] px-5 py-4">
              <div className="min-w-0 flex-1">
                <ComposeForm replyTo={id} placeholder="Post your reply" />
              </div>
            </div>
          ) : (
            <p className="border-b-[8px] border-[color:color-mix(in_srgb,var(--ink)_5%,transparent)] px-5 py-4 text-center text-sm text-ink-soft">
              Sign in to reply.
            </p>
          )}

          {replies.isLoading ? (
            <div className="grid place-items-center py-8"><Spinner /></div>
          ) : !replies.data?.length ? (
            <p className="py-8 text-center text-sm text-ink-soft">No replies yet. Be the first.</p>
          ) : (
            replies.data.map((r) => <PostCard key={r.id} post={r} />)
          )}
        </>
      )}
    </AppShell>
  );
}
