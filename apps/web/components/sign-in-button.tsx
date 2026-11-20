"use client";

import { useConnectWallet, useWallets } from "@mysten/dapp-kit";
import { isEnokiWallet } from "@mysten/enoki";
import { isAuthConfigured } from "@/lib/enoki";
import { useSignInAvailable } from "@/lib/sign-in";
import { Button, Spinner, type ButtonProps } from "./ui";

export function SignInButton({ size = "sm" }: { size?: ButtonProps["size"] }) {
  const enokiWallets = useWallets().filter(isEnokiWallet);
  const { mutate: connect, isPending } = useConnectWallet();
  const available = useSignInAvailable();
  const google = enokiWallets[0];

  if (!isAuthConfigured) {
    return (
      <Button variant="outline" size={size} disabled title="Set NEXT_PUBLIC_ENOKI_PUBLIC_API_KEY + GOOGLE_CLIENT_ID">
        Sign-in not configured
      </Button>
    );
  }

  // The app's network isn't enabled for the Enoki key yet: opening Google would
  // only show a blank window, so say so instead.
  if (available.data === "not-enabled") {
    return (
      <Button variant="outline" size={size} disabled title="Enable this network for the Enoki API key in the Enoki portal">
        Sign-in opens soon
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
