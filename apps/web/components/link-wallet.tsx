"use client";

import { useState } from "react";
import { useConnectWallet, useCurrentAccount, useSignPersonalMessage, useWallets } from "@mysten/dapp-kit";
import { isEnokiWallet } from "@mysten/enoki";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canonicalWalletLinkBytes, type WalletLinkMessage } from "@umbra/core";
import { trpc } from "@/lib/trpc";
import { shortAddr } from "@/lib/utils";
import { Button, Card, Spinner } from "./ui";
import { CopyButton } from "./copy-button";

type Wallets = ReturnType<typeof useWallets>;
type Wallet = Wallets[number];
type Account = Wallet["accounts"][number];

export function LinkWallet() {
  const wallets = useWallets();
  const current = useCurrentAccount();
  const qc = useQueryClient();
  const { mutateAsync: connect } = useConnectWallet();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();

  const enoki = wallets.find(isEnokiWallet);
  const externalWallets = wallets.filter((w) => !isEnokiWallet(w));
  const social = enoki?.accounts[0]?.address ?? current?.address;

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const linked = useQuery({
    queryKey: ["linked", social],
    queryFn: () => trpc.linkedWallets.query({ owner: social! }),
    enabled: Boolean(social),
  });
  const linkedSet = new Set(linked.data ?? []);

  async function connectWallet(wallet: Wallet) {
    setError(null);
    try {
      await connect({ wallet });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect");
    }
  }

  async function linkAccount(account: Account) {
    if (!social) return;
    setError(null);
    setPending(account.address);
    try {
      const message: WalletLinkMessage = { owner: social, linked: account.address, timestamp: Date.now() };
      const { signature } = await signPersonalMessage({ message: canonicalWalletLinkBytes(message), account });
      const r = await trpc.linkWallet.mutate({ message, signature });
      if (!r.ok) throw new Error("Signature verification failed");
      await qc.invalidateQueries({ queryKey: ["linked", social] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to link");
    } finally {
      setPending(null);
    }
  }

  const unlink = useMutation({
    mutationFn: (addr: string) => trpc.unlinkWallet.mutate({ owner: social!, linked: addr }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["linked", social] }),
  });

  return (
    <Card className="p-5">
      <h2 className="text-lg font-bold">Bind a crypto wallet</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Link a Sui wallet you control to trade and pay with its balances. Your wallet signs a proof — ReeF
        never holds your keys.
      </p>

      {/* already-linked */}
      {linked.data && linked.data.length > 0 ? (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Linked</p>
          {linked.data.map((addr) => (
            <div key={addr} className="flex items-center justify-between rounded-2xl border border-[color:var(--glass-border)] px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm">{shortAddr(addr)}</span>
                <CopyButton value={addr} />
              </div>
              <button type="button" onClick={() => unlink.mutate(addr)} className="text-xs font-medium text-danger hover:underline">
                Unlink
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {/* choose a wallet + account to link */}
      <div className="mt-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Available wallets</p>
        {externalWallets.length === 0 ? (
          <p className="text-sm text-ink-faint">
            No Sui wallet detected. Install{" "}
            <a href="https://slush.app" target="_blank" rel="noreferrer" className="text-accent hover:underline">
              Slush
            </a>{" "}
            (or another Sui wallet) to bind one.
          </p>
        ) : (
          externalWallets.map((w) => (
            <div key={w.name} className="rounded-2xl border border-[color:var(--glass-border)] p-3">
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {w.icon ? <img src={w.icon} alt="" className="h-5 w-5 rounded" /> : null}
                <span className="text-sm font-semibold">{w.name}</span>
              </div>
              {w.accounts.length === 0 ? (
                <Button className="mt-2" size="sm" variant="outline" onClick={() => connectWallet(w)}>
                  Connect
                </Button>
              ) : (
                <div className="mt-2 space-y-1.5">
                  {w.accounts.map((acc) => (
                    <div key={acc.address} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm">{shortAddr(acc.address)}</span>
                        <CopyButton value={acc.address} />
                      </div>
                      {linkedSet.has(acc.address) ? (
                        <span className="text-xs font-medium text-accent">Linked</span>
                      ) : (
                        <Button size="sm" disabled={pending === acc.address} onClick={() => linkAccount(acc)}>
                          {pending === acc.address ? <Spinner className="border-on-ink" /> : null}
                          Link
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
    </Card>
  );
}
