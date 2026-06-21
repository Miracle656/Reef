"use client";

import Link from "next/link";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { useQuery } from "@tanstack/react-query";
import { AppNav } from "@/components/app-nav";
import { ComposeBox } from "@/components/compose-box";
import { Feed } from "@/components/feed";
import { SignInButton } from "@/components/sign-in-button";
import { Button, Card } from "@/components/ui";
import { isConfigured } from "@/lib/config";
import { trpc } from "@/lib/trpc";

export default function HomePage() {
  const account = useCurrentAccount();
  const profile = useQuery({
    queryKey: ["profile-by-addr", account?.address],
    queryFn: () => trpc.profileByAddress.query({ address: account!.address }),
    enabled: Boolean(account),
  });

  return (
    <>
      <AppNav />
      <main className="mx-auto max-w-2xl px-4 py-6">
        {!isConfigured ? <ConfigBanner /> : null}
        {!account ? (
          <Hero />
        ) : profile.isLoading ? null : !profile.data ? (
          <OnboardCta />
        ) : (
          <div className="space-y-4">
            <ComposeBox />
            <Feed />
          </div>
        )}
      </main>
    </>
  );
}

function Hero() {
  return (
    <div className="py-10">
      <h1 className="text-4xl font-bold tracking-tight">The social layer of Sui.</h1>
      <p className="mt-3 max-w-md text-ink-soft">
        Own your identity, your posts, and your audience — no seed phrases, no gas, no middlemen. Built for
        Lagos, on Walrus + zkLogin.
      </p>
      <div className="mt-6">
        <SignInButton />
      </div>
    </div>
  );
}

function OnboardCta() {
  return (
    <Card className="p-6">
      <h2 className="text-xl font-bold">One step left</h2>
      <p className="mt-1 text-sm text-ink-soft">Claim your handle and set up your profile to start posting.</p>
      <Link href="/onboarding" className="mt-4 inline-block">
        <Button>Set up profile</Button>
      </Link>
    </Card>
  );
}

function ConfigBanner() {
  return (
    <Card className="mb-4 border-danger p-3 text-sm">
      <span className="font-semibold text-danger">Demo not wired:</span> set{" "}
      <code className="font-mono text-xs">NEXT_PUBLIC_UMBRA_PACKAGE_ID</code> /{" "}
      <code className="font-mono text-xs">REGISTRY_ID</code> after publishing to testnet.
    </Card>
  );
}
