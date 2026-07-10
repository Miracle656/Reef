/**
 * Adapter selector. The whole UI imports `messaging` from here and nothing else
 * from the lib internals.
 */

import { MockMessaging } from "./mock-adapter";
import { SuiMessaging } from "./sui-adapter";
import { isMessagingConfigured } from "./sui-config";
import type { Messaging } from "./messaging";

/**
 * The single messaging backend the app talks to. Uses the on-chain Sui adapter
 * when a relayer + Seal servers are configured (the testnet defaults satisfy
 * this out of the box — see sui-config.ts); otherwise falls back to the local
 * mock so the UI still runs.
 */
export const messaging: Messaging = isMessagingConfigured() ? new SuiMessaging() : new MockMessaging();

export * from "./messaging";
export * from "./types";
