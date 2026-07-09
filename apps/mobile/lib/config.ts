import Constants from "expo-constants";
import { testnetConfig, type SuiNetwork, type UmbraConfig } from "@umbra/core";

const PACKAGE_ID = process.env.EXPO_PUBLIC_UMBRA_PACKAGE_ID ?? "0x0";
const REGISTRY_ID = process.env.EXPO_PUBLIC_UMBRA_REGISTRY_ID ?? "0x0";

export const NETWORK: SuiNetwork = (process.env.EXPO_PUBLIC_SUI_NETWORK as SuiNetwork) ?? "testnet";
export const umbraConfig: UmbraConfig = testnetConfig(PACKAGE_ID, REGISTRY_ID);

/**
 * The indexer runs on the same machine as the Expo dev server, so derive its
 * host from Metro's host (e.g. "192.168.1.66:8081" → "192.168.1.66") instead of
 * hardcoding a LAN IP that changes with the network. EXPO_PUBLIC_INDEXER_URL
 * still wins if explicitly set (e.g. a tunnel or deployed indexer).
 */
function devIndexerUrl(): string {
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost ?? "";
  const host = hostUri.split(":")[0];
  return host ? `http://${host}:3001` : "http://localhost:3001";
}

export const INDEXER_URL = process.env.EXPO_PUBLIC_INDEXER_URL ?? devIndexerUrl();
export const SPONSOR_API_URL = process.env.EXPO_PUBLIC_SPONSOR_API_URL ?? `${INDEXER_URL}/sponsor`;
export const SUINS_MINT_URL = `${INDEXER_URL}/suins/mint`;

/** Walrus image served through the indexer proxy (reachable + correct Content-Type). */
export const imgUrl = (blobId: string) => `${INDEXER_URL}/img/${blobId}`;

export const ENOKI_PUBLIC_API_KEY = process.env.EXPO_PUBLIC_ENOKI_PUBLIC_API_KEY;
export const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;

// Google Web OAuth clients reject custom schemes, so zkLogin redirects to an
// HTTPS bounce page (apps/web /auth/native) that forwards the token to
// umbra://auth. Set this to the deployed bounce URL, e.g.
// https://<your-web-domain>/auth/native. Must be registered in the Google Web
// client AND the Enoki portal as an authorized redirect.
export const OAUTH_REDIRECT_URL = process.env.EXPO_PUBLIC_OAUTH_REDIRECT_URL;

export const isConfigured = PACKAGE_ID !== "0x0" && REGISTRY_ID !== "0x0";
export const isAuthConfigured = Boolean(ENOKI_PUBLIC_API_KEY && GOOGLE_CLIENT_ID);
