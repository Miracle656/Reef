"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { SecureAccount } from "@/components/secure-account";
import { PASSKEY_RECOVERY } from "@/lib/config";

/** Step after onboarding (#10): offer a recovery passkey. Always skippable. */
export default function SecureAccountStep() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (!PASSKEY_RECOVERY) router.replace("/");
    else setMounted(true);
  }, [router]);

  return (
    <AppShell title="Secure your account">
      <p className="text-sm text-ink-soft">
        One last thing. It takes a few seconds and means you can&apos;t get locked out.
      </p>
      <div className="mt-5">{mounted ? <SecureAccount onAdded={() => router.push("/")} /> : null}</div>
      <Link href="/" className="mt-5 inline-block text-sm font-medium text-ink-faint hover:underline">
        Skip for now
      </Link>
    </AppShell>
  );
}
