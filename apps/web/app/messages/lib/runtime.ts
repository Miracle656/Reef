/**
 * Messaging runtime — the bridge between the hook world (React: Enoki signer,
 * gasless sponsor) and the hook-free `SuiMessaging` adapter singleton.
 *
 * `provider.tsx` builds the client + signer + a gasless executor inside effects
 * (it has the hooks) and injects them here via `setMessagingRuntime`. The adapter
 * reads them via `requireRuntime()`. Cleared on sign-out / account change.
 */

import type { Signer } from "@mysten/sui/cryptography";
import type { SuiGraphQLClient } from "@mysten/sui/graphql";
import type { Transaction } from "@mysten/sui/transactions";
import type { ReefMessagingClient } from "./messaging-client";
import type { Me } from "./types";

export interface MessagingRuntime {
  client: ReefMessagingClient;
  /** Delegate Ed25519 keypair — signs relayer auth + per-message + Seal session key. */
  signer: Signer;
  /** The delegate's Sui address — the group member the relayer authorizes. */
  delegateAddress: string;
  /** Sui GraphQL client — group discovery (MemberAdded/Removed events). */
  graphqlClient: SuiGraphQLClient;
  me: Me;
  /** Run an on-chain Transaction gaslessly via ReeF's Enoki sponsor (zkLogin-signed,
   *  so the user's zkLogin address is the group admin that can grant the delegate). */
  sponsorExecute: (tx: Transaction) => Promise<{ digest: string }>;
}

let current: MessagingRuntime | null = null;

export function setMessagingRuntime(rt: MessagingRuntime | null): void {
  current = rt;
}

export function getMessagingRuntime(): MessagingRuntime | null {
  return current;
}

export function requireRuntime(): MessagingRuntime {
  if (!current) throw new Error("Messaging not ready — sign in with Google first.");
  return current;
}
