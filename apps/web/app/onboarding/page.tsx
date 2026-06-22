"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useCurrentAccount, useCurrentWallet } from "@mysten/dapp-kit";
import { getSession } from "@mysten/enoki";
import { buildOnboardTx, walrus } from "@umbra/core";
import { AppNav } from "@/components/app-nav";
import { Avatar, Button, Card, Input, Spinner, Textarea } from "@/components/ui";
import { SUINS_MINT_URL, umbraConfig } from "@/lib/config";
import { useGasless } from "@/lib/gasless";

/** Decode a JWT payload (UTF-8 safe). */
function decodeJwt(jwt: string): { name?: string; picture?: string; email?: string } {
  const b64 = (jwt.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "===".slice((b64.length + 3) % 4);
  return JSON.parse(decodeURIComponent(escape(atob(padded))));
}

export default function OnboardingPage() {
  const account = useCurrentAccount();
  const router = useRouter();
  const run = useGasless();
  const fileRef = useRef<HTMLInputElement>(null);

  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googlePicture, setGooglePicture] = useState<string | null>(null);
  const { currentWallet } = useCurrentWallet();

  // Pre-fill name + avatar from the signed-in Google account (fully editable).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!currentWallet) return;
      try {
        const session = await getSession(currentWallet);
        const claims = session?.jwt ? decodeJwt(session.jwt) : null;
        if (cancelled || !claims) return;
        if (claims.name) setDisplayName((d) => d || claims.name!);
        if (claims.picture) {
          setGooglePicture(claims.picture);
          setAvatarPreview((p) => p ?? claims.picture!);
        }
      } catch {
        /* no Google claims available */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentWallet]);

  const handleOk = /^[a-z0-9_]{3,20}$/.test(handle);

  async function submit() {
    if (!account) return;
    setBusy(true);
    setError(null);
    try {
      // 1. avatar -> Walrus: custom upload, else the Google picture
      let avatarBlobId: string | null = null;
      let bytes: Uint8Array | null = null;
      if (avatar) {
        bytes = new Uint8Array(await avatar.arrayBuffer());
      } else if (googlePicture) {
        try {
          bytes = new Uint8Array(await (await fetch(googlePicture)).arrayBuffer());
        } catch {
          /* Google image not fetchable (CORS) — proceed without avatar */
        }
      }
      if (bytes) avatarBlobId = (await walrus.upload(umbraConfig, bytes)).blobId;
      // 2. ask backend to mint the SuiNS leaf subname (best-effort)
      let suinsName: string | null = null;
      try {
        const res = await fetch(SUINS_MINT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle, address: account.address }),
        });
        if (res.ok) suinsName = (await res.json()).subname ?? null;
      } catch {
        /* subname optional in Phase 1 */
      }
      // 3. create profile + follow set in one gasless tx
      await run(buildOnboardTx(umbraConfig, { handle, displayName: displayName || handle, bio, avatarBlobId, suinsName }));
      router.push("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Onboarding failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AppNav />
      <main className="mx-auto max-w-md px-4 py-8 pb-28">
        <h1 className="text-2xl font-bold">Create your profile</h1>
        {!account ? (
          <p className="mt-4 text-sm text-ink-soft">Sign in first to claim a handle.</p>
        ) : (
          <Card className="mt-5 space-y-4 p-5">
            <div className="flex items-center gap-4">
              <button type="button" onClick={() => fileRef.current?.click()} className="shrink-0">
                <Avatar name={handle || "u"} src={avatarPreview} size={64} />
              </button>
              <div className="text-sm text-ink-soft">
                <button type="button" onClick={() => fileRef.current?.click()} className="font-medium text-accent">
                  Upload avatar
                </button>
                <p className="text-xs">JPG or PNG</p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setAvatar(f);
                  setAvatarPreview(f ? URL.createObjectURL(f) : null);
                }}
              />
            </div>

            <label className="block">
              <span className="text-sm font-medium">Handle</span>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-ink-faint">@</span>
                <Input
                  value={handle}
                  onChange={(e) => setHandle(e.target.value.toLowerCase())}
                  placeholder="lagoskid"
                  maxLength={20}
                />
              </div>
              {handle && !handleOk ? (
                <span className="mt-1 block text-xs text-danger">3–20 chars, a–z 0–9 _ only</span>
              ) : handle ? (
                <span className="mt-1 block text-xs text-ink-faint">{handle}.umbra.sui</span>
              ) : null}
            </label>

            <label className="block">
              <span className="text-sm font-medium">Display name</span>
              <Input className="mt-1" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={50} />
            </label>

            <label className="block">
              <span className="text-sm font-medium">Bio</span>
              <Textarea className="mt-1" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={280} />
            </label>

            {error ? <p className="text-sm text-danger">{error}</p> : null}

            <Button className="w-full" disabled={!handleOk || busy} onClick={submit}>
              {busy ? <Spinner className="border-on-ink" /> : null}
              Claim @{handle || "handle"}
            </Button>
          </Card>
        )}
      </main>
    </>
  );
}
