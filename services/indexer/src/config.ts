import { testnetConfig, type UmbraConfig } from "@umbra/core";

export interface IndexerEnv {
  umbra: UmbraConfig;
  databaseUrl: string;
  port: number;
  pollIntervalMs: number;
  /** Sui GraphQL endpoint used for event ingestion (gRPC has no event query) */
  graphqlUrl: string;
  /** Enoki private API key (server-only); sponsor disabled if absent */
  enokiApiKey?: string;
  /** app-owned SuiNS parent name, e.g. "umbra.sui"; minting disabled if absent */
  suinsParentName?: string;
  /** dUSDC faucet keypair (bech32 `suiprivkey…`); drip disabled if absent */
  dusdcFaucetKey?: string;
  /** dUSDC dripped to a new zkLogin address on first ask, in USD (default 25) */
  dusdcDripUsd: number;
  /** key (`suiprivkey…`) of WALRUS_BLOB_OWNER; Walrus renewal disabled if absent */
  walrusRenewerKey?: string;
  /** how often the Walrus renewal job runs (default 6h) */
  walrusRenewIntervalMs: number;
}

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export function loadEnv(): IndexerEnv {
  return {
    umbra: {
      // UMBRA_PACKAGE_ID must stay the ORIGINAL package id: Move event type
      // origins never change on upgrade, and the poller filters on this id.
      ...testnetConfig(req("UMBRA_PACKAGE_ID"), req("UMBRA_REGISTRY_ID")),
      // Optional gRPC(-web) fullnode override. Must speak gRPC — Sui JSON-RPC
      // URLs (e.g. the old publicnode one) no longer work.
      ...(process.env.SUI_GRPC_URL ? { fullnodeUrl: process.env.SUI_GRPC_URL } : {}),
    },
    databaseUrl: req("DATABASE_URL"),
    port: Number(process.env.INDEXER_PORT ?? 3001),
    pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 3000),
    graphqlUrl: process.env.SUI_GRAPHQL_URL ?? "https://graphql.testnet.sui.io/graphql",
    enokiApiKey: process.env.ENOKI_PRIVATE_API_KEY,
    suinsParentName: process.env.SUINS_PARENT_NAME,
    dusdcFaucetKey: process.env.DUSDC_FAUCET_SECRET_KEY,
    dusdcDripUsd: Number(process.env.DUSDC_DRIP_USD ?? 25),
    walrusRenewerKey: process.env.WALRUS_RENEWER_SECRET_KEY,
    walrusRenewIntervalMs: Number(process.env.WALRUS_RENEW_INTERVAL_MS ?? 6 * 60 * 60 * 1000),
  };
}
