"use client";

import { useSignPersonalMessage } from "@mysten/dapp-kit";
import { useSocialAccount } from "@/lib/account";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canonicalReactionBytes, type Post, type ReactionMessage } from "@umbra/core";
import { trpc } from "@/lib/trpc";

export function LikeButton({ post }: { post: Post }) {
  const account = useSocialAccount();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
  const qc = useQueryClient();

  const counts = useQuery({
    queryKey: ["reactions", post.id],
    queryFn: () => trpc.reactionsForPost.query({ postId: post.id }),
  });

  const like = useMutation({
    mutationFn: async () => {
      if (!account) throw new Error("Sign in first");
      const message: ReactionMessage = {
        kind: "like",
        postId: post.id,
        reactor: account.address,
        timestamp: Date.now(),
        value: 1,
      };
      const { signature } = await signPersonalMessage({ message: canonicalReactionBytes(message), account });
      return trpc.addReaction.mutate({ message, signature });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reactions", post.id] }),
  });

  return (
    <button
      type="button"
      onClick={() => like.mutate()}
      disabled={!account || like.isPending}
      className="inline-flex items-center gap-1.5 text-sm text-ink-soft transition-colors hover:text-accent disabled:opacity-50"
    >
      <span aria-hidden>♥</span>
      <span>{counts.data?.likes ?? 0}</span>
    </button>
  );
}
