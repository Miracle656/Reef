import { useState } from "react";
import { Pressable } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { palette } from "@umbra/ui";

/** Tap to copy a value to the clipboard; shows a checkmark briefly. */
export function CopyButton({ value, size = 18 }: { value: string; size?: number }) {
  const [copied, setCopied] = useState(false);
  return (
    <Pressable
      hitSlop={8}
      onPress={async () => {
        await Clipboard.setStringAsync(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      <Ionicons name={copied ? "checkmark-circle" : "copy-outline"} size={size} color={copied ? "#16c784" : palette.light.inkSoft} />
    </Pressable>
  );
}
