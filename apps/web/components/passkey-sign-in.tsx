"use client";

import { useEffect, useRef, useState } from "react";
import { passkey } from "@umbra/core";
import { passkeyBlocker, passkeyRpId, type PasskeyBlocker } from "@/lib/passkey";
import { passkeyWallet, walletPasskeyProvider } from "@/lib/passkey-wallet";
import { walletClient } from "@/lib/wallet";
import { toast } from "./toaster";
import { Button, Spinner, type ButtonProps } from "./ui";

type Step =
  | { name: "choose" }
  /** The passkey exists on the device. It still has to prove it can sign.
   *  `signature` is kept when only the network check has to be repeated. */
  | { name: "made"; wallet: passkey.PasskeyWallet; signature?: string }
  /** The first of the two prompts that find an existing wallet is done. */
  | { name: "picked" };

type Doing = "create" | "check" | "find" | "open";

/**
 * Sign-in for the wallet-only app: make a wallet, or open the one a passkey on
 * this device already belongs to.
 *
 * Each passkey prompt gets its own tap. Browsers only allow a prompt straight
 * after one (Safari is strict about it), so the second prompt of a flow is
 * never fired automatically after the first.
 */
export function PasskeySignIn({ size = "md" }: { size?: ButtonProps["size"] }) {
  // Whether passkeys can work here depends on the browser and the page's address.
  const [blocker, setBlocker] = useState<PasskeyBlocker | null | "unknown">("unknown");
  useEffect(() => setBlocker(passkeyBlocker()), []);

  const [step, setStep] = useState<Step>({ name: "choose" });
  const [doing, setDoing] = useState<Doing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const search = useRef<passkey.PasskeySearch | null>(null);

  async function run(what: Doing, wording: passkey.PasskeyStep, work: () => Promise<void>) {
    setError(null);
    setDoing(what);
    try {
      await work();
    } catch (e) {
      setError(passkey.describePasskeyError(e, wording).message);
    } finally {
      setDoing(null);
    }
  }

  const create = () =>
    run("create", "create", async () => {
      setStep({ name: "made", wallet: await passkey.createPasskey(walletPasskeyProvider()) });
    });

  const check = (made: Extract<Step, { name: "made" }>) =>
    run("check", "check", async () => {
      if (!walletClient) throw new passkey.PasskeyError("failed", "The wallet isn't switched on.");
      // A signature we already hold can be checked again without another prompt.
      const signature = made.signature ?? (await passkey.signPasskeyCheck(made.wallet, walletPasskeyProvider()));
      try {
        await passkey.confirmPasskey(walletClient, made.wallet, signature);
      } catch (e) {
        const networkOnly = e instanceof passkey.PasskeyError && e.code === "network";
        setStep({ name: "made", wallet: made.wallet, signature: networkOnly ? signature : undefined });
        throw e;
      }
      // Only now is the address safe to receive money at.
      passkeyWallet.remember(made.wallet);
      toast("Your wallet is ready ✓");
    });

  const find = () =>
    run("find", "find", async () => {
      const started = passkey.findPasskey(walletPasskeyProvider());
      await started.first();
      search.current = started;
      setStep({ name: "picked" });
    });

  const open = () =>
    run("open", "find", async () => {
      if (!search.current) throw new passkey.PasskeyError("failed", "Start again.");
      passkeyWallet.remember(await search.current.second());
    });

  function startOver() {
    search.current = null;
    setError(null);
    setStep({ name: "choose" });
  }

  if (blocker === "unknown") return <div className="h-11" aria-hidden />;
  if (blocker === "unsupported") {
    return (
      <p className="text-sm leading-relaxed text-ink-soft">
        This browser can&apos;t use passkeys. Open ReeF in an up-to-date Chrome, Safari or Edge, on a phone or computer that has a screen lock.
      </p>
    );
  }
  if (blocker === "no-site") {
    return (
      <Button variant="outline" size={size} disabled title="Set NEXT_PUBLIC_PASSKEY_RP_ID to the web address wallets belong to">
        Wallets open soon
      </Button>
    );
  }
  if (blocker === "wrong-site") {
    const site = passkeyRpId();
    return (
      <p className="text-sm leading-relaxed text-ink-soft">
        Wallets live at{" "}
        <a href={`https://${site}`} className="font-semibold text-accent hover:underline">
          {site}
        </a>
        . Open ReeF there to create or open yours.
      </p>
    );
  }

  const busy = doing !== null;
  const spinner = <Spinner className="border-on-ink" />;

  if (step.name === "made") {
    return (
      <div className="space-y-3">
        <h3 className="text-[15px] font-bold">Passkey saved</h3>
        <p className="text-sm leading-relaxed text-ink-soft">
          One more tap checks that it works, before any money goes in. Keep this passkey: if it is ever deleted, nobody can open the wallet again,
          not even ReeF.
        </p>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button size={size} disabled={busy} onClick={() => check(step)}>
            {doing === "check" ? spinner : null}
            {doing === "check" ? "Checking…" : step.signature ? "Try the check again" : "Check my passkey"}
          </Button>
          <button type="button" disabled={busy} onClick={startOver} className="text-sm font-medium text-ink-soft hover:text-ink disabled:opacity-50">
            Start over
          </button>
        </div>
      </div>
    );
  }

  if (step.name === "picked") {
    return (
      <div className="space-y-3">
        <h3 className="text-[15px] font-bold">Passkey found</h3>
        <p className="text-sm leading-relaxed text-ink-soft">
          Confirm with the same passkey once more to open your wallet. It takes two taps because ReeF keeps nothing about you: the second one pins
          down which wallet is yours.
        </p>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button size={size} disabled={busy} onClick={open}>
            {doing === "open" ? spinner : null}
            {doing === "open" ? "Opening…" : "Open my wallet"}
          </Button>
          <button type="button" disabled={busy} onClick={startOver} className="text-sm font-medium text-ink-soft hover:text-ink disabled:opacity-50">
            Start over
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <Button size={size} disabled={busy} onClick={create}>
          {doing === "create" ? spinner : null}
          Create my wallet
        </Button>
        <Button size={size} variant="outline" disabled={busy} onClick={find}>
          {doing === "find" ? <Spinner /> : null}
          I already have a wallet
        </Button>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <p className="text-[13px] leading-relaxed text-ink-faint">
        Your wallet opens with a passkey: your fingerprint, face or screen lock. No password, and no seed phrase to write down.
      </p>
      <p className="text-[13px] leading-relaxed text-ink-soft">
        <span className="font-semibold text-ink">Made a wallet on another phone or computer?</span> Choose &ldquo;I already have a wallet&rdquo; and use
        that device&apos;s passkey. Creating one here makes a second, empty wallet.
      </p>
    </div>
  );
}
