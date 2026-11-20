"use client";

/**
 * The wallet: the signed-in account's money on WALLET_NETWORK, which is always
 * the app's own network (see lib/config). Reads go through a gRPC client.
 * Signing depends on how this build signs in: the account's passkey on the
 * wallet-only app, the Google (zkLogin) session on the full app.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useWallets } from "@mysten/dapp-kit";
import { isEnokiWallet } from "@mysten/enoki";
import { Transaction } from "@mysten/sui/transactions";
import { toBase64 } from "@mysten/sui/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createSuiClient, passkey, wallet } from "@umbra/core";
import { SIGN_IN, WALLET_NETWORK, walletConfig } from "./config";
import { usePasskeyWallet, walletPasskeyProvider } from "./passkey-wallet";

/** gRPC client for the wallet's network, or null when the app has no wallet. */
export const walletClient = walletConfig ? createSuiClient(walletConfig) : null;

/**
 * Whose wallet is shown: the signed-in account (the passkey wallet, or the
 * zkLogin account on the full app), never a linked external wallet, because
 * that is the only account this page can sign for.
 * In development only, `/wallet?as=0x…` shows any address read-only, to check
 * the page against real balances.
 */
export function useWalletOwner(): { address: string | null; viewOnly: boolean } {
  const google = useWallets().find(isEnokiWallet)?.accounts[0];
  const passkeyWallet = usePasskeyWallet();
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
  return { address: (SIGN_IN === "passkey" ? passkeyWallet?.address : google?.address) ?? null, viewOnly: false };
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

/** Whatever signs for the wallet's account. Both return a serialized signature. */
interface WalletSigner {
  /** Sign exactly these transaction bytes, or throw. */
  signTransaction(bytes: Uint8Array): Promise<string>;
  signPersonalMessage(message: Uint8Array): Promise<string>;
}

const NOT_SIGNED_IN = SIGN_IN === "passkey" ? "Open your wallet first" : "Sign in with Google first";

/**
 * The signer for the wallet's account, or null when nobody is signed in.
 *
 * With a passkey every signature is a prompt on the device (fingerprint, face
 * or screen lock), and browsers only allow that straight after a tap. So call
 * these from a click handler, never from an effect or a timer.
 */
function useWalletSigner(): WalletSigner | null {
  const googleWallet = useWallets().find(isEnokiWallet);
  const googleAccount = googleWallet?.accounts[0];
  const passkeyWallet = usePasskeyWallet();

  return useMemo<WalletSigner | null>(() => {
    if (!WALLET_NETWORK) return null;

    if (SIGN_IN === "passkey") {
      if (!passkeyWallet) return null;
      return {
        signTransaction: (bytes) => passkey.signTransactionWithPasskey(passkeyWallet, walletPasskeyProvider(), bytes),
        signPersonalMessage: (message) => passkey.signMessageWithPasskey(passkeyWallet, walletPasskeyProvider(), message),
      };
    }

    if (!googleWallet || !googleAccount) return null;
    const features = googleWallet.features as Record<string, unknown>;
    const chain = `sui:${WALLET_NETWORK}`;
    return {
      async signTransaction(bytes) {
        const feature = features["sui:signTransaction"] as SignTransactionFeature | undefined;
        if (!feature?.signTransaction) throw new Error("This account can't sign transactions");
        const signed = await feature.signTransaction({ transaction: Transaction.from(bytes), account: googleAccount, chain });
        // The wallet rebuilds the transaction before signing; refuse to go on if that changed anything.
        if (signed.bytes !== toBase64(bytes)) throw new Error("The transfer changed while it was being signed. Nothing was sent.");
        return signed.signature;
      },
      async signPersonalMessage(message) {
        const feature = features["sui:signPersonalMessage"] as SignMessageFeature | undefined;
        if (!feature?.signPersonalMessage) throw new Error("This account can't sign messages");
        return (await feature.signPersonalMessage({ message, account: googleAccount, chain })).signature;
      },
    };
  }, [googleWallet, googleAccount, passkeyWallet]);
}

/**
 * Sign a personal message as the wallet's account (cash-out requests are
 * verified against the wallet's network). Call it from a click: a passkey
 * prompts, and an expired Google session reopens Google.
 */
export function useWalletSignMessage() {
  const signer = useWalletSigner();
  return useCallback(
    async (message: Uint8Array): Promise<string> => {
      if (!WALLET_NETWORK) throw new Error("The wallet isn't switched on");
      if (!signer) throw new Error(NOT_SIGNED_IN);
      return signer.signPersonalMessage(message);
    },
    [signer],
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

/** What WebAuthn calls its failures (a closed prompt, the wrong web address, …). */
const PASSKEY_FAILURES = new Set(["NotAllowedError", "AbortError", "SecurityError", "NotSupportedError"]);

/** Turn SDK/chain errors into something a person can act on. */
export function sendErrorMessage(e: unknown): string {
  if (e instanceof wallet.WalletInputError) return e.message;
  if (e instanceof passkey.PasskeyError || PASSKEY_FAILURES.has((e as { name?: string } | null)?.name ?? "")) {
    return passkey.describePasskeyError(e, "send").message;
  }
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
  const signer = useWalletSigner();
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

  /** Sign exactly the reviewed bytes and execute them. What was reviewed is
   *  what is signed: the signer signs these bytes or throws. */
  const send = useCallback(
    async (prepared: PreparedSend): Promise<{ digest: string }> => {
      if (!walletClient || !WALLET_NETWORK) throw new Error("The wallet isn't switched on");
      if (!signer) throw new Error(NOT_SIGNED_IN);
      const signature = await signer.signTransaction(prepared.bytes);

      const res = await walletClient.core.executeTransaction({ transaction: prepared.bytes, signatures: [signature] });
      if (res.$kind !== "Transaction") throw new Error("The transfer failed on the network. Nothing was sent.");
      const digest = res.Transaction.digest;
      await walletClient.core.waitForTransaction({ digest }).catch(() => {});
      await qc.invalidateQueries({ queryKey: ["wallet-balances"] });
      return { digest };
    },
    [signer, qc],
  );

  return { prepare, send, canSign: Boolean(signer) };
}
