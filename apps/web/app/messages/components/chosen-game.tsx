"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui";
import { useMessaging } from "../lib/provider";
import type { Chat } from "../lib/types";
import { TargetIcon, XIcon } from "./icons";

const CATEGORIES = ["mild", "spicy"];
const MODES: { key: "dare" | "truth" | "both"; label: string }[] = [
  { key: "dare", label: "Dares" },
  { key: "truth", label: "Truths" },
  { key: "both", label: "Both" },
];

/** Full-screen "Chosen" party-game overlay. State is driven by the adapter. */
export function ChosenGame({ chat, onClose }: { chat: Chat; onClose: () => void }) {
  const { state, me, chosen } = useMessaging();
  const game = state.chosenGames[chat.id];
  const [mode, setMode] = useState<"dare" | "truth" | "both">("dare");
  const [category, setCategory] = useState("mild");

  useEffect(() => {
    void chosen.sync(chat.id);
  }, [chat.id, chosen]);

  const nameOf = (id: string) =>
    id === me?.id ? "You" : chat.participants.find((p) => p.id === id)?.displayName || chat.participants.find((p) => p.id === id)?.username || "someone";

  const iAmChosen = game?.chosenId === me?.id;
  const iAmInitiator = game?.initiatorId === me?.id;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex flex-col bg-ink text-on-ink">
      <div className="flex items-center justify-between p-4">
        <span className="flex items-center gap-2 font-bold"><TargetIcon className="h-[18px] w-[18px]" /> Chosen {game ? `· round ${game.round}` : ""}</span>
        <button onClick={() => { if (game && iAmInitiator) void chosen.end(chat.id); onClose(); }} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full text-on-ink/80 hover:bg-white/10"><XIcon className="h-5 w-5" /></button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
        {!game ? (
          // ── start config ──
          <>
            <h2 className="text-2xl font-black">Start a round</h2>
            <div className="flex gap-2">
              {MODES.map((m) => (
                <button key={m.key} onClick={() => setMode(m.key)} className={`rounded-full px-4 py-2 text-sm font-semibold ${mode === m.key ? "bg-accent text-on-accent" : "bg-white/10"}`}>{m.label}</button>
              ))}
            </div>
            <div className="flex gap-2">
              {CATEGORIES.map((c) => (
                <button key={c} onClick={() => setCategory(c)} className={`rounded-full px-4 py-2 text-sm font-semibold capitalize ${category === c ? "bg-accent text-on-accent" : "bg-white/10"}`}>{c}</button>
              ))}
            </div>
            <Button onClick={() => void chosen.start(chat.id, { mode, category })} className="mt-2">Start</Button>
            <p className="max-w-xs text-sm text-on-ink/60">Everyone taps in, one player is chosen at random, then picks a hidden {mode === "truth" ? "truth" : "dare"} for the group.</p>
          </>
        ) : game.phase === "arming" ? (
          // ── tap circle ──
          <>
            <h2 className="text-xl font-bold">Everyone tap in</h2>
            <button
              onClick={() => void chosen.tap(chat.id)}
              className="grid h-44 w-44 place-items-center rounded-full bg-gradient-to-tr from-accent to-aqua text-xl font-black text-on-accent transition-transform active:scale-95"
            >
              TAP
            </button>
            <p className="text-sm text-on-ink/60">{game.tapped.length}/{game.players.length} tapped</p>
          </>
        ) : game.phase === "pulsing" ? (
          // ── choosing ──
          <>
            <h2 className="text-xl font-bold">Choosing…</h2>
            <span className="grid h-44 w-44 animate-ping place-items-center rounded-full bg-accent/40" />
          </>
        ) : (
          // ── revealed ──
          <>
            <p className="text-sm uppercase tracking-widest text-on-ink/60">Chosen</p>
            <h2 className="text-3xl font-black text-mint">{nameOf(game.chosenId ?? "")}</h2>
            {!game.revealedText ? (
              iAmChosen ? (
                <>
                  <p className="text-sm text-on-ink/70">Pick a hidden number</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} onClick={() => void chosen.pick(chat.id, n - 1)} className="grid h-14 w-14 place-items-center rounded-2xl bg-white/10 text-xl font-bold hover:bg-white/20">{n}</button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-on-ink/60">Waiting for {nameOf(game.chosenId ?? "")} to pick…</p>
              )
            ) : (
              <>
                <div className="max-w-sm rounded-3xl bg-white/10 p-5 text-lg font-semibold">
                  <span className="mb-1 block text-xs uppercase tracking-widest text-on-ink/50">{game.revealedKind}</span>
                  {game.revealedText}
                </div>
                {iAmInitiator ? (
                  <div className="mt-2 flex gap-2">
                    <Button onClick={() => void chosen.next(chat.id)}>Next round</Button>
                    <Button variant="outline" onClick={() => { void chosen.end(chat.id); onClose(); }} className="bg-white/5">End game</Button>
                  </div>
                ) : (
                  <p className="text-sm text-on-ink/60">Waiting for the host to continue…</p>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
