import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  type ViewStyle,
  type TextStyle,
  type PressableProps,
  type TextInputProps,
} from 'react-native';
import { Image } from 'expo-image';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

export function useTheme() {
  const scheme = useColorScheme();
  return Colors[scheme ?? 'light'];
}

// ---- Button ----------------------------------------------------------------

type ButtonVariant = 'primary' | 'accent' | 'outline' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends PressableProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: React.ReactNode;
}

/** True when children are pure text (string/number, or an array of them) so
 *  they must be wrapped in <Text> rather than dropped into a <View>. */
function isText(children: React.ReactNode): boolean {
  if (typeof children === 'string' || typeof children === 'number') return true;
  if (Array.isArray(children)) return children.every((c) => typeof c === 'string' || typeof c === 'number');
  return false;
}

export function Button({ variant = 'primary', size = 'md', children, disabled, style, ...props }: ButtonProps) {
  const t = useTheme();

  const variantStyle: ViewStyle = (() => {
    switch (variant) {
      case 'accent': return { backgroundColor: t.accent };
      case 'outline': return { backgroundColor: 'transparent', borderWidth: 1, borderColor: t.border };
      case 'danger': return { backgroundColor: t.danger };
      case 'ghost': return { backgroundColor: 'transparent' };
      default: return { backgroundColor: t.ink };
    }
  })();

  const textColor: string = (() => {
    switch (variant) {
      case 'accent': return t.onAccent;
      case 'outline': return t.ink;
      case 'danger': return '#ffffff';
      case 'ghost': return t.ink;
      default: return t.onInk;
    }
  })();

  const sizeStyle: ViewStyle = (() => {
    switch (size) {
      case 'sm': return { height: 36, paddingHorizontal: 16 };
      case 'lg': return { height: 56, paddingHorizontal: 28 };
      default: return { height: 44, paddingHorizontal: 20 };
    }
  })();

  const fontSize = size === 'sm' ? 14 : size === 'lg' ? 16 : 15;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.btn,
        variantStyle,
        sizeStyle,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style as ViewStyle,
      ]}
      disabled={disabled}
      {...props}
    >
      {isText(children) ? (
        <Text style={{ color: textColor, fontSize, fontWeight: '600' }}>{children}</Text>
      ) : (
        <View style={styles.btnInner}>{children}</View>
      )}
    </Pressable>
  );
}

// ---- Card ------------------------------------------------------------------

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: t.surface,
          borderRadius: 22,
          borderWidth: 1,
          borderColor: t.border,
          shadowColor: t.ink,
          shadowOpacity: 0.06,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 3,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ---- Input / Textarea ------------------------------------------------------

export function Input({ style, ...props }: TextInputProps) {
  const t = useTheme();
  return (
    <TextInput
      style={[
        {
          height: 44,
          backgroundColor: t.surfaceGlass,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: t.border,
          paddingHorizontal: 16,
          fontSize: 15,
          color: t.ink,
        },
        style,
      ]}
      placeholderTextColor={t.inkFaint}
      {...props}
    />
  );
}

export function Textarea({ style, ...props }: TextInputProps) {
  const t = useTheme();
  return (
    <TextInput
      multiline
      textAlignVertical="top"
      style={[
        {
          backgroundColor: t.surfaceGlass,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: t.border,
          paddingHorizontal: 16,
          paddingVertical: 12,
          fontSize: 15,
          color: t.ink,
          minHeight: 80,
        },
        style,
      ]}
      placeholderTextColor={t.inkFaint}
      {...props}
    />
  );
}

// ---- Avatar ----------------------------------------------------------------

export function Avatar({ src, name, size = 44 }: { src?: string | null; name: string; size?: number }) {
  const t = useTheme();
  const initials = name.replace(/^@/, '').slice(0, 2).toUpperCase();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: t.surfaceMuted,
        borderWidth: 1,
        borderColor: t.border,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {src ? (
        <Image source={{ uri: src }} style={{ width: size, height: size }} contentFit="cover" />
      ) : (
        <Text style={{ color: t.ink, fontSize: size * 0.36, fontWeight: '700' }}>{initials}</Text>
      )}
    </View>
  );
}

// ---- Spinner ---------------------------------------------------------------

export function Spinner({ color }: { color?: string }) {
  const t = useTheme();
  return <ActivityIndicator color={color ?? t.accent} />;
}

// ---- Badge -----------------------------------------------------------------

export function Badge({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: t.surfaceGlass,
          borderRadius: 100,
          borderWidth: 1,
          borderColor: t.border,
          paddingHorizontal: 12,
          paddingVertical: 4,
          alignSelf: 'flex-start',
        },
        style,
      ]}
    >
      {typeof children === 'string' ? (
        <Text style={{ color: t.ink, fontSize: 12, fontWeight: '500' }}>{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}

// ---- Shared styles ---------------------------------------------------------

const styles = StyleSheet.create({
  btn: {
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  btnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
});

// ---- Typed text helpers ----------------------------------------------------

export function Heading({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  const t = useTheme();
  return (
    <Text style={[{ color: t.ink, fontSize: 24, fontWeight: '700', letterSpacing: -0.5 }, style]}>
      {children}
    </Text>
  );
}

export function Body({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  const t = useTheme();
  return <Text style={[{ color: t.ink, fontSize: 15, lineHeight: 22 }, style]}>{children}</Text>;
}

export function Caption({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  const t = useTheme();
  return <Text style={[{ color: t.inkSoft, fontSize: 13 }, style]}>{children}</Text>;
}
