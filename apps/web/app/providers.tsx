"use client";

import { useEffect, useState } from "react";
import { SuiClientProvider, WalletProvider, createNetworkConfig, useSuiClientContext } from "@mysten/dapp-kit";
import { isEnokiNetwork, registerEnokiWallets } from "@mysten/enoki";
import { getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { enokiConfig } from "@/lib/enoki";
import { umbraConfig } from "@/lib/config";

const { networkConfig } = createNetworkConfig({
  // Don't use getJsonRpcFullnodeUrl("testnet") — Mysten deprecated JSON-RPC on
  // the public fullnodes (Aug 2026); core config points at publicnode instead.
  testnet: { url: umbraConfig.fullnodeUrl, network: "testnet" },
  mainnet: { url: getJsonRpcFullnodeUrl("mainnet"), network: "mainnet" },
});

/** Registers Enoki Google zkLogin wallets with dapp-kit. No-op without env. */
function RegisterEnokiWallets() {
  const { client, network } = useSuiClientContext();
  useEffect(() => {
    if (!isEnokiNetwork(network)) return;
    if (!enokiConfig.enokiApiKey || !enokiConfig.googleClientId) return;
    const { unregister } = registerEnokiWallets({
      apiKey: enokiConfig.enokiApiKey,
      providers: {
        google: {
          clientId: enokiConfig.googleClientId,
          // Pin the OAuth redirect to the site root. Enoki otherwise uses the
          // page you signed in FROM, and Google rejects any URL not registered
          // in the Cloud Console (works on "/", 400s on "/messages", …).
          redirectUrl: `${window.location.origin}/`,
        },
      },
      client,
      network,
    });
    return unregister;
  }, [client, network]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork={enokiConfig.suiNetwork as "testnet" | "mainnet"}>
        <RegisterEnokiWallets />
        <WalletProvider autoConnect>{children}</WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
