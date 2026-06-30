/**
 * Adapter selector. The whole UI imports `messaging` from here and nothing else
 * from the lib internals. To go on-chain: implement SuiMessaging in
 * ./sui-adapter.ts and swap the one line below.
 */

import { MockMessaging } from "./mock-adapter";
import type { Messaging } from "./messaging";
// import { SuiMessaging } from "./sui-adapter"; // ← onchain: use this instead

/** The single messaging backend instance the app talks to. */
export const messaging: Messaging = new MockMessaging();
// export const messaging: Messaging = new SuiMessaging();

export * from "./messaging";
export * from "./types";
