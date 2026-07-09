import { ActivityIndicator, Platform, Pressable, Text, TextInput, View, type TextInputProps } from "react-native";
import { palette } from "@umbra/ui";
import { RemoteImage } from "./remote-image";

/** Monospace accents (handles, timestamps, numbers) — the design uses Space
 *  Mono; the platform mono is the closest zero-dependency match. */
export const MONO = Platform.select({ ios: "Menlo", default: "monospace" });

/** Soft "liquid" surface — rounded, gentle shadow, hairline border (no hard brutalist edge). */
export const card = {
  borderRadius: 20,
  backgroundColor: palette.light.surface,
  borderWidth: 1,
  borderColor: palette.light.border,
  shadowColor: "#16161A",
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.07,
  shadowRadius: 18,
  elevation: 3,
} as const;

// Back-compat alias (older imports used `neoShadow`).
export const neoShadow = card;

type ButtonVariant = "primary" | "accent" | "outline" | "danger";

const bg: Record<ButtonVariant, string> = {
  primary: "bg-ink",
  accent: "bg-accent",
  outline: "bg-surface",
  danger: "bg-danger",
};
const fg: Record<ButtonVariant, string> = {
  primary: "text-on-ink",
  accent: "text-on-accent",
  outline: "text-ink",
  danger: "text-white",
};

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
}) {
  const soft = variant === "accent" || variant === "danger";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => ({
        // rounding/border/bg live in className (NativeWind applies those reliably);
        // only interaction + shadow stay inline.
        opacity: disabled ? 0.5 : pressed ? 0.92 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }],
        ...(soft
          ? {
              shadowColor: variant === "danger" ? palette.light.danger : palette.light.accent,
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.3,
              shadowRadius: 12,
              elevation: 4,
            }
          : {}),
      })}
      className={`h-12 flex-row items-center justify-center gap-2 rounded-full px-5 ${bg[variant]} ${variant === "outline" ? "border border-border" : ""}`}
    >
      {loading ? <ActivityIndicator color={variant === "outline" ? palette.light.ink : "#fff"} /> : null}
      <Text style={{ fontFamily: "Expose-Bold" }} className={`text-base ${fg[variant]}`}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <View style={card} className={`p-4 ${className}`}>
      {children}
    </View>
  );
}

export function Field(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={palette.light.inkFaint}
      {...props}
      style={[{ borderWidth: 1, borderColor: palette.light.border, borderRadius: 14, backgroundColor: palette.light.surface }, props.style]}
      className="px-3.5 py-3 text-ink"
    />
  );
}

export function Avatar({ uri, name, size = 44 }: { uri?: string | null; name: string; size?: number }) {
  const initials = name.replace(/^@/, "").slice(0, 2).toUpperCase();
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: "#fff" }}
      className="items-center justify-center overflow-hidden bg-surface-muted shadow-sm"
    >
      {uri ? (
        <RemoteImage uri={uri} style={{ width: size, height: size }} />
      ) : (
        <Text className="font-bold text-ink" style={{ fontSize: size * 0.34, fontFamily: "Expose-Bold" }}>
          {initials}
        </Text>
      )}
    </View>
  );
}

export function Spinner() {
  return <ActivityIndicator color={palette.light.accent} />;
}
