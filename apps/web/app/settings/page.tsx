"use client";

import { useEffect, useState } from "react";
import { AppNav } from "@/components/app-nav";
import { LinkWallet } from "@/components/link-wallet";

export default function SettingsPage() {
  // Render wallet-dependent UI only after mount (dapp-kit hooks are client-only).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <>
      <AppNav />
      <main className="mx-auto max-w-md px-4 py-6 pb-28">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-ink-soft">Manage your account.</p>
        <div className="mt-5 space-y-4">{mounted ? <LinkWallet /> : null}</div>
      </main>
    </>
  );
}
