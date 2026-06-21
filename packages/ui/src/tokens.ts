/**
 * Umbra design tokens — the single source of truth for both web (Tailwind v4
 * via `theme.css`) and mobile (NativeWind, later). Aesthetic: smooth, clean
 * neobrutalism. Near-monochrome paper/ink palette, one sparing teal accent,
 * hard (not blurry) offset shadows, softened corners. Confident, not loud.
 */

export const palette = {
  light: {
    background: "#FBFBF9", // warm paper
    surface: "#FFFFFF",
    surfaceMuted: "#F3F3F0",
    ink: "#1B1B1F", // near-black — text + brutalist borders
    inkSoft: "#52525B",
    inkFaint: "#A1A1AA",
    border: "#E5E5E1", // subtle divider
    borderStrong: "#1B1B1F", // the neobrutalist ink edge
    accent: "#2DA89E", // muted teal — used sparingly
    accentInk: "#0F4C47",
    danger: "#D2483F",
    onAccent: "#FFFFFF",
    onInk: "#FBFBF9",
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
    accent: "#34C3B7",
    accentInk: "#A7E8E1",
    danger: "#E5675E",
    onAccent: "#0B2C29",
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
