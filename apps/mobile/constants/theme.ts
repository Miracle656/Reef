import { Platform } from 'react-native';

export const LightColors = {
  background: '#f5f6f9',
  surface: '#ffffff',
  surfaceGlass: 'rgba(255, 255, 255, 0.85)',
  surfaceMuted: '#eceef2',
  ink: '#16161a',
  inkSoft: '#565660',
  inkFaint: '#9a9aa6',
  border: 'rgba(22, 22, 26, 0.08)',
  borderStrong: 'rgba(22, 22, 26, 0.14)',
  accent: '#0a84ff',
  accentInk: '#0a4ea3',
  danger: '#e2554a',
  onAccent: '#ffffff',
  onInk: '#f7f8fa',
  tint: '#0a84ff',
  tabIconDefault: '#9a9aa6',
  tabIconSelected: '#0a84ff',
  text: '#16161a',
  icon: '#9a9aa6',
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
