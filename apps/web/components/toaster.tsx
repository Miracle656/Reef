"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Toast = { id: number; msg: string };
let listeners: ((msg: string) => void)[] = [];

/** Fire a transient toast from anywhere. */
export function toast(msg: string) {
  listeners.forEach((l) => l(msg));
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const l = (msg: string) => {
      const id = Date.now() + Math.random();
      setItems((i) => [...i, { id, msg }]);
      setTimeout(() => setItems((i) => i.filter((x) => x.id !== id)), 3000);
    };
    listeners.push(l);
    return () => {
      listeners = listeners.filter((x) => x !== l);
    };
  }, []);

  if (!mounted) return null;
  return createPortal(
    <div className="pointer-events-none fixed bottom-24 left-1/2 z-[200] flex w-[min(92vw,26rem)] -translate-x-1/2 flex-col items-center gap-2">
      {items.map((i) => {
        const ok = i.msg.includes("✓");
        return (
          <div
            key={i.id}
            className="reef-toast flex w-full items-center gap-3 rounded-2xl border border-[color:var(--glass-border)] bg-surface-glass px-4 py-3 text-sm font-medium text-ink shadow-[var(--shadow-glass-lg)] backdrop-blur-xl"
          >
            <span
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-white"
              style={{ background: ok ? "#16c784" : "var(--accent)" }}
            >
              {ok ? (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 8v5M12 16h.01" />
                </svg>
              )}
            </span>
            <span className="leading-snug">{i.msg.replace(/\s*✓\s*$/, "")}</span>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
