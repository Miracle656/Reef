"use client";

/**
 * The wallet: the signed-in account's money on WALLET_NETWORK, which is always
 * the app's own network (see lib/config). Reads go through a gRPC client;
 * signing goes through the Enoki (zkLogin) wallet with the session sign-in made.
 */
import { useCallback, useEffect, useState } from "react";
import { useWallets } from "@mysten/dapp-kit";
import { isEnokiWallet } from "@mysten/enoki";
import { Transaction } from "@mysten/sui/transactions";
import { fromBase64, toBase64 } from "@mysten/sui/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createSuiClient, wallet } from "@umbra/core";
import { WALLET_NETWORK, walletConfig } from "./config";

/** gRPC client for the wallet's network, or null when the app has no wallet. */
export const walletClient = walletConfig ? createSuiClient(walletConfig) : null;

/**
 * Whose wallet is shown: the signed-in zkLogin (Google) account, never a linked
 * external wallet, because that is the only account this page can sign for.
 * In development only, `/wallet?as=0x…` shows any address read-only, to check
 * the page against real balances where Google sign-in can't run (localhost).
 */
export function useWalletOwner(): { address: string | null; viewOnly: boolean } {
  const account = useWallets().find(isEnokiWallet)?.accounts[0];
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const as = new URLSearchParams(window.location.search).get("as");
    if (!as) return;
    try {
      setPreview(wallet.parseRecipient(as));
    } catch {
      /* not an address: ignore */
    }
  }, []);
  if (preview) return { address: preview, viewOnly: true };
  return { address: account?.address ?? null, viewOnly: false };
}

export function useWalletBalances(address: string | null) {
  return useQuery({
    queryKey: ["wallet-balances", WALLET_NETWORK, address],
    queryFn: () => wallet.getWalletBalances(walletClient!, address!, walletConfig!.coins),
    enabled: Boolean(walletClient && address),
    refetchInterval: 20_000,
  });
}

type SignTransactionFeature = {
  signTransaction: (input: {
    transaction: Transaction;
    account: { address: string };
    chain: string;
  }) => Promise<{ bytes: string; signature: string }>;
};

type SignMessageFeature = {
  signPersonalMessage: (input: {
    message: Uint8Array;
    account: { address: string };
    chain?: string;
  }) => Promise<{ signature: string; bytes: string }>;
};

/**
 * Sign a personal message as the wallet's account (cash-out requests are
 * verified against the wallet's network). If the Google session has expired
 * this reopens Google, so call it from a click, not from an effect.
 */
export function useWalletSignMessage() {
  const enokiWallet = useWallets().find(isEnokiWallet);
  const enokiAccount = enokiWallet?.accounts[0];
  return useCallback(
    async (message: Uint8Array): Promise<string> => {
      if (!WALLET_NETWORK) throw new Error("The wallet isn't switched on");
      if (!enokiWallet || !enokiAccount) throw new Error("Sign in with Google first");
      const feature = (enokiWallet.features as Record<string, unknown>)["sui:signPersonalMessage"] as SignMessageFeature | undefined;
      if (!feature?.signPersonalMessage) throw new Error("This account can't sign messages");
      const { signature } = await feature.signPersonalMessage({ message, account: enokiAccount, chain: `sui:${WALLET_NETWORK}` });
      return signature;
    },
    [enokiWallet, enokiAccount],
  );
}

export interface SendRequest {
  coin: wallet.WalletCoin;
  /** base units */
  amount: bigint;
  recipient: string;
}

/** A transfer that has been built and dry-run, ready for the user to confirm. */
export interface PreparedSend extends SendRequest {
  /** exactly what will be signed */
  bytes: Uint8Array;
  /** the network runs it for free */
  gasless: boolean;
  /** network fee in MIST (0 when gasless) */
  fee: bigint;
}

