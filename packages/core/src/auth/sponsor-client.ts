/**
 * Client-side half of the gasless flow. Builds the transaction *kind* bytes,
 * ships them to our sponsor endpoint, gets back sponsored bytes for the user to
 * sign, then submits the signature for execution. The Enoki private key never
 * leaves the server (see `../server.ts`).
 */
import type { ClientWithCoreApi } from "@mysten/sui/client";
import type { Transaction } from "@mysten/sui/transactions";
import { toBase64 } from "@mysten/sui/utils";
import type { SuiNetwork } from "../config";

export interface SponsorRequest {
  transactionKindBytes: string;
  sender: string;
  network: SuiNetwork;
}

export interface SponsorResponse {
  /** base64 sponsored transaction bytes for the user to sign */
  bytes: string;
  digest: string;
}

export interface ExecuteResponse {
  digest: string;
}

/** HTTP error from the sponsor endpoint, carrying the status so retries can
 *  decide (retry 5xx/429; give up on deterministic 4xx). */
export class SponsorHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "SponsorHttpError";
  }
}

/** Best-effort HTTP status off any error shape (SponsorHttpError, EnokiClientError,
 *  fetch Response-like) without importing Enoki here. */
function statusOf(err: unknown): number | undefined {
  if (err instanceof SponsorHttpError) return err.status;
  if (err && typeof err === "object" && "status" in err) {
    const s = (err as { status?: unknown }).status;
    if (typeof s === "number") return s;
  }
  return undefined;
}

/** Whether a failure is worth retrying: transient network blips, server errors
 *  (5xx), and rate limits (429). A 4xx (bad bytes, disallowed target) is
 *  deterministic — retrying just wastes time, so don't. Covers Enoki's
 *  client-side prover failures ("Request to Enoki API failed"), detected
 *  structurally by name/status so core needn't depend on @mysten/enoki. */
function isTransient(err: unknown): boolean {
  const status = statusOf(err);
  if (status !== undefined) return status >= 500 || status === 429;
  // fetch() rejects with a TypeError on network failure — always transient.
  if (err instanceof TypeError) return true;
  // Enoki prover blip without a clean status → treat as transient.
  return err instanceof Error && err.name === "EnokiClientError";
}

/** Run `fn`, retrying transient failures with exponential backoff (+ jitter).
 *  Non-transient errors and the final attempt rethrow immediately. */
async function withRetry<T>(fn: () => Promise<T>, retries = 2, baseMs = 350): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !isTransient(err)) throw err;
      const delay = baseMs * 2 ** attempt + Math.random() * baseMs;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/** Serialize a tx to base64 transaction-kind bytes (no gas/sender attached). */
export async function buildKindBytes(client: ClientWithCoreApi, tx: Transaction): Promise<string> {
  const bytes = await tx.build({ client, onlyTransactionKind: true });
  return toBase64(bytes);
}

/** POST the kind bytes to the sponsor endpoint -> sponsored bytes + digest. */
export async function requestSponsorship(sponsorUrl: string, body: SponsorRequest): Promise<SponsorResponse> {
  const res = await fetch(sponsorUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new SponsorHttpError(res.status, `sponsor request failed: HTTP ${res.status}`);
  return (await res.json()) as SponsorResponse;
}

/** POST the user signature to execute the sponsored tx. */
export async function submitSponsoredSignature(
  sponsorUrl: string,
  body: { digest: string; signature: string },
): Promise<ExecuteResponse> {
  const res = await fetch(`${sponsorUrl.replace(/\/$/, "")}/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new SponsorHttpError(res.status, `sponsor execute failed: HTTP ${res.status}`);
  return (await res.json()) as ExecuteResponse;
}

export interface SponsorAndExecuteParams {
  sponsorUrl: string;
  client: ClientWithCoreApi;
  tx: Transaction;
  sender: string;
  network: SuiNetwork;
  /** sign the sponsored bytes with the user's zkLogin key -> base64 signature */
  sign: (sponsoredBytes: string) => Promise<{ signature: string }>;
}

/** Full client orchestration: build -> sponsor -> sign -> execute.
 *
 * Each step retries transient failures (Enoki prover/API blips, 5xx, network),
 * which is where sporadic "Request to Enoki API failed" errors come from. This
 * is double-execution safe: only `requestSponsorship` mints a fresh sponsored
 * digest — once we hold `sponsored`, sign + execute reuse that FIXED digest, so
 * re-signing/re-submitting the same digest is idempotent (never a second tx). */
export async function sponsorAndExecute(p: SponsorAndExecuteParams): Promise<ExecuteResponse> {
  const transactionKindBytes = await buildKindBytes(p.client, p.tx);
  const sponsored = await withRetry(() =>
    requestSponsorship(p.sponsorUrl, { transactionKindBytes, sender: p.sender, network: p.network }),
  );
  // Signing hits Enoki's zkLogin prover client-side; it's the most flake-prone
  // step, and re-signing the same bytes is deterministic — always retry it.
  const { signature } = await withRetry(() => p.sign(sponsored.bytes), 2, 500);
  // Same sponsored.digest → executing twice is idempotent, so retry is safe.
  return withRetry(() => submitSponsoredSignature(p.sponsorUrl, { digest: sponsored.digest, signature }));
}
