"use client";

import { useConnectWallet, useWallets } from "@mysten/dapp-kit";
import { isEnokiWallet } from "@mysten/enoki";
import { isAuthConfigured } from "@/lib/enoki";
import { Button, Spinner } from "./ui";

export function SignInButton() {
  const enokiWallets = useWallets().filter(isEnokiWallet);
  const { mutate: connect, isPending } = useConnectWallet();
  const google = enokiWallets[0];

  if (!isAuthConfigured) {
    return (
      <Button variant="outline" size="sm" disabled title="Set NEXT_PUBLIC_ENOKI_PUBLIC_API_KEY + GOOGLE_CLIENT_ID">
        Sign-in not configured
      </Button>
    );
  }

  return (
    <Button size="sm" disabled={!google || isPending} onClick={() => google && connect({ wallet: google })}>
      {isPending ? <Spinner className="border-on-ink" /> : null}
      Continue with Google
    </Button>
  );
}
