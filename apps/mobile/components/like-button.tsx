import { useState } from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/components/ui';

export function LikeButton({ initialLikes }: { initialLikes: number }) {
  const t = useTheme();
  const [liked, setLiked] = useState(false);
  const count = liked ? initialLikes + 1 : initialLikes;
  return (
    <Pressable
      onPress={() => setLiked((v) => !v)}
      style={({ pressed }) => [styles.btn, pressed && { opacity: 0.7 }]}
    >
      <Text style={{ fontSize: 16 }}>💧</Text>
      <Text style={[styles.count, { color: liked ? t.accent : t.inkFaint }]}>{count}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  count: { fontSize: 13, fontWeight: '500' },
});
