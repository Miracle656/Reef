"use client";

import { useCurrentAccount, useWallets } from "@mysten/dapp-kit";
import { isEnokiWallet } from "@mysten/enoki";

/**
 * The logged-in social identity = the zkLogin (Enoki) account, regardless of
 * which wallet dapp-kit currently has "active". Binding an external wallet makes
 * it the current account, but the app's identity must stay the zkLogin one.
 * Falls back to the current account when there's no Enoki wallet.
 */
export function useSocialAccount() {
  const wallets = useWallets();
  const current = useCurrentAccount();
  const enoki = wallets.find(isEnokiWallet);
  return enoki?.accounts[0] ?? current ?? null;
}
