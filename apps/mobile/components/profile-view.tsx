import { useState, type ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Avatar, useTheme } from '@/components/ui';
import { PostCard } from '@/components/post-card';
import { MOCK_POSTS, type MockAuthor } from '@/lib/mock';

type Tab = 'posts' | 'reposts' | 'bookmarks';
const TABS: Tab[] = ['posts', 'reposts', 'bookmarks'];

/**
 * Profile layout — RN replica of web `u/[handle]/page.tsx`: gradient-ish banner,
 * avatar pulled up over it, name + verified seal, handle + suins, bio, stats,
 * and posts/reposts/bookmarks tabs. Frontend-only (mock posts).
 */
export function ProfileView({
  author,
  rightAction,
  extra,
}: {
  author: MockAuthor;
  rightAction?: ReactNode;
  extra?: ReactNode;
}) {
  const t = useTheme();
  const [tab, setTab] = useState<Tab>('posts');
  const verified = Boolean(author.suinsName);

  const roots = MOCK_POSTS.filter((p) => !p.replyTo);
  const own = roots.filter((p) => p.author.handle === author.handle);
  const others = roots.filter((p) => p.author.handle !== author.handle);
  const tabData: Record<Tab, typeof MOCK_POSTS> = {
    posts: own,
    reposts: others.slice(0, 2),
    bookmarks: others.slice(2, 4),
  };
  const emptyText: Record<Tab, string> = {
    posts: 'No posts yet.',
    reposts: 'No reposts yet.',
    bookmarks: 'No bookmarks yet.',
  };
  const data = tabData[tab];

  return (
    <View>
      {/* banner */}
      <View style={[styles.banner, { backgroundColor: '#18c2c2' }]}>
        <View style={[styles.bannerAccent, { backgroundColor: '#0a84ff' }]} />
      </View>

      {/* identity */}
      <View style={styles.body}>
        <View style={styles.avatarRow}>
          <View style={[styles.avatarRing, { borderColor: t.background }]}>
            <Avatar name={author.handle} src={author.avatar} size={88} />
          </View>
          <View style={{ flex: 1 }} />
          {rightAction ? <View style={styles.rightAction}>{rightAction}</View> : null}
        </View>

        <View style={styles.nameRow}>
          <Text style={[styles.displayName, { color: t.ink }]}>{author.displayName}</Text>
          {verified ? <Feather name="check-circle" size={18} color={t.accent} /> : null}
        </View>
        <View style={styles.handleRow}>
          <Text style={[styles.handle, { color: t.inkFaint }]}>@{author.handle}</Text>
          {author.suinsName ? <Text style={[styles.suins, { color: t.accent }]}> · {author.suinsName}</Text> : null}
        </View>

        {author.bio ? <Text style={[styles.bio, { color: t.ink }]}>{author.bio}</Text> : null}

        <View style={styles.stats}>
          <Text style={{ color: t.ink, fontSize: 14 }}>
            <Text style={{ fontWeight: '700' }}>{author.followingCount}</Text>
            <Text style={{ color: t.inkSoft }}> Following</Text>
          </Text>
          <Text style={{ color: t.ink, fontSize: 14 }}>
            <Text style={{ fontWeight: '700' }}>{author.followersCount}</Text>
            <Text style={{ color: t.inkSoft }}> Followers</Text>
          </Text>
        </View>

        {extra}

        {/* tabs */}
        <View style={[styles.tabBar, { borderBottomColor: t.border }]}>
          {TABS.map((tb) => {
            const active = tb === tab;
            return (
              <Pressable key={tb} onPress={() => setTab(tb)} style={styles.tab}>
                <Text style={[styles.tabTxt, { color: active ? t.ink : t.inkFaint, fontWeight: active ? '700' : '500' }]}>
                  {tb[0]!.toUpperCase() + tb.slice(1)}
                </Text>
                {active ? <View style={[styles.tabUnderline, { backgroundColor: t.accent }]} /> : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* tab content */}
      <View style={styles.list}>
        {data.length > 0 ? (
          data.map((post) => <PostCard key={`${tab}-${post.id}`} post={post} />)
        ) : (
          <Text style={[styles.empty, { color: t.inkSoft }]}>{emptyText[tab]}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { height: 140, width: '100%', overflow: 'hidden' },
  bannerAccent: { position: 'absolute', right: -40, top: 20, width: 240, height: 240, borderRadius: 120, opacity: 0.55 },
  body: { paddingHorizontal: 16 },
  avatarRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: -44 },
  avatarRing: { borderRadius: 52, borderWidth: 4 },
  rightAction: { marginBottom: 6 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  displayName: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  handleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  handle: { fontSize: 13 },
  suins: { fontSize: 13, fontWeight: '500' },
  bio: { fontSize: 15, lineHeight: 22, marginTop: 10, maxWidth: 480 },
  stats: { flexDirection: 'row', gap: 20, marginTop: 12 },
  tabBar: { flexDirection: 'row', marginTop: 16, borderBottomWidth: 1 },
  tab: { paddingVertical: 12, marginRight: 24, alignItems: 'center' },
  tabTxt: { fontSize: 14.5 },
  tabUnderline: { position: 'absolute', bottom: -1, left: 0, right: 0, height: 2.5, borderRadius: 2 },
  list: { paddingHorizontal: 16, paddingTop: 12, gap: 12, paddingBottom: 120 },
  empty: { textAlign: 'center', paddingVertical: 40, fontSize: 14 },
});
