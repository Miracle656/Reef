import { parseSponsorMode, TESTNET_TIP_USDC_TYPE, testnetConfig, type SuiNetwork, type UmbraConfig } from "@umbra/core";

const PACKAGE_ID = process.env.NEXT_PUBLIC_UMBRA_PACKAGE_ID ?? "0x0";
const REGISTRY_ID = process.env.NEXT_PUBLIC_UMBRA_REGISTRY_ID ?? "0x0";

export const NETWORK: SuiNetwork = (process.env.NEXT_PUBLIC_SUI_NETWORK as SuiNetwork) ?? "testnet";

/** Shared Umbra config from public env. */
/** Address that owns uploaded Walrus blobs so the indexer can renew them (#7). */
const WALRUS_BLOB_OWNER = process.env.NEXT_PUBLIC_WALRUS_BLOB_OWNER || undefined;

export const umbraConfig: UmbraConfig = testnetConfig(PACKAGE_ID, REGISTRY_ID, { walrusBlobOwner: WALRUS_BLOB_OWNER });

export const SPONSOR_API_URL = process.env.NEXT_PUBLIC_SPONSOR_API_URL ?? "http://localhost:3001/sponsor";
/** "enoki" (default) or "self" (our own sponsor key, address-balance gas; see #11). */
export const SPONSOR_MODE = parseSponsorMode(process.env.NEXT_PUBLIC_SPONSOR_MODE);
/** Coin type tips send as "USDC" (#13). Testnet default: the faucet's dUSDC; mainnet: Circle's native USDC. */
export const TIP_USDC_TYPE = process.env.NEXT_PUBLIC_TIP_USDC_TYPE || TESTNET_TIP_USDC_TYPE;
/** Explorer link for a transaction digest. */
export const explorerTxUrl = (digest: string) => `https://suiscan.xyz/${NETWORK}/tx/${digest}`;
export const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL ?? "http://localhost:3001";
export const SUINS_MINT_URL = `${INDEXER_URL}/suins/mint`;

/** Whether onboarding/posting can actually execute (package published + sponsor set). */
export const isConfigured = PACKAGE_ID !== "0x0" && REGISTRY_ID !== "0x0";
