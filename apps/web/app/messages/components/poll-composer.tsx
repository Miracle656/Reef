"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui";
import { useMessaging } from "../lib/provider";
import { PlusIcon, XIcon } from "./icons";

export function PollComposer({ chatId, onClose }: { chatId: string; onClose: () => void }) {
  const { createPoll } = useMessaging();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multi, setMulti] = useState(false);
  const [busy, setBusy] = useState(false);

  const valid = question.trim() && options.filter((o) => o.trim()).length >= 2;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    await createPoll(chatId, question.trim(), options.map((o) => o.trim()).filter(Boolean), multi);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-start justify-center bg-ink/40 p-4 pt-16 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl border border-[color:var(--glass-border)] bg-surface p-5 shadow-[var(--shadow-glass-lg)]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">New poll</h2>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full text-ink-soft hover:bg-surface-muted"><XIcon /></button>
        </div>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a question"
          className="mb-3 h-11 w-full rounded-2xl border border-[color:var(--glass-border)] bg-surface-glass px-4 text-[15px] outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_45%,transparent)]"
        />
        <div className="space-y-2">
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={o}
                onChange={(e) => setOptions((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder={`Option ${i + 1}`}
                className="h-10 w-full rounded-xl border border-[color:var(--glass-border)] bg-surface-glass px-3.5 text-[14px] outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_45%,transparent)]"
              />
              {options.length > 2 ? (
                <button onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))} aria-label="Remove" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-faint hover:bg-surface-muted">
                  <XIcon className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
        {options.length < 6 ? (
          <button onClick={() => setOptions((p) => [...p, ""])} className="mt-2 flex items-center gap-1.5 text-[13.5px] font-semibold text-accent">
            <PlusIcon className="h-4 w-4" /> Add option
          </button>
        ) : null}
        <label className="mt-3 flex items-center gap-2 text-[14px]">
          <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} className="h-4 w-4 accent-[color:var(--accent)]" />
          Allow multiple answers
        </label>
        <Button onClick={() => void submit()} disabled={!valid || busy} className="mt-4 w-full">Create poll</Button>
      </div>
    </div>,
    document.body,
  );
}
