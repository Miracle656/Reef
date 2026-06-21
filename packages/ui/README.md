# @umbra/ui

Umbra's design system: **smooth, clean neobrutalism**. Near-monochrome paper/ink
palette, 2px ink borders, hard (no-blur) offset shadows, softened corners, and a
single sparing teal accent. Confident, not loud.

- `src/tokens.ts` — framework-agnostic tokens (palette light/dark, spacing,
  radius, hard shadows, motion, type). Consumed by web (Tailwind) and mobile
  (NativeWind, later).
- `src/theme.css` — Tailwind v4 theme: CSS-var tokens + `.dark`, the `neo` /
  `neo-press` interaction utilities, minimal scrollbars. Imported by `apps/web`.

```css
@import "tailwindcss";
@import "@umbra/ui/theme.css";
```
