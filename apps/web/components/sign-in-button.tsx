"use client";

import { useConnectWallet, useWallets } from "@mysten/dapp-kit";
import { isEnokiWallet } from "@mysten/enoki";
import { isAuthConfigured } from "@/lib/enoki";
import { Button, Spinner, type ButtonProps } from "./ui";

/** Google sign-in, for the full testnet app. The wallet-only app signs in with
 *  a passkey instead: see `PasskeySignIn`. */
export function SignInButton({ size = "sm" }: { size?: ButtonProps["size"] }) {
  const enokiWallets = useWallets().filter(isEnokiWallet);
  const { mutate: connect, isPending } = useConnectWallet();
  const google = enokiWallets[0];

  if (!isAuthConfigured) {
    return (
      <Button variant="outline" size={size} disabled title="Set NEXT_PUBLIC_ENOKI_PUBLIC_API_KEY + GOOGLE_CLIENT_ID">
        Sign-in not configured
      </Button>
    );
  }

  return (
    <Button size={size} disabled={!google || isPending} onClick={() => google && connect({ wallet: google })}>
      {isPending ? <Spinner className="border-on-ink" /> : null}
      Continue with Google
    </Button>
  );
}
