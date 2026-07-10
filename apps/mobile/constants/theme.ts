import { Platform } from 'react-native';
import { palette } from '@umbra/ui';

// Light palette mirrors @umbra/ui palette.light — the same tokens NativeWind's
// bg-background etc. resolve to — so messages/notifications match every other route.
export const LightColors = {
  ...palette.light,
  surfaceGlass: 'rgba(255, 255, 255, 0.85)',
  tint: palette.light.accent,
  tabIconDefault: palette.light.inkFaint,
  tabIconSelected: palette.light.accent,
  text: palette.light.ink,
  icon: palette.light.inkFaint,
};

export const DarkColors = {
  background: '#0e0e11',
  surface: '#18181c',
  surfaceGlass: 'rgba(30, 30, 36, 0.85)',
  surfaceMuted: '#232329',
  ink: '#f3f3f5',
  inkSoft: '#a7a7b2',
  inkFaint: '#6a6a76',
  border: 'rgba(255, 255, 255, 0.1)',
  borderStrong: 'rgba(255, 255, 255, 0.16)',
  accent: '#4da2ff',
  accentInk: '#bfe0ff',
  danger: '#ef6a60',
  onAccent: '#04243f',
  onInk: '#0e0e11',
  tint: '#4da2ff',
  tabIconDefault: '#6a6a76',
  tabIconSelected: '#4da2ff',
  text: '#f3f3f5',
  icon: '#6a6a76',
};

export const Colors = {
  light: LightColors,
  dark: DarkColors,
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
