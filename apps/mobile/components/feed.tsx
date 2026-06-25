import { View } from 'react-native';
import { PostCard } from '@/components/post-card';
import { MOCK_POSTS } from '@/lib/mock';

export function Feed() {
  return (
    <View style={{ gap: 12 }}>
      {MOCK_POSTS.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </View>
  );
}
