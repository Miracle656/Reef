import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Link, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { walrus } from '@umbra/core';
import { useSocialAccount } from '@/lib/account';
import { umbraConfig } from '@/lib/config';
import { useGasless } from '@/lib/gasless';
import { trpc } from '@/lib/trpc';
import { useEnokiFlow } from '@mysten/enoki/react';
import { Avatar, Button, Card, Spinner, Heading, Caption, useTheme } from '@/components/ui';
import { SignInButton } from '@/components/sign-in-button';
import { PostCard } from '@/components/post-card';

export default function ProfileTab() {
  const account = useSocialAccount();
  const t = useTheme();
  const flow = useEnokiFlow();
  const router = useRouter();

  const profile = useQuery({
    queryKey: ['profile-by-addr', account?.address],
    queryFn: () => trpc.profileByAddress.query({ address: account!.address }),
    enabled: Boolean(account),
  });

  const posts = useQuery({
    queryKey: ['posts-by-author', profile.data?.owner],
    queryFn: () => trpc.postsByAuthor.query({ address: profile.data!.owner }),
    enabled: Boolean(profile.data),
  });

  if (!account) {
    return (
      <View style={[styles.center, { backgroundColor: t.background }]}>
        <Text style={{ color: t.ink, fontSize: 20, fontWeight: '700', marginBottom: 8 }}>Sign in</Text>
        <Text style={{ color: t.inkSoft, fontSize: 15, marginBottom: 24, textAlign: 'center' }}>
          Join Umbra to post and connect on Sui.
        </Text>
        <SignInButton />
      </View>
    );
  }

  if (profile.isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: t.background }]}>
        <Spinner />
      </View>
    );
  }

  if (!profile.data) {
    return (
      <View style={[styles.center, { backgroundColor: t.background }]}>
        <Card style={{ padding: 24, alignItems: 'center' }}>
          <Text style={{ color: t.ink, fontSize: 20, fontWeight: '700' }}>One step left</Text>
          <Text style={{ color: t.inkSoft, fontSize: 14, marginTop: 4, textAlign: 'center' }}>
            Claim your handle to start posting.
          </Text>
          <View style={{ marginTop: 16 }}>
            <Link href="/onboarding" asChild>
              <Button>Set up profile</Button>
            </Link>
          </View>
        </Card>
      </View>
    );
  }

  const p = profile.data;

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.container}>
      <Card style={{ padding: 20 }}>
        <View style={styles.profileHeader}>
          <Avatar
            name={p.handle}
            src={p.avatarBlobId ? walrus.urlFor(umbraConfig, p.avatarBlobId) : null}
            size={72}
          />
          <Button variant="ghost" size="sm" onPress={() => router.push('/settings' as never)}>
            Settings
          </Button>
        </View>
        <Text style={{ color: t.ink, fontSize: 20, fontWeight: '700', marginTop: 12 }}>{p.displayName}</Text>
        <Text style={{ color: t.inkSoft, fontSize: 14 }}>@{p.handle}</Text>
        {p.suinsName ? (
          <Text style={{ color: t.accent, fontSize: 12, fontFamily: 'monospace', marginTop: 2 }}>{p.suinsName}</Text>
        ) : null}
        {p.bio ? (
          <Text style={{ color: t.ink, fontSize: 15, marginTop: 8, lineHeight: 22 }}>{p.bio}</Text>
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

      <View style={{ marginTop: 16, gap: 12 }}>
        {posts.isLoading ? (
          <View style={{ paddingVertical: 32, alignItems: 'center' }}><Spinner /></View>
        ) : posts.data?.length ? (
          posts.data.map((post) => <PostCard key={post.id} post={post} />)
        ) : (
          <Text style={{ color: t.inkSoft, textAlign: 'center', paddingVertical: 32, fontSize: 14 }}>
            No posts yet.
          </Text>
        )}
      </View>

      <View style={{ marginTop: 24, alignItems: 'center' }}>
        <Button variant="ghost" size="sm" onPress={() => flow.logout()}>
          Sign out
        </Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  container: { padding: 16, paddingBottom: 100 },
  profileHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  stats: { flexDirection: 'row', gap: 16, marginTop: 12 },
});
