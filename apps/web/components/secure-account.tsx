"use client";

/**
 * "Secure your account" (#10): add Face ID / fingerprint as a recovery passkey.
 * The passkey joins the account's `0x2::address_alias` set, so if Google access
 * is lost it can still sign for the SAME address. Posts, followers, handle and
 * chats stay put. Day-to-day actions stay on zkLogin (no biometric prompt per
 * like); the passkey is for recovery and, later, value moves.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import {
  buildAddAliasTx,
  buildEnableAliasesTx,
  buildRemoveAliasTx,
  canonicalPasskeyRecordBytes,
  MAX_ADDRESS_ALIASES,
  readAliasState,
  type PasskeyRecordMessage,
} from "@umbra/core";
import { useSocialAccount } from "@/lib/account";
import { useEnokiSignPersonalMessage, useGasless } from "@/lib/gasless";
import { createRecoveryPasskey, deviceLabel, onPasskeyHost, passkeyRpId, passkeysSupported, type NewPasskey } from "@/lib/passkey";
import { useChainClient } from "@/lib/sui-client";
import { trpc } from "@/lib/trpc";
import { shortAddr } from "@/lib/utils";
import { toast } from "./toaster";
import { Button, Card, Spinner } from "./ui";

export function SecureAccount({ onAdded }: { onAdded?: () => void }) {
  const account = useSocialAccount();
  const owner = account?.address ? normalizeSuiAddress(account.address) : null;
  const client = useChainClient();
  const run = useGasless();
  const signMessage = useEnokiSignPersonalMessage();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  // The chain is the source of truth for who can sign; the indexer only labels.
  const aliases = useQuery({
    queryKey: ["aliases", owner],
    queryFn: () => readAliasState(client, owner!),
    enabled: Boolean(owner),
  });
  const records = useQuery({
    queryKey: ["passkeys", owner],
    queryFn: () => trpc.passkeysForOwner.query({ owner: owner! }),
    enabled: Boolean(owner),
  });
  const refresh = () =>
    Promise.all([qc.invalidateQueries({ queryKey: ["aliases", owner] }), qc.invalidateQueries({ queryKey: ["passkeys", owner] })]);

  async function record(action: PasskeyRecordMessage["action"], pk: NewPasskey & { label: string }) {
    const message: PasskeyRecordMessage = {
      action,
      owner: owner!,
      passkey: pk.address,
      publicKey: pk.publicKey,
      credentialId: pk.credentialId,
      label: pk.label,
      timestamp: Date.now(),
    };
    const { signature } = await signMessage(canonicalPasskeyRecordBytes(message));
    const res = await trpc.passkeyRecord.mutate({ message, signature });
    if (!res.ok) throw new Error(res.error ?? "couldn't save the passkey record");
  }

  const add = useMutation({
    mutationFn: async () => {
      setError(null);
      const state = await readAliasState(client, owner!);
      if (state.aliases.length >= MAX_ADDRESS_ALIASES) throw new Error(`You can have at most ${MAX_ADDRESS_ALIASES - 1} recovery passkeys`);
      const pk = await createRecoveryPasskey(shortAddr(owner!));
      // `enable` must be its own transaction before the first `add`.
      if (!state.enabled) {
        const { digest } = await run(buildEnableAliasesTx());
        await client.core.waitForTransaction({ digest });
      }
      const { digest } = await run(buildAddAliasTx(owner!, pk.address));
      await client.core.waitForTransaction({ digest });
      try {
        await record("add", { ...pk, label: deviceLabel() });
      } catch (e) {
        // The passkey already works on-chain; the record is only its label + id.
        console.warn("[passkey] record failed", e);
      }
    },
    onSuccess: async () => {
      await refresh();
      toast("Recovery passkey added ✓");
      onAdded?.();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Couldn't add a passkey"),
  });

  const remove = useMutation({
    mutationFn: async (passkey: string) => {
      setError(null);
      const { digest } = await run(buildRemoveAliasTx(owner!, passkey));
      await client.core.waitForTransaction({ digest });
      const row = records.data?.find((r) => r.passkey === passkey);
      if (row) await record("remove", { address: passkey, publicKey: row.publicKey, credentialId: row.credentialId, label: row.label }).catch(() => {});
    },
    onSuccess: async () => {
      await refresh();
      toast("Passkey removed");
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Couldn't remove the passkey"),
  });

  if (!owner) return null;
  const supported = passkeysSupported();
  const rightHost = supported && onPasskeyHost();
  const labels = new Map((records.data ?? []).map((r) => [r.passkey, r]));
  const passkeys = (aliases.data?.aliases ?? []).filter((a) => a !== owner);
  const busy = add.isPending || remove.isPending;

  return (
    <Card className="p-5">
      <h2 className="text-lg font-bold">Recovery passkey</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Add Face ID or your fingerprint as a backup way into your account. If you ever lose your Google account, the
        passkey can still sign for you. Your address, posts and followers stay exactly the same.
      </p>

      {aliases.isLoading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-ink-faint">
          <Spinner /> Checking your account…
        </div>
      ) : passkeys.length > 0 ? (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Can sign for you</p>
          {passkeys.map((addr) => {
            const r = labels.get(addr);
            return (
              <div key={addr} className="flex items-center justify-between rounded-2xl border border-[color:var(--glass-border)] px-3 py-2">
                <div>
                  <p className="text-sm font-semibold">{r?.label || "Passkey"}</p>
                  <p className="font-mono text-xs text-ink-faint">
                    {shortAddr(addr)}
                    {r ? ` · added ${new Date(r.createdAtMs).toLocaleDateString()}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => remove.mutate(addr)}
                  className="text-xs font-medium text-danger hover:underline disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="mt-4">
        {!supported ? (
          <p className="text-sm text-ink-faint">This browser doesn&apos;t support passkeys. Try Safari on iPhone or Chrome on Android.</p>
        ) : !rightHost ? (
          <p className="text-sm text-ink-faint">
            Passkeys only work on {passkeyRpId()}, not on previews or localhost.
          </p>
        ) : (
          <Button disabled={busy || aliases.isLoading} onClick={() => add.mutate()}>
            {add.isPending ? <Spinner className="border-on-ink" /> : null}
            {passkeys.length > 0 ? "Add another passkey" : "Add a passkey"}
          </Button>
        )}
      </div>

      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
    </Card>
  );
}
