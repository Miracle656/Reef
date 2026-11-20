"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { wallet } from "@umbra/core";
import { AppShell } from "@/components/app-shell";
import { PasskeySignIn } from "@/components/passkey-sign-in";
import { SignInButton } from "@/components/sign-in-button";
import { Badge, Button, Card, Spinner } from "@/components/ui";
import { WalletCashout } from "@/components/wallet-cashout";
import { WalletReceive } from "@/components/wallet-receive";
import { WalletSend } from "@/components/wallet-send";
import { useCashoutInfo } from "@/lib/cashout";
import { SIGN_IN, walletConfig } from "@/lib/config";
import { useUsdPrices, useWalletBalances, useWalletOwner } from "@/lib/wallet";

const ICONS: Record<string, string> = { USDC: "/usdc.png", SUI: "/sui.png" };

// The swap screen brings the DeepBook SDK with it, so it is fetched only when opened.
const WalletSwap = dynamic(() => import("@/components/wallet-swap").then((m) => m.WalletSwap), {
  ssr: false,
  loading: () => (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-sm text-ink-faint">
        <Spinner /> Loading…
      </div>
    </Card>
  ),
});

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
function BankIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10 12 4l9 6" />
      <path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8" />
      <path d="M3 20h18" />
    </svg>
  );
}
function SwapIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4 3 8l4 4" />
      <path d="M3 8h14" />
      <path d="m17 12 4 4-4 4" />
      <path d="M21 16H7" />
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

type Panel = "receive" | "send" | "swap" | "cashout" | null;

export default function WalletPage() {
  // The signed-in account lives in the browser: render wallet state after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [panel, setPanel] = useState<Panel>(null);

  const { address, viewOnly } = useWalletOwner();
  const balances = useWalletBalances(address);
  const prices = useUsdPrices();
  const cashoutInfo = useCashoutInfo(address);

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
  // Dollar coins at face value, plus SUI at its market price when there is one.
  const value = balances.data ? wallet.walletValue(balances.data, prices.data) : null;
  const suiHeld = balances.data?.find((b) => b.coin.symbol === "SUI")?.total ?? 0n;
  // Swapping SUI for dollars exists on mainnet only. The button is always there:
  // hiding it from a wallet with no SUI made the feature look missing.
  const canSwap = walletConfig.network === wallet.SWAP_NETWORK;
  // Nothing in the wallet at all. Usually a brand-new wallet, but also what someone sees after
  // making a second wallet on another device by mistake, so the page says which it could be.
  const empty = balances.data !== undefined && balances.data.every((b) => b.total === 0n);
  const toggle = (next: Exclude<Panel, null>) => setPanel((p) => (p === next ? null : next));
  const cashoutOn = cashoutInfo.data?.available ? cashoutInfo.data : null;

  return (
    <AppShell title="Wallet" subtitle={test ? "Test money on Sui testnet" : undefined}>
      {!mounted ? (
        <div className="flex items-center gap-2 text-sm text-ink-faint">
          <Spinner /> Loading…
        </div>
      ) : !address ? (
        <Card className="p-6">
          <h2 className="text-lg font-bold">Your wallet</h2>
          <p className="mt-1 text-sm text-ink-soft">
            {SIGN_IN === "passkey" ? "Create a wallet, or open yours, to get paid and send money." : "Sign in to see your balance, get paid and send money."}
          </p>
          <div className="mt-4">{SIGN_IN === "passkey" ? <PasskeySignIn /> : <SignInButton />}</div>
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
              {value === null ? <span className="text-ink-faint">$—</span> : `$${wallet.formatAmount(value.total, 6)}`}
            </p>
            {value && Object.keys(value.priced).length > 0 ? (
              <p className="mt-2 text-[13px] text-ink-soft">
                {value.dollars > 0n ? `$${wallet.formatAmount(value.dollars, 6)} in dollars, plus your ` : "Your "}
                SUI at today&apos;s price (about ${wallet.formatAmount(prices.data?.SUI ?? 0n, 6, 4)} each).
              </p>
            ) : null}
            {value && value.unpriced.length > 0 ? (
              <p className="mt-2 text-[13px] text-ink-soft">
                Not counting your {value.unpriced.map((b) => `${wallet.formatAmount(b.total, b.coin.decimals, 4)} ${b.coin.symbol}`).join(" and ")}:
                {prices.isLoading ? " its price is loading." : " its price isn't available right now."}
              </p>
            ) : null}
            {empty && !viewOnly ? (
              <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
                This wallet is empty. Tap Receive to get paid into it. If your money is in a wallet you made on another phone or computer, this is
                a different one: sign out in Settings, then choose &ldquo;I already have a wallet&rdquo;.
              </p>
            ) : null}
            {balances.isError ? (
              <p className="mt-3 text-sm text-danger">
                Couldn&apos;t load your balance.{" "}
                <button type="button" className="font-semibold underline" onClick={() => balances.refetch()}>
                  Try again
                </button>
              </p>
            ) : null}
            {/* Two even columns on a phone; a row on anything wider. */}
            <div className="mt-5 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
              <Button variant={panel === "receive" ? "primary" : "outline"} onClick={() => toggle("receive")} aria-expanded={panel === "receive"}>
                <ArrowDown /> Receive
              </Button>
              <Button variant={panel === "send" ? "primary" : "accent"} onClick={() => toggle("send")} aria-expanded={panel === "send"} disabled={!balances.data}>
                <ArrowUp /> Send
              </Button>
              {canSwap ? (
                <Button variant={panel === "swap" ? "primary" : "outline"} onClick={() => toggle("swap")} aria-expanded={panel === "swap"}>
                  <SwapIcon /> Swap
                </Button>
              ) : null}
              {cashoutOn ? (
                <Button variant={panel === "cashout" ? "primary" : "outline"} onClick={() => toggle("cashout")} aria-expanded={panel === "cashout"} disabled={!balances.data}>
                  <BankIcon /> Cash out
                </Button>
              ) : null}
            </div>
          </Card>

          {panel === "receive" ? <WalletReceive address={address} config={walletConfig} /> : null}
          {panel === "send" && balances.data ? (
            <WalletSend address={address} config={walletConfig} balances={balances.data} viewOnly={viewOnly} />
          ) : null}
          {panel === "swap" && balances.data && canSwap ? (
            <WalletSwap address={address} config={walletConfig} balances={balances.data} price={prices.data?.SUI} viewOnly={viewOnly} />
          ) : null}
          {panel === "cashout" && balances.data && cashoutOn ? (
            <WalletCashout
              address={address}
              config={walletConfig}
              balances={balances.data}
              info={cashoutOn}
              viewOnly={viewOnly}
              onSwap={canSwap && suiHeld > 0n ? () => setPanel("swap") : undefined}
            />
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
                    {value?.priced[b.coin.symbol] !== undefined ? (
                      <p className="text-xs text-ink-faint">about ${wallet.formatAmount(value.priced[b.coin.symbol] ?? 0n, 6)}</p>
                    ) : null}
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
