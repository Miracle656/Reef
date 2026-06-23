import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BottomNav } from "@/components/bottom-nav";
import { Toaster } from "@/components/toaster";
import { Providers } from "./providers";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Umbra",
  description: "A Sui-native decentralized social superapp.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh bg-background text-ink antialiased">
        <Providers>
          {children}
          <BottomNav />
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
