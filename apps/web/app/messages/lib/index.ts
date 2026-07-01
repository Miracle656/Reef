/**
 * Adapter selector. The whole UI imports `messaging` from here and nothing else
 * from the lib internals. To go on-chain: implement SuiMessaging in
 * ./sui-adapter.ts and swap the one line below.
 */

import { MockMessaging } from "./mock-adapter";
import { SuiMessaging } from "./sui-adapter";
import { isMessagingConfigured } from "./sui-config";
import type { Messaging } from "./messaging";

/**
 * The single messaging backend the app talks to. Uses the on-chain Sui adapter
 * when a relayer + Seal servers are configured (see `isMessagingConfigured`);
 * otherwise falls back to the localStorage mock so the UI still runs.
 */
export const messaging: Messaging = isMessagingConfigured() ? new SuiMessaging() : new MockMessaging();

export * from "./messaging";
export * from "./types";
