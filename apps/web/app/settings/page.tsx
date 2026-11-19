"use client";

import { useEffect, useState } from "react";
import { useDisconnectWallet } from "@mysten/dapp-kit";
import { AppShell } from "@/components/app-shell";
import { LinkWallet } from "@/components/link-wallet";
import { SecureAccount } from "@/components/secure-account";
import { Button } from "@/components/ui";
import { useSocialAccount } from "@/lib/account";
import { PASSKEY_RECOVERY, WALLET_ONLY } from "@/lib/config";

export default function SettingsPage() {
  // Render wallet-dependent UI only after mount (dapp-kit hooks are client-only).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { mutate: disconnect } = useDisconnectWallet();
  const account = useSocialAccount();

  return (
    <AppShell title="Settings">
      <p className="text-sm text-ink-soft">Manage your account.</p>
      <div className="mt-5 space-y-4">
        {/* Linked wallets and the recovery passkey belong to the testnet social app. */}
        {mounted && !WALLET_ONLY && PASSKEY_RECOVERY ? <SecureAccount /> : null}
        {mounted && !WALLET_ONLY ? <LinkWallet /> : null}
        {mounted && WALLET_ONLY && account ? (
          <p className="break-all font-mono text-xs text-ink-faint">Signed in as {account.address}</p>
        ) : null}
      </div>
      {mounted ? (
        <Button variant="outline" className="mt-6" onClick={() => disconnect()}>
          Sign out
        </Button>
      ) : null}
    </AppShell>
  );
}
