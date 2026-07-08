/**
 * ── ON-CHAIN MESSAGING CONFIG ───────────────────────────────────────────────
 *
 * Environment + package configuration for the Sui Stack Messaging adapter.
 *
 * The messaging Move package, MessagingNamespace, Version, and SuiNS configs are
 * auto-detected by the SDK from the base client's `network` (testnet/mainnet), so
 * we do NOT set them here — see `TESTNET_SUI_STACK_MESSAGING_PACKAGE_CONFIG` in
 * `@mysten/sui-stack-messaging/constants`.
 *
 * What the SDK genuinely needs from us (and has no default for):
 *   1. a **relayer URL** — the E2EE store-and-forward transport. There is no
 *      public relayer; it's a self-hosted Rust service (see the SDK's
 *      `relayer/` reference). Set NEXT_PUBLIC_MESSAGING_RELAYER_URL once deployed.
 *   2. **Seal key-server object IDs** — the threshold key servers that hold DEK
 *      shares. Comma-separated in NEXT_PUBLIC_SEAL_SERVER_IDS.
 *
 * Until both are set, `isMessagingConfigured()` is false and the app stays on the
 * mock adapter (see ./index.ts). This lets the on-chain adapter land in the tree
 * without breaking the running app.
 */

import { NETWORK } from "@/lib/config";

/** Weighted Seal key-server, as the factory's `seal.serverConfigs` expects. */
export interface SealServerConfig {
  objectId: string;
  weight: number;
}

/**
 * The two standard Mysten **testnet** Seal key-server object IDs (the same pair
 * chirp hard-coded — they're public, well-known testnet infra). Defaulting to
 * these means you don't have to configure any Seal IDs on testnet; override via
 * NEXT_PUBLIC_SEAL_SERVER_IDS for mainnet or a custom/local Seal topology.
 */
const TESTNET_SEAL_SERVERS: SealServerConfig[] = [
  { objectId: "0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75", weight: 1 },
  { objectId: "0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8", weight: 1 },
];

/**
 * Default relayer for testnet — our deployed instance. Like the Seal defaults
 * above, this makes messaging work out of the box on testnet with zero env
 * config; NEXT_PUBLIC_MESSAGING_RELAYER_URL still overrides (e.g. a local
 * relayer during development).
 */
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
  /** E2EE relayer transport base URL (no trailing slash). */
  // `||` (not `??`) on purpose: an env var saved with an EMPTY value must
  // still fall back to the default, otherwise messaging silently stays mock.
  relayerUrl: (
    process.env.NEXT_PUBLIC_MESSAGING_RELAYER_URL ||
    (NETWORK === "testnet" ? TESTNET_RELAYER_URL : "")
  ).replace(/\/$/, ""),
  /** Threshold Seal key servers holding DEK shares. */
  sealServers: parseSealServers(process.env.NEXT_PUBLIC_SEAL_SERVER_IDS),
  /** Seal threshold (how many shares required to reconstruct a DEK). */
  sealThreshold: Number(process.env.NEXT_PUBLIC_SEAL_THRESHOLD ?? "2"),
  /**
   * Sui GraphQL endpoint — group discovery (listChats) queries MemberAdded/
   * MemberRemoved<Messaging> events here; the SDK has no listGroups method.
   * The canonical chat-app defaults to a same-origin proxy at /api/graphql.
   */
  graphqlUrl:
    process.env.NEXT_PUBLIC_SUI_GRAPHQL_URL ??
    (NETWORK === "mainnet"
      ? "https://graphql.mainnet.sui.io/graphql"
      : "https://graphql.testnet.sui.io/graphql"),
  /** Walrus HTTP endpoints for message attachments (optional — omit → no files). */
  walrusPublisherUrl: process.env.NEXT_PUBLIC_WALRUS_PUBLISHER_URL ?? "",
  walrusAggregatorUrl: process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR_URL ?? "",
  walrusEpochs: Number(process.env.NEXT_PUBLIC_WALRUS_EPOCHS ?? "1"),
  /** SDK auto-detects package config from this. testnet in Phase 1. */
  network: NETWORK,
} as const;

/**
 * Whether the on-chain messaging stack is fully wired. When false the app must
 * stay on the mock adapter — the SDK cannot construct a client without a relayer
 * and Seal servers, and flipping to SuiMessaging would throw on first use.
 */
export function isMessagingConfigured(): boolean {
  return Boolean(messagingEnv.relayerUrl) && messagingEnv.sealServers.length > 0;
}
