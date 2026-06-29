"use client";

import { useEffect, useState } from "react";
import { useDisconnectWallet } from "@mysten/dapp-kit";
import { AppShell } from "@/components/app-shell";
import { LinkWallet } from "@/components/link-wallet";
import { Button } from "@/components/ui";

export default function SettingsPage() {
  // Render wallet-dependent UI only after mount (dapp-kit hooks are client-only).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { mutate: disconnect } = useDisconnectWallet();

  return (
    <AppShell title="Settings">
      <p className="text-sm text-ink-soft">Manage your account.</p>
      <div className="mt-5 space-y-4">{mounted ? <LinkWallet /> : null}</div>
      {mounted ? (
        <Button variant="outline" className="mt-6" onClick={() => disconnect()}>
          Sign out
        </Button>
      ) : null}
    </AppShell>
  );
}
