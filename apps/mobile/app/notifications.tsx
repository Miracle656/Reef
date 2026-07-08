import { useEffect } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme, Avatar } from '@/components/ui';
import { Screen } from '@/components/screen';
import { BackIcon } from '@/components/messages/icons';
import { MOCK_NOTIFICATIONS, type MockNotification } from '@/lib/mock';
import { markNotificationsSeen } from '@/lib/notifications';
import { timeAgo } from '@/lib/utils';

function verbFor(n: MockNotification): string {
  const target = n.targetIsReply ? 'comment' : 'post';
  switch (n.type) {
    case 'follow': return 'followed you';
    case 'like': return `liked your ${target}`;
    case 'repost': return `reposted your ${target}`;
    case 'reply': return `replied to your ${target}`;
    case 'mention': return 'mentioned you';
  }
}

export default function NotificationsScreen() {
  const t = useTheme();
  const router = useRouter();

  useEffect(() => {
    markNotificationsSeen();
  }, []);

  return (
    <Screen style={{ backgroundColor: t.background }}>
      <View style={[styles.header, { borderBottomColor: t.border }]}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <BackIcon size={22} color={t.ink} />
        </Pressable>
        <Text style={[styles.title, { color: t.ink }]}>Notifications</Text>
      </View>

      {!MOCK_NOTIFICATIONS.length ? (
        <View style={styles.empty}>
          <Text style={{ color: t.inkSoft, fontSize: 15, textAlign: 'center' }}>
            No notifications yet — when someone follows, likes, or replies to you, it shows up here.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
          {MOCK_NOTIFICATIONS.map((n) => (
            <Pressable
              key={n.id}
              onPress={() => n.postId && router.push(`/p/${n.postId}` as never)}
              style={[styles.row, { borderBottomColor: t.border }]}
            >
              <Avatar name={n.actor.displayName} src={n.actor.avatar} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.ink, fontSize: 14 }}>
                  <Text style={{ fontWeight: '700' }}>{n.actor.displayName}</Text> {verbFor(n)}
                </Text>
                <Text style={{ color: t.inkFaint, fontSize: 12, marginTop: 2 }}>{timeAgo(n.createdAtMs)}</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 8, borderBottomWidth: 1 },
  back: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 19, fontWeight: '800' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
});
