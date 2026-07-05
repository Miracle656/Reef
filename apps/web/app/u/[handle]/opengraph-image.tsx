import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/**
 * Per-profile share card: the reef template (water + coral bed + REEF logo)
 * with the person's avatar, name, handle and graph stats drawn on top.
 * Rendered on demand when a /u/<handle> link is unfurled by a chat app.
 */

export const alt = "ReeF profile";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL ?? "http://localhost:3001";

type OgProfile = {
  handle: string;
  displayName: string | null;
  bio: string | null;
  avatarBlobId: string | null;
  followersCount: number;
  followingCount: number;
};

async function getProfile(handle: string): Promise<OgProfile | null> {
  try {
    const input = encodeURIComponent(JSON.stringify({ handle }));
    const r = await fetch(`${INDEXER_URL}/trpc/profileByHandle?input=${input}`, { next: { revalidate: 300 } });
    if (!r.ok) return null;
    const j = (await r.json()) as { result?: { data?: OgProfile | null } };
    return j.result?.data ?? null;
  } catch {
    return null;
  }
}

/** Avatar as a data URI — only formats the card renderer can decode (no webp). */
async function getAvatar(blobId: string | null): Promise<string | null> {
  if (!blobId) return null;
  try {
    const r = await fetch(`${INDEXER_URL}/img/${blobId}`);
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    const mime = buf[0] === 0x89 ? "image/png" : buf[0] === 0x47 ? "image/gif" : buf[0] === 0xff ? "image/jpeg" : null;
    return mime ? `data:${mime};base64,${buf.toString("base64")}` : null;
  } catch {
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const profile = await getProfile(handle.toLowerCase());
  const avatar = await getAvatar(profile?.avatarBlobId ?? null);
  const bg = await readFile(join(process.cwd(), "app/u/[handle]/og-bg.jpg"));
  const bgSrc = `data:image/jpeg;base64,${bg.toString("base64")}`;

  const name = profile?.displayName || profile?.handle || handle;
  const label = `@${profile?.handle ?? handle}.reef`;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={bgSrc} width={1200} height={630} style={{ position: "absolute", top: 0, left: 0 }} alt="" />
        <div style={{ display: "flex", alignItems: "center", gap: 44, padding: "0 80px", marginTop: 148 }}>
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatar}
              width={168}
              height={168}
              style={{ borderRadius: 999, border: "6px solid #4DA2FF", objectFit: "cover" }}
              alt=""
            />
          ) : (
            <div
              style={{
                width: 168,
                height: 168,
                borderRadius: 999,
                border: "6px solid #4DA2FF",
                background: "#0F2A44",
                color: "#7CC4FF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 84,
                fontWeight: 700,
              }}
            >
              {name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 800 }}>
            <div style={{ fontSize: 58, fontWeight: 700, color: "#F4F6F9", lineHeight: 1.1 }}>{name}</div>
            <div style={{ fontSize: 30, color: "#4DA2FF", marginTop: 8 }}>{label}</div>
            {profile?.bio ? (
              <div style={{ fontSize: 25, color: "#C9CED6", marginTop: 16, lineHeight: 1.4 }}>
                {profile.bio.length > 90 ? `${profile.bio.slice(0, 90)}…` : profile.bio}
              </div>
            ) : null}
            {profile ? (
              <div style={{ fontSize: 24, color: "#8792A0", marginTop: 18 }}>
                {`${profile.followersCount} followers · ${profile.followingCount} following`}
              </div>
            ) : (
              <div style={{ fontSize: 24, color: "#8792A0", marginTop: 18 }}>on ReeF — the social layer of Sui</div>
            )}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
