"use client";

/**
 * Send money inside a DM, or tip a post's author (#13). The transfer is a plain
 * on-chain payment; the optional note rides the DM as a "payment" message, so
 * it's end-to-end encrypted (Seal) and only the two of you can read it.
 */
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { buildTipTx, formatUnits, tipCoins, toBaseUnits } from "@umbra/core";
import { toast } from "@/components/toaster";
import { Button, Spinner } from "@/components/ui";
import { useSocialAccount } from "@/lib/account";
import { TIP_USDC_TYPE } from "@/lib/config";
import { useGasless } from "@/lib/gasless";
import { useChainClient } from "@/lib/sui-client";
import { useMessaging } from "../lib/provider";
import type { Participant } from "../lib/types";
import { LockIcon, XIcon } from "./icons";

const PRESETS: Record<"USDC" | "SUI", string[]> = { USDC: ["1", "2", "5"], SUI: ["0.5", "1", "2"] };

export function PaySheet({
  chatId,
  recipient,
  postId,
  onClose,
}: {
  chatId: string;
  recipient: Participant;
  /** set when tipping a specific post */
  postId?: string;
  onClose: () => void;
}) {
  const { send } = useMessaging();
  const account = useSocialAccount();
  const client = useChainClient();
  const run = useGasless();
  const coins = useMemo(() => tipCoins(TIP_USDC_TYPE), []);
  const [coinIdx, setCoinIdx] = useState(0);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const coin = coins[coinIdx]!;

  const balance = useQuery({
    queryKey: ["balance", account?.address, coin.type],
    queryFn: async () => BigInt((await client.core.getBalance({ owner: account!.address, coinType: coin.type })).balance.balance),
    enabled: Boolean(account),
  });

  const units = toBaseUnits(amount, coin.decimals);
  const insufficient = units != null && balance.data != null && units > balance.data;
  const name = recipient.displayName || `@${recipient.username}`;

  const submit = async () => {
    if (!units || insufficient) return;
    setBusy(true);
    setError(null);
    try {
      const { digest } = await run(buildTipTx({ recipient: recipient.id, coinType: coin.type, amount: units }));
      // The money has moved. Now the (encrypted) payment message with the note.
      let noteSent = true;
      try {
        await send({
          chatId,
          type: "payment",
          content: note.trim(),
          payment: { digest, coin: coin.symbol, amount: formatUnits(units, coin.decimals), to: recipient.id, postId },
        });
      } catch {
        noteSent = false;
      }
      const sent = `Sent ${formatUnits(units, coin.decimals)} ${coin.symbol} to ${name}`;
      toast(noteSent ? `${sent} ✓` : `${sent}, but the note didn't go through. Send it as a message.`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-start justify-center bg-ink/40 p-4 pt-16 backdrop-blur-sm" onClick={busy ? undefined : onClose}>
      <div className="w-full max-w-md rounded-3xl border border-[color:var(--glass-border)] bg-surface p-5 shadow-[var(--shadow-glass-lg)]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{postId ? `Tip ${name}` : `Send money to ${name}`}</h2>
          <button onClick={onClose} disabled={busy} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full text-ink-soft hover:bg-surface-muted">
            <XIcon />
          </button>
        </div>

        <div className="mb-3 flex gap-2" role="radiogroup" aria-label="Coin">
          {coins.map((c, i) => (
            <button
              key={c.symbol}
              role="radio"
              aria-checked={i === coinIdx}
              onClick={() => {
                setCoinIdx(i);
                setAmount("");
              }}
              className={`h-9 rounded-full px-4 text-[14px] font-semibold ${i === coinIdx ? "bg-accent text-on-accent" : "border border-[color:var(--glass-border)] text-ink-soft"}`}
            >
              {c.symbol}
            </button>
          ))}
        </div>

        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(",", "."))}
          placeholder={`Amount in ${coin.symbol}`}
          aria-label="Amount"
          className="h-12 w-full rounded-2xl border border-[color:var(--glass-border)] bg-surface-glass px-4 text-[17px] font-semibold outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_45%,transparent)]"
        />
        <div className="mt-2 flex items-center justify-between">
          <div className="flex gap-1.5">
            {PRESETS[coin.symbol].map((p) => (
              <button key={p} onClick={() => setAmount(p)} className="h-8 rounded-full border border-[color:var(--glass-border)] px-3 text-[13px] font-medium hover:bg-surface-muted">
                {p}
              </button>
            ))}
          </div>
          <span className="text-[12.5px] text-ink-faint">
            {balance.data != null ? `Balance ${formatUnits(balance.data, coin.decimals)} ${coin.symbol}` : balance.isLoading ? "…" : ""}
          </span>
        </div>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 280))}
          placeholder="Add a note (optional)"
          rows={2}
          className="mt-3 w-full resize-none rounded-2xl border border-[color:var(--glass-border)] bg-surface-glass px-4 py-2.5 text-[14.5px] outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_45%,transparent)]"
        />
        <p className="mt-2 flex items-start gap-1.5 text-[12.5px] text-ink-faint">
          <LockIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Your note is private: only you and {name} can read it. The payment itself is on-chain.</span>
        </p>

        {insufficient ? <p className="mt-2 text-sm text-danger">Not enough {coin.symbol}.</p> : null}
        {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}

        <Button onClick={() => void submit()} disabled={!units || insufficient || busy} className="mt-4 w-full">
          {busy ? <Spinner className="border-on-ink" /> : null}
          {units ? `Send ${formatUnits(units, coin.decimals)} ${coin.symbol}` : "Send"}
        </Button>
      </div>
    </div>,
    document.body,
  );
}
