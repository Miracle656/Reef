import type { Metadata } from "next";
import localFont from "next/font/local";
import { Space_Mono } from "next/font/google";
import { Toaster } from "@/components/toaster";
import { Providers } from "./providers";
import "./globals.css";

// Brand typeface — Expose (Fontshare). Static weights for reliable rendering;
// used across the whole app (theme.css maps --font-sans/--font-mono to it,
// globals.css pins it on html/body).
const expose = localFont({
  src: [
    { path: "./fonts/Expose-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/Expose-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/Expose-Bold.woff2", weight: "700", style: "normal" },
    { path: "./fonts/Expose-Black.woff2", weight: "900", style: "normal" },
  ],
  variable: "--font-expose",
  display: "swap",
});

// Mono accent typeface — Space Mono. Used for labels, handles, timestamps,
// tickers and eyebrows (theme.css maps --font-mono to it).
const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ReeF",
  description: "A Sui-native decentralized social superapp.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${expose.variable} ${spaceMono.variable}`}>
      <body className="min-h-dvh bg-background text-ink antialiased">
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
