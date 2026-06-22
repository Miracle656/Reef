"use client";

import { useSuiClient } from "@mysten/dapp-kit";
import { useSocialAccount } from "@/lib/account";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { buildFollowTx, buildUnfollowTx } from "@umbra/core";
import { umbraConfig } from "@/lib/config";
import { useGasless } from "@/lib/gasless";
import { getFollowSetId } from "@/lib/objects";
import { trpc } from "@/lib/trpc";
import { Button } from "./ui";

export function FollowButton({ target }: { target: string }) {
  const account = useSocialAccount();
  const client = useSuiClient() as unknown as SuiJsonRpcClient;
  const run = useGasless();
  const qc = useQueryClient();

  const following = useQuery({
    queryKey: ["following", account?.address],
    queryFn: async () => {
      const rows = await trpc.following.query({ address: account!.address });
      return rows.map((r) => r.followee);
    },
    enabled: Boolean(account),
  });
  const isFollowing = following.data?.includes(target) ?? false;
  const isSelf = account?.address === target;

  const toggle = useMutation({
    mutationFn: async () => {
      if (!account) throw new Error("Sign in first");
      const setId = await getFollowSetId(client, account.address);
      if (!setId) throw new Error("No follow set — finish onboarding first");
      const tx = isFollowing
        ? buildUnfollowTx(umbraConfig, setId, target)
        : buildFollowTx(umbraConfig, setId, target);
      return run(tx);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["following", account?.address] }),
  });

  if (isSelf) return null;

  return (
    <Button
      variant={isFollowing ? "outline" : "accent"}
      size="sm"
      disabled={!account || toggle.isPending}
      onClick={() => toggle.mutate()}
    >
      {toggle.isPending ? "…" : isFollowing ? "Following" : "Follow"}
    </Button>
  );
}
