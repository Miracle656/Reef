import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { GOOGLE_CLIENT_ID, NETWORK, isAuthConfigured } from "./config";
import { enokiFlow } from "./enoki";

WebBrowser.maybeCompleteAuthSession();

type AuthState = {
  address: string | null;
  loading: boolean;
  configured: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

const redirectUrl = AuthSession.makeRedirectUri({ scheme: "umbra", path: "auth" });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    await enokiFlow.getSession(); // hydrate state from the store
    setAddress(enokiFlow.$zkLoginState.get().address ?? null);
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
        redirectUrl,
        network: NETWORK,
      });
      const result = await WebBrowser.openAuthSessionAsync(url, redirectUrl);
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
    () => ({ address, loading, configured: isAuthConfigured, signIn, signOut }),
    [address, loading, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
