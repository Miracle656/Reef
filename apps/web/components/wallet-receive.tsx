"use client";

import { QRCodeSVG } from "qrcode.react";
import type { wallet } from "@umbra/core";
import { CopyButton } from "./copy-button";
import { Card } from "./ui";

/** "Receive": the account's address as text and as a QR code. */
export function WalletReceive({ address, config }: { address: string; config: wallet.WalletConfig }) {
  const symbols = config.coins.map((c) => c.symbol);
  const coins = symbols.length > 1 ? `${symbols.slice(0, -1).join(", ")} or ${symbols[symbols.length - 1]}` : symbols[0];
  const test = config.network === "testnet";

  return (
    <Card className="p-5">
      <h2 className="text-lg font-bold">Receive</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Share this address to get paid in {coins}
        {test ? " on Sui testnet" : " on Sui"}.
      </p>

      <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        {/* Always dark-on-white, whatever the theme, so every scanner reads it. */}
        <div className="shrink-0 rounded-2xl border border-[color:var(--glass-border)] bg-white p-3">
          <QRCodeSVG value={address} size={156} bgColor="#ffffff" fgColor="#0b0b0f" level="M" aria-label="Your wallet address as a QR code" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Your address</p>
          <div className="mt-1.5 flex items-start gap-2 rounded-2xl border border-[color:var(--glass-border)] bg-surface-muted px-3 py-2.5">
            <code className="min-w-0 flex-1 break-all font-mono text-[13px] leading-relaxed text-ink">{address}</code>
            <CopyButton value={address} className="mt-0.5 shrink-0" />
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">
            {test
              ? "This is test money. Send only Sui testnet coins here."
              : "Use the Sui network only. Money sent to this address on another network (Ethereum, Base, BNB, Solana) can't be recovered."}
          </p>
        </div>
      </div>
    </Card>
  );
}
