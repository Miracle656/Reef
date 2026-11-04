/**
 * Walrus blob renewal (#7).
 *
 * Uploads send their Blob objects to `WALRUS_BLOB_OWNER` (publisher
 * `send_object_to`). This job holds that address's key and, on a timer,
 * extends every owned Blob that is within `thresholdEpochs` of expiry so it
 * stays stored `targetEpochsAhead` epochs into the future. It pays in WAL
 * from the same address.
 *
 * It calls `<walrus>::system::extend_blob(&mut System, &mut Blob, u32, &mut Coin<WAL>)`
 * directly instead of using `@mysten/walrus`, whose current releases need
 * `@mysten/sui` >= 2.39 (we're on 2.19; see #18).
 */
import { bcs } from "@mysten/sui/bcs";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { createSuiClient, type UmbraConfig } from "@umbra/core";

/** Walrus testnet shared System object (holds the current package id). */
export const WALRUS_TESTNET_SYSTEM = "0x6c2547cbbc38025cf3adac45f63cb0a8d12ecf777cdc75a4971612bf97fdf6af";
/** Walrus testnet WAL coin type. */
export const WAL_TESTNET_TYPE = "0x8270feb7375eee355e64fdb69c50abb6b5f9393a722883c1cf45f8e26048810a::wal::WAL";
/** Walrus caps storage at 53 epochs ahead. */
export const MAX_EPOCHS_AHEAD = 53;

export interface RenewOptions {
  umbra: UmbraConfig;
  /** bech32 `suiprivkey…` of the blob owner */
  secretKey: string;
  /** renew blobs expiring within this many epochs (default 7) */
  thresholdEpochs?: number;
  /** extend to this many epochs ahead of now (default 50, max 53) */
  targetEpochsAhead?: number;
  /** blobs per transaction (default 50) */
  batchSize?: number;
  dryRun?: boolean;
  /** dry-run only: inspect this address instead of the key's (no key needed) */
  ownerOverride?: string;
  log?: (msg: string) => void;
}

export interface RenewPlanItem {
  blobObjectId: string;
  endEpoch: number;
  extendBy: number;
}

/**
 * Pure planning step: which blobs to extend and by how much. Blobs already
 * expired (endEpoch <= current) can't be extended, so they're skipped.
 */
export function planRenewals(
  blobs: { objectId: string; endEpoch: number }[],
  currentEpoch: number,
  thresholdEpochs: number,
  targetEpochsAhead: number,
): RenewPlanItem[] {
  const target = Math.min(targetEpochsAhead, MAX_EPOCHS_AHEAD);
  const plan: RenewPlanItem[] = [];
  for (const b of blobs) {
    const remaining = b.endEpoch - currentEpoch;
    if (remaining <= 0) continue;
    if (remaining > thresholdEpochs) continue;
    const extendBy = target - remaining;
    if (extendBy > 0) plan.push({ blobObjectId: b.objectId, endEpoch: b.endEpoch, extendBy });
  }
  return plan;
}

function endEpochOf(json: Record<string, unknown> | null): number | null {
  const storage = json?.storage as Record<string, unknown> | undefined;
  const raw = storage?.end_epoch ?? storage?.endEpoch;
  const n = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : NaN;
  return Number.isFinite(n) ? n : null;
}

