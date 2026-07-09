import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { GOOGLE_CLIENT_ID, NETWORK, OAUTH_REDIRECT_URL, isAuthConfigured } from "./config";
import { enokiFlow } from "./enoki";

WebBrowser.maybeCompleteAuthSession();

type AuthState = {
  address: string | null;
  loading: boolean;
  configured: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-read the Enoki session into state (used by the /auth deep-link route). */
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

// The app deep link the in-app browser waits for to close (umbra://auth).
const appReturnUrl = AuthSession.makeRedirectUri({ scheme: "umbra", path: "auth" });
// What Google/Enoki redirect to: the HTTPS bounce page if configured, else the
// app deep link directly (only works in custom dev builds, not a Google Web
// client). The bounce page forwards the token to appReturnUrl.
const oauthRedirectUrl = OAUTH_REDIRECT_URL ?? appReturnUrl;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    // Restores a persisted session on cold start; null if expired/none, in which
    // case we treat the user as signed out so stale state can't linger.
    const session = await enokiFlow.getSession();
    setAddress(session ? enokiFlow.$zkLoginState.get().address ?? null : null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signIn = useCallback(async () => {
    if (!isAuthConfigured) throw new Error("Set EXPO_PUBLIC_ENOKI_PUBLIC_API_KEY + GOOGLE_CLIENT_ID");
    setLoading(true);
    try {
      const url = await enokiFlow.createAuthorizationURL({
        provider: "google",
        clientId: GOOGLE_CLIENT_ID!,
        redirectUrl: oauthRedirectUrl,
        network: NETWORK,
        // Carry the app's deep link in `state` so the HTTPS bounce page knows
        // where to forward the token (the device URL is dynamic in Expo Go).
        extraParams: { state: appReturnUrl },
      });
      const result = await WebBrowser.openAuthSessionAsync(url, appReturnUrl);
      if (result.type === "success") {
        const hash = result.url.split("#")[1] ?? result.url.split("?")[1] ?? "";
        await enokiFlow.handleAuthCallback(hash);
        await refresh();
      }
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  const signOut = useCallback(async () => {
    await enokiFlow.logout();
    setAddress(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ address, loading, configured: isAuthConfigured, signIn, signOut, refresh }),
    [address, loading, signIn, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
