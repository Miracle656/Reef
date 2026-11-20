"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useDisconnectWallet } from "@mysten/dapp-kit";
import { AppShell } from "@/components/app-shell";
import { LinkWallet } from "@/components/link-wallet";
import { PasskeySignIn } from "@/components/passkey-sign-in";
import { SecureAccount } from "@/components/secure-account";
import { Button, Card } from "@/components/ui";
import { forgetCashoutSessions } from "@/lib/cashout";
import { PASSKEY_RECOVERY, WALLET_ONLY } from "@/lib/config";
import { passkeyWallet, usePasskeyWallet } from "@/lib/passkey-wallet";

/** Settings for the full testnet app: recovery passkey, linked wallets, Google sign-out. */
function SocialSettings({ mounted }: { mounted: boolean }) {
  const { mutate: disconnect } = useDisconnectWallet();
  return (
    <AppShell title="Settings">
      <p className="text-sm text-ink-soft">Manage your account.</p>
      <div className="mt-5 space-y-4">
        {mounted && PASSKEY_RECOVERY ? <SecureAccount /> : null}
        {mounted ? <LinkWallet /> : null}
      </div>
      {mounted ? (
        <Button variant="outline" className="mt-6" onClick={() => disconnect()}>
          Sign out
        </Button>
      ) : null}
    </AppShell>
  );
}

/** Settings for the wallet-only app: the account is a passkey, so this is about keeping it. */
function WalletSettings({ mounted }: { mounted: boolean }) {
  const wallet = usePasskeyWallet();
  const router = useRouter();

  if (!mounted) return <AppShell title="Settings">{null}</AppShell>;
  if (!wallet) {
    return (
      <AppShell title="Settings">
        <Card className="mx-auto max-w-xl p-6">
          <h2 className="text-lg font-bold">Your wallet</h2>
          <p className="mb-4 mt-1 text-sm text-ink-soft">Open your wallet to see its settings.</p>
          <PasskeySignIn />
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Settings">
      <div className="mx-auto max-w-xl space-y-4">
        <Card className="p-5">
          <h2 className="text-[15px] font-bold">Your address</h2>
          <code className="mt-2 block break-all font-mono text-[12.5px] leading-relaxed text-ink-soft">{wallet.address}</code>
        </Card>

        <Card className="p-5">
          <h2 className="text-[15px] font-bold">Your passkey</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            This wallet opens with a passkey kept by the password manager on your phone or computer (Google Password Manager, iCloud Keychain and
            the like). ReeF holds no copy and can&apos;t reset it.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            If the passkey is deleted, nobody can reach the money in this wallet. Keep it, and keep your password manager&apos;s sync or backup on.
          </p>
        </Card>

        <div>
          <Button
            variant="outline"
            onClick={() => {
              passkeyWallet.forget();
              forgetCashoutSessions();
              router.replace("/");
            }}
          >
            Sign out
          </Button>
          <p className="mt-2 text-xs leading-relaxed text-ink-faint">
            Signing out only makes this browser forget the wallet. Your passkey and your money stay where they are, and &ldquo;I already have a
            wallet&rdquo; opens it again.
          </p>
        </div>
      </div>
    </AppShell>
  );
}

export default function SettingsPage() {
  // Render account-dependent UI only after mount (it lives in the browser).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return WALLET_ONLY ? <WalletSettings mounted={mounted} /> : <SocialSettings mounted={mounted} />;
}
