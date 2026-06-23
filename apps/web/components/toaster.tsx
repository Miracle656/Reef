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
    <div className="pointer-events-none fixed bottom-24 left-1/2 z-[200] flex -translate-x-1/2 flex-col items-center gap-2">
      {items.map((i) => (
        <div
          key={i.id}
          className="rounded-full border border-[color:var(--glass-border)] bg-ink px-4 py-2 text-sm font-medium text-on-ink shadow-[var(--shadow-glass-lg)]"
        >
          {i.msg}
        </div>
      ))}
    </div>,
    document.body,
  );
}
