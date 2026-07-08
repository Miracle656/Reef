/**
 * ── ReeF messaging client factory ───────────────────────────────────────────
 *
 * Builds a configured `@mysten/sui-stack-messaging` client for ReeF. Mirrors the
 * canonical chat-app / deepmarket wiring, adapted to ReeF's Enoki (zkLogin)
 * identity.
 *
 * Namespaces on the returned client:
 *   client.messaging — E2EE send/getMessages/subscribe/createAndShareGroup
 *   client.groups    — permissions (grant/revoke, membership)
 *   client.seal      — encryption
 *   client.core      — base Sui RPC
 *
 * SESSION KEY — Tier 1 (now):
 *   `encryption.sessionKey = { signer }`. The SDK creates, certifies (one silent
 *   Enoki `signPersonalMessage`), caches, and refreshes the Seal SessionKey for
 *   us. The same `EnokiSigner` also signs the relayer's per-request auth.
 *
 * TODO(tier-3, later): swap to `{ getSessionKey: () => sessionKey }` and port
 *   the messaging-sdk-example `SessionKeyProvider` (manual SessionKey.create +
 *   sessionStorage cache + SessionExpirationModal re-cert UX). See
 *   memory: umbra-messaging.
 */

import {
  createSuiStackMessagingClient,
  WalrusHttpStorageAdapter,
} from "@mysten/sui-stack-messaging";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import type { Signer } from "@mysten/sui/cryptography";
import { messagingEnv } from "./sui-config";

function rpcUrl(): string {
  return `https://fullnode.${messagingEnv.network}.sui.io:443`;
}

/**
 * Construct a messaging client bound to `signer` (an `EnokiSigner`). One client
 * per connected account; rebuild when the account changes.
 *
 * Package config (messaging namespace, version) is auto-detected from the
 * network — no packageConfig needed on testnet/mainnet.
 */
export function createReefMessagingClient(signer: Signer) {
  const baseClient = new SuiJsonRpcClient({ url: rpcUrl(), network: messagingEnv.network });

  const attachments =
    messagingEnv.walrusPublisherUrl && messagingEnv.walrusAggregatorUrl
      ? {
          storageAdapter: new WalrusHttpStorageAdapter({
            publisherUrl: messagingEnv.walrusPublisherUrl,
            aggregatorUrl: messagingEnv.walrusAggregatorUrl,
            epochs: messagingEnv.walrusEpochs,
            fetch: (...args: Parameters<typeof fetch>) => fetch(...args),
          }),
          maxFileSizeBytes: 5 * 1024 * 1024, // 5 MB / file
          maxAttachments: 10,
        }
      : undefined;

  return createSuiStackMessagingClient(baseClient, {
    seal: { serverConfigs: messagingEnv.sealServers },
    encryption: {
      // Tier 1 — SDK owns the Seal SessionKey lifecycle off this signer.
      sessionKey: { signer },
    },
    relayer: {
      relayerUrl: messagingEnv.relayerUrl,
      fetch: (...args: Parameters<typeof fetch>) => fetch(...args),
    },
    attachments,
  });
}

/** The fully-extended messaging client type (messaging + groups + seal + core). */
export type ReefMessagingClient = ReturnType<typeof createReefMessagingClient>;
