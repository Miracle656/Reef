import { Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { palette } from "@umbra/ui";

const black = { fontFamily: "Expose-Black" } as const;
const bold = { fontFamily: "Expose-Bold" } as const;

/** Apply a keypad press to a numeric string. */
export function applyKey(cur: string, key: string): string {
  if (key === "⌫") {
    const next = cur.slice(0, -1);
    return next === "" ? "0" : next;
  }
  if (key === ".") return cur.includes(".") ? cur : `${cur}.`;
  if (cur === "0") return key; // replace leading zero
  return `${cur}${key}`;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"];

/** In-app numeric keypad sheet shared by the trade + asset swap screens. */
export function Keypad({ visible, onKey, onDone }: { visible: boolean; onKey: (k: string) => void; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDone}>
      <Pressable className="flex-1" onPress={onDone} />
      <View style={{ paddingBottom: Math.max(insets.bottom, 12) }} className="rounded-t-3xl border-t border-border bg-surface px-4 pt-3">
        <View className="mb-1 flex-row items-center justify-between">
          <View />
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: palette.light.border }} />
          <Pressable onPress={onDone} className="rounded-full bg-accent px-4 py-1.5">
            <Text style={bold} className="text-sm text-on-accent">Done</Text>
          </Pressable>
        </View>
        <View className="flex-row flex-wrap">
          {KEYS.map((k) => (
            <Pressable key={k} onPress={() => onKey(k)} style={{ width: "33.33%" }} className="items-center justify-center py-4">
              <Text style={black} className="text-2xl text-ink">{k}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}
