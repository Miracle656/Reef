import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { walrus, type Post } from '@umbra/core';
import { umbraConfig } from '@/lib/config';
import { trpc } from '@/lib/trpc';
import { shortAddr, timeAgo } from '@/lib/utils';
import { Avatar, Card, useTheme } from './ui';
import { LikeButton } from './like-button';

export function PostCard({ post }: { post: Post }) {
  const t = useTheme();
  const router = useRouter();

  const author = useQuery({
    queryKey: ['profile-by-addr', post.author],
    queryFn: () => trpc.profileByAddress.query({ address: post.author }),
  });
  const a = author.data;

  return (
    <Card style={{ padding: 16 }}>
      <View style={styles.row}>
        <Pressable onPress={() => a && router.push(`/u/${a.handle}`)}>
          <Avatar
            name={a?.handle ?? post.author}
            src={a?.avatarBlobId ? walrus.urlFor(umbraConfig, a.avatarBlobId) : null}
          />
        </Pressable>
        <View style={styles.body}>
          <View style={styles.meta}>
            <Text style={{ color: t.ink, fontSize: 14, fontWeight: '600' }}>
              {a?.displayName ?? 'Someone'}
            </Text>
            <Pressable onPress={() => a && router.push(`/u/${a.handle}`)}>
              <Text style={{ color: t.inkSoft, fontSize: 13 }}>
                @{a?.handle ?? shortAddr(post.author)}
              </Text>
            </Pressable>
            <Text style={{ color: t.inkFaint, fontSize: 12 }}>· {timeAgo(post.createdAtMs)}</Text>
          </View>
          {post.text ? (
            <Text style={{ color: t.ink, fontSize: 15, lineHeight: 22, marginTop: 4 }}>
              {post.text}
            </Text>
          ) : null}
          {post.media.length > 0 ? (
            <View style={[styles.mediaGrid, post.media.length > 1 && styles.mediaGrid2]}>
              {post.media.map((blob) => (
                <Image
                  key={blob}
                  source={{ uri: walrus.urlFor(umbraConfig, blob) }}
                  style={[styles.mediaImg, post.media.length > 1 && styles.mediaImgHalf]}
                  contentFit="cover"
                />
              ))}
            </View>
          ) : null}
          <View style={{ marginTop: 12 }}>
            <LikeButton post={post} />
          </View>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  body: { flex: 1, minWidth: 0 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  mediaGrid: { marginTop: 12, gap: 8 },
  mediaGrid2: { flexDirection: 'row' },
  mediaImg: { borderRadius: 16, height: 240, width: '100%' },
  mediaImgHalf: { flex: 1, height: 160 },
});
