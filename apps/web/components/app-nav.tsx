"use client";

import Link from "next/link";
import { useCurrentAccount, useDisconnectWallet } from "@mysten/dapp-kit";
import { useQuery } from "@tanstack/react-query";
import { walrus } from "@umbra/core";
import { umbraConfig } from "@/lib/config";
import { trpc } from "@/lib/trpc";
import { Avatar, Button } from "./ui";
import { SignInButton } from "./sign-in-button";

export function AppNav() {
  const account = useCurrentAccount();
  const { mutate: disconnect } = useDisconnectWallet();

  const profile = useQuery({
    queryKey: ["profile-by-addr", account?.address],
    queryFn: () => trpc.profileByAddress.query({ address: account!.address }),
    enabled: Boolean(account),
  });
  const p = profile.data;

  return (
    <header className="sticky top-0 z-10 border-b-2 border-border-strong bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-bold tracking-tight lowercase">
          umbra
        </Link>
        <div className="flex items-center gap-3">
          {account ? (
            <>
              {p ? (
                <Link href={`/u/${p.handle}`} className="flex items-center gap-2">
                  <Avatar
                    name={p.handle}
                    src={p.avatarBlobId ? walrus.urlFor(umbraConfig, p.avatarBlobId) : null}
                    size={32}
                  />
                  <span className="hidden text-sm font-medium sm:inline">@{p.handle}</span>
                </Link>
              ) : (
                <Link href="/onboarding" className="text-sm font-medium text-accent">
                  Finish setup
                </Link>
              )}
              <Button variant="ghost" size="sm" onClick={() => disconnect()}>
                Sign out
              </Button>
            </>
          ) : (
            <SignInButton />
          )}
        </div>
      </div>
    </header>
  );
}
