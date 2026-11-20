"use client";

import { useCurrentAccount, useWallets } from "@mysten/dapp-kit";
import { isEnokiWallet } from "@mysten/enoki";
import { SIGN_IN } from "./config";
import { usePasskeyWallet } from "./passkey-wallet";

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

/**
 * The signed-in address, however this build signs in (SIGN_IN in lib/config):
 * the passkey wallet on the wallet-only app, the Google account on the full app.
 * For the few screens both apps share; social screens use `useSocialAccount`.
 */
export function useSignedInAddress(): string | null {
  const social = useSocialAccount();
  const passkeyWallet = usePasskeyWallet();
  return (SIGN_IN === "passkey" ? passkeyWallet?.address : social?.address) ?? null;
}
