import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Link } from 'expo-router';
import { Avatar, Button, Card, Spinner, useTheme } from '@/components/ui';
import { FollowButton } from '@/components/follow-button';
import { PostCard } from '@/components/post-card';
import { MOCK_AUTHORS, MOCK_POSTS } from '@/lib/mock';

export default function ProfileScreen() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const t = useTheme();
  const router = useRouter();
  const p = handle ? MOCK_AUTHORS[handle] ?? null : null;
  const posts = p ? MOCK_POSTS.filter((post) => post.author.handle === handle) : [];

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.container}>
      <Button variant="ghost" size="sm" onPress={() => router.back()} style={{ alignSelf: 'flex-start' } as any}>
        ← Back
      </Button>

      {!p ? (
        <View style={styles.notFound}>
          <Text style={{ color: t.inkSoft, fontSize: 15 }}>@{handle} not found.</Text>
        </View>
      ) : (
        <>
          <Card style={styles.profileCard}>
            <View style={styles.profileHead}>
              <Avatar name={p.handle} size={72} />
              <FollowButton handle={p.handle} />
            </View>
            <Text style={[styles.displayName, { color: t.ink }]}>{p.displayName}</Text>
            <Text style={{ color: t.inkSoft, fontSize: 14 }}>@{p.handle}</Text>
            {p.suinsName ? (
              <Text style={{ color: t.accent, fontSize: 12, fontFamily: 'monospace', marginTop: 2 }}>
                {p.suinsName}
              </Text>
            ) : null}
            {p.bio ? (
              <Text style={[styles.bio, { color: t.ink }]}>{p.bio}</Text>
            ) : null}
            <View style={styles.stats}>
              <Text style={{ color: t.ink, fontSize: 14 }}>
                <Text style={{ fontWeight: '700' }}>{p.followingCount}</Text>
                <Text style={{ color: t.inkSoft }}> Following</Text>
              </Text>
              <Text style={{ color: t.ink, fontSize: 14 }}>
                <Text style={{ fontWeight: '700' }}>{p.followersCount}</Text>
                <Text style={{ color: t.inkSoft }}> Followers</Text>
              </Text>
            </View>
          </Card>

          {/* Creator coins placeholder */}
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

          <View style={{ gap: 12 }}>
            {posts.length > 0 ? (
              posts.map((post) => <PostCard key={post.id} post={post} />)
            ) : (
              <Text style={{ color: t.inkSoft, textAlign: 'center', paddingVertical: 32, fontSize: 14 }}>
                No posts yet.
              </Text>
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 100, gap: 16 },
  notFound: { paddingVertical: 48, alignItems: 'center' },
  profileCard: { padding: 20 },
  profileHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  displayName: { fontSize: 20, fontWeight: '700', marginTop: 12 },
  bio: { fontSize: 15, lineHeight: 22, marginTop: 8 },
  stats: { flexDirection: 'row', gap: 16, marginTop: 12 },
  coinsCard: { padding: 16 },
  coinRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
