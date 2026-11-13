import { parseSponsorMode, savings, testnetConfig, type SuiNetwork, type UmbraConfig } from "@umbra/core";

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

/** USDC savings deployment (#15); null hides savings. Values come from
 *  packages/savings/deployments/<network>.json (see docs/savings.md). */
export const SAVINGS: (savings.SavingsDeployment & { faucetId?: string }) | null = process.env.NEXT_PUBLIC_SAVINGS_PACKAGE_ID
  ? {
      packageId: process.env.NEXT_PUBLIC_SAVINGS_PACKAGE_ID,
      configId: process.env.NEXT_PUBLIC_SAVINGS_CONFIG_ID ?? "",
      vaultId: process.env.NEXT_PUBLIC_SAVINGS_VAULT_ID ?? "",
      bonusPoolId: process.env.NEXT_PUBLIC_SAVINGS_BONUS_POOL_ID ?? "",
      underlyingType: process.env.NEXT_PUBLIC_SAVINGS_UNDERLYING ?? "",
      faucetId: process.env.NEXT_PUBLIC_SAVINGS_FAUCET_ID || undefined,
    }
  : null;
/** Naira per US dollar for the “≈₦” hint; unset hides it (we don't invent a rate). */
export const NGN_PER_USD = Number(process.env.NEXT_PUBLIC_NGN_PER_USD) || null;
export const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL ?? "http://localhost:3001";
export const SUINS_MINT_URL = `${INDEXER_URL}/suins/mint`;

/** Whether onboarding/posting can actually execute (package published + sponsor set). */
export const isConfigured = PACKAGE_ID !== "0x0" && REGISTRY_ID !== "0x0";
