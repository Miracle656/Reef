import { useEffect, useRef, useState } from "react";
import { Animated, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { palette } from "@umbra/ui";
import { card } from "./ui";

type Toast = { id: number; msg: string };

const TOAST_MS = 3000;
let listeners: ((msg: string) => void)[] = [];

/** Fire a transient toast from anywhere. A trailing "✓" marks it as a success. */
export function toast(msg: string) {
  listeners.forEach((l) => l(msg));
}

/** Mount once near the root; renders every toast raised via `toast()`. */
export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  const { bottom } = useSafeAreaInsets();

  useEffect(() => {
    const l = (msg: string) => {
      const id = Date.now() + Math.random();
      setItems((i) => [...i, { id, msg }]);
      setTimeout(() => setItems((i) => i.filter((x) => x.id !== id)), TOAST_MS);
    };
    listeners.push(l);
    return () => {
      listeners = listeners.filter((x) => x !== l);
    };
  }, []);

  if (items.length === 0) return null;
  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", left: 16, right: 16, bottom: bottom + 88, alignItems: "center", gap: 8 }}
    >
      {items.map((i) => (
        <ToastRow key={i.id} msg={i.msg} />
      ))}
    </View>
  );
}

function ToastRow({ msg }: { msg: string }) {
  const ok = msg.includes("✓");
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    const t = setTimeout(
      () => Animated.timing(enter, { toValue: 0, duration: 180, useNativeDriver: true }).start(),
      TOAST_MS - 200,
    );
    return () => clearTimeout(t);
  }, [enter]);

  return (
    <Animated.View
      style={[
        card,
        {
          width: "100%",
          maxWidth: 420,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingHorizontal: 16,
          paddingVertical: 12,
          opacity: enter,
          transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
        },
      ]}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: ok ? "#16c784" : palette.light.accent,
        }}
      >
        <Ionicons name={ok ? "checkmark" : "alert"} size={14} color="#fff" />
      </View>
      <Text style={{ fontFamily: "Expose-Medium", flex: 1, fontSize: 14, color: palette.light.ink }}>
        {msg.replace(/\s*✓\s*$/, "")}
      </Text>
    </Animated.View>
  );
}
