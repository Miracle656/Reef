"use client";

import { useEffect, useState } from "react";

/**
 * OAuth bounce page for the mobile app.
 *
 * Google OAuth Web clients only accept http(s) redirect URIs — they reject
 * custom schemes like `umbra://auth`. So zkLogin on mobile redirects here
 * (an HTTPS page), and we forward the id_token fragment straight into the app
 * via its deep link. Register THIS url as the authorized redirect URI in both
 * the Google Web OAuth client and the Enoki portal, and set it as
 * EXPO_PUBLIC_OAUTH_REDIRECT_URL in the mobile app.
 *
 * Chrome Custom Tabs (Expo Go's in-app browser) blocks *automatic* navigation
 * to custom/non-http schemes — so we auto-try once, then show a tappable button
 * (a user gesture is allowed through).
 */
const APP_SCHEME = "umbra://auth";

export default function NativeAuthRedirect() {
  const [target, setTarget] = useState<string | null>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    // zkLogin returns the id_token in the URL fragment; fall back to the query.
    const frag = window.location.hash.slice(1) || window.location.search.slice(1);
    // The app passes its deep link in `state` (dynamic in Expo Go, e.g.
    // exp://10.0.0.5:8081/--/auth); fall back to the custom scheme for dev builds.
    const ret = new URLSearchParams(frag).get("state");
    const base = ret || APP_SCHEME;
    // Forward as a query (?), not a fragment (#): query params survive the
    // native deep link into expo-router; fragments are often dropped.
    const t = frag ? `${base}?${frag}` : base;
    setTarget(t);
    // No auto-redirect: Custom Tabs blocks programmatic navigation to custom
    // schemes, and attempting it freezes this page. The user taps the button.
    const timer = setTimeout(() => setStuck(true), 800);
    return () => clearTimeout(timer);
  }, []);

  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
      <div style={{ maxWidth: 360 }}>
        <p style={{ fontSize: 20, fontWeight: 700 }}>You’re signed in 🎉</p>
        <p style={{ marginTop: 8, opacity: 0.7 }}>Tap below to return to ReeF.</p>
        {target ? (
          <a
            href={target}
            style={{
              display: "inline-block",
              marginTop: 20,
              padding: "14px 28px",
              borderRadius: 999,
              background: "#0A84FF",
              color: "#fff",
              fontWeight: 700,
              textDecoration: "none",
              fontSize: 16,
            }}
          >
            Open ReeF
          </a>
        ) : (
          <p style={{ marginTop: 20 }}>Loading…</p>
        )}
        {stuck ? (
          <p style={{ marginTop: 16, fontSize: 13, opacity: 0.5 }}>
            If the button does nothing, switch back to the ReeF app manually — your session is ready.
          </p>
        ) : null}
        {target ? (
          <p style={{ marginTop: 20, fontSize: 11, opacity: 0.4, wordBreak: "break-all" }}>{target.split("?")[0]}</p>
        ) : null}
      </div>
    </main>
  );
}
