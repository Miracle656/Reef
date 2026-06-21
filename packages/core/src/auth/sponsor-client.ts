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
  if (!res.ok) throw new Error(`sponsor request failed: HTTP ${res.status}`);
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
  if (!res.ok) throw new Error(`sponsor execute failed: HTTP ${res.status}`);
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

/** Full client orchestration: build -> sponsor -> sign -> execute. */
export async function sponsorAndExecute(p: SponsorAndExecuteParams): Promise<ExecuteResponse> {
  const transactionKindBytes = await buildKindBytes(p.client, p.tx);
  const sponsored = await requestSponsorship(p.sponsorUrl, {
    transactionKindBytes,
    sender: p.sender,
    network: p.network,
  });
  const { signature } = await p.sign(sponsored.bytes);
  return submitSponsoredSignature(p.sponsorUrl, { digest: sponsored.digest, signature });
}
