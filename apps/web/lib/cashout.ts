"use client";

/**
 * Client side of cash-out: talks to ReeF's own `/api/cashout`, never to Linq.
 * The wallet signs one message to confirm who it is (see `@umbra/core`
 * `cashout`), so the server can tell whose orders these are without a login.
 */
import { useCallback } from "react";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { useQuery } from "@tanstack/react-query";
import { cashout } from "@umbra/core";
import { SIGN_IN, WALLET_NETWORK } from "./config";
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

/** Use a confirmation for a little less time than the server allows it. */
const SESSION_USE_MS = cashout.CASHOUT_SESSION_MS - 2 * 60_000;

/**
 * The wallet's confirmations, by owner. Memory only: a reload asks again.
 * `signing` holds a confirmation that is being made, so two requests that start
 * together share one prompt.
 */
const sessions = new Map<string, cashout.CashoutSession>();
const signing = new Map<string, Promise<cashout.CashoutSession>>();

/** Forget every confirmation (signing out). */
export function forgetCashoutSessions() {
  sessions.clear();
}

/**
 * A confirmation is needed and this isn't the moment to ask for one: the call
 * was `quiet` (made from a timer, not a tap) and the wallet signs with a
 * passkey, whose prompt browsers only allow straight after a tap.
 */
export class CashoutLockedError extends Error {
  constructor() {
    super("Confirm it's you to carry on.");
    this.name = "CashoutLockedError";
  }
}

/**
 * `call(address, draft)` sends one cash-out request.
 *
 * The wallet confirms once (one signature: a passkey prompt, or nothing visible
 * for a Google account) and that confirmation is sent with every request for
 * the next half hour. Pass `{ quiet: true }` from anything that isn't a tap.
 * Looking up the name on a bank account needs no confirmation at all.
 */
export function useCashoutApi() {
  const sign = useWalletSignMessage();

  return useCallback(
    async <D extends CashoutDraft>(address: string, draft: D, opts: { quiet?: boolean } = {}): Promise<ResponseFor<D["action"]>> => {
      const owner = normalizeSuiAddress(address);

      let session = sessions.get(owner);
      if (session && Date.now() - session.issuedAt > SESSION_USE_MS) session = undefined;
      // A bank lookup says nothing about any wallet, so it is never worth a prompt.
      if (!session && draft.action !== "verify-bank") {
        if (opts.quiet && SIGN_IN === "passkey") throw new CashoutLockedError();
        let pending = signing.get(owner);
        if (!pending) {
          const issuedAt = Date.now();
          pending = sign(cashout.canonicalCashoutSessionBytes(WALLET_NETWORK ?? "", owner, issuedAt))
            .then((signature) => {
              const made = { issuedAt, signature };
              sessions.set(owner, made);
              return made;
            })
            .finally(() => signing.delete(owner));
          signing.set(owner, pending);
        }
        session = await pending;
      }

      const message = { ...draft, owner, timestamp: Date.now() } as cashout.CashoutMessage;
      const res = await fetch("/api/cashout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(session ? { message, session } : { message }),
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
      if (!res.ok) {
        // The server no longer takes this confirmation: the next tap makes a new one.
        if (res.status === 401) sessions.delete(owner);
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
