import { View, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useSocialAccount } from '@/lib/account';
import { trpc } from '@/lib/trpc';
import { useTheme, Spinner } from './ui';
import { PostCard } from './post-card';

export function Feed() {
  const account = useSocialAccount();
  const t = useTheme();

  const feed = useQuery({
    queryKey: ['feed', account?.address],
    queryFn: () => trpc.feed.query({ address: account!.address }),
    enabled: Boolean(account),
  });

  if (!account) return null;

  if (feed.isLoading) {
    return (
      <View style={{ paddingVertical: 48, alignItems: 'center' }}>
        <Spinner />
      </View>
    );
  }

  if (feed.isError) {
    return (
      <Text style={{ color: t.inkSoft, textAlign: 'center', paddingVertical: 32, fontSize: 14 }}>
        Couldn't reach the feed API. Is the indexer running?
      </Text>
    );
  }

  const posts = feed.data ?? [];
  if (posts.length === 0) {
    return (
      <Text style={{ color: t.inkSoft, textAlign: 'center', paddingVertical: 48, fontSize: 14 }}>
        Your feed is quiet. Follow people to fill it up.
      </Text>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      {posts.map((p) => (
        <PostCard key={p.id} post={p} />
      ))}
    </View>
  );
}
