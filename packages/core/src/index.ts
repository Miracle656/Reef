/**
 * @umbra/core — client-safe entrypoint (browser + mobile + indexer).
 * Server-only Enoki sponsorship lives in `@umbra/core/server`.
 */
export * from "./config";
export * from "./sui/client";
export * from "./events";
export * from "./schemas/index";

// contract bindings
export * from "./contracts/args";
export * from "./contracts/profile";
export * from "./contracts/post";
export * from "./contracts/follow";
export * from "./contracts/onboard";
export * from "./contracts/address-alias";

// storage + gasless client
export * as walrus from "./walrus/index";
export * from "./auth/sponsor-client";

// wallet on the value network: balances + gasless stablecoin transfers
export * as wallet from "./wallet/index";
// swap SUI for USDC on DeepBook (pulls in the DeepBook SDK: load it lazily in apps)
export * as swap from "./wallet/swap";

// passkey wallets: the account is a passkey (the wallet-only app on mainnet)
export * as passkey from "./passkey/index";

// naira cash-out: signed request shapes, banks, status + amount helpers
// (the half that talks to Linq is server-only: `@umbra/core/server`)
export * as cashout from "./cashout/index";

// DeepBook v3 (creator-coin markets)
export * as deepbook from "./deepbook/index";
