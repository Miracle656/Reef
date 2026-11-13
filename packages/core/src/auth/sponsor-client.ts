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

// ---- mode switch ------------------------------------------------------------

/** Who pays gas: Enoki (default) or ReeF's own sponsor key (`/sponsor/self`). */
export type SponsorMode = "enoki" | "self";

/** Reads `*_SPONSOR_MODE` env values; anything but `"self"` means Enoki. */
export function parseSponsorMode(value: string | undefined): SponsorMode {
  return value?.trim().toLowerCase() === "self" ? "self" : "enoki";
}

/** Run a gasless transaction through whichever sponsor `mode` selects. The
 *  `sign` callback is the same for both: sign the final bytes as the sender. */
export function executeGasless(mode: SponsorMode, p: SponsorAndExecuteParams): Promise<ExecuteResponse> {
  return mode === "self" ? selfSponsorAndExecute(p) : sponsorAndExecute(p);
}

// ---- self-run sponsor (#11): address-balance gas, user signs first ---------

export interface SelfSponsorInfo {
  /** address whose SUI address balance pays the gas */
  sponsorAddress: string;
  /** per-transaction budget cap (MIST, decimal string) */
  maxGasBudget: string;
}

/** `GET {sponsorUrl}/self` → the self-run sponsor's address + budget cap. */
export async function getSelfSponsorInfo(sponsorUrl: string): Promise<SelfSponsorInfo> {
  const res = await fetch(`${sponsorUrl.replace(/\/$/, "")}/self`);
  if (!res.ok) throw new SponsorHttpError(res.status, `self sponsor info failed: HTTP ${res.status}`);
  return (await res.json()) as SelfSponsorInfo;
}

/** `POST {sponsorUrl}/self` with the user-signed bytes → sponsor co-signs + executes. */
export async function submitSelfSponsored(
  sponsorUrl: string,
  body: { txBytes: string; signature: string },
): Promise<ExecuteResponse> {
  const res = await fetch(`${sponsorUrl.replace(/\/$/, "")}/self`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null) as { error?: string } | null;
    throw new SponsorHttpError(res.status, `self sponsor failed: HTTP ${res.status}${detail?.error ? ` (${detail.error})` : ""}`);
  }
  return (await res.json()) as ExecuteResponse;
}

/**
 * Self-run sponsorship: gas comes from the sponsor key's SUI **address
 * balance**, so there are no gas coins to pick and the bytes are final before
 * the sponsor sees them. Order: set gas owner = sponsor + payment = [] → build
 * (the SDK adds a short `ValidDuring` expiration) → user signs → sponsor checks
 * policy, co-signs and executes.
 *
 * Retrying the submit is safe: the bytes (and so the digest) are fixed, so a
 * second submit of the same signed tx can't execute twice.
 */
export async function selfSponsorAndExecute(p: Omit<SponsorAndExecuteParams, "network">): Promise<ExecuteResponse> {
  const info = await withRetry(() => getSelfSponsorInfo(p.sponsorUrl));
  p.tx.setSender(p.sender);
  p.tx.setGasOwner(info.sponsorAddress);
  p.tx.setGasPayment([]);
  const bytes = await p.tx.build({ client: p.client });
  const budget = BigInt(p.tx.getData().gasData.budget ?? 0);
  if (budget > BigInt(info.maxGasBudget)) {
    throw new SponsorHttpError(400, `gas budget ${budget} is over the sponsor's ${info.maxGasBudget} cap`);
  }
  const txBytes = toBase64(bytes);
  const { signature } = await withRetry(() => p.sign(txBytes), 2, 500);
  return withRetry(() => submitSelfSponsored(p.sponsorUrl, { txBytes, signature }));
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