export async function renewWalrusBlobs(opts: RenewOptions): Promise<{ checked: number; extended: number; digests: string[] }> {
  const log = opts.log ?? ((m: string) => console.log(`[walrus-renew] ${m}`));
  const client = createSuiClient(opts.umbra);
  const keypair = opts.secretKey ? Ed25519Keypair.fromSecretKey(opts.secretKey) : null;
  const owner = opts.dryRun && opts.ownerOverride ? opts.ownerOverride : keypair?.toSuiAddress();
  if (!owner) throw new Error("secretKey required");

  // Resolve the current Walrus package (it's upgradeable) from the System object.
  const { object: system } = await client.getObject({ objectId: WALRUS_TESTNET_SYSTEM, include: { json: true } });
  const pkg = String((system.json as Record<string, unknown> | null)?.package_id ?? "");
  if (!pkg) throw new Error("Walrus System object has no package_id");
  // Types keep the ORIGINAL package id; read it from the System's type.
  const typePkg = system.type.split("::")[0]!;

  // Current Walrus epoch via a read-only simulation of system::epoch.
  const probe = new Transaction();
  probe.setSender(owner);
  probe.moveCall({ target: `${pkg}::system::epoch`, arguments: [probe.object(WALRUS_TESTNET_SYSTEM)] });
  const sim = await client.simulateTransaction({ transaction: probe, include: { commandResults: true }, checksEnabled: false });
  const epochBytes = (sim as unknown as { commandResults?: { returnValues: { bcs: Uint8Array }[] }[] }).commandResults?.[0]
    ?.returnValues[0]?.bcs;
  if (!epochBytes) throw new Error("could not read Walrus epoch");
  const currentEpoch = bcs.u32().parse(epochBytes);

  // Every Blob this address owns.
  const blobs: { objectId: string; endEpoch: number }[] = [];
  let cursor: string | null = null;
  do {
    const page: Awaited<ReturnType<typeof client.listOwnedObjects<{ json: true }>>> = await client.listOwnedObjects({
      owner,
      type: `${typePkg}::blob::Blob`,
      include: { json: true },
      cursor,
      limit: 50,
    });
    for (const o of page.objects) {
      const end = endEpochOf(o.json);
      if (end !== null) blobs.push({ objectId: o.objectId, endEpoch: end });
    }
    cursor = page.hasNextPage ? page.cursor : null;
  } while (cursor);

  const plan = planRenewals(blobs, currentEpoch, opts.thresholdEpochs ?? 7, opts.targetEpochsAhead ?? 50);
  log(`epoch ${currentEpoch}: ${blobs.length} owned blobs, ${plan.length} to extend`);
  if (plan.length === 0 || opts.dryRun) return { checked: blobs.length, extended: 0, digests: [] };

  const { objects: walCoins } = await client.listCoins({ owner, coinType: WAL_TESTNET_TYPE, limit: 50 });
  if (walCoins.length === 0) throw new Error(`${owner} has no WAL to pay for renewals`);

  const digests: string[] = [];
  const size = opts.batchSize ?? 50;
  for (let i = 0; i < plan.length; i += size) {
    const batch = plan.slice(i, i + size);
    const tx = new Transaction();
    tx.setSender(owner);
    const [primary, ...rest] = walCoins.map((c) => tx.object(c.objectId));
    if (rest.length) tx.mergeCoins(primary!, rest);
    const sys = tx.object(WALRUS_TESTNET_SYSTEM);
    for (const item of batch) {
      tx.moveCall({
        target: `${pkg}::system::extend_blob`,
        arguments: [sys, tx.object(item.blobObjectId), tx.pure.u32(item.extendBy), primary!],
      });
    }
    if (!keypair) throw new Error("secretKey required");
    const res = await keypair.signAndExecuteTransaction({ transaction: tx, client });
    const digest = (res as unknown as { Transaction?: { digest: string }; digest?: string }).Transaction?.digest
      ?? (res as unknown as { digest?: string }).digest ?? "?";
    digests.push(digest);
    log(`extended ${batch.length} blobs in ${digest}`);
    // After the first tx the WAL coins were merged; only the primary remains.
    walCoins.splice(1);
  }
  return { checked: blobs.length, extended: plan.length, digests };
}

/** Start the periodic renewal loop (no-op if the key isn't configured). */
export function startWalrusRenewer(umbra: UmbraConfig, secretKey: string | undefined, intervalMs: number): void {
  if (!secretKey) {
    console.log("[walrus-renew] disabled (WALRUS_RENEWER_SECRET_KEY not set)");
    return;
  }
  const run = () =>
    renewWalrusBlobs({ umbra, secretKey }).catch((err) => console.error("[walrus-renew] failed:", err));
  void run();
  setInterval(run, intervalMs);
}
