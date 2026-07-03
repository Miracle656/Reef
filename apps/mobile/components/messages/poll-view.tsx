import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@/components/ui';
import type { Message, PollState } from '@/lib/messaging/types';

export function PollView({ message, mine, onVote }: { message: Message; mine: boolean; onVote: (idx: number) => void }) {
  const t = useTheme();
  const poll = message.poll as PollState;
  const total = poll.options.reduce((s, o) => s + o.votes, 0);
  const label = mine ? t.onAccent : t.ink;
  const sub = mine ? 'rgba(255,255,255,0.7)' : t.inkFaint;
  const fill = mine ? 'rgba(255,255,255,0.35)' : t.accent;
  const trackBg = mine ? 'rgba(255,255,255,0.15)' : t.accent + '14';

  return (
    <View style={styles.wrap}>
      <Text style={[styles.q, { color: label }]}>{poll.question}</Text>
      <View style={{ gap: 6 }}>
        {poll.options.map((o, i) => {
          const pct = total > 0 ? Math.round((o.votes / total) * 100) : 0;
          const voted = poll.myVotes.includes(i);
          return (
            <Pressable
              key={i}
              onPress={() => onVote(i)}
              style={[styles.opt, { backgroundColor: trackBg, borderColor: voted ? label : 'transparent' }]}
            >
              <View style={[styles.optFill, { width: `${pct}%`, backgroundColor: fill, opacity: 0.4 }]} />
              <View style={styles.optRow}>
                <Text numberOfLines={1} style={[styles.optText, { color: label, fontWeight: voted ? '700' : '400' }]}>
                  {voted ? '● ' : ''}{o.text}
                </Text>
                <Text style={[styles.pct, { color: label }]}>{pct}%</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.meta, { color: sub }]}>
        {total} vote{total === 1 ? '' : 's'} · {poll.allowMultiple ? 'multiple' : 'single'} choice
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { minWidth: 220 },
  q: { fontWeight: '600', marginBottom: 8, fontSize: 14.5 },
  opt: { position: 'relative', overflow: 'hidden', borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7 },
  optFill: { position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: 10 },
  optRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  optText: { flex: 1, fontSize: 13.5 },
  pct: { fontSize: 11.5, fontVariant: ['tabular-nums'] },
  meta: { marginTop: 6, fontSize: 11 },
});
