import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Redirect } from "expo-router";
import * as Linking from "expo-linking";
import { palette } from "@umbra/ui";
import { enokiFlow } from "@/lib/enoki";
import { useAuth } from "@/lib/auth";

/**
 * zkLogin deep-link landing. The HTTPS bounce page (apps/web /auth/native)
 * forwards Google's id_token here as `exp://…/--/auth?id_token=…&state=…`.
 * We hand the params to Enoki, refresh auth state, then redirect home — the
 * redirect is declarative so it fires reliably once auth resolves.
 */
export default function AuthCallback() {
  const { address, refresh } = useAuth();
  const url = Linking.useURL();
  const handled = useRef(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      if (handled.current) return;
      const full = url ?? (await Linking.getInitialURL());
      if (!full) return;
      handled.current = true;
      // token params live after `?` (query) or `#` (fragment); strip the other.
      const after = (full.includes("?") ? full.split("?")[1] : full.split("#")[1] ?? "").split("#")[0];
      try {
        if (after) {
          await enokiFlow.handleAuthCallback(after);
          await refresh();
        }
      } catch {
        // fall through — land on home; user can retry sign-in
      }
      setDone(true);
    })();
  }, [url, refresh]);

  if (address || done) return <Redirect href="/" />;

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: palette.light.background }}>
      <ActivityIndicator color={palette.light.accent} />
      <Text style={{ marginTop: 12, color: palette.light.inkSoft }}>Finishing sign-in…</Text>
    </View>
  );
}
