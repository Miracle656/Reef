"use client";

/**
 * Client side of cash-out: talks to ReeF's own `/api/cashout`, never to Linq.
 * Every request is a personal message signed by the wallet (see `@umbra/core`
 * `cashout`), so the server can tell whose orders these are without a login.
 */
import { useCallback, useRef } from "react";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { useQuery } from "@tanstack/react-query";
import { cashout } from "@umbra/core";
import { WALLET_NETWORK } from "./config";
import { useWalletSignMessage } from "./wallet";

export type CashoutInfo =
  | { available: false; reason?: string }
  | {
      available: true;
      /** "mock" = rehearsal: no bank, no real payout */
      mode: "live" | "mock";
      network: string;
      coins: cashout.CashoutCoin[];
      minCents: string;
      maxCents: string;
      /** naira per dollar right now (an estimate; the real rate is locked per order) */
      rate: number | null;
    };

/** Whether cash-out is on for this wallet, its limits and today's rate. (A
 *  rehearsal on mainnet is open to named wallets only, so the server is asked
 *  about this address.) */
export function useCashoutInfo(address: string | null) {
  return useQuery({
    queryKey: ["cashout-info", address],
    enabled: Boolean(WALLET_NETWORK && address),
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<CashoutInfo> => {
      const res = await fetch(`/api/cashout?owner=${encodeURIComponent(normalizeSuiAddress(address!))}`, { cache: "no-store" });
      if (!res.ok) return { available: false };
      return (await res.json()) as CashoutInfo;
    },
  });
}

export class CashoutApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CashoutApiError";
  }
}

/** A message without the parts this module fills in. */
type Draft<T> = T extends unknown ? Omit<T, "owner" | "timestamp"> : never;
export type CashoutDraft = Draft<cashout.CashoutMessage>;

type ResponseFor<A extends cashout.CashoutMessage["action"]> = Extract<cashout.CashoutResponse, { action: A }>;

/** The server accepts a signed request for 5 minutes; reuse a read for less than that. */
const REUSE_SIGNED_READ_MS = 3 * 60_000;

/**
 * `call(address, draft)` signs and sends one cash-out request.
 *
 * Reads of the same order are polled every few seconds; signing each poll
 * would be wasteful, so a signed "get" is reused for a few minutes.
 */
export function useCashoutApi() {
  const sign = useWalletSignMessage();
  const reads = useRef(new Map<string, { body: string; atMs: number }>());

  return useCallback(
    async <D extends CashoutDraft>(address: string, draft: D): Promise<ResponseFor<D["action"]>> => {
      const owner = normalizeSuiAddress(address);
      const key = draft.action === "get" ? `${owner}:${(draft as { orderId: string }).orderId}` : null;
      const cached = key ? reads.current.get(key) : undefined;

      let body: string;
      if (cached && Date.now() - cached.atMs < REUSE_SIGNED_READ_MS) {
        body = cached.body;
      } else {
        const message = { ...draft, owner, timestamp: Date.now() } as cashout.CashoutMessage;
        const signature = await sign(cashout.canonicalCashoutBytes(message));
        body = JSON.stringify({ message, signature });
        if (key) reads.current.set(key, { body, atMs: message.timestamp });
      }

      const res = await fetch("/api/cashout", { method: "POST", headers: { "Content-Type": "application/json" }, body, cache: "no-store" });
      const json = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
      if (!res.ok) {
        // A rejected signature may mean the cached one aged out: sign afresh next time.
        if (key) reads.current.delete(key);
        throw new CashoutApiError(json?.error ?? "Cash-out isn't answering. Try again in a minute.", json?.code ?? "provider", res.status);
      }
      return json as ResponseFor<D["action"]>;
    },
    [sign],
  );
}

/** `"15000.00"` -> `"₦15,000.00"`. */
export function formatNgn(amount: string): string {
  const [whole = "0", frac = "00"] = amount.split(".");
  return `₦${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${frac.padEnd(2, "0").slice(0, 2)}`;
}

/** Remember the order in progress, so a reload comes back to it. */
const activeKey = (address: string) => `reef:cashout:active:${normalizeSuiAddress(address)}`;
export const activeOrder = {
  get(address: string): string | null {
    try {
      return localStorage.getItem(activeKey(address));
    } catch {
      return null;
    }
  },
  set(address: string, orderId: string | null) {
    try {
      if (orderId) localStorage.setItem(activeKey(address), orderId);
      else localStorage.removeItem(activeKey(address));
    } catch {
      /* storage blocked: the order is still safe on the server */
    }
  },
};
