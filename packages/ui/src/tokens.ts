/**
 * Umbra design tokens — the single source of truth for both web (Tailwind v4
 * via `theme.css`) and mobile (NativeWind, later). Aesthetic: smooth, clean
 * neobrutalism. Near-monochrome paper/ink palette, one sparing teal accent,
 * hard (not blurry) offset shadows, softened corners. Confident, not loud.
 */

export const palette = {
  light: {
    background: "#F5F6F9", // cool off-white (matches web)
    surface: "#FFFFFF",
    surfaceMuted: "#ECEEF2",
    ink: "#16161A",
    inkSoft: "#565660",
    inkFaint: "#9A9AA6",
    border: "#E6E8EE", // soft divider
    borderStrong: "#D7DAE2", // soft edge (liquid, not brutalist)
    accent: "#0A84FF", // Sui blue
    accentInk: "#0A4EA3",
    danger: "#E2554A",
    onAccent: "#FFFFFF",
    onInk: "#F7F8FA",
  },
  dark: {
    background: "#121214",
    surface: "#1A1A1D",
    surfaceMuted: "#222226",
    ink: "#F4F4F5",
    inkSoft: "#A1A1AA",
    inkFaint: "#6B6B73",
    border: "#2C2C31",
    borderStrong: "#F4F4F5",
    accent: "#4DA2FF",
    accentInk: "#BFE0FF",
    danger: "#EF6A60",
    onAccent: "#04243F",
    onInk: "#121214",
  },
} as const;

/** 4px base spacing scale. */
export const spacing = {
  0: "0px",
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "20px",
  6: "24px",
  8: "32px",
  10: "40px",
  12: "48px",
  16: "64px",
} as const;

export const radius = {
  sm: "6px",
  md: "10px", // default — softened brutalism
  lg: "14px",
  full: "9999px",
} as const;

/** Hard, offset neobrutalist shadows (no blur). */
export const shadow = {
  sm: "2px 2px 0 0 var(--shadow-color)",
  md: "4px 4px 0 0 var(--shadow-color)",
  lg: "6px 6px 0 0 var(--shadow-color)",
  none: "0 0 0 0 transparent",
} as const;

export const motion = {
  fast: "120ms",
  base: "200ms",
  slow: "320ms",
  ease: "cubic-bezier(0.22, 1, 0.36, 1)", // smooth ease-out
} as const;

export const typography = {
  fontSans: "var(--font-sans, ui-sans-serif, system-ui, sans-serif)",
  fontMono: "var(--font-mono, ui-monospace, monospace)",
  weights: { regular: 400, medium: 500, semibold: 600, bold: 700 },
} as const;

export const borderWidth = {
  hairline: "1px",
  base: "1.5px",
  thick: "2px", // ink edges
} as const;

export type Palette = typeof palette;
export const tokens = { palette, spacing, radius, shadow, motion, typography, borderWidth } as const;
export type Tokens = typeof tokens;
