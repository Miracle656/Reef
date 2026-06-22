import { ActivityIndicator, Image, Pressable, Text, TextInput, View, type TextInputProps } from "react-native";
import { palette } from "@umbra/ui";

/** Hard offset neobrutalist shadow (iOS shadow + Android elevation). */
export const neoShadow = {
  borderWidth: 2,
  borderColor: palette.light.borderStrong,
  borderRadius: 10,
  shadowColor: palette.light.borderStrong,
  shadowOffset: { width: 3, height: 3 },
  shadowOpacity: 1,
  shadowRadius: 0,
  elevation: 3,
} as const;

type ButtonVariant = "primary" | "accent" | "outline";

const bg: Record<ButtonVariant, string> = {
  primary: "bg-ink",
  accent: "bg-accent",
  outline: "bg-surface",
};
const fg: Record<ButtonVariant, string> = {
  primary: "text-on-ink",
  accent: "text-on-accent",
  outline: "text-ink",
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
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        neoShadow,
        {
          opacity: disabled ? 0.5 : 1,
          transform: [{ translateX: pressed ? 2 : 0 }, { translateY: pressed ? 2 : 0 }],
          shadowOffset: { width: pressed ? 0 : 3, height: pressed ? 0 : 3 },
        },
      ]}
      className={`h-12 flex-row items-center justify-center gap-2 px-5 ${bg[variant]}`}
    >
      {loading ? <ActivityIndicator color={variant === "outline" ? palette.light.ink : palette.light.onInk} /> : null}
      <Text className={`text-base font-semibold ${fg[variant]}`}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <View style={neoShadow} className={`bg-surface p-4 ${className}`}>
      {children}
    </View>
  );
}

export function Field(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={palette.light.inkFaint}
      {...props}
      style={[{ borderWidth: 2, borderColor: palette.light.borderStrong, borderRadius: 10 }, props.style]}
      className="bg-surface px-3 py-3 text-ink"
    />
  );
}

export function Avatar({ uri, name, size = 44 }: { uri?: string | null; name: string; size?: number }) {
  const initials = name.replace(/^@/, "").slice(0, 2).toUpperCase();
  return (
    <View
      style={{ width: size, height: size, borderWidth: 2, borderColor: palette.light.borderStrong, borderRadius: 10 }}
      className="items-center justify-center overflow-hidden bg-surface-muted"
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} />
      ) : (
        <Text className="font-bold text-ink" style={{ fontSize: size * 0.34 }}>
          {initials}
        </Text>
      )}
    </View>
  );
}

export function Spinner() {
  return <ActivityIndicator color={palette.light.ink} />;
}