/** Turn SDK/chain errors into something a person can act on. */
export function sendErrorMessage(e: unknown): string {
  if (e instanceof wallet.WalletInputError) return e.message;
  const raw = e instanceof Error ? e.message : String(e);
  if (/popup closed/i.test(raw)) return "The Google window was closed before it finished. Nothing was sent.";
  if (/failed to open popup/i.test(raw)) return "Your browser blocked the Google window. Allow pop-ups for this site and try again.";
  if (/missing_networks|not enabled for this api key/i.test(raw)) return "Sending isn't switched on for this wallet yet.";
  if (/insufficient\s*gas|gas\s*balance|no valid gas|unable to (?:find|select)[^.]*gas/i.test(raw)) {
    return "This transfer needs a little SUI for the network fee, and this wallet doesn't have enough.";
  }
  if (/insufficient|not enough/i.test(raw)) return "You don't have enough for this transfer.";
  // Chain errors can be long and technical; keep the screen readable.
  return raw.length > 160 ? "The transfer couldn't be prepared. Nothing was sent." : raw;
}

export function useWalletSend() {
  const wallets = useWallets();
  const enokiWallet = wallets.find(isEnokiWallet);
  const enokiAccount = enokiWallet?.accounts[0];
  const qc = useQueryClient();

  /** Build and dry-run the transfer from `sender`, so the review screen shows
   *  what will really happen (free or not, and that the chain accepts it).
   *  Needs no signature, so it also works for a read-only preview. */
  const prepare = useCallback(
    async (sender: string, req: SendRequest): Promise<PreparedSend> => {
      if (!walletClient || !WALLET_NETWORK) throw new Error("The wallet isn't switched on");
      const tx = wallet.buildSendTx({ sender, ...req });
      const bytes = await tx.build({ client: walletClient });
      const gasless = wallet.isGaslessBuilt(tx);
      const sim = await walletClient.core.simulateTransaction({ transaction: bytes, include: { effects: true } });
      const effects = (sim.Transaction ?? sim.FailedTransaction)?.effects;
      if (sim.$kind !== "Transaction" || !effects?.status.success) {
        throw new Error(effects?.status.error?.message ?? "The network rejected this transfer");
      }
      const g = effects.gasUsed;
      const fee = gasless ? 0n : BigInt(g.computationCost) + BigInt(g.storageCost) - BigInt(g.storageRebate);
      return { ...req, bytes, gasless, fee: fee > 0n ? fee : 0n };
    },
    [],
  );

  /** Sign exactly the reviewed bytes with the zkLogin wallet and execute them. */
  const send = useCallback(
    async (prepared: PreparedSend): Promise<{ digest: string }> => {
      if (!walletClient || !WALLET_NETWORK) throw new Error("The wallet isn't switched on");
      if (!enokiWallet || !enokiAccount) throw new Error("Sign in with Google first");
      const feature = (enokiWallet.features as Record<string, unknown>)["sui:signTransaction"] as SignTransactionFeature | undefined;
      if (!feature?.signTransaction) throw new Error("This account can't sign transactions");

      const { bytes, signature } = await feature.signTransaction({
        transaction: Transaction.from(prepared.bytes),
        account: enokiAccount,
        chain: `sui:${WALLET_NETWORK}`,
      });
      // What was reviewed must be what was signed. The wallet rebuilds the
      // transaction before signing; refuse to submit if that changed anything.
      if (bytes !== toBase64(prepared.bytes)) throw new Error("The transfer changed while it was being signed. Nothing was sent.");

      const res = await walletClient.core.executeTransaction({ transaction: fromBase64(bytes), signatures: [signature] });
      if (res.$kind !== "Transaction") throw new Error("The transfer failed on the network. Nothing was sent.");
      const digest = res.Transaction.digest;
      await walletClient.core.waitForTransaction({ digest }).catch(() => {});
      await qc.invalidateQueries({ queryKey: ["wallet-balances"] });
      return { digest };
    },
    [enokiWallet, enokiAccount, qc],
  );

  return { prepare, send, canSign: Boolean(enokiWallet && enokiAccount) };
}
