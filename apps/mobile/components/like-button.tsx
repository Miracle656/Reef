import { Pressable, Text, StyleSheet } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEnokiFlow } from '@mysten/enoki/react';
import { canonicalReactionBytes, type Post, type ReactionMessage } from '@umbra/core';
import { useSocialAccount } from '@/lib/account';
import { NETWORK } from '@/lib/config';
import { trpc } from '@/lib/trpc';
import { useTheme } from './ui';

export function LikeButton({ post }: { post: Post }) {
  const account = useSocialAccount();
  const flow = useEnokiFlow();
  const qc = useQueryClient();
  const t = useTheme();

  const state = useQuery({
    queryKey: ['like', post.id, account?.address],
    queryFn: () => trpc.likeState.query({ postId: post.id, viewer: account?.address }),
  });
  const liked = state.data?.liked ?? false;
  const likes = state.data?.likes ?? 0;

  const toggle = useMutation({
    mutationFn: async () => {
      if (!account) throw new Error('Sign in first');
      const message: ReactionMessage = {
        kind: 'like',
        postId: post.id,
        reactor: account.address,
        timestamp: Date.now(),
        value: (liked ? 0 : 1) as 0 | 1,
      };
      const keypair = await flow.getKeypair({ network: NETWORK });
      const { signature } = await keypair.signPersonalMessage(canonicalReactionBytes(message));
      return trpc.addReaction.mutate({ message, signature });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['like', post.id] }),
  });

  return (
    <Pressable
      onPress={() => toggle.mutate()}
      disabled={!account || toggle.isPending}
      style={[styles.row, (!account || toggle.isPending) && styles.disabled]}
      accessibilityRole="button"
      accessibilityLabel={liked ? 'Unlike' : 'Like'}
    >
      <Text style={{ fontSize: 14, opacity: liked ? 1 : 0.5 }}>💧</Text>
      <Text style={{ fontSize: 14, color: liked ? t.accent : t.inkSoft, fontWeight: '500' }}>{likes}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  disabled: { opacity: 0.5 },
});
