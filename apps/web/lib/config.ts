import { testnetConfig, type SuiNetwork, type UmbraConfig } from "@umbra/core";

const PACKAGE_ID = process.env.NEXT_PUBLIC_UMBRA_PACKAGE_ID ?? "0x0";
const REGISTRY_ID = process.env.NEXT_PUBLIC_UMBRA_REGISTRY_ID ?? "0x0";

export const NETWORK: SuiNetwork = (process.env.NEXT_PUBLIC_SUI_NETWORK as SuiNetwork) ?? "testnet";

/** Shared Umbra config from public env. */
export const umbraConfig: UmbraConfig = testnetConfig(PACKAGE_ID, REGISTRY_ID);

export const SPONSOR_API_URL = process.env.NEXT_PUBLIC_SPONSOR_API_URL ?? "http://localhost:3001/sponsor";
export const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL ?? "http://localhost:3001";
export const SUINS_MINT_URL = `${INDEXER_URL}/suins/mint`;

/** Whether onboarding/posting can actually execute (package published + sponsor set). */
export const isConfigured = PACKAGE_ID !== "0x0" && REGISTRY_ID !== "0x0";
