"use client";

import { useState } from "react";
import { SideRail, MobileNav } from "@/components/side-rail";
import { MessagingProvider, useMessaging } from "../lib/provider";
import { ChatList } from "./chat-list";
import { ChatThread } from "./chat-thread";
import { NewChatModal } from "./new-chat-modal";
import { VaultModal } from "./vault-modal";

export function MessagesApp() {
  return (
    <MessagingProvider>
      <Shell />
    </MessagingProvider>
  );
}

function Shell() {
  const { activeChat, openChat } = useMessaging();
  const [modal, setModal] = useState<"direct" | "group" | null>(null);
  const [vaultOpen, setVaultOpen] = useState(false);
  const hasActive = Boolean(activeChat);

  return (
    <div className="mx-auto flex h-dvh max-w-[1320px] gap-6 px-3 py-4 md:px-6">
      <SideRail />

      <section className="flex min-w-0 flex-1 overflow-hidden rounded-[22px] border border-[color:var(--glass-border)] bg-surface-glass backdrop-blur-md">
        {/* list pane: full width on mobile when no chat open; fixed column on desktop */}
        <div
          className={`${hasActive ? "hidden md:flex" : "flex"} h-full w-full flex-col border-[color:var(--glass-border)] md:w-[336px] md:shrink-0 md:border-r`}
        >
          <ChatList onNew={() => setModal("direct")} onNewGroup={() => setModal("group")} onVault={() => setVaultOpen(true)} />
        </div>

        {/* thread pane: full width on mobile when a chat is open */}
        <div className={`${hasActive ? "flex" : "hidden md:flex"} h-full min-w-0 flex-1 flex-col`}>
          <ChatThread onBack={() => openChat(null)} />
        </div>
      </section>

      <MobileNav />

      {modal ? <NewChatModal mode={modal} onClose={() => setModal(null)} /> : null}
      {vaultOpen ? <VaultModal onClose={() => setVaultOpen(false)} /> : null}
    </div>
  );
}
