/**
 * On mainnet the app is the wallet alone.
 *
 * The social app (feed, search, trade, predict, messages, notifications,
 * profiles, onboarding) is published on testnet only. When the app is switched
 * to mainnet (NEXT_PUBLIC_SUI_NETWORK=mainnet) those pages are not shown: any
 * page that isn't on the short list below is sent to /wallet. On testnet this
 * does nothing.
 *
 * The list is an allowlist on purpose: a page added later stays hidden on
 * mainnet until someone decides it belongs there.
 */
import { NextResponse, type NextRequest } from "next/server";

const WALLET_ONLY = process.env.NEXT_PUBLIC_SUI_NETWORK === "mainnet";

/** Pages that exist on mainnet. `/auth` is the sign-in return page the mobile app relies on. */
const ON_MAINNET = [/^\/$/, /^\/wallet(\/|$)/, /^\/settings(\/|$)/, /^\/auth(\/|$)/];

export function middleware(req: NextRequest) {
  if (!WALLET_ONLY) return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (ON_MAINNET.some((re) => re.test(pathname))) return NextResponse.next();
  return NextResponse.redirect(new URL("/wallet", req.url));
}

export const config = {
  // Pages only: skip the API, Next's own files and anything with a file extension.
  matcher: ["/((?!api/|_next/|.*\\..*).*)"],
};
