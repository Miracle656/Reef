import { useEffect, useState } from "react";
import { DeviceEventEmitter } from "react-native";
import * as SecureStore from "expo-secure-store";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "./trpc";
import { useAuth } from "./auth";

/**
 * Real notifications from the indexer (follows / likes / reposts / replies /
 * mentions), plus a device-local "last seen" timestamp for the unread badge.
 */

export type Notification = {
  type: "follow" | "reply" | "like" | "repost" | "mention";
  postId?: string;
  preview?: string;
  targetIsReply?: boolean;
  createdAtMs: number;
  actor: {
    address: string;
    handle: string | null;
    displayName: string | null;
    avatarBlobId: string | null;
  };
};

const SEEN_EVENT = "reef:notif-seen";
const SEEN_KEY = "reef.notifSeenAt";

let seenAt = 0;
void SecureStore.getItemAsync(SEEN_KEY).then((v) => {
  if (v) {
    seenAt = Number(v) || 0;
    DeviceEventEmitter.emit(SEEN_EVENT);
  }
});

export function markNotificationsSeen() {
  seenAt = Date.now();
  void SecureStore.setItemAsync(SEEN_KEY, String(seenAt));
  DeviceEventEmitter.emit(SEEN_EVENT);
}

export function useNotifications() {
  const { address } = useAuth();
  return useQuery({
    queryKey: ["notifications", address],
    queryFn: async (): Promise<Notification[]> => trpc.notifications.query({ address: address! }),
    enabled: Boolean(address),
    refetchInterval: 30_000,
  });
}

export function useUnreadNotifications() {
  const notifs = useNotifications();
  const [, bump] = useState(0);
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(SEEN_EVENT, () => bump((x) => x + 1));
    return () => sub.remove();
  }, []);
  return (notifs.data ?? []).filter((n) => n.createdAtMs > seenAt).length;
}
