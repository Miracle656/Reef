"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Button, Spinner } from "@/components/ui";
import { useMessaging } from "../lib/provider";
import { RELOCK_CHOICES } from "../lib/chat-lock";
import { LockIcon, XIcon } from "./icons";

/**
 * Chat lock: put a passcode on specific chats. Locked chats disappear from the
 * list until you enter the passcode, and everything re-locks automatically
 * after the idle time you pick. Handles setup, unlock, and lock-now.
 */
export function ChatLockModal({ onClose }: { onClose: () => void }) {
  const { chatLock, chatLockSetup, chatLockUnlock, chatLockNow, setChatLockRelock } = useMessaging();
  const [passcode, setPasscode] = useState("");
  const [confirm, setConfirm] = useState("");
  // relock choice during setup — the store doesn't exist until setup completes
  const [setupRelock, setSetupRelock] = useState(chatLock.relockMinutes);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr("");
    if (!passcode.trim()) return;
    setBusy(true);
    try {
      if (!chatLock.hasPasscode) {
        if (passcode !== confirm) {
          setErr("Passcodes don't match");
          return;
        }
        await chatLockSetup(passcode);
        setChatLockRelock(setupRelock);
        setPasscode("");
        setConfirm("");
      } else {
        const ok = await chatLockUnlock(passcode);
        if (!ok) setErr("Wrong passcode");
        else onClose();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const minutesLeft = chatLock.msLeft != null ? Math.max(1, Math.ceil(chatLock.msLeft / 60_000)) : null;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-start justify-center bg-ink/40 p-4 pt-24 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl border border-[color:var(--glass-border)] bg-surface p-6 shadow-[var(--shadow-glass-lg)]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold"><LockIcon className="h-5 w-5" /> Chat lock</h2>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full text-ink-soft hover:bg-surface-muted"><XIcon /></button>
        </div>

        {chatLock.unlocked ? (
          <div className="py-2">
            <p className="text-sm text-ink-soft">
              Unlocked — your locked chats are visible.
              {minutesLeft != null ? ` They lock again in about ${minutesLeft} min.` : ""}
            </p>
            <p className="mt-3 text-xs font-bold uppercase tracking-wide text-ink-faint">Lock again after</p>
            <RelockPicker value={chatLock.relockMinutes} onChange={setChatLockRelock} />
            <p className="mt-3 text-[12px] text-ink-faint">
              Lock any chat from its info screen (tap the chat name → &ldquo;Lock this chat&rdquo;).
            </p>
            <Button variant="outline" onClick={() => { chatLockNow(); onClose(); }} className="mt-4 w-full">Lock now</Button>
          </div>
        ) : (
          <div className="py-1">
            <p className="mb-3 text-sm text-ink-soft">
              {chatLock.hasPasscode
                ? "Enter your passcode to show your locked chats."
                : "Set a passcode to start locking chats. Locked chats stay hidden until you unlock, and lock again on their own."}
            </p>
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && chatLock.hasPasscode) void submit(); }}
              placeholder="Passcode"
              className="mb-2 h-11 w-full rounded-2xl border border-[color:var(--glass-border)] bg-surface-glass px-4 text-[15px] outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_45%,transparent)]"
            />
            {!chatLock.hasPasscode ? (
              <>
                <input
                  type="password"
                  inputMode="numeric"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Confirm passcode"
                  className="mb-2 h-11 w-full rounded-2xl border border-[color:var(--glass-border)] bg-surface-glass px-4 text-[15px] outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_45%,transparent)]"
                />
                <p className="mt-1 text-xs font-bold uppercase tracking-wide text-ink-faint">Lock again after</p>
                <RelockPicker value={setupRelock} onChange={setSetupRelock} />
              </>
            ) : null}
            {err ? <p className="mb-2 mt-2 text-[13px] text-danger">{err}</p> : null}
            <Button onClick={() => void submit()} disabled={busy || !passcode.trim()} className="mt-3 w-full">
              {busy ? <Spinner className="border-on-accent" /> : null}
              {chatLock.hasPasscode ? "Unlock" : "Set passcode"}
            </Button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function RelockPicker({ value, onChange }: { value: number; onChange: (minutes: number) => void }) {
  return (
    <div className="mt-1.5 flex gap-1.5">
      {RELOCK_CHOICES.map((c) => (
        <button
          key={c.minutes}
          type="button"
          onClick={() => onChange(c.minutes)}
          className={`flex-1 rounded-full px-2 py-1.5 text-[12px] font-semibold transition-colors ${
            value === c.minutes
              ? "bg-accent text-on-accent"
              : "border border-[color:var(--glass-border)] bg-surface-glass text-ink-soft hover:bg-surface-muted"
          }`}
        >
          {c.label.replace(" minutes", " min").replace("1 hour", "1 hr")}
        </button>
      ))}
    </div>
  );
}
