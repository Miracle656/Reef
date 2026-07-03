import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter, Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, useTheme } from '@/components/ui';
import { FollowButton } from '@/components/follow-button';
import { ProfileView } from '@/components/profile-view';
import { BackIcon } from '@/components/messages/icons';
import { MOCK_AUTHORS } from '@/lib/mock';

export default function ProfileScreen() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const p = handle ? MOCK_AUTHORS[handle] ?? null : null;

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      {/* floating back button over the banner */}
      <Pressable
        onPress={() => router.back()}
        style={[styles.back, { top: insets.top + 8, backgroundColor: 'rgba(0,0,0,0.35)' }]}
        hitSlop={8}
      >
        <BackIcon size={22} color="#fff" />
      </Pressable>

      {!p ? (
        <View style={styles.notFound}>
          <Text style={{ color: t.inkSoft, fontSize: 15 }}>@{handle} not found.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
          <ProfileView
            author={p}
            rightAction={<FollowButton handle={p.handle} />}
            extra={
              <Card style={styles.coinsCard}>
                <View style={styles.coinRow}>
                  <View>
                    <Text style={{ color: t.ink, fontWeight: '600' }}>$LAGOS</Text>
                    <Text style={{ color: t.inkSoft, fontSize: 12 }}>{p.displayName} coin</Text>
                  </View>
                  <Link href="/trade" asChild>
                    <Button variant="accent" size="sm">Trade</Button>
                  </Link>
                </View>
              </Card>
            }
          />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  back: { position: 'absolute', left: 12, zIndex: 10, width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  notFound: { flex: 1, paddingVertical: 96, alignItems: 'center', justifyContent: 'center' },
  coinsCard: { padding: 16, marginTop: 16 },
  coinRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
