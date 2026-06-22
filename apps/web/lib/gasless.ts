"use client";

import { useSignTransaction, useSuiClient } from "@mysten/dapp-kit";
import { sponsorAndExecute } from "@umbra/core";
import type { Transaction } from "@mysten/sui/transactions";
import { useCallback } from "react";
import { useSocialAccount } from "./account";
import { NETWORK, SPONSOR_API_URL } from "./config";

/**
 * Returns a function that runs a transaction gaslessly: build kind-bytes ->
 * sponsor (Enoki, server) -> user signs the sponsored bytes via their zkLogin
 * wallet -> execute. The user never pays gas and never sees a gas prompt.
 */
export function useGasless() {
  const client = useSuiClient();
  const account = useSocialAccount();
  const { mutateAsync: signTransaction } = useSignTransaction();

  return useCallback(
    async (tx: Transaction): Promise<{ digest: string }> => {
      if (!account) throw new Error("Sign in first");
      return sponsorAndExecute({
        sponsorUrl: SPONSOR_API_URL,
        client,
        tx,
        sender: account.address,
        network: NETWORK,
        sign: async (sponsoredBytes) => {
          // sign with the social (zkLogin) account explicitly, even if a bound
          // external wallet is dapp-kit's "current" account
          const { signature } = await signTransaction({ transaction: sponsoredBytes, account });
          return { signature };
        },
      });
    },
    [account, client, signTransaction],
  );
}
