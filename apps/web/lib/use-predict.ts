"use client";

import { useCallback } from "react";
import { useSocialAccount } from "./account";
import { useGasless } from "./gasless";
import { buildCreateManagerTx, buildDepositMintTx } from "./predict-tx";
import { findManagerByOwner, getCachedManagerId, setCachedManagerId } from "./predict";

// One tap = one $1-max-payout contract. We fund $1 per bet: the premium is < $1,
// so the remainder simply accrues in the manager (withdrawable later).
const BET_QTY = 1_000_000n;
const DEPOSIT_PER_BET = 1_000_000n;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Place a real on-chain binary prediction via the app's gasless (zkLogin +
 * Enoki sponsor) path. Auto-creates the caller's PredictManager on first use.
 * Returns the mint tx digest.
 */
export function usePredict() {
  const account = useSocialAccount();
  const gasless = useGasless();

  return useCallback(
    async (side: "up" | "down", oracleId: string, expiry: number, strikeUsd: number): Promise<string> => {
      if (!account) throw new Error("Sign in to predict");
      const addr = account.address;

      // 1. Ensure a PredictManager exists (cache → server → create + poll).
      let mgr = getCachedManagerId(addr) ?? (await findManagerByOwner(addr));
      if (!mgr) {
        await gasless(buildCreateManagerTx());
        // create_manager shares the object internally — poll the indexer for it.
        for (let i = 0; i < 8 && !mgr; i++) {
          await sleep(1500);
          mgr = await findManagerByOwner(addr);
        }
        if (!mgr) throw new Error("Couldn't set up your prediction account — try again in a moment");
        setCachedManagerId(addr, mgr);
      }

      // 2. Deposit + mint in one PTB. Set the sender so coinWithBalance can
      //    resolve the depositor's dUSDC during the onlyTransactionKind build.
      const strike = Math.round(strikeUsd * 1e9);
      const tx = buildDepositMintTx({
        managerId: mgr,
        oracleId,
        expiry,
        strike,
        isUp: side === "up",
        quantity: BET_QTY,
        depositAmount: DEPOSIT_PER_BET,
      });
      tx.setSenderIfNotSet(addr);
      const { digest } = await gasless(tx);
      return digest;
    },
    [account, gasless],
  );
}
