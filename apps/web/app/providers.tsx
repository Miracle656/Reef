"use client";

import { useEffect, useState } from "react";
import { SuiClientProvider, WalletProvider, createNetworkConfig, useSuiClientContext } from "@mysten/dapp-kit";
import { isEnokiNetwork, registerEnokiWallets } from "@mysten/enoki";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { enokiConfig } from "@/lib/enoki";
import { umbraConfig } from "@/lib/config";
import { walletClient } from "@/lib/wallet";

const { networkConfig } = createNetworkConfig({
  testnet: { url: umbraConfig.fullnodeUrl, network: "testnet" },
  mainnet: { url: "https://fullnode.mainnet.sui.io:443", network: "mainnet" },
});

// Sui shut JSON-RPC off in 2026, so dapp-kit gets a gRPC client. dapp-kit 1.x
// is typed for JSON-RPC but only needs the core API it shares with gRPC; read
// it back through `useChainClient()` (lib/sui-client.ts).
const createClient = (_name: string, config: { url: string; network: "testnet" | "mainnet" }) =>
  new SuiGrpcClient({ baseUrl: config.url, network: config.network }) as unknown as SuiJsonRpcClient;

/** Registers Enoki Google zkLogin wallets with dapp-kit. No-op without env. */
function RegisterEnokiWallets() {
  const { client, network } = useSuiClientContext();
  useEffect(() => {
    if (!isEnokiNetwork(network)) return;
    if (!enokiConfig.enokiApiKey || !enokiConfig.googleClientId) return;
    // The social app signs on `network`. The wallet can live on another network
    // (mainnet money, testnet social), so Enoki gets that client too and the
    // same Google account can sign there. Enoki keeps one zkLogin session per
    // network: sign-in creates this one, the first wallet send creates the other.
    const clients = walletClient && walletClient.network !== network ? [client, walletClient] : [client];
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
      clients,
      getCurrentNetwork: () => network,
    });
    return unregister;
  }, [client, network]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} createClient={createClient} defaultNetwork={enokiConfig.suiNetwork as "testnet" | "mainnet"}>
        <RegisterEnokiWallets />
        <WalletProvider autoConnect>{children}</WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
