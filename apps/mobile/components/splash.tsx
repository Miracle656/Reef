import { useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Image, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from "react-native-svg";

const { width, height } = Dimensions.get("window");
const WORD = Math.min(width * 0.42, 176); // wordmark width
const MASCOT = Math.min(width * 0.38, 160);

/**
 * Launch splash in the onboarding palette: the mint→teal→blue gradient from the
 * design, soft bubbles, the walrus mascot springing in with the wordmark under
 * it. Fades out once the app is ready (fonts loaded) and a minimum on-screen
 * time has passed.
 */
export function Splash({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const scale = useRef(new Animated.Value(0.8)).current;
  const wordOp = useRef(new Animated.Value(0)).current;
  const subOp = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const finished = useRef(false);
  const [minElapsed, setMinElapsed] = useState(false);
  const [force, setForce] = useState(false);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 6, tension: 55, useNativeDriver: true }),
      Animated.timing(wordOp, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(subOp, { toValue: 1, duration: 700, delay: 350, useNativeDriver: true }),
    ]).start();
    const t = setTimeout(() => setMinElapsed(true), 1500);
    const max = setTimeout(() => setForce(true), 4000); // safety: never trap the app
    return () => {
      clearTimeout(t);
      clearTimeout(max);
    };
  }, [scale, wordOp, subOp]);

  // Dismiss once fonts are ready AND the minimum time elapsed (or the safety cap).
  useEffect(() => {
    if (finished.current) return;
    if ((ready && minElapsed) || force) {
      finished.current = true;
      Animated.timing(fade, { toValue: 0, duration: 550, useNativeDriver: true }).start(() => onDone());
    }
  }, [ready, minElapsed, force, fade, onDone]);

  return (
    <Animated.View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#073a7d", opacity: fade, zIndex: 999, elevation: 999 }}>
      <Svg width="100%" height="100%" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
        <Defs>
          <LinearGradient id="reef" x1="0.4" y1="0" x2="0.6" y2="1">
            <Stop offset="0" stopColor="#7CFCD8" />
            <Stop offset="0.3" stopColor="#18C2C2" />
            <Stop offset="0.66" stopColor="#0A84FF" />
            <Stop offset="1" stopColor="#073a7d" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#reef)" />
        <Circle cx={width * 0.06} cy={height * 0.24} r={120} fill="#ffffff" opacity={0.14} />
        <Circle cx={width * 0.94} cy={height * 0.72} r={90} fill="#ffffff" opacity={0.1} />
        <Circle cx={width * 0.24} cy={height * 0.78} r={26} fill="#ffffff" opacity={0.12} />
      </Svg>

      {/* the reef bed from the web footer, anchored to the sea floor
          (its top edge fades to transparent in the asset itself, so it
          dissolves into the gradient with no seam) */}
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", overflow: "hidden" }}>
        <Image
          source={require("../assets/reef-bed.png")}
          style={{ width: width * 1.5, height: width * 1.5 * (126 / 1080) }}
          resizeMode="cover"
        />
      </View>

      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Animated.Image
          source={require("../assets/reef-logo.png")}
          style={{
            width: MASCOT,
            height: MASCOT * 1.16,
            resizeMode: "contain",
            opacity: wordOp,
            transform: [{ scale }],
          }}
        />
        <Animated.Image
          source={require("../assets/reef-wordmark.png")}
          style={{
            width: WORD,
            height: WORD / 3.52,
            marginTop: 18,
            resizeMode: "contain",
            tintColor: "#fff",
            opacity: wordOp,
            transform: [{ scale }],
          }}
        />
        <Animated.Text
          style={{ fontFamily: "Expose-Bold", marginTop: 12, letterSpacing: 4, fontSize: 11, color: "rgba(255,255,255,0.9)", opacity: subOp }}
        >
          THE SOCIAL LAYER OF SUI
        </Animated.Text>
      </View>
    </Animated.View>
  );
}
