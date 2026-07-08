import { ImageResponse } from "next/og";
import { OG_BG } from "../../u/[handle]/og-bg";

/**
 * Per-post share card: the reef template with the author's avatar/handle and
 * the post text drawn on top. Rendered when a /p/<id> link is unfurled.
 */

export const alt = "ReeF post";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL ?? "http://localhost:3001";

type OgPost = { author: string; text: string; media: string[]; likeCount: number; replyCount: number };
type OgProfile = { handle: string; displayName: string | null; avatarBlobId: string | null };

async function rpc<T>(proc: string, input: unknown): Promise<T | null> {
  try {
    const r = await fetch(`${INDEXER_URL}/trpc/${proc}?input=${encodeURIComponent(JSON.stringify(input))}`, {
      next: { revalidate: 300 },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { result?: { data?: T | null } };
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

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await rpc<OgPost>("post", { id });
  const author = post ? await rpc<OgProfile>("profileByAddress", { address: post.author }) : null;
  const avatar = await getAvatar(author?.avatarBlobId ?? null);

  const name = author?.displayName || author?.handle || "Someone";
  const label = author ? `@${author.handle}.reef` : "on ReeF";
  const raw = post?.text?.trim() || (post?.media?.length ? "Shared a photo 🖼" : "A post on the reef");
  const text = raw.length > 220 ? `${raw.slice(0, 220)}…` : raw;
  const big = text.length <= 90;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={OG_BG} width={1200} height={630} style={{ position: "absolute", top: 0, left: 0 }} alt="" />
        <div style={{ display: "flex", flexDirection: "column", padding: "150px 80px 0", width: 1200 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} width={72} height={72} style={{ borderRadius: 999, border: "4px solid #4DA2FF", objectFit: "cover" }} alt="" />
            ) : (
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 999,
                  border: "4px solid #4DA2FF",
                  background: "#0F2A44",
                  color: "#7CC4FF",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 36,
                  fontWeight: 700,
                }}
              >
                {name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 32, fontWeight: 700, color: "#F4F6F9" }}>{name}</div>
              <div style={{ fontSize: 24, color: "#4DA2FF" }}>{label}</div>
            </div>
          </div>
          <div style={{ fontSize: big ? 46 : 34, fontWeight: 600, color: "#EDF1F6", lineHeight: 1.35, marginTop: 34, maxWidth: 1040 }}>
            {text}
          </div>
          {post ? (
            <div style={{ fontSize: 24, color: "#8792A0", marginTop: 28 }}>
              {`♥ ${post.likeCount} · ${post.replyCount} ${post.replyCount === 1 ? "reply" : "replies"}`}
            </div>
          ) : null}
        </div>
      </div>
    ),
    size,
  );
}
