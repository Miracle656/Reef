"use client";

/**
 * The passkey wallet this browser is signed in to (the wallet-only app).
 *
 * Signing in means this browser remembers which wallet is yours: its public key
 * and which passkey signs for it. Neither is secret, and the key itself never
 * leaves the device's password manager. Signing out forgets that and nothing
 * else; "I already have a wallet" brings it back from the passkey.
 */
import { useSyncExternalStore } from "react";
import { passkey } from "@umbra/core";
import { ReefPasskeyProvider } from "./passkey";

const KEY = "reef:wallet:passkey";

const listeners = new Set<() => void>();
/** Some browsers refuse storage (private windows, blocked site data). The wallet
 *  is then kept here and lasts until the tab closes. */
let memory: string | null = null;
let storageBlocked = false;
let cache: { raw: string | null; wallet: passkey.PasskeyWallet | null } = { raw: null, wallet: null };

function readRaw(): string | null {
  if (storageBlocked) return memory;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    storageBlocked = true;
    return memory;
  }
}

/** The remembered wallet. The same object comes back until storage changes,
 *  which `useSyncExternalStore` relies on. */
function current(): passkey.PasskeyWallet | null {
  const raw = readRaw();
  if (raw !== cache.raw) cache = { raw, wallet: passkey.parsePasskeyWallet(raw) };
  return cache.wallet;
}

function write(raw: string | null) {
  memory = raw;
  try {
    if (raw === null) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, raw);
    storageBlocked = false;
  } catch {
    storageBlocked = true;
  }
  for (const notify of listeners) notify();
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  // Signing in or out in another tab reaches this one too.
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) notify();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", onStorage);
  };
}

export const passkeyWallet = {
  current,
  /** Sign in: remember this wallet on this browser. */
  remember: (wallet: passkey.PasskeyWallet) => write(passkey.serializePasskeyWallet(wallet)),
  /** Sign out: forget it. The passkey stays in the password manager. */
  forget: () => write(null),
};

/** The signed-in passkey wallet, or null. Null while the page renders on the server. */
export function usePasskeyWallet(): passkey.PasskeyWallet | null {
  return useSyncExternalStore(subscribe, current, () => null);
}

/** The WebAuthn side for wallet passkeys. The date tells two wallets apart in a password manager. */
export function walletPasskeyProvider(): ReefPasskeyProvider {
  const made = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return new ReefPasskeyProvider(`ReeF wallet (${made})`);
}
