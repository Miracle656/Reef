import { parseSponsorMode, testnetConfig, wallet, type UmbraConfig } from "@umbra/core";
import { NETWORK, WALLET_ONLY } from "./mode";

const PACKAGE_ID = process.env.NEXT_PUBLIC_UMBRA_PACKAGE_ID ?? "0x0";
const REGISTRY_ID = process.env.NEXT_PUBLIC_UMBRA_REGISTRY_ID ?? "0x0";

/**
 * The network the whole app runs on, and whether it shows the wallet alone
 * (always on mainnet). Both are defined in lib/mode.ts.
 */
export { NETWORK, WALLET_ONLY };

/**
 * How people sign in.
 *   passkey  the wallet-only app. The account is a passkey (fingerprint, face or
 *            screen lock) and signs for itself: no Google and no Enoki, whose
 *            mainnet access is a paid plan.
 *   google   the full testnet app: zkLogin through Enoki.
 */
export const SIGN_IN: "passkey" | "google" = WALLET_ONLY ? "passkey" : "google";

/** Shared Umbra config from public env. */
/** Address that owns uploaded Walrus blobs so the indexer can renew them (#7). */
const WALRUS_BLOB_OWNER = process.env.NEXT_PUBLIC_WALRUS_BLOB_OWNER || undefined;

export const umbraConfig: UmbraConfig = testnetConfig(PACKAGE_ID, REGISTRY_ID, { walrusBlobOwner: WALRUS_BLOB_OWNER });

/**
 * The wallet (balances, sending, cash-out) always runs on the app's own network.
 * On the wallet-only app it IS the app, so it is always on. On the full testnet
 * app it is opt-in (NEXT_PUBLIC_WALLET_NETWORK=testnet), for trying it with test
 * USDC next to the social app. Null means this build has no wallet.
 */
export const WALLET_NETWORK: wallet.WalletNetwork | null = WALLET_ONLY
  ? NETWORK
  : wallet.parseWalletNetwork(process.env.NEXT_PUBLIC_WALLET_NETWORK) === "testnet"
    ? "testnet"
    : null;
export const walletConfig = WALLET_NETWORK ? wallet.walletConfig(WALLET_NETWORK) : null;

export const SPONSOR_API_URL = process.env.NEXT_PUBLIC_SPONSOR_API_URL ?? "http://localhost:3001/sponsor";
/** "enoki" (default) or "self" (our own sponsor key, address-balance gas; see #11). */
export const SPONSOR_MODE = parseSponsorMode(process.env.NEXT_PUBLIC_SPONSOR_MODE);
/** #10 passkey recovery UI. OFF until a real zkLogin account has been checked with
 *  address_alias on the production URL (docs/passkey-recovery.md). Set to "1" to enable. */
export const PASSKEY_RECOVERY = process.env.NEXT_PUBLIC_PASSKEY_RECOVERY === "1";
/**
 * The web address passkeys belong to (the WebAuthn RP ID), e.g. `reef.app`. A
 * passkey only works on that address and its subdomains, for good, so on
 * mainnet it has to be set on purpose: a wallet made on a throwaway preview
 * address would be stranded there with real money in it. Unset on testnet means
 * the page's own host. A pasted URL is cut down to its host.
 */
export const PASSKEY_RP_ID =
  (process.env.NEXT_PUBLIC_PASSKEY_RP_ID ?? "")
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/[/:?#].*$/, "") || undefined;
export const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL ?? "http://localhost:3001";
export const SUINS_MINT_URL = `${INDEXER_URL}/suins/mint`;

/** Whether onboarding/posting can actually execute (package published + sponsor set). */
export const isConfigured = PACKAGE_ID !== "0x0" && REGISTRY_ID !== "0x0";
