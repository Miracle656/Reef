"use client";

import { useSuiClient, useWallets } from "@mysten/dapp-kit";
import { isEnokiWallet } from "@mysten/enoki";
import { sponsorAndExecute } from "@umbra/core";
import { Transaction } from "@mysten/sui/transactions";
import { useCallback } from "react";
import { NETWORK, SPONSOR_API_URL } from "./config";

type SignFeature = {
  signTransaction: (input: {
    transaction: Transaction;
    account: { address: string };
    chain: string;
  }) => Promise<{ signature: string }>;
};

type SignMessageFeature = {
  signPersonalMessage: (input: {
    message: Uint8Array;
    account: { address: string };
    chain?: string;
  }) => Promise<{ signature: string; bytes: string }>;
};

/**
 * Sign a personal message (off-chain reactions) with the Enoki (zkLogin) wallet
 * DIRECTLY — never dapp-kit's `useSignPersonalMessage`, which signs with whatever
 * wallet is "current". A bound external wallet being current would be (wrongly)
 * asked to sign for the Enoki account and reject it ("account isn't connected").
 */
export function useEnokiSignPersonalMessage() {
  const wallets = useWallets();
  const enokiWallet = wallets.find(isEnokiWallet);
  const enokiAccount = enokiWallet?.accounts[0];

  return useCallback(
    async (message: Uint8Array): Promise<{ signature: string }> => {
      if (!enokiWallet || !enokiAccount) throw new Error("Sign in with Google first");
      const feature = (enokiWallet.features as Record<string, unknown>)["sui:signPersonalMessage"] as SignMessageFeature | undefined;
      if (!feature?.signPersonalMessage) throw new Error("Enoki wallet can't sign messages");
      const { signature } = await feature.signPersonalMessage({ message, account: enokiAccount, chain: `sui:${NETWORK}` });
      return { signature };
    },
    [enokiWallet, enokiAccount],
  );
}

/**
 * Runs a transaction gaslessly: build kind-bytes -> sponsor (Enoki, server) ->
 * sign the sponsored bytes -> execute. We call the Enoki (zkLogin) wallet's
 * signer feature DIRECTLY rather than dapp-kit's `useSignTransaction`, because
 * the latter signs with whatever wallet is "current" — and a bound external
 * wallet (e.g. Slush) being current would (wrongly) be asked to sign the Enoki
 * account's transaction.
 */
export function useGasless() {
  const client = useSuiClient();
  const wallets = useWallets();
  const enokiWallet = wallets.find(isEnokiWallet);
  const enokiAccount = enokiWallet?.accounts[0];

  return useCallback(
    async (tx: Transaction): Promise<{ digest: string }> => {
      if (!enokiWallet || !enokiAccount) throw new Error("Sign in with Google to make gasless transactions");
      const feature = (enokiWallet.features as Record<string, unknown>)["sui:signTransaction"] as SignFeature | undefined;
      if (!feature?.signTransaction) throw new Error("Enoki wallet can't sign transactions");

      return sponsorAndExecute({
        sponsorUrl: SPONSOR_API_URL,
        client,
        tx,
        sender: enokiAccount.address,
        network: NETWORK,
        sign: async (sponsoredBytes) => {
          const { signature } = await feature.signTransaction({
            transaction: Transaction.from(sponsoredBytes),
            account: enokiAccount,
            chain: `sui:${NETWORK}`,
          });
          return { signature };
        },
      });
    },
    [enokiWallet, enokiAccount, client],
  );
}
