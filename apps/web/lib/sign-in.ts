"use client";

import { EnokiClient } from "@mysten/enoki";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { useQuery } from "@tanstack/react-query";
import { NETWORK, WALLET_ONLY } from "./config";
import { enokiConfig } from "./enoki";

export type SignInState = "ready" | "not-enabled" | "unknown";

/**
 * Can Google sign-in work on the app's network at all?
 *
 * Networks are switched on per API key in the Enoki portal. If this one isn't,
 * the sign-in window would open and stay blank, so the button asks first and
 * says so instead. Only asked on mainnet: testnet is where the app has always
 * signed in, and the check costs a request.
 */
export function useSignInAvailable() {
  return useQuery({
    queryKey: ["sign-in-available", NETWORK],
    enabled: Boolean(WALLET_ONLY && enokiConfig.enokiApiKey),
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: async (): Promise<SignInState> => {
      try {
        // A nonce request signs nobody in and moves nothing; it only tells us
        // whether the key accepts this network.
        await new EnokiClient({ apiKey: enokiConfig.enokiApiKey! }).createZkLoginNonce({
          network: NETWORK === "mainnet" ? "mainnet" : "testnet",
          ephemeralPublicKey: new Ed25519Keypair().getPublicKey(),
        });
        return "ready";
      } catch (e) {
        const err = e as { status?: number; errors?: { code?: string }[] };
        if (err.status === 403 && err.errors?.some((x) => x.code === "missing_networks")) return "not-enabled";
        // Anything else (offline, a blocked origin on a preview): don't guess.
        return "unknown";
      }
    },
  });
}
