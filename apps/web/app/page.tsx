"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSocialAccount } from "@/lib/account";
import { walrus } from "@umbra/core";
import { AppShell } from "@/components/app-shell";
import { ComposeForm } from "@/components/compose-box";
import { Feed } from "@/components/feed";
import { Landing } from "@/components/landing";
import { RightSidebar } from "@/components/right-sidebar";
import { Avatar, Button, Card } from "@/components/ui";
import { isConfigured, umbraConfig } from "@/lib/config";
import { trpc } from "@/lib/trpc";

export default function HomePage() {
  const account = useSocialAccount();
  const profile = useQuery({
    queryKey: ["profile-by-addr", account?.address],
    queryFn: () => trpc.profileByAddress.query({ address: account!.address }),
    enabled: Boolean(account),
  });

  // Signed-out visitors get the full animated landing (no app chrome).
  if (!account) return <Landing />;

  return (
    <AppShell
      flush
      title="Home"
      header={
        <div className="flex gap-8 px-6">
          <button className="border-b-[2.5px] border-accent pb-3 text-[15px] font-bold text-ink">For you</button>
          <button className="border-b-[2.5px] border-transparent pb-3 text-[15px] font-medium text-ink-faint transition-colors hover:text-ink-soft">Following</button>
        </div>
      }
      right={profile.data ? <RightSidebar /> : undefined}
    >
      {!isConfigured ? <div className="px-5 pt-4"><ConfigBanner /></div> : null}
      {profile.isLoading ? null : !profile.data ? (
        <div className="p-5"><OnboardCta /></div>
      ) : (
        <>
          <div className="flex gap-3 border-b-[8px] border-[color:color-mix(in_srgb,var(--ink)_5%,transparent)] px-5 py-4">
            <div className="shrink-0">
              <Avatar
                name={profile.data.handle}
                src={profile.data.avatarBlobId ? walrus.urlFor(umbraConfig, profile.data.avatarBlobId) : null}
                size={46}
              />
            </div>
            <div className="min-w-0 flex-1">
              <ComposeForm placeholder="What's happening on the reef?" />
            </div>
          </div>
          <Feed />
        </>
      )}
    </AppShell>
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
