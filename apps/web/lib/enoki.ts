import { NETWORK } from "./config";

export const enokiConfig = {
  enokiApiKey: process.env.NEXT_PUBLIC_ENOKI_PUBLIC_API_KEY,
  googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  suiNetwork: NETWORK,
};

export const isAuthConfigured = Boolean(enokiConfig.enokiApiKey && enokiConfig.googleClientId);
