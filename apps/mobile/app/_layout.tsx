import "@/lib/crypto-polyfill";
import "../global.css";
import React, { useState } from "react";
import { Text, TextInput } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { Ionicons } from "@expo/vector-icons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { palette } from "@umbra/ui";
import { AuthProvider } from "@/lib/auth";
import { MessagingProvider } from "@/lib/messaging/provider";
import { Splash } from "@/components/splash";

const queryClient = new QueryClient();

// Make Expose the app-wide default font. We merge fontFamily into the *input*
// props before calling the original render (the safe, standard pattern), so even
// NativeWind-styled <Text> gets it; any explicit fontFamily a component sets
// (e.g. "Expose-Bold") still wins because it comes last in the style array.
/* eslint-disable @typescript-eslint/no-explicit-any */
function patchDefaultFont() {
  try {
    for (const Comp of [Text, TextInput] as any[]) {
      if (typeof Comp.render !== "function" || Comp.__reef) continue;
      const orig = Comp.render;
      Comp.__reef = true;
      Comp.render = function (props: any, ref: any) {
        return orig.call(this, { ...props, style: [{ fontFamily: "Expose" }, props?.style] }, ref);
      };
    }
  } catch {
    // best-effort; never let the font hook crash the app
  }
}
patchDefaultFont();

export default function RootLayout() {
  const [loaded] = useFonts({
    Expose: require("../assets/fonts/Expose-Regular.otf"),
    "Expose-Medium": require("../assets/fonts/Expose-Medium.otf"),
    "Expose-Bold": require("../assets/fonts/Expose-Bold.otf"),
    "Expose-Black": require("../assets/fonts/Expose-Black.otf"),
    // Preload the icon font — lazy auto-load fails silently under our Metro
    // package-exports config, leaving blank glyphs.
    ...Ionicons.font,
  });
  const [splashGone, setSplashGone] = useState(false);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MessagingProvider>
            <StatusBar style={splashGone ? "dark" : "light"} />
            {loaded ? <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.light.background } }} /> : null}
            {!splashGone ? <Splash ready={loaded} onDone={() => setSplashGone(true)} /> : null}
          </MessagingProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
