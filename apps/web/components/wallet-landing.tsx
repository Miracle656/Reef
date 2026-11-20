"use client";

import { PasskeySignIn } from "./passkey-sign-in";

/**
 * The signed-out home page of the wallet-only app (mainnet). The full animated
 * landing describes the social app, which is testnet-only, so it isn't shown
 * here.
 */
export function WalletLanding() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6 py-16">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-ink text-[20px] font-black text-on-ink">R</span>
        <span className="text-[26px] font-black tracking-tight">ReeF</span>
      </div>

      <h1 className="mt-10 text-[44px] font-black leading-[1.02] tracking-tight sm:text-[56px]">
        Your dollars, <span className="text-accent">on Sui.</span>
      </h1>
      <p className="mt-5 text-[17px] leading-relaxed text-ink-soft">
        Hold USDC and USDSUI, and send them with no network fee. Nothing to install: your wallet opens with your fingerprint, face or screen lock.
      </p>

      <div className="mt-8">
        <PasskeySignIn size="lg" />
      </div>

      <ul className="mt-10 space-y-3 text-sm text-ink-soft">
        <li>
          <span className="font-semibold text-ink">Receive</span> with an address or a QR code.
        </li>
        <li>
          <span className="font-semibold text-ink">Send</span> dollars without holding any SUI for fees.
        </li>
        <li>
          <span className="font-semibold text-ink">Review first.</span> Every transfer is checked on the network before you confirm it.
        </li>
      </ul>
    </main>
  );
}
