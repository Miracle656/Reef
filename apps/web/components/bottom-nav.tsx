"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useSocialAccount } from "@/lib/account";
import { trpc } from "@/lib/trpc";

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </svg>
  );
}
function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </svg>
  );
}
function MarketsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M7 14l3-4 3 3 4-6" />
    </svg>
  );
}
function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function BottomNav() {
  const account = useSocialAccount();
  const pathname = usePathname();
  const router = useRouter();
  const profile = useQuery({
    queryKey: ["profile-by-addr", account?.address],
    queryFn: () => trpc.profileByAddress.query({ address: account!.address }),
    enabled: Boolean(account),
  });

  if (!account) return null;

  const profileHref = profile.data ? `/u/${profile.data.handle}` : "/onboarding";
  const homeActive = pathname === "/";
  const profileActive = pathname.startsWith("/u/") || pathname === "/onboarding";

  return (
    <nav className="fixed bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border border-[color:var(--glass-border)] bg-surface-glass px-2 py-2 shadow-[var(--shadow-glass-lg)] backdrop-blur-xl">
      <NavTab href="/" label="Home" active={homeActive}>
        <HomeIcon className="h-5 w-5" />
      </NavTab>

      <NavTab href="/trade" label="Trade" active={pathname.startsWith("/trade")}>
        <MarketsIcon className="h-5 w-5" />
      </NavTab>

      <button
        type="button"
        aria-label="New post"
        onClick={() => router.push("/")}
        className="lift mx-1 grid h-11 w-11 place-items-center rounded-full bg-accent text-on-accent shadow-[var(--shadow-glass)]"
      >
        <PlusIcon className="h-5 w-5" />
      </button>

      <NavTab href={profileHref} label="Profile" active={profileActive}>
        <UserIcon className="h-5 w-5" />
      </NavTab>
    </nav>
  );
}

function NavTab({ href, label, active, children }: { href: string; label: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`flex flex-col items-center gap-0.5 rounded-full px-5 py-1.5 text-[11px] font-medium transition-colors ${
        active ? "bg-ink text-on-ink" : "text-ink-soft hover:text-ink"
      }`}
    >
      {children}
      <span>{label}</span>
    </Link>
  );
}
