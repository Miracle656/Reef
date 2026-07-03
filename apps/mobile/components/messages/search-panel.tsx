import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal, StyleSheet, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/components/ui';
import { useMessaging } from '@/lib/messaging/provider';
import { timeShort } from '@/lib/messaging/format';
import type { Message } from '@/lib/messaging/types';
import { SearchIcon, XIcon } from './icons';

export function SearchPanel({ chatId, onClose, onJump }: { chatId: string; onClose: () => void; onJump?: (messageId: string) => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { searchMessages } = useMessaging();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Message[]>([]);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const needle = q.trim();
    if (!needle) {
      setResults([]);
      setSearched(false);
      return;
    }
    let live = true;
    const timer = setTimeout(async () => {
      const r = await searchMessages(chatId, needle);
      if (live) {
        setResults(r);
        setSearched(true);
      }
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q, chatId, searchMessages]);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: t.surface }}>
        <View style={[styles.head, { borderBottomColor: t.border }]}>
          <SearchIcon size={17} color={t.inkFaint} />
          <TextInput
            autoFocus
            value={q}
            onChangeText={setQ}
            placeholder="Search in conversation"
            placeholderTextColor={t.inkFaint}
            style={{ flex: 1, fontSize: 14.5, color: t.ink }}
          />
          <Pressable onPress={onClose} style={styles.iconBtn}><XIcon size={20} color={t.inkSoft} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 8 }} keyboardShouldPersistTaps="handled">
          {searched && results.length === 0 ? (
            <Text style={[styles.empty, { color: t.inkFaint }]}>No matches.</Text>
          ) : (
            results.map((m) => (
              <Pressable key={m.id} onPress={() => onJump?.(m.id)} style={styles.row}>
                <View style={styles.rowTop}>
                  <Text numberOfLines={1} style={[styles.name, { color: t.ink }]}>{m.sender?.displayName || m.sender?.username || 'You'}</Text>
                  <Text style={[styles.time, { color: t.inkFaint }]}>{timeShort(m.createdAt)}</Text>
                </View>
                <Text numberOfLines={1} style={{ color: t.inkSoft, fontSize: 13.5 }}>{m.content}</Text>
              </Pressable>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  iconBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', fontSize: 14, paddingVertical: 40 },
  row: { gap: 2, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, fontSize: 13, fontWeight: '600' },
  time: { fontSize: 11 },
});
