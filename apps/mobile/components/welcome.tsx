import { Image, Pressable, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { MONO, Spinner } from "./ui";

/**
 * Signed-out welcome — "the beach party is on". Aqua→deep-blue gradient,
 * the walrus mascot, and a single white Continue-with-Google button
 * (zkLogin via Enoki; Apple is a teaser for later).
 */
export function Welcome({
  onGoogle,
  loading,
  configured,
}: {
  onGoogle: () => void;
  loading: boolean;
  configured: boolean;
}) {
  return (
    <LinearGradient
      colors={["#7CFCD8", "#18C2C2", "#0A84FF", "#073A7D"]}
      locations={[0, 0.3, 0.66, 1]}
      start={{ x: 0.4, y: 0 }}
      end={{ x: 0.6, y: 1 }}
      style={{ flex: 1, alignItems: "center", justifyContent: "space-between", paddingTop: 96, paddingBottom: 46, paddingHorizontal: 28, overflow: "hidden" }}
    >
      <StatusBar style="light" />
      {/* soft bubbles */}
      <View style={{ position: "absolute", top: 120, left: -60, width: 240, height: 240, borderRadius: 120, backgroundColor: "rgba(255,255,255,.14)" }} />
      <View style={{ position: "absolute", bottom: 180, right: -50, width: 180, height: 180, borderRadius: 90, backgroundColor: "rgba(255,255,255,.10)" }} />

      <Text style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2.4, textTransform: "uppercase", color: "rgba(255,255,255,.85)" }}>
        Sui-native · walletless
      </Text>

      <View style={{ alignItems: "center", gap: 18 }}>
        <Image
          source={require("../assets/reef-logo.png")}
          style={{ width: 170, height: 200, resizeMode: "contain" }}
        />
        <Text style={{ fontFamily: "Expose-Black", fontSize: 76, letterSpacing: -3, color: "#fff", lineHeight: 76, textShadowColor: "rgba(0,0,0,.25)", textShadowOffset: { width: 0, height: 10 }, textShadowRadius: 40 }}>
          ReeF
        </Text>
        <Text style={{ fontFamily: MONO, fontSize: 12, letterSpacing: 1.9, textTransform: "uppercase", color: "rgba(255,255,255,.9)" }}>
          The beach party is on
        </Text>
      </View>

      <View style={{ width: "100%", alignItems: "center", gap: 16 }}>
        <Pressable
          onPress={onGoogle}
          disabled={!configured || loading}
          // static style object — style-as-function gets dropped under our
          // NativeWind setup (same reason ui.tsx Button keeps visuals static)
          style={{
            width: "100%",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 11,
            backgroundColor: "#ffffff",
            paddingVertical: 17,
            borderRadius: 18,
            opacity: !configured || loading ? 0.7 : 1,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 14 },
            shadowOpacity: 0.18,
            shadowRadius: 30,
            elevation: 8,
          }}
        >
          {loading ? (
            <Spinner />
          ) : (
            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: "#15151A", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontFamily: "Expose-Black", fontSize: 14, color: "#fff" }}>G</Text>
            </View>
          )}
          <Text style={{ fontFamily: "Expose-Bold", fontSize: 17, color: "#15151A" }}>
            {configured ? "Continue with Google" : "Sign-in not configured"}
          </Text>
        </Pressable>

        <View
          style={{
            width: "100%",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            backgroundColor: "rgba(255,255,255,.16)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,.3)",
            paddingVertical: 14,
            borderRadius: 18,
            opacity: 0.9,
          }}
        >
          <Ionicons name="logo-apple" size={18} color="#fff" />
          <Text style={{ fontFamily: "Expose-Medium", fontSize: 15, color: "#fff" }}>Continue with Apple</Text>
          <Text style={{ fontFamily: MONO, fontSize: 9, color: "rgba(255,255,255,.7)", letterSpacing: 1 }}>SOON</Text>
        </View>

        <Text style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 0.8, color: "rgba(255,255,255,.78)", textAlign: "center", lineHeight: 17, marginTop: 4 }}>
          No seed phrase · no gas · self-custodial{"\n"}secured by zkLogin · Enoki
        </Text>
      </View>
    </LinearGradient>
  );
}
