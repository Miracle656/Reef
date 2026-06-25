import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { Avatar, Button, Card, useTheme } from '@/components/ui';
import { SignInButton } from '@/components/sign-in-button';
import { PostCard } from '@/components/post-card';
import { MOCK_AUTHORS, MOCK_POSTS } from '@/lib/mock';

// In UI-only mode we always show the signed-out state + a sample profile preview.
export default function ProfileTab() {
  const t = useTheme();
  const sample = MOCK_AUTHORS['lagosbuild']!;
  const samplePosts = MOCK_POSTS.filter((p) => p.author.handle === sample.handle);

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.container}>
      {/* Sign-in prompt */}
      <Card style={styles.signInCard}>
        <Text style={[styles.signInTitle, { color: t.ink }]}>Sign in</Text>
        <Text style={[styles.signInSub, { color: t.inkSoft }]}>
          Join Umbra to post and connect on Sui.
        </Text>
        <View style={{ marginTop: 16, gap: 10 }}>
          <SignInButton />
          <Link href="/onboarding" asChild>
            <Button variant="outline">Create profile</Button>
          </Link>
        </View>
      </Card>

      {/* Sample profile preview */}
      <Text style={[styles.sectionLabel, { color: t.inkFaint }]}>Example profile</Text>
      <Card style={{ padding: 20 }}>
        <View style={styles.profileHeader}>
          <Avatar name={sample.handle} size={72} />
          <Button variant="ghost" size="sm">Settings</Button>
        </View>
        <Text style={[styles.displayName, { color: t.ink }]}>{sample.displayName}</Text>
        <Text style={{ color: t.inkSoft, fontSize: 14 }}>@{sample.handle}</Text>
        {sample.suinsName ? (
          <Text style={{ color: t.accent, fontSize: 12, fontFamily: 'monospace', marginTop: 2 }}>
            {sample.suinsName}
          </Text>
        ) : null}
        <Text style={[styles.bio, { color: t.ink }]}>{sample.bio}</Text>
        <View style={styles.stats}>
          <Text style={{ color: t.ink, fontSize: 14 }}>
            <Text style={{ fontWeight: '700' }}>{sample.followingCount}</Text>
            <Text style={{ color: t.inkSoft }}> Following</Text>
          </Text>
          <Text style={{ color: t.ink, fontSize: 14 }}>
            <Text style={{ fontWeight: '700' }}>{sample.followersCount}</Text>
            <Text style={{ color: t.inkSoft }}> Followers</Text>
          </Text>
        </View>
      </Card>

      <View style={{ marginTop: 16, gap: 12 }}>
        {samplePosts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 100 },
  signInCard: { padding: 24, alignItems: 'center', marginBottom: 24 },
  signInTitle: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  signInSub: { fontSize: 14, textAlign: 'center' },
  sectionLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  profileHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  displayName: { fontSize: 20, fontWeight: '700', marginTop: 12 },
  bio: { fontSize: 15, lineHeight: 22, marginTop: 8 },
  stats: { flexDirection: 'row', gap: 16, marginTop: 12 },
});
