/**
 * ── ReeF messaging client factory (mobile) ──────────────────────────────────
 *
 * Mirror of web app/messages/lib/messaging-client.ts: builds a configured
 * `@mysten/sui-stack-messaging` client bound to the delegate signer.
 * Requires lib/crypto-polyfill to have run first (AES-GCM subtle shim).
 */

import {
  createSuiStackMessagingClient,
  WalrusHttpStorageAdapter,
} from "@mysten/sui-stack-messaging";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import type { Signer } from "@mysten/sui/cryptography";
import { messagingEnv } from "./sui-config";

function rpcUrl(): string {
  return process.env.EXPO_PUBLIC_SUI_FULLNODE_URL || `https://fullnode.${messagingEnv.network}.sui.io:443`;
}

/**
 * Construct a messaging client bound to `signer` (the delegate keypair). One
 * client per connected account; rebuild when the account changes.
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
            // RN's fetch types don't accept URL; the SDK's do — bridge the types.
            fetch: ((input: unknown, init?: RequestInit) => fetch(input as never, init)) as never,
          }),
          maxFileSizeBytes: 5 * 1024 * 1024, // 5 MB / file
          maxAttachments: 10,
        }
      : undefined;

  return createSuiStackMessagingClient(baseClient, {
    seal: { serverConfigs: messagingEnv.sealServers },
    encryption: {
      // The SDK owns the Seal SessionKey lifecycle off this signer.
      sessionKey: { signer },
    },
    relayer: {
      relayerUrl: messagingEnv.relayerUrl,
      fetch: ((input: unknown, init?: RequestInit) => fetch(input as never, init)) as never,
    },
    attachments,
  });
}

/** The fully-extended messaging client type (messaging + groups + seal + core). */
export type ReefMessagingClient = ReturnType<typeof createReefMessagingClient>;
