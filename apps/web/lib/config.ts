import { parseSponsorMode, testnetConfig, wallet, type SuiNetwork, type UmbraConfig } from "@umbra/core";

const PACKAGE_ID = process.env.NEXT_PUBLIC_UMBRA_PACKAGE_ID ?? "0x0";
const REGISTRY_ID = process.env.NEXT_PUBLIC_UMBRA_REGISTRY_ID ?? "0x0";

export const NETWORK: SuiNetwork = (process.env.NEXT_PUBLIC_SUI_NETWORK as SuiNetwork) ?? "testnet";

/** Shared Umbra config from public env. */
/** Address that owns uploaded Walrus blobs so the indexer can renew them (#7). */
const WALRUS_BLOB_OWNER = process.env.NEXT_PUBLIC_WALRUS_BLOB_OWNER || undefined;

export const umbraConfig: UmbraConfig = testnetConfig(PACKAGE_ID, REGISTRY_ID, { walrusBlobOwner: WALRUS_BLOB_OWNER });

/**
 * Network the wallet (balances, sending, cash-out) runs on: "mainnet" for real
 * money, "testnet" to rehearse with test USDC. Unset means the app has no
 * wallet. It is independent of NETWORK, which is where the social app lives; a
 * zkLogin address is the same on both, so it is still the user's own account.
 */
export const WALLET_NETWORK = wallet.parseWalletNetwork(process.env.NEXT_PUBLIC_WALLET_NETWORK);
export const walletConfig = WALLET_NETWORK ? wallet.walletConfig(WALLET_NETWORK) : null;

export const SPONSOR_API_URL = process.env.NEXT_PUBLIC_SPONSOR_API_URL ?? "http://localhost:3001/sponsor";
/** "enoki" (default) or "self" (our own sponsor key, address-balance gas; see #11). */
export const SPONSOR_MODE = parseSponsorMode(process.env.NEXT_PUBLIC_SPONSOR_MODE);
export const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL ?? "http://localhost:3001";
export const SUINS_MINT_URL = `${INDEXER_URL}/suins/mint`;

/** Whether onboarding/posting can actually execute (package published + sponsor set). */
export const isConfigured = PACKAGE_ID !== "0x0" && REGISTRY_ID !== "0x0";
