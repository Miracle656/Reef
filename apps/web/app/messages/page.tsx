"use client";

import { useSocialAccount } from "@/lib/account";
import { Landing } from "@/components/landing";
import { MessagesApp } from "./components/messages-app";

export default function MessagesPage() {
  const account = useSocialAccount();
  // Signed-out visitors get the marketing landing (matches the rest of the app).
  if (!account) return <Landing />;
  return <MessagesApp />;
}
