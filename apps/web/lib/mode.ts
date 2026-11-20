/**
 * What this build of the web app is. No imports, so middleware can read it too.
 *
 *   NEXT_PUBLIC_SUI_NETWORK=testnet (default)  the full app, on test money
 *   NEXT_PUBLIC_SUI_NETWORK=mainnet            the wallet alone, on real money
 *
 * The social app (profiles, posts, trade, predict, chat) is published on
 * testnet only, so on mainnet every one of its pages is hidden and sends people
 * to /wallet (see middleware.ts).
 *
 * NEXT_PUBLIC_WALLET_ONLY=1 shows the wallet alone on testnet too: the mainnet
 * app with test money, for trying it out. It changes nothing on mainnet.
 */
export const NETWORK: "mainnet" | "testnet" = process.env.NEXT_PUBLIC_SUI_NETWORK === "mainnet" ? "mainnet" : "testnet";

/** True when only the wallet is shown. */
export const WALLET_ONLY = NETWORK === "mainnet" || process.env.NEXT_PUBLIC_WALLET_ONLY === "1";
