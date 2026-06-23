"use client";

import { useSignPersonalMessage } from "@mysten/dapp-kit";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canonicalReactionBytes, type Post, type ReactionMessage } from "@umbra/core";
import { useSocialAccount } from "@/lib/account";
import { trpc } from "@/lib/trpc";

export function LikeButton({ post }: { post: Post }) {
  const account = useSocialAccount();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
  const qc = useQueryClient();

  const state = useQuery({
    queryKey: ["like", post.id, account?.address],
    queryFn: () => trpc.likeState.query({ postId: post.id, viewer: account?.address }),
  });
  const liked = state.data?.liked ?? false;
  const likes = state.data?.likes ?? 0;

  const toggle = useMutation({
    mutationFn: async () => {
      if (!account) throw new Error("Sign in first");
      const message: ReactionMessage = {
        kind: "like",
        postId: post.id,
        reactor: account.address,
        timestamp: Date.now(),
        value: (liked ? 0 : 1) as 0 | 1,
      };
      const { signature } = await signPersonalMessage({ message: canonicalReactionBytes(message), account });
      return trpc.addReaction.mutate({ message, signature });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["like", post.id] }),
  });

  return (
    <button
      type="button"
      onClick={() => toggle.mutate()}
      disabled={!account || toggle.isPending}
      className="inline-flex items-center gap-1.5 text-sm transition-colors disabled:opacity-50"
      aria-pressed={liked}
      aria-label={liked ? "Unlike" : "Like"}
    >
      {/* Sui drop — grey when not liked, blue when liked */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/sui.png" alt="" className={`h-4 w-4 transition ${liked ? "" : "opacity-40 grayscale"}`} />
      <span className={liked ? "text-accent" : "text-ink-soft"}>{likes}</span>
    </button>
  );
}
