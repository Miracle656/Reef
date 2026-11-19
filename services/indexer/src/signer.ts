/**
 * Who may sign an off-chain message (reaction, story…) for an account (#10).
 *
 * Mirrors the validator's `address_alias` rule: an address without aliases is
 * signed for only by its own key; once it enables aliases, ONLY the listed
 * keys may sign. So a recovery passkey added as an alias can like or post a
 * story as the account, and a zkLogin key that was rotated OUT of the set (lost
 * or compromised Google) can't anymore.
 */
import type { ClientWithCoreApi } from "@mysten/sui/client";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";
import { canSignFor, readAliasState, type AliasState } from "@umbra/core";
import { suiClient } from "./sui";

const CACHE_MS = 60_000;

export interface SignerVerifierDeps {
  /** chain client for zkLogin signature verification */
  client?: ClientWithCoreApi;
  /** alias lookup; defaults to reading `AddressAliases` through `client` */
  readAliases?: (owner: string) => Promise<AliasState>;
}

export function makeVerifySignedBy(deps: SignerVerifierDeps) {
  const read = deps.readAliases ?? ((owner: string) => readAliasState(deps.client!, owner));
  const cache = new Map<string, { state: AliasState; at: number }>();

  async function aliasState(owner: string): Promise<AliasState | null> {
    const hit = cache.get(owner);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.state;
    try {
      const state = await read(owner);
      cache.set(owner, { state, at: Date.now() });
      return state;
    } catch (err) {
      console.warn(`[signer] alias read failed for ${owner}:`, err instanceof Error ? err.message : err);
      return null;
    }
  }

  /** True iff `signature` over `bytes` is valid AND its signer may act as `owner`. */
  return async function verifySignedBy(owner: string, bytes: Uint8Array, signature: string): Promise<boolean> {
    const o = normalizeSuiAddress(owner);
    let signer: string;
    try {
      // The owner's own key. Passing `address` keeps zkLogin verification exactly as before.
      signer = (await verifyPersonalMessageSignature(bytes, signature, { client: deps.client, address: o })).toSuiAddress();
    } catch {
      try {
        // Another key, e.g. a recovery passkey. Checked against the alias set below.
        signer = (await verifyPersonalMessageSignature(bytes, signature, { client: deps.client })).toSuiAddress();
      } catch {
        return false;
      }
    }
    const state = await aliasState(o);
    // Chain read failed: fall back to the pre-alias rule rather than fail every like.
    if (!state) return normalizeSuiAddress(signer) === o;
    return canSignFor(state, signer);
  };
}

/** The indexer's verifier, on the shared read client. */
export const verifySignedBy = makeVerifySignedBy({ client: suiClient });
