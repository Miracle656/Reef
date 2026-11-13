import { parseSponsorMode, testnetConfig, type SuiNetwork, type UmbraConfig } from "@umbra/core";

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
/** #10 passkey recovery UI. OFF until a real zkLogin account has been checked with
 *  address_alias on the production URL (docs/passkey-recovery.md). Set to "1" to enable. */
export const PASSKEY_RECOVERY = process.env.NEXT_PUBLIC_PASSKEY_RECOVERY === "1";
/** WebAuthn RP ID for passkeys (#9). Defaults to the current host. */
export const PASSKEY_RP_ID = process.env.NEXT_PUBLIC_PASSKEY_RP_ID || undefined;
export const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL ?? "http://localhost:3001";
export const SUINS_MINT_URL = `${INDEXER_URL}/suins/mint`;

/** Whether onboarding/posting can actually execute (package published + sponsor set). */
export const isConfigured = PACKAGE_ID !== "0x0" && REGISTRY_ID !== "0x0";
