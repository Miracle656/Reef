// NativeWind v4 (Tailwind v3). Palette mirrors @umbra/ui tokens (light theme).
const { palette, radius } = require("@umbra/ui");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: palette.light.background,
        surface: palette.light.surface,
        "surface-muted": palette.light.surfaceMuted,
        ink: palette.light.ink,
        "ink-soft": palette.light.inkSoft,
        "ink-faint": palette.light.inkFaint,
        border: palette.light.border,
        "border-strong": palette.light.borderStrong,
        accent: palette.light.accent,
        "accent-ink": palette.light.accentInk,
        danger: palette.light.danger,
        "on-accent": palette.light.onAccent,
        "on-ink": palette.light.onInk,
      },
      borderRadius: { sm: radius.sm, md: radius.md, lg: radius.lg },
    },
  },
  plugins: [],
};
