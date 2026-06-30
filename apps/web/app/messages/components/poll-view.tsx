"use client";

import type { Message, PollState } from "../lib/types";

export function PollView({ message, mine, onVote }: { message: Message; mine: boolean; onVote: (idx: number) => void }) {
  const poll = message.poll as PollState;
  const total = poll.options.reduce((s, o) => s + o.votes, 0);
  const labelColor = mine ? "text-on-accent" : "text-ink";
  const subColor = mine ? "text-on-accent/70" : "text-ink-faint";

  return (
    <div className="min-w-[220px]">
      <div className={`mb-2 font-semibold ${labelColor}`}>{poll.question}</div>
      <div className="space-y-1.5">
        {poll.options.map((o, i) => {
          const pct = total > 0 ? Math.round((o.votes / total) * 100) : 0;
          const voted = poll.myVotes.includes(i);
          return (
            <button
              key={i}
              onClick={() => onVote(i)}
              className={`relative block w-full overflow-hidden rounded-[10px] border px-2.5 py-1.5 text-left text-[13.5px] ${
                voted ? "border-current font-semibold" : "border-transparent"
              } ${mine ? "bg-white/15" : "bg-accent/8"}`}
            >
              <span
                className="absolute inset-y-0 left-0 rounded-[10px] opacity-40"
                style={{ width: `${pct}%`, background: mine ? "rgba(255,255,255,.35)" : "var(--accent)" }}
              />
              <span className={`relative z-10 flex items-center justify-between gap-2 ${labelColor}`}>
                <span className="truncate">{voted ? "● " : ""}{o.text}</span>
                <span className="shrink-0 font-mono text-[11.5px]">{pct}%</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className={`mt-1.5 font-mono text-[11px] ${subColor}`}>
        {total} vote{total === 1 ? "" : "s"} · {poll.allowMultiple ? "multiple" : "single"} choice
      </div>
    </div>
  );
}
