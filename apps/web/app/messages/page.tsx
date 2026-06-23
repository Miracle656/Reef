"use client";

import { AppNav } from "@/components/app-nav";
import { Card } from "@/components/ui";

export default function MessagesPage() {
  return (
    <>
      <AppNav />
      <main className="mx-auto max-w-2xl px-4 py-6 pb-28">
        <h1 className="text-2xl font-semibold">Messages</h1>
        <Card className="mt-5 p-8 text-center">
          <p className="text-3xl">✉️</p>
          <p className="mt-3 font-semibold">Coming soon</p>
          <p className="mt-1 text-sm text-ink-soft">
            Direct messages &amp; group chat — Phase 3, on the Sui Stack Messaging SDK (Seal-managed keys, Walrus
            attachments).
          </p>
        </Card>
      </main>
    </>
  );
}
