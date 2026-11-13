"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "@/components/toaster";
import { SideRail, MobileNav } from "@/components/side-rail";
import { MessagingProvider, useMessaging } from "../lib/provider";
import { ChatList } from "./chat-list";
import { ChatThread } from "./chat-thread";
import { NewChatModal } from "./new-chat-modal";
import { ChatLockModal } from "./chat-lock-modal";

export function MessagesApp() {
  return (
    <MessagingProvider>
      <Shell />
    </MessagingProvider>
  );
}

function Shell() {
  const { activeChat, openChat, me, startDirect } = useMessaging();
  const [payIntent, setPayIntent] = useState<{ to: string; postId?: string } | null>(null);
  const deepLinked = useRef(false);

  // Deep link from a post's Tip button (#13): /messages?to=0x..&pay=1&post=0x..
  // opens the DM with the author and pops the pay sheet. Read once, then cleared.
  useEffect(() => {
    if (deepLinked.current || !me) return;
    const q = new URLSearchParams(window.location.search);
    const to = q.get("to");
    if (!to || !/^0x[0-9a-fA-F]{1,64}$/.test(to)) return;
    deepLinked.current = true;
    window.history.replaceState(null, "", "/messages");
    startDirect(to)
      .then(() => {
        if (q.get("pay") === "1") setPayIntent({ to, postId: q.get("post") ?? undefined });
      })
      .catch(() => toast("Couldn't open that chat"));
  }, [me, startDirect]);
  const [modal, setModal] = useState<"direct" | "group" | null>(null);
  const [lockOpen, setLockOpen] = useState(false);
  const hasActive = Boolean(activeChat);

  return (
    <div className="mx-auto flex h-dvh max-w-[1320px] gap-6 px-3 py-4 md:px-6">
      <SideRail />

      <section className="flex min-w-0 flex-1 overflow-hidden rounded-[22px] border border-[color:var(--glass-border)] bg-surface-glass backdrop-blur-md">
        {/* list pane: full width on mobile when no chat open; fixed column on desktop */}
        <div
          className={`${hasActive ? "hidden md:flex" : "flex"} h-full w-full flex-col border-[color:var(--glass-border)] md:w-[336px] md:shrink-0 md:border-r`}
        >
          <ChatList onNew={() => setModal("direct")} onNewGroup={() => setModal("group")} onLock={() => setLockOpen(true)} />
        </div>

        {/* thread pane: full width on mobile when a chat is open */}
        <div className={`${hasActive ? "flex" : "hidden md:flex"} h-full min-w-0 flex-1 flex-col`}>
          <ChatThread onBack={() => openChat(null)} payIntent={payIntent} onPayIntentDone={() => setPayIntent(null)} />
        </div>
      </section>

      {/* hidden while a thread is open on mobile — it would cover the composer */}
      {!hasActive ? <MobileNav /> : null}

      {modal ? <NewChatModal mode={modal} onClose={() => setModal(null)} /> : null}
      {lockOpen ? <ChatLockModal onClose={() => setLockOpen(false)} /> : null}
    </div>
  );
}
