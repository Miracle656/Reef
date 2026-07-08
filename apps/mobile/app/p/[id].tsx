import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/components/ui';
import { PostCard } from '@/components/post-card';
import { ComposeBox } from '@/components/compose-form';
import { BackIcon } from '@/components/messages/icons';
import { MOCK_POSTS } from '@/lib/mock';
import { Screen } from '@/components/screen';

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const router = useRouter();

  const post = MOCK_POSTS.find((p) => p.id === id) ?? null;
  const replies = MOCK_POSTS.filter((p) => p.replyTo === id);

  return (
    <Screen style={{ backgroundColor: t.background }}>
      {/* header */}
      <View style={[styles.header, { borderBottomColor: t.border }]}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <BackIcon size={22} color={t.ink} />
        </Pressable>
        <Text style={[styles.title, { color: t.ink }]}>Post</Text>
      </View>

      {!post ? (
        <View style={styles.notFound}>
          <Text style={{ color: t.inkSoft, fontSize: 15 }}>Post not found.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.container}>
          <PostCard post={post} />

          <View style={[styles.replyBar, { borderTopColor: t.border, borderBottomColor: t.border }]}>
            <ComposeBox />
          </View>

          <Text style={[styles.repliesLabel, { color: t.inkFaint }]}>
            {replies.length > 0 ? `${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}` : 'No replies yet. Be the first.'}
          </Text>
          <View style={{ gap: 12 }}>
            {replies.map((r) => (
              <PostCard key={r.id} post={r} />
            ))}
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 8, borderBottomWidth: 1 },
  back: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 19, fontWeight: '800' },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 96 },
  container: { padding: 16, paddingBottom: 120, gap: 12 },
  replyBar: { borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 8 },
  repliesLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 },
});
