import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Card, Avatar, useTheme } from '@/components/ui';
import { LikeButton } from '@/components/like-button';
import { timeAgo } from '@/lib/utils';
import type { MockPost } from '@/lib/mock';

export function PostCard({ post }: { post: MockPost }) {
  const t = useTheme();
  const router = useRouter();

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Avatar name={post.author.handle} src={post.author.avatar} size={40} />
        <View style={styles.headerText}>
          <Text
            style={{ color: t.ink, fontWeight: '600', fontSize: 15 }}
            onPress={() => router.push(`/u/${post.author.handle}` as never)}
          >
            {post.author.displayName}
          </Text>
          <Text style={{ color: t.inkFaint, fontSize: 13 }}>
            @{post.author.handle} · {timeAgo(post.createdAt)}
          </Text>
        </View>
      </View>

      <Text style={[styles.body, { color: t.ink }]}>{post.text}</Text>

      {post.media.length > 0 ? (
        <View style={styles.media}>
          {post.media.map((uri, i) => (
            <Image
              key={i}
              source={{ uri }}
              style={styles.img}
              contentFit="cover"
            />
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        <LikeButton initialLikes={post.likes} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  headerText: { flex: 1 },
  body: { fontSize: 15, lineHeight: 22 },
  media: { marginTop: 10, gap: 8 },
  img: { width: '100%', height: 220, borderRadius: 16 },
  actions: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 20 },
});
