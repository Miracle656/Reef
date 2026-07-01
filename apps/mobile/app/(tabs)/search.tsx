import { useMemo, useState } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Input, Avatar, useTheme } from '@/components/ui';
import { MOCK_AUTHORS, PAIRS } from '@/lib/mock';

type Filter = 'all' | 'people' | 'pairs';

export default function SearchTab() {
  const t = useTheme();
  const [raw, setRaw] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const q = raw.trim().toLowerCase();
  const people = useMemo(() => {
    const all = Object.values(MOCK_AUTHORS);
    return q ? all.filter((p) => `${p.handle} ${p.displayName}`.toLowerCase().includes(q)) : all;
  }, [q]);
  const pairs = useMemo(
    () => (q ? PAIRS.filter((p) => `${p.base} ${p.quote} ${p.key}`.toLowerCase().includes(q)) : PAIRS),
    [q],
  );

  const showPeople = filter !== 'pairs';
  const showPairs = filter !== 'people';

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.container}>
      {/* search input */}
      <View style={[styles.searchRow, { backgroundColor: t.surfaceGlass, borderColor: t.borderStrong }]}>
        <Feather name="search" size={18} color={t.accent} />
        <Input
          value={raw}
          onChangeText={setRaw}
          placeholder="Search people, tokens or pairs…"
          style={styles.searchInput}
          autoCorrect={false}
        />
        {raw ? (
          <Pressable onPress={() => setRaw('')} hitSlop={8}>
            <Feather name="x" size={16} color={t.inkFaint} />
          </Pressable>
        ) : null}
      </View>

      {/* filter chips */}
      <View style={styles.chipsRow}>
        {(['all', 'people', 'pairs'] as const).map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            style={[
              styles.chip,
              { borderColor: t.borderStrong },
              filter === f && { backgroundColor: t.ink, borderColor: t.ink },
            ]}
          >
            <Text style={[styles.chipLabel, { color: filter === f ? t.onInk : t.inkSoft }]}>{f}</Text>
          </Pressable>
        ))}
      </View>

      {/* people */}
      {showPeople ? (
        <>
          <SectionLabel>People</SectionLabel>
          {!people.length ? (
            <Hint>No people match "{q}".</Hint>
          ) : (
            people.map((p) => (
              <Link key={p.handle} href={`/u/${p.handle}`} asChild>
                <Pressable style={styles.row}>
                  <Avatar name={p.handle} src={p.avatar} size={46} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, { color: t.ink }]}>{p.displayName || p.handle}</Text>
                    <Text style={[styles.rowSub, { color: t.inkFaint }]}>
                      @{p.handle}
                      {p.followersCount ? ` · ${p.followersCount} followers` : ''}
                    </Text>
                  </View>
                </Pressable>
              </Link>
            ))
          )}
        </>
      ) : null}

      {/* token pairs */}
      {showPairs ? (
        <>
          <SectionLabel>Token pairs</SectionLabel>
          {!pairs.length ? (
            <Hint>No pairs match "{q}".</Hint>
          ) : (
            pairs.map((p) => (
              <Link key={p.key} href="/trade" asChild>
                <Pressable style={styles.row}>
                  <View style={[styles.pairIcon, { backgroundColor: t.surfaceMuted }]}>
                    <Text style={[styles.pairIconText, { color: t.ink }]}>{p.base.slice(0, 1)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, { color: t.ink }]}>
                      {p.base} <Text style={{ color: t.inkFaint }}>/</Text> {p.quote}
                    </Text>
                    <Text style={[styles.rowSub, { color: t.inkFaint }]}>DeepBook v3</Text>
                  </View>
                  <Text style={[styles.gasless, { color: '#0a8a5b' }]}>gasless</Text>
                </Pressable>
              </Link>
            ))
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <Text style={[styles.sectionLabel, { color: t.inkSoft }]}>{children}</Text>;
}
function Hint({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <Text style={[styles.hint, { color: t.inkSoft }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 120 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  searchInput: { flex: 1, height: 40, backgroundColor: 'transparent', borderWidth: 0, paddingHorizontal: 0 },
  chipsRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  chip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 7 },
  chipLabel: { fontSize: 12, fontFamily: 'monospace', textTransform: 'capitalize' },
  sectionLabel: { marginTop: 22, marginBottom: 6, fontSize: 10.5, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 1 },
  hint: { paddingVertical: 28, textAlign: 'center', fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 4 },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  rowSub: { fontSize: 12, fontFamily: 'monospace', marginTop: 2 },
  pairIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  pairIconText: { fontSize: 15, fontWeight: '800' },
  gasless: { fontSize: 12, fontFamily: 'monospace' },
});
