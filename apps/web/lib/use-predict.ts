"use client";

import { useCallback } from "react";
import { useSocialAccount } from "./account";
import { useGasless } from "./gasless";
import { useChainClient } from "./sui-client";
import {
  buildCreateManagerTx,
  buildDepositMintRangeTx,
  buildDepositMintTx,
  buildPreviewTx,
  buildRangePreviewTx,
  buildRedeemRangeTx,
  buildRedeemTx,
  buildWithdrawTx,
} from "./predict-tx";
import {
  DUSDC_TYPE,
  decodeTradeAmounts,
  findManagerByOwner,
  getCachedManagerId,
  requestDusdc,
  setCachedManagerId,
  usdToQty,
  usdToStrike,
  type RangePosition,
} from "./predict";

// One tap = one $1-max-payout contract. We fund $1 per bet: the premium is < $1,
// so the remainder simply accrues in the manager (withdrawable later).
const BET_QTY = 1_000_000n;
const DEPOSIT_PER_BET = 1_000_000n;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Ensure the caller has a PredictManager: cache → server → create + poll.
 * `create_manager` shares the object internally and returns only an id, so the
 * first-ever call is a separate gasless tx, then we poll the indexer for it.
 */
function useEnsureManager() {
  const account = useSocialAccount();
  const gasless = useGasless();
  return useCallback(async (): Promise<string> => {
    if (!account) throw new Error("Sign in to predict");
    const addr = account.address;
    let mgr = getCachedManagerId(addr) ?? (await findManagerByOwner(addr));
    if (!mgr) {
      await gasless(buildCreateManagerTx());
      for (let i = 0; i < 8 && !mgr; i++) {
        await sleep(1500);
        mgr = await findManagerByOwner(addr);
      }
      if (!mgr) throw new Error("Couldn't set up your prediction account — try again in a moment");
    }
    setCachedManagerId(addr, mgr);
    return mgr;
  }, [account, gasless]);
}

/**
 * One-tap binary prediction (fixed $1 contract) via the gasless path. Kept for
 * the quick Bet YES/NO buttons. Returns the mint tx digest.
 */
export function usePredict() {
  const account = useSocialAccount();
  const gasless = useGasless();
  const ensureManager = useEnsureManager();

  return useCallback(
    async (side: "up" | "down", oracleId: string, expiry: number, strikeUsd: number): Promise<string> => {
      if (!account) throw new Error("Sign in to predict");
      const mgr = await ensureManager();
      const tx = buildDepositMintTx({
        managerId: mgr,
        oracleId,
        expiry,
        strike: usdToStrike(strikeUsd),
        isUp: side === "up",
        quantity: BET_QTY,
        depositAmount: DEPOSIT_PER_BET,
      });
      tx.setSenderIfNotSet(account.address);
      const { digest } = await gasless(tx);
      return digest;
    },
    [account, gasless, ensureManager],
  );
}

export interface BetParams {
  side: "up" | "down";
  oracleId: string;
  expiry: number;
  /** Strike in USD (snapped to the oracle tick grid by the caller). */
  strikeUsd: number;
  /** Max payout in USD = position size ($1 max payout per contract). */
  maxPayoutUsd: number;
  /** dUSDC to deposit before minting (default: the max payout, covers the premium). */
  depositUsd?: number;
}

/**
 * Place a binary prediction with a caller-chosen strike + size. Deposits enough
 * dUSDC to cover the premium (the unspent remainder accrues in the manager and
 * is withdrawable). Returns the mint tx digest.
 */
export function useBet() {
  const account = useSocialAccount();
  const gasless = useGasless();
  const ensureManager = useEnsureManager();

  return useCallback(
    async (p: BetParams): Promise<string> => {
      if (!account) throw new Error("Sign in to predict");
      const mgr = await ensureManager();
      const tx = buildDepositMintTx({
        managerId: mgr,
        oracleId: p.oracleId,
        expiry: p.expiry,
        strike: usdToStrike(p.strikeUsd),
        isUp: p.side === "up",
        quantity: usdToQty(p.maxPayoutUsd),
        depositAmount: usdToQty(p.depositUsd ?? p.maxPayoutUsd),
      });
      tx.setSenderIfNotSet(account.address);
      const { digest } = await gasless(tx);
      return digest;
    },
    [account, gasless, ensureManager],
  );
}

export interface PreviewParams {
  oracleId: string;
  expiry: number;
  strikeUsd: number;
  isUp: boolean;
  maxPayoutUsd: number;
}

