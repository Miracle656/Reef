"use client";

import { useEffect, useState } from "react";
import { wallet } from "@umbra/core";
import { AppShell } from "@/components/app-shell";
import { SignInButton } from "@/components/sign-in-button";
import { Badge, Button, Card, Spinner } from "@/components/ui";
import { WalletReceive } from "@/components/wallet-receive";
import { WalletSend } from "@/components/wallet-send";
import { walletConfig } from "@/lib/config";
import { useWalletBalances, useWalletOwner, useWalletSigning } from "@/lib/wallet";

const ICONS: Record<string, string> = { USDC: "/usdc.png", SUI: "/sui.png" };

function CoinIcon({ symbol }: { symbol: string }) {
  const src = ICONS[symbol];
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border border-[color:var(--glass-border)] bg-surface-muted text-[13px] font-black text-ink">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        "$"
      )}
    </span>
  );
}

function ArrowDown() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M6 13l6 6 6-6" />
    </svg>
  );
}
function ArrowUp() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  );
}

type Panel = "receive" | "send" | null;

export default function WalletPage() {
  // dapp-kit hooks are client-only: render wallet state after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [panel, setPanel] = useState<Panel>(null);

  const { address, viewOnly } = useWalletOwner();
  const balances = useWalletBalances(address);
  const signing = useWalletSigning();

  if (!walletConfig) {
    return (
      <AppShell title="Wallet">
        <Card className="p-5">
          <p className="text-sm text-ink-soft">The wallet isn&apos;t available here yet.</p>
        </Card>
      </AppShell>
    );
  }

  const test = walletConfig.network === "testnet";
  const dollars = balances.data ? wallet.stableTotal(balances.data) : null;
  const toggle = (next: Exclude<Panel, null>) => setPanel((p) => (p === next ? null : next));

  return (
    <AppShell title="Wallet" subtitle={test ? "Test money on Sui testnet" : undefined}>
      {!mounted ? (
        <div className="flex items-center gap-2 text-sm text-ink-faint">
          <Spinner /> Loading…
        </div>
      ) : !address ? (
        <Card className="p-6">
          <h2 className="text-lg font-bold">Your wallet</h2>
          <p className="mt-1 text-sm text-ink-soft">Sign in to see your balance, get paid and send money.</p>
          <div className="mt-4">
            <SignInButton />
          </div>
        </Card>
      ) : (
        <div className="mx-auto max-w-xl space-y-4">
          <Card className="p-6">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Balance</p>
              <div className="flex items-center gap-2">
                {viewOnly ? <Badge>Preview, read-only</Badge> : null}
                {test ? <Badge>Test money</Badge> : null}
              </div>
            </div>
            <p className="mt-2 text-[44px] font-black leading-none tracking-tight">
              {dollars === null ? <span className="text-ink-faint">$—</span> : `$${wallet.formatAmount(dollars, 6)}`}
            </p>
            {balances.isError ? (
              <p className="mt-3 text-sm text-danger">
                Couldn&apos;t load your balance.{" "}
                <button type="button" className="font-semibold underline" onClick={() => balances.refetch()}>
                  Try again
                </button>
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap gap-3">
              <Button variant={panel === "receive" ? "primary" : "outline"} onClick={() => toggle("receive")} aria-expanded={panel === "receive"}>
                <ArrowDown /> Receive
              </Button>
              <Button variant={panel === "send" ? "primary" : "accent"} onClick={() => toggle("send")} aria-expanded={panel === "send"} disabled={!balances.data}>
                <ArrowUp /> Send
              </Button>
            </div>
          </Card>

          {panel === "receive" ? <WalletReceive address={address} config={walletConfig} /> : null}
          {panel === "send" && balances.data ? (
            <WalletSend address={address} config={walletConfig} balances={balances.data} viewOnly={viewOnly} signing={signing.data} />
          ) : null}

          <Card className="p-2">
            {balances.isLoading ? (
              <div className="flex items-center gap-2 p-4 text-sm text-ink-faint">
                <Spinner /> Loading your coins…
              </div>
            ) : (
              (balances.data ?? []).map((b) => (
                <div key={b.coin.symbol} className="flex items-center gap-3 rounded-2xl px-3 py-3">
                  <CoinIcon symbol={b.coin.symbol} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-bold leading-tight">{b.coin.symbol}</p>
                    <p className="truncate text-xs text-ink-faint">{b.coin.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-[15px] font-semibold leading-tight">
                      {wallet.formatAmount(b.total, b.coin.decimals, b.coin.stable ? 2 : 4)}
                    </p>
                    {b.coin.gasless ? <p className="text-xs text-ink-faint">No fee to send</p> : null}
                  </div>
                </div>
              ))
            )}
          </Card>

          <p className="px-1 text-xs text-ink-faint">
            <a href={wallet.explorerAddressUrl(walletConfig.network, address)} target="_blank" rel="noreferrer" className="hover:underline">
              View this wallet on the Sui explorer
            </a>
          </p>
        </div>
      )}
    </AppShell>
  );
}
