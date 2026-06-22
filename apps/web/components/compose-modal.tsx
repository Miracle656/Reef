"use client";

import { createPortal } from "react-dom";
import { ComposeForm } from "./compose-box";

/** Farcaster-style compose modal — the full composer (with tokenize toggle). */
export function ComposeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-ink/40 p-4 pt-16 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-3xl border border-[color:var(--glass-border)] bg-surface p-5 shadow-[var(--shadow-glass-lg)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">New post</h2>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-ink-soft hover:bg-surface-muted" aria-label="Close">
            ✕
          </button>
        </div>
        <ComposeForm withTokenize autoFocus onPosted={onClose} />
      </div>
    </div>,
    document.body,
  );
}
