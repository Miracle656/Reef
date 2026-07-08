import { useEffect, useState } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { MOCK_NOTIFICATIONS } from './mock';

const SEEN_EVENT = 'reef:notif-seen';
let seenAt = 0;

export function markNotificationsSeen() {
  seenAt = Date.now();
  DeviceEventEmitter.emit(SEEN_EVENT);
}

export function useUnreadNotifications() {
  const [, bump] = useState(0);
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(SEEN_EVENT, () => bump((x) => x + 1));
    return () => sub.remove();
  }, []);
  return MOCK_NOTIFICATIONS.filter((n) => n.createdAtMs > seenAt).length;
}
