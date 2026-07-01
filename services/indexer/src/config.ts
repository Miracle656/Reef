import { testnetConfig, type UmbraConfig } from "@umbra/core";

export interface IndexerEnv {
  umbra: UmbraConfig;
  databaseUrl: string;
  port: number;
  pollIntervalMs: number;
  /** Enoki private API key (server-only); sponsor disabled if absent */
  enokiApiKey?: string;
  /** app-owned SuiNS parent name, e.g. "umbra.sui"; minting disabled if absent */
  suinsParentName?: string;
  /** dUSDC faucet keypair (bech32 `suiprivkey…`); drip disabled if absent */
  dusdcFaucetKey?: string;
  /** dUSDC dripped to a new zkLogin address on first ask, in USD (default 25) */
  dusdcDripUsd: number;
}

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export function loadEnv(): IndexerEnv {
  return {
    umbra: testnetConfig(req("UMBRA_PACKAGE_ID"), req("UMBRA_REGISTRY_ID")),
    databaseUrl: req("DATABASE_URL"),
    port: Number(process.env.INDEXER_PORT ?? 3001),
    pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 3000),
    enokiApiKey: process.env.ENOKI_PRIVATE_API_KEY,
    suinsParentName: process.env.SUINS_PARENT_NAME,
    dusdcFaucetKey: process.env.DUSDC_FAUCET_SECRET_KEY,
    dusdcDripUsd: Number(process.env.DUSDC_DRIP_USD ?? 25),
  };
}
