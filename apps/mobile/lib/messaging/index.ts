/**
 * Adapter selector. The whole UI imports `messaging` from here and nothing else
 * from the lib internals. To go on-chain: implement SuiMessaging in a
 * sui-adapter and swap the one line below.
 */

import { MockMessaging } from "./mock-adapter";
import type { Messaging } from "./messaging";

/** The single messaging backend instance the app talks to (session-lived). */
export const messaging: Messaging = new MockMessaging();

export * from "./messaging";
export * from "./types";
