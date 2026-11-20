"use client";

/**
 * Swap SUI for USDC from the wallet (see `swap` in @umbra/core for the rules).
 *
 * Kept apart from lib/wallet.ts on purpose: this file pulls in the DeepBook SDK,
 * so it is only loaded when the swap screen is opened.
 */
import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { passkey, swap, wallet } from "@umbra/core";
import { walletConfig } from "./config";
import { sendErrorMessage, useWalletExecute, walletClient } from "./wallet";

/** The swap this build offers, or null (mainnet only). */
export const swapMarket = walletConfig ? swap.swapMarket(walletConfig) : null;

/** A swap that has been quoted, built and dry-run, ready for the user to confirm. */
export interface PreparedSwap extends swap.SwapOutcome {
  /** exactly what will be signed */
  bytes: Uint8Array;
  /** what the user typed */
  amount: bigint;
  /** what will be sold: `amount` rounded down to a whole step of the market */
  quantity: bigint;
  /** the swap cancels itself if it would pay out less than this */
  minReceived: bigint;
}

const PASSKEY_FAILURES = new Set(["NotAllowedError", "AbortError", "SecurityError", "NotSupportedError"]);

/** Turn anything a swap can throw into something a person can act on. */
export function swapErrorMessage(e: unknown): string {
  if (e instanceof wallet.WalletInputError) return e.message;
  if (e instanceof passkey.PasskeyError || PASSKEY_FAILURES.has((e as { name?: string } | null)?.name ?? "")) {
    return passkey.describePasskeyError(e, "swap").message;
  }
  const raw = e instanceof Error ? e.message : String(e);
  // The pool's own "less than the minimum came out" abort: the price moved since the quote.
  if (/abort code:? 12\b[^]*swap_exact_quantity/i.test(raw)) return "The price moved while the swap was being prepared. Try again.";
  // Our own floor inside the transaction (see buildSwapTx).
  if (/InsufficientCoinBalance/i.test(raw)) return "That amount is too small for this market to swap.";
  if (/MoveAbort/i.test(raw)) return "The market couldn't take this swap right now. Try again in a moment.";
  // Everything else (not enough for the fee, network trouble) reads the same as for sending.
  return sendErrorMessage(e).replace("transfer", "swap").replace("Nothing was sent", "Nothing was swapped");
}

/** The pool's step and minimum. Read once per visit: they change very rarely. */
export function useSwapRules(sender: string | null) {
  return useQuery({
    queryKey: ["swap-rules", swapMarket?.poolKey],
    enabled: Boolean(walletClient && swapMarket && sender),
    staleTime: 10 * 60_000,
    queryFn: () => swap.readSwapRules(swap.createSwapClient(walletClient!, swapMarket!, sender!), swapMarket!),
  });
}

export function useWalletSwap() {
  const { execute, canSign } = useWalletExecute();

  /**
   * Quote, build and dry-run a swap of the `amount` typed (base units of SUI)
   * from `sender`, who holds `held`. What comes back is what the network says
   * would happen right now. Needs no signature, so it also works for a
   * read-only preview.
   */
  const prepare = useCallback(async (sender: string, amount: bigint, held: bigint, rules: swap.SwapRules): Promise<PreparedSwap> => {
    if (!walletClient || !swapMarket) throw new Error("Swapping isn't available here");
    // What was typed, as a whole number of the market's steps, with its fee added on top.
    const { quantity, offer } = swap.planSwap(swapMarket, rules, amount, held);
    const db = swap.createSwapClient(walletClient, swapMarket, sender);

    const quote = await swap.quoteSwap(db, swapMarket, offer);
    if (quote.out <= 0n) throw new wallet.WalletInputError("The market won't take that amount right now. Try a different amount.");
    const minReceived = swap.minOutFor(quote.out);

    const tx = swap.buildSwapTx(db, swapMarket, sender, offer, minReceived);
    const bytes = await tx.build({ client: walletClient });
    const sim = await walletClient.core.simulateTransaction({ transaction: bytes, include: { effects: true, balanceChanges: true } });
    const ran = sim.Transaction ?? sim.FailedTransaction;
    if (sim.$kind !== "Transaction" || !ran?.effects?.status.success) {
      throw new Error(ran?.effects?.status.error?.message ?? "The network rejected this swap");
    }
    const outcome = swap.readSwapOutcome(swapMarket, sender, ran.balanceChanges ?? [], ran.effects.gasUsed);
    // Belt and braces: never offer to sign a swap that wouldn't pay out what was quoted.
    if (outcome.received < minReceived || outcome.paid <= 0n) throw new Error("This swap wouldn't pay out what was quoted. Nothing was swapped.");
    return { bytes, amount, quantity, minReceived, ...outcome };
  }, []);

  /** Sign exactly the reviewed bytes and run them. Gives back what really happened. */
  const run = useCallback(
    async (sender: string, prepared: PreparedSwap): Promise<{ digest: string; outcome: swap.SwapOutcome | null }> => {
      const done = await execute(prepared.bytes, "The price moved before the swap landed, so it cancelled itself. Nothing was swapped.");
      const outcome = swapMarket && done.gasUsed ? swap.readSwapOutcome(swapMarket, sender, done.balanceChanges, done.gasUsed) : null;
      return { digest: done.digest, outcome };
    },
    [execute],
  );

  return { prepare, run, canSign };
}
