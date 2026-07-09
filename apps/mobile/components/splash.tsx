import { useEffect, useRef, useState } from "react";
import { Animated, Dimensions, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from "react-native-svg";

const { width, height } = Dimensions.get("window");
const WORD = Math.min(width * 0.26, 132);

/**
 * Beach-party launch splash: an ocean→sunset gradient with a glowing sun, a few
 * bubbles, and a big "ReeF" wordmark that springs in. Fades out once the app is
 * ready (fonts loaded) and a minimum on-screen time has passed.
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
    <Animated.View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#04263f", opacity: fade, zIndex: 999, elevation: 999 }}>
      <Svg width="100%" height="100%" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
        <Defs>
          <LinearGradient id="ocean" x1="0" y1="0" x2="0.35" y2="1">
            <Stop offset="0" stopColor="#04263f" />
            <Stop offset="0.42" stopColor="#0a84ff" />
            <Stop offset="0.72" stopColor="#18c2c2" />
            <Stop offset="1" stopColor="#ff8a5b" />
          </LinearGradient>
          <LinearGradient id="sun" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#fff3c4" />
            <Stop offset="0.55" stopColor="#ffd166" />
            <Stop offset="1" stopColor="#ff8a5b" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#ocean)" />
        <Circle cx={width * 0.8} cy={height * 0.2} r={72} fill="url(#sun)" opacity={0.92} />
        <Circle cx={width * 0.16} cy={height * 0.32} r={34} fill="#ffffff" opacity={0.1} />
        <Circle cx={width * 0.28} cy={height * 0.7} r={20} fill="#ffffff" opacity={0.12} />
        <Circle cx={width * 0.78} cy={height * 0.68} r={46} fill="#ffffff" opacity={0.08} />
      </Svg>

      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Animated.Image
          source={require("../assets/reef-wordmark.png")}
          style={{
            width: WORD * 2.9,
            height: (WORD * 2.9) / 3.52,
            resizeMode: "contain",
            tintColor: "#fff",
            opacity: wordOp,
            transform: [{ scale }],
          }}
        />
        <Animated.Text
          style={{ fontFamily: "Expose-Bold", marginTop: 6, letterSpacing: 4, fontSize: 12, color: "rgba(255,255,255,0.85)", opacity: subOp }}
        >
          THE SOCIAL LAYER OF SUI
        </Animated.Text>
      </View>
    </Animated.View>
  );
}
