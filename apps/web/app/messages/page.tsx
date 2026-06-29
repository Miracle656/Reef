"use client";

import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui";

export default function MessagesPage() {
  return (
    <AppShell title="Messages">
      <Card className="mt-1 p-8 text-center">
        <p className="text-3xl">✉️</p>
        <p className="mt-3 font-semibold">Coming soon</p>
        <p className="mt-1 text-sm text-ink-soft">
          Direct messages &amp; group chat — Phase 3, on the Sui Stack Messaging SDK (Seal-managed keys, Walrus
          attachments).
        </p>
      </Card>
    </AppShell>
  );
}
