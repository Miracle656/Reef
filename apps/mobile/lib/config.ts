import Constants from 'expo-constants';
import { testnetConfig, type SuiNetwork, type UmbraConfig } from '@umbra/core';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;

const PACKAGE_ID = extra.UMBRA_PACKAGE_ID ?? process.env.EXPO_PUBLIC_UMBRA_PACKAGE_ID ?? '0x0';
const REGISTRY_ID = extra.UMBRA_REGISTRY_ID ?? process.env.EXPO_PUBLIC_UMBRA_REGISTRY_ID ?? '0x0';

export const NETWORK: SuiNetwork = (extra.SUI_NETWORK ?? process.env.EXPO_PUBLIC_SUI_NETWORK ?? 'testnet') as SuiNetwork;

export const umbraConfig: UmbraConfig = testnetConfig(PACKAGE_ID, REGISTRY_ID);

export const ENOKI_API_KEY = extra.ENOKI_PUBLIC_API_KEY ?? process.env.EXPO_PUBLIC_ENOKI_PUBLIC_API_KEY ?? '';
export const GOOGLE_CLIENT_ID = extra.GOOGLE_CLIENT_ID ?? process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '';

export const SPONSOR_API_URL = extra.SPONSOR_API_URL ?? process.env.EXPO_PUBLIC_SPONSOR_API_URL ?? 'http://localhost:3001/sponsor';
export const INDEXER_URL = extra.INDEXER_URL ?? process.env.EXPO_PUBLIC_INDEXER_URL ?? 'http://localhost:3001';
export const SUINS_MINT_URL = `${INDEXER_URL}/suins/mint`;

export const AUTH_REDIRECT_URL = 'umbra://auth';

export const isConfigured = PACKAGE_ID !== '0x0' && REGISTRY_ID !== '0x0';
export const isAuthConfigured = Boolean(ENOKI_API_KEY && GOOGLE_CLIENT_ID);

export const suiClient = new SuiJsonRpcClient({ url: umbraConfig.fullnodeUrl, network: umbraConfig.network });