export interface TradePreview {
  /** Premium you pay, in USD. */
  costUsd: number;
  /** Max payout if you win, in USD. */
  payoutUsd: number;
  /** Implied per-contract price 0..1 (cost / payout). */
  price: number;
}

/**
 * Live cost/payout preview via devInspect (read-only — no sponsor). Returns
 * null when the strike is outside the quotable band (the move call aborts).
 */
export function usePreviewTrade() {
  const client = useChainClient();
  const account = useSocialAccount();

  return useCallback(
    async (p: PreviewParams): Promise<TradePreview | null> => {
      const quantity = usdToQty(p.maxPayoutUsd);
      if (quantity <= 0n) return null;
      const tx = buildPreviewTx({
        oracleId: p.oracleId,
        expiry: p.expiry,
        strike: usdToStrike(p.strikeUsd),
        isUp: p.isUp,
        quantity,
      });
      tx.setSenderIfNotSet(account?.address ?? "0x0000000000000000000000000000000000000000000000000000000000000000");
      // Read-only dry run (the gRPC replacement for devInspect).
      const res = await client.simulateTransaction({ transaction: tx, include: { commandResults: true }, checksEnabled: false });
      if (res.$kind !== "Transaction") return null;
      const amounts = await decodeTradeAmounts(res.commandResults);
      if (!amounts) return null;
      const costUsd = Number(amounts.cost) / 1e6;
      const payoutUsd = Number(amounts.payout) / 1e6;
      return { costUsd, payoutUsd, price: payoutUsd > 0 ? costUsd / payoutUsd : 0 };
    },
    [client, account],
  );
}

/** Redeem (sell pre-expiry / claim after settlement) a binary position. */
export function useRedeem() {
  const account = useSocialAccount();
  const gasless = useGasless();
  const ensureManager = useEnsureManager();

  return useCallback(
    async (args: { oracleId: string; expiry: number; strike: number; isUp: boolean; quantity: bigint }): Promise<string> => {
      if (!account) throw new Error("Sign in first");
      const mgr = await ensureManager();
      const tx = buildRedeemTx({ managerId: mgr, ...args });
      tx.setSenderIfNotSet(account.address);
      const { digest } = await gasless(tx);
      return digest;
    },
    [account, gasless, ensureManager],
  );
}

/** Withdraw idle/realised dUSDC from the manager back to the user's address. */
export function useWithdraw() {
  const account = useSocialAccount();
  const gasless = useGasless();
  const ensureManager = useEnsureManager();

  return useCallback(
    async (amountUsd: number): Promise<string> => {
      if (!account) throw new Error("Sign in first");
      const mgr = await ensureManager();
      const tx = buildWithdrawTx(mgr, usdToQty(amountUsd), account.address);
      tx.setSenderIfNotSet(account.address);
      const { digest } = await gasless(tx);
      return digest;
    },
    [account, gasless, ensureManager],
  );
}

/** The caller's spendable dUSDC balance (wallet), in USD. */
export function useDusdcBalance() {
  const client = useChainClient();
  const account = useSocialAccount();
  return useCallback(async (): Promise<number> => {
    if (!account) return 0;
    const bal = await client.getBalance({ owner: account.address, coinType: DUSDC_TYPE });
    return Number(bal.balance.balance) / 1e6;
  }, [client, account]);
}

/** Drip testnet dUSDC to the caller from the server faucet (idempotent). */
export function useFundDusdc() {
  const account = useSocialAccount();
  return useCallback(async () => {
    if (!account) throw new Error("Sign in first");
    return requestDusdc(account.address);
  }, [account]);
}

// ── Range positions (vertical bands) — pays $1·qty if settlement ∈ (lower, higher] ──

export interface RangeBetParams {
  oracleId: string;
  expiry: number;
  /** Band edges in USD (snapped to the oracle tick grid by the caller). */
  lowerUsd: number;
  higherUsd: number;
  /** Max payout in USD = position size. */
  maxPayoutUsd: number;
  depositUsd?: number;
}

/** Mint a range (band) position via the gasless path. Returns the tx digest. */
export function useMintRange() {
  const account = useSocialAccount();
  const gasless = useGasless();
  const ensureManager = useEnsureManager();

  return useCallback(
    async (p: RangeBetParams): Promise<string> => {
      if (!account) throw new Error("Sign in to predict");
      const mgr = await ensureManager();
      const tx = buildDepositMintRangeTx({
        managerId: mgr,
        oracleId: p.oracleId,
        expiry: p.expiry,
        lowerStrike: usdToStrike(p.lowerUsd),
        higherStrike: usdToStrike(p.higherUsd),
        quantity: usdToQty(p.maxPayoutUsd),
        depositAmount: usdToQty(p.depositUsd ?? p.maxPayoutUsd),
      });
      tx.setSenderIfNotSet(account.address);
      const { digest } = await gasless(tx);
      return digest;
    },
    [account, gasless, ensureManager],
  );
}

