/**
 * Walrus media storage via the HTTP publisher/aggregator (browser- and
 * mobile-friendly: one PUT per blob instead of fanning out to storage nodes).
 */
import type { UmbraConfig, WalrusConfig } from "../config";

export interface UploadResult {
  blobId: string;
  /** true if Walrus had to store it fresh (vs already-certified dedupe) */
  newlyCreated: boolean;
  endpoint: string;
  /** on-chain Blob object id (only for newly created blobs) */
  blobObjectId?: string;
  /** Walrus epoch at which the stored copy expires, when the publisher reports it */
  endEpoch?: number;
}

type WalrusPublisherResponse = {
  newlyCreated?: { blobObject?: { id?: string; blobId?: string; storage?: { endEpoch?: number } } };
  alreadyCertified?: { blobId?: string; endEpoch?: number };
  blobObject?: { blobId?: string };
  blobId?: string;
};

type Extracted = Omit<UploadResult, "endpoint">;

export function extractBlobId(data: WalrusPublisherResponse): Extracted | null {
  const obj = data.newlyCreated?.blobObject;
  if (obj?.blobId) {
    return { blobId: obj.blobId, newlyCreated: true, blobObjectId: obj.id, endEpoch: obj.storage?.endEpoch };
  }
  const certified = data.alreadyCertified?.blobId ?? data.blobObject?.blobId ?? data.blobId;
  if (certified) return { blobId: certified, newlyCreated: false, endEpoch: data.alreadyCertified?.endEpoch };
  return null;
}

/** Upload bytes to Walrus, trying publishers in order until one succeeds. */
export async function uploadBlob(
  walrus: WalrusConfig,
  data: Uint8Array | Blob,
  opts: { epochs?: number } = {},
): Promise<UploadResult> {
  const epochs = opts.epochs ?? walrus.defaultEpochs;
  let lastError: unknown;

  for (const base of walrus.publishers) {
    const owner = walrus.blobOwner ? `&send_object_to=${encodeURIComponent(walrus.blobOwner)}` : "";
    const endpoint = `${base.replace(/\/$/, "")}?epochs=${epochs}${owner}`;
    try {
      // Wrap in a Blob so the body type is portable across node + DOM lib
      // typings. Re-allocating into a fresh ArrayBuffer-backed array avoids the
      // TS 5.7 `Uint8Array<ArrayBufferLike>` vs `BlobPart` mismatch under DOM lib.
      const body = data instanceof Blob ? data : new Blob([new Uint8Array(data)]);
      const res = await fetch(endpoint, { method: "PUT", body });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const json = (await res.json()) as WalrusPublisherResponse;
      const found = extractBlobId(json);
      if (!found) throw new Error("blobId missing in Walrus response");
      return { ...found, endpoint };
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`All Walrus publishers failed. Last error: ${String(lastError)}`);
}

/** Public read URL for a blob id (first aggregator). */
export function blobUrl(walrus: WalrusConfig, blobId: string): string {
  return `${walrus.aggregators[0]!.replace(/\/$/, "")}/${blobId}`;
}

/** Fetch a blob's bytes, trying aggregators in order. */
export async function readBlob(walrus: WalrusConfig, blobId: string): Promise<Uint8Array> {
  let lastError: unknown;
  for (const base of walrus.aggregators) {
    try {
      const res = await fetch(`${base.replace(/\/$/, "")}/${blobId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`All Walrus aggregators failed. Last error: ${String(lastError)}`);
}

export const upload = (cfg: UmbraConfig, data: Uint8Array | Blob, opts?: { epochs?: number }) =>
  uploadBlob(cfg.walrus, data, opts);
export const urlFor = (cfg: UmbraConfig, blobId: string) => blobUrl(cfg.walrus, blobId);

/**
 * Epoch renewal: Walrus blobs expire after their stored epoch count. Renewal
 * is a Move call (`<walrus>::system::extend_blob`) by the Blob's owner, so
 * uploads send the Blob to `walrus.blobOwner` and the indexer's renewal job
 * (`services/indexer/src/walrus-renew.ts`, holds that key + WAL) extends blobs
 * nearing expiry. Not exposed over the HTTP publisher.
 */
export const RENEWAL_NOTE =
  "Blob renewal runs server-side in services/indexer/src/walrus-renew.ts (system::extend_blob).";
