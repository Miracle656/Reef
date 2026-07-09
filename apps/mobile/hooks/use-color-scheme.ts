// The app is light-only for now (the design's dark surfaces — trade, predict —
// are per-screen, not a theme). Pin messages/notifications to the light palette
// so they never flip dark while the rest of the app stays light.
export function useColorScheme(): "light" | "dark" {
  return "light";
}
