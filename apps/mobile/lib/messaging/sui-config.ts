/**
 * ── ON-CHAIN MESSAGING CONFIG (mobile) ──────────────────────────────────────
 *
 * Mirror of web app/messages/lib/sui-config.ts with Expo env vars. On testnet
 * everything defaults to well-known public infra + our deployed relayer, so
 * messaging works with zero env config; EXPO_PUBLIC_* overrides for a local
 * relayer or custom Seal topology.
 */

import { NETWORK } from "@/lib/config";

/** Weighted Seal key-server, as the factory's `seal.serverConfigs` expects. */
export interface SealServerConfig {
  objectId: string;
  weight: number;
}

/** The two standard Mysten **testnet** Seal key-server object IDs. */
const TESTNET_SEAL_SERVERS: SealServerConfig[] = [
  { objectId: "0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75", weight: 1 },
  { objectId: "0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8", weight: 1 },
];

/** Default relayer for testnet — our deployed instance (same as web). */
const TESTNET_RELAYER_URL = "https://sui-stack-messaging.onrender.com";

function parseSealServers(raw: string | undefined): SealServerConfig[] {
  if (!raw) return NETWORK === "testnet" ? TESTNET_SEAL_SERVERS : [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((objectId) => ({ objectId, weight: 1 }));
}

export const messagingEnv = {
  /** E2EE relayer transport base URL (no trailing slash). `||` on purpose —
   *  an env var saved empty must still fall back to the default. */
  relayerUrl: (
    process.env.EXPO_PUBLIC_MESSAGING_RELAYER_URL ||
    (NETWORK === "testnet" ? TESTNET_RELAYER_URL : "")
  ).replace(/\/$/, ""),
  /** Threshold Seal key servers holding DEK shares. */
  sealServers: parseSealServers(process.env.EXPO_PUBLIC_SEAL_SERVER_IDS),
  /** Seal threshold (how many shares required to reconstruct a DEK). */
  sealThreshold: Number(process.env.EXPO_PUBLIC_SEAL_THRESHOLD ?? "2"),
  /** Sui GraphQL endpoint — group discovery (MemberAdded/Removed events). */
  graphqlUrl:
    process.env.EXPO_PUBLIC_SUI_GRAPHQL_URL ??
    (NETWORK === "mainnet"
      ? "https://graphql.mainnet.sui.io/graphql"
      : "https://graphql.testnet.sui.io/graphql"),
  /** Walrus HTTP endpoints for SDK-managed attachments (optional). */
  walrusPublisherUrl: process.env.EXPO_PUBLIC_WALRUS_PUBLISHER_URL ?? "",
  walrusAggregatorUrl: process.env.EXPO_PUBLIC_WALRUS_AGGREGATOR_URL ?? "",
  walrusEpochs: Number(process.env.EXPO_PUBLIC_WALRUS_EPOCHS ?? "1"),
  /** SDK auto-detects package config from this. testnet in Phase 1. */
  network: NETWORK,
} as const;

/** Whether the on-chain messaging stack is fully wired (else: mock adapter). */
export function isMessagingConfigured(): boolean {
  return Boolean(messagingEnv.relayerUrl) && messagingEnv.sealServers.length > 0;
}
