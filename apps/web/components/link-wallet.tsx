"use client";

import { useConnectWallet, useCurrentAccount, useSignPersonalMessage, useWallets } from "@mysten/dapp-kit";
import { isEnokiWallet } from "@mysten/enoki";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canonicalWalletLinkBytes, type WalletLinkMessage } from "@umbra/core";
import { trpc } from "@/lib/trpc";
import { shortAddr } from "@/lib/utils";
import { Button, Card, Spinner } from "./ui";

export function LinkWallet() {
  const wallets = useWallets();
  const current = useCurrentAccount();
  const qc = useQueryClient();
  const { mutateAsync: connect } = useConnectWallet();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();

  const enoki = wallets.find(isEnokiWallet);
  const externalWallets = wallets.filter((w) => !isEnokiWallet(w));
  const social = enoki?.accounts[0]?.address ?? current?.address;

  const linked = useQuery({
    queryKey: ["linked", social],
    queryFn: () => trpc.linkedWallets.query({ owner: social! }),
    enabled: Boolean(social),
  });

  const link = useMutation({
    mutationFn: async () => {
      if (!social) throw new Error("Sign in first");
      const ext = externalWallets[0];
      if (!ext) throw new Error("No Sui wallet detected — install Slush (Sui Wallet) to bind one.");
      let account = ext.accounts[0];
      if (!account) {
        const res = await connect({ wallet: ext });
        account = res.accounts[0];
      }
      if (!account) throw new Error("Could not connect wallet");
      const message: WalletLinkMessage = { owner: social, linked: account.address, timestamp: Date.now() };
      const { signature } = await signPersonalMessage({ message: canonicalWalletLinkBytes(message), account });
      const r = await trpc.linkWallet.mutate({ message, signature });
      if (!r.ok) throw new Error("Signature verification failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["linked", social] }),
  });

  const unlink = useMutation({
    mutationFn: (addr: string) => trpc.unlinkWallet.mutate({ owner: social!, linked: addr }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["linked", social] }),
  });

  return (
    <Card className="p-5">
      <h2 className="text-lg font-bold">Bind a crypto wallet</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Already have a Sui wallet? Link it to trade and pay with your existing balances. Your wallet signs a
        proof — Umbra never holds your keys.
      </p>

      <div className="mt-4 space-y-2">
        {linked.data?.length ? (
          linked.data.map((addr) => (
            <div key={addr} className="flex items-center justify-between rounded-2xl border border-[color:var(--glass-border)] px-3 py-2">
              <span className="font-mono text-sm">{shortAddr(addr)}</span>
              <button
                type="button"
                onClick={() => unlink.mutate(addr)}
                className="text-xs font-medium text-danger hover:underline"
              >
                Unlink
              </button>
            </div>
          ))
        ) : (
          <p className="text-sm text-ink-faint">No wallets linked yet.</p>
        )}
      </div>

      {link.error ? <p className="mt-3 text-sm text-danger">{(link.error as Error).message}</p> : null}

      <Button className="mt-4" variant="outline" disabled={link.isPending} onClick={() => link.mutate()}>
        {link.isPending ? <Spinner /> : null}
        Connect &amp; link a wallet
      </Button>
    </Card>
  );
}
