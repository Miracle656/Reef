"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Spinner } from "@/components/ui";
import { useMessaging } from "../lib/provider";
import { LockIcon, XIcon } from "./icons";

/**
 * The Vault: passcode-locked chats. This modal handles first-time setup, unlock,
 * and (when unlocked) lets the user lock again. Vaulted chats are hidden from the
 * main list until unlocked this session.
 */
export function VaultModal({ onClose }: { onClose: () => void }) {
  const { vaultStatus, vaultSetup, unlockVault, lockVault } = useMessaging();
  const [status, setStatus] = useState<{ hasPasscode: boolean; unlocked: boolean } | null>(null);
  const [passcode, setPasscode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void vaultStatus().then(setStatus);
  }, [vaultStatus]);

  const submit = async () => {
    setErr("");
    if (!passcode.trim()) return;
    setBusy(true);
    try {
      if (!status?.hasPasscode) {
        if (passcode !== confirm) {
          setErr("Passcodes don't match");
          return;
        }
        await vaultSetup(passcode);
        onClose();
      } else {
        const ok = await unlockVault(passcode);
        if (!ok) setErr("Wrong passcode");
        else onClose();
      }
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-start justify-center bg-ink/40 p-4 pt-24 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl border border-[color:var(--glass-border)] bg-surface p-6 shadow-[var(--shadow-glass-lg)]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold"><LockIcon className="h-5 w-5" /> The Vault</h2>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full text-ink-soft hover:bg-surface-muted"><XIcon /></button>
        </div>

        {status === null ? (
          <div className="grid place-items-center py-8"><Spinner /></div>
        ) : status.unlocked ? (
          <div className="py-2">
            <p className="text-sm text-ink-soft">The vault is unlocked. Vaulted chats appear in your list this session.</p>
            <Button variant="outline" onClick={() => { lockVault(); onClose(); }} className="mt-4 w-full">Lock vault</Button>
          </div>
        ) : (
          <div className="py-1">
            <p className="mb-3 text-sm text-ink-soft">
              {status.hasPasscode ? "Enter your passcode to reveal vaulted chats." : "Set a passcode to start locking chats into the vault."}
            </p>
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && status.hasPasscode) void submit(); }}
              placeholder="Passcode"
              className="mb-2 h-11 w-full rounded-2xl border border-[color:var(--glass-border)] bg-surface-glass px-4 text-[15px] outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_45%,transparent)]"
            />
            {!status.hasPasscode ? (
              <input
                type="password"
                inputMode="numeric"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Confirm passcode"
                className="mb-2 h-11 w-full rounded-2xl border border-[color:var(--glass-border)] bg-surface-glass px-4 text-[15px] outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_45%,transparent)]"
              />
            ) : null}
            {err ? <p className="mb-2 text-[13px] text-danger">{err}</p> : null}
            <Button onClick={() => void submit()} disabled={busy || !passcode.trim()} className="mt-1 w-full">
              {busy ? <Spinner className="border-on-accent" /> : null}
              {status.hasPasscode ? "Unlock" : "Set passcode"}
            </Button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
