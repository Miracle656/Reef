import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import { Card, Avatar, useTheme } from '@/components/ui';
import { ActionBar } from '@/components/action-bar';
import { timeAgo } from '@/lib/utils';
import type { MockPost } from '@/lib/mock';

export function PostCard({ post }: { post: MockPost }) {
  const t = useTheme();
  const router = useRouter();
  const verified = Boolean(post.author.suinsName);
  const openPost = () => router.push(`/p/${post.id}` as never);

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Avatar name={post.author.handle} src={post.author.avatar} size={40} />
        <View style={styles.headerText}>
          <View style={styles.nameRow}>
            <Text
              style={{ color: t.ink, fontWeight: '600', fontSize: 15 }}
              onPress={() => router.push(`/u/${post.author.handle}` as never)}
            >
              {post.author.displayName}
            </Text>
            {verified ? <Feather name="check-circle" size={14} color={t.accent} /> : null}
          </View>
          <Text style={{ color: t.inkFaint, fontSize: 13 }}>
            @{post.author.handle} · {timeAgo(post.createdAt)}
          </Text>
        </View>
      </View>

      <Text style={[styles.body, { color: t.ink }]} onPress={openPost}>{post.text}</Text>

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

      <ActionBar post={post} onComment={openPost} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  headerText: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  body: { fontSize: 15, lineHeight: 22 },
  media: { marginTop: 10, gap: 8 },
  img: { width: '100%', height: 220, borderRadius: 16 },
});