/** Live cost/payout preview for a range band (devInspect, read-only). */
export function useRangePreview() {
  const client = useChainClient();
  const account = useSocialAccount();

  return useCallback(
    async (p: { oracleId: string; expiry: number; lowerUsd: number; higherUsd: number; maxPayoutUsd: number }): Promise<TradePreview | null> => {
      const quantity = usdToQty(p.maxPayoutUsd);
      if (quantity <= 0n || p.lowerUsd >= p.higherUsd) return null;
      const tx = buildRangePreviewTx({
        oracleId: p.oracleId,
        expiry: p.expiry,
        lowerStrike: usdToStrike(p.lowerUsd),
        higherStrike: usdToStrike(p.higherUsd),
        quantity,
      });
      tx.setSenderIfNotSet(account?.address ?? "0x0000000000000000000000000000000000000000000000000000000000000000");
      // Read-only dry run (the gRPC replacement for devInspect).
      const res = await client.simulateTransaction({ transaction: tx, include: { commandResults: true }, checksEnabled: false });
      if (res.$kind !== "Transaction") return null;
      const amounts = await decodeTradeAmounts(res.commandResults);
      if (!amounts) return null;
      const costUsd = Number(amounts.cost) / 1e6;
      const payoutUsd = Number(amounts.payout) / 1e6;
      return { costUsd, payoutUsd, price: payoutUsd > 0 ? costUsd / payoutUsd : 0 };
    },
    [client, account],
  );
}

/** gRPC JSON of a `Field<RangeKey, u64>` dynamic field (no `fields` wrappers). */
type RangeFieldJson = {
  name?: { oracle_id?: string; expiry?: string; lower_strike?: string; higher_strike?: string };
  value?: string;
};

/**
 * Read a manager's open range positions from chain (the server has no range
 * endpoint). Walks the `range_positions` Table dynamic fields. Returns [] on
 * any error or empty table.
 */
export function useRangePositions() {
  const client = useChainClient();
  return useCallback(
    async (managerId: string): Promise<RangePosition[]> => {
      try {
        const { object } = await client.getObject({ objectId: managerId, include: { json: true } });
        const json = object.json as { range_positions?: { id?: string; size?: string } } | null | undefined;
        const tableId = json?.range_positions?.id;
        const size = Number(json?.range_positions?.size ?? 0);
        if (!tableId || size === 0) return [];

        const fieldIds: string[] = [];
        let cursor: string | null = null;
        do {
          const page: { dynamicFields: { fieldId: string }[]; hasNextPage: boolean; cursor: string | null } =
            await client.listDynamicFields({ parentId: tableId, cursor });
          for (const f of page.dynamicFields) fieldIds.push(f.fieldId);
          cursor = page.hasNextPage ? page.cursor : null;
        } while (cursor);
        if (fieldIds.length === 0) return [];

        const out: RangePosition[] = [];
        for (let i = 0; i < fieldIds.length; i += 50) {
          const { objects } = await client.getObjects({ objectIds: fieldIds.slice(i, i + 50), include: { json: true } });
          for (const o of objects) {
            if (o instanceof Error) continue;
            const f = o.json as RangeFieldJson | null | undefined;
            const key = f?.name;
            const qty = Number(f?.value ?? 0);
            if (!key || !key.oracle_id || qty <= 0) continue;
            out.push({
              oracleId: key.oracle_id,
              expiry: Number(key.expiry ?? 0),
              lowerStrike: Number(key.lower_strike ?? 0),
              higherStrike: Number(key.higher_strike ?? 0),
              openQuantity: qty,
            });
          }
        }
        return out;
      } catch {
        return [];
      }
    },
    [client],
  );
}

/** Redeem (sell / claim) a range position. */
export function useRedeemRange() {
  const account = useSocialAccount();
  const gasless = useGasless();
  const ensureManager = useEnsureManager();

  return useCallback(
    async (args: { oracleId: string; expiry: number; lowerStrike: number; higherStrike: number; quantity: bigint }): Promise<string> => {
      if (!account) throw new Error("Sign in first");
      const mgr = await ensureManager();
      const tx = buildRedeemRangeTx({ managerId: mgr, ...args });
      tx.setSenderIfNotSet(account.address);
      const { digest } = await gasless(tx);
      return digest;
    },
    [account, gasless, ensureManager],
  );
}
