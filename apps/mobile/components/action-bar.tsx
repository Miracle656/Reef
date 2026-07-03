import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Share } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/components/ui';
import type { MockPost } from '@/lib/mock';

/**
 * Post action row — frontend-only replica of web `action-bar.tsx`. Comment /
 * repost / like / bookmark / share with local optimistic toggles (no chain).
 */
export function ActionBar({ post, onComment }: { post: MockPost; onComment?: () => void }) {
  const t = useTheme();
  const [liked, setLiked] = useState(false);
  const [reposted, setReposted] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);

  const likes = post.likes + (liked ? 1 : 0);
  // mock has no repost/reply/bookmark counts — derive small stable seeds from id
  const seed = Number(post.id.replace(/\D/g, '')) || 1;
  const reposts = (seed * 2) % 9 + (reposted ? 1 : 0);
  const replies = (seed * 3) % 7;
  const bookmarks = (seed % 5) + (bookmarked ? 1 : 0);

  const share = async () => {
    try {
      await Share.share({ message: `Check out this post on ReeF · /p/${post.id}` });
    } catch {
      /* dismissed */
    }
  };

  return (
    <View style={styles.row}>
      <Pressable style={styles.item} onPress={onComment} hitSlop={6}>
        <Feather name="message-circle" size={18} color={t.inkFaint} />
        <Text style={[styles.count, { color: t.inkFaint }]}>{replies}</Text>
      </Pressable>

      <Pressable style={styles.item} onPress={() => setReposted((v) => !v)} hitSlop={6}>
        <Feather name="repeat" size={18} color={reposted ? '#10b981' : t.inkFaint} />
        <Text style={[styles.count, { color: reposted ? '#10b981' : t.inkFaint }]}>{reposts}</Text>
      </Pressable>

      <Pressable style={styles.item} onPress={() => setLiked((v) => !v)} hitSlop={6}>
        <Text style={{ fontSize: 15, opacity: liked ? 1 : 0.55 }}>💧</Text>
        <Text style={[styles.count, { color: liked ? t.accent : t.inkFaint }]}>{likes}</Text>
      </Pressable>

      <Pressable style={styles.item} onPress={() => setBookmarked((v) => !v)} hitSlop={6}>
        <Feather name="bookmark" size={18} color={bookmarked ? '#f59e0b' : t.inkFaint} />
        <Text style={[styles.count, { color: bookmarked ? '#f59e0b' : t.inkFaint }]}>{bookmarks}</Text>
      </Pressable>

      <Pressable style={styles.item} onPress={() => void share()} hitSlop={6}>
        <Feather name="share" size={18} color={t.inkFaint} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', maxWidth: 320, marginTop: 12 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  count: { fontSize: 13, fontWeight: '500' },
});
