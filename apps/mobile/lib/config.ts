import { testnetConfig, type SuiNetwork, type UmbraConfig } from "@umbra/core";

const PACKAGE_ID = process.env.EXPO_PUBLIC_UMBRA_PACKAGE_ID ?? "0x0";
const REGISTRY_ID = process.env.EXPO_PUBLIC_UMBRA_REGISTRY_ID ?? "0x0";

export const NETWORK: SuiNetwork = (process.env.EXPO_PUBLIC_SUI_NETWORK as SuiNetwork) ?? "testnet";
export const umbraConfig: UmbraConfig = testnetConfig(PACKAGE_ID, REGISTRY_ID);

export const SPONSOR_API_URL = process.env.EXPO_PUBLIC_SPONSOR_API_URL ?? "http://localhost:3001/sponsor";
export const INDEXER_URL = process.env.EXPO_PUBLIC_INDEXER_URL ?? "http://localhost:3001";
export const SUINS_MINT_URL = `${INDEXER_URL}/suins/mint`;

export const ENOKI_PUBLIC_API_KEY = process.env.EXPO_PUBLIC_ENOKI_PUBLIC_API_KEY;
export const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;

export const isConfigured = PACKAGE_ID !== "0x0" && REGISTRY_ID !== "0x0";
export const isAuthConfigured = Boolean(ENOKI_PUBLIC_API_KEY && GOOGLE_CLIENT_ID);
