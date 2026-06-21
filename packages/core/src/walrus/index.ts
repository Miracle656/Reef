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
}

type WalrusPublisherResponse = {
  newlyCreated?: { blobObject?: { blobId?: string } };
  alreadyCertified?: { blobId?: string };
  blobObject?: { blobId?: string };
  blobId?: string;
};

function extractBlobId(data: WalrusPublisherResponse): { blobId: string; newlyCreated: boolean } | null {
  const fresh = data.newlyCreated?.blobObject?.blobId;
  if (fresh) return { blobId: fresh, newlyCreated: true };
  const certified = data.alreadyCertified?.blobId ?? data.blobObject?.blobId ?? data.blobId;
  if (certified) return { blobId: certified, newlyCreated: false };
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
    const endpoint = `${base.replace(/\/$/, "")}?epochs=${epochs}`;
    try {
      const res = await fetch(endpoint, { method: "PUT", body: data });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const json = (await res.json()) as WalrusPublisherResponse;
      const found = extractBlobId(json);
      if (!found) throw new Error("blobId missing in Walrus response");
      return { blobId: found.blobId, newlyCreated: found.newlyCreated, endpoint };
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
 * extends the on-chain Blob object's `end_epoch` and requires the WalrusClient
 * SDK (`@mysten/walrus` `WalrusClient.extendBlob`) or an equivalent Move call —
 * it is NOT exposed over the HTTP publisher. Implemented in the indexer's
 * scheduled renewal job (it holds the funding key), not in this client module.
 *
 * Tracking: see CLAUDE.md TODO "Walrus epoch renewal job".
 */
export const RENEWAL_NOTE =
  "Blob renewal runs server-side via @mysten/walrus WalrusClient.extendBlob; see indexer renewal job.";
