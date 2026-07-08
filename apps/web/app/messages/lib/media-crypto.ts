/**
 * End-to-end encrypted chat media.
 *
 * Chat text is E2E encrypted by the messaging SDK, but Walrus blobs are public
 * — so media is AES-GCM encrypted on the device before upload, and the key+iv
 * ride INSIDE the encrypted message envelope as a `reef-enc://` URL. Walrus
 * (and our image proxy) only ever see ciphertext; receivers decrypt locally.
 */

import { useEffect, useState } from "react";
import { walrus } from "@umbra/core";
import { INDEXER_URL, umbraConfig } from "@/lib/config";
import type { UploadResult } from "./messaging";

const PREFIX = "reef-enc://";

export function isEncryptedMediaUrl(url: string | undefined): boolean {
  return Boolean(url?.startsWith(PREFIX));
}

function b64u(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64u(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function encryptAndUpload(file: File): Promise<UploadResult> {
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, await file.arrayBuffer()));
  const { blobId } = await walrus.upload(umbraConfig, cipher);
  return {
    url: `${PREFIX}${blobId}#${b64u(keyBytes)}.${b64u(iv)}`,
    name: file.name,
    size: file.size,
    mimeType: file.type || "application/octet-stream",
  };
}

// Decrypted object-URLs, keyed by the reef-enc URL — decrypt once per session.
const resolved = new Map<string, Promise<string>>();

/** Plain URLs pass through; reef-enc:// URLs fetch + decrypt to an object URL. */
export function resolveMediaUrl(url: string, mime?: string): Promise<string> {
  if (!url.startsWith(PREFIX)) return Promise.resolve(url);
  let p = resolved.get(url);
  if (!p) {
    p = decryptToObjectUrl(url, mime);
    p.catch(() => resolved.delete(url)); // let a failed fetch retry later
    resolved.set(url, p);
  }
  return p;
}

async function decryptToObjectUrl(url: string, mime?: string): Promise<string> {
  const [blobId, frag] = url.slice(PREFIX.length).split("#");
  const [kb, ivb] = (frag ?? "").split(".");
  if (!blobId || !kb || !ivb) throw new Error("malformed encrypted media url");
  // The indexer's blob proxy serves the ciphertext bytes (content-type is
  // irrelevant — we only read the body).
  const r = await fetch(`${INDEXER_URL}/img/${blobId}`);
  if (!r.ok) throw new Error(`media fetch failed (${r.status})`);
  const cipher = await r.arrayBuffer();
  const key = await crypto.subtle.importKey("raw", fromB64u(kb), "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64u(ivb) }, key, cipher);
  return URL.createObjectURL(new Blob([plain], { type: mime || "application/octet-stream" }));
}

/** Resolve a message's media URL for rendering (null while decrypting). */
export function useMediaUrl(url?: string, mime?: string): string | null {
  const [out, setOut] = useState<string | null>(url && !url.startsWith(PREFIX) ? url : null);
  useEffect(() => {
    if (!url) return;
    let on = true;
    resolveMediaUrl(url, mime)
      .then((u) => {
        if (on) setOut(u);
      })
      .catch(() => {});
    return () => {
      on = false;
    };
  }, [url, mime]);
  return out;
}

/** Decrypt (if needed) and trigger a browser download. */
export async function downloadMedia(url: string, name?: string, mime?: string): Promise<void> {
  const u = await resolveMediaUrl(url, mime);
  const a = document.createElement("a");
  a.href = u;
  a.download = name || "file";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
