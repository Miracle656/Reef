import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal, StyleSheet, TextInput } from 'react-native';
import { Avatar, useTheme } from '@/components/ui';
import { useMessaging } from '@/lib/messaging/provider';
import { chatAvatar, chatName } from '@/lib/messaging/display';
import type { Message } from '@/lib/messaging/types';
import { SearchIcon, XIcon } from './icons';

export function ForwardModal({ message, onClose }: { message: Message; onClose: () => void }) {
  const t = useTheme();
  const { state, me, forwardMessage } = useMessaging();
  const [q, setQ] = useState('');
  const [sent, setSent] = useState<Set<string>>(new Set());

  const chats = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = state.chats.filter((c) => !c.archived);
    return needle ? list.filter((c) => chatName(c, me?.id).toLowerCase().includes(needle)) : list;
  }, [state.chats, q, me?.id]);

  const forward = async (chatId: string) => {
    await forwardMessage(chatId, message);
    setSent((s) => new Set(s).add(chatId));
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]} onPress={() => {}}>
          <View style={styles.head}>
            <Text style={[styles.title, { color: t.ink }]}>Forward to…</Text>
            <Pressable onPress={onClose} style={styles.iconBtn}><XIcon size={20} color={t.inkSoft} /></Pressable>
          </View>
          <View style={[styles.searchBox, { backgroundColor: t.surfaceGlass, borderColor: t.border }]}>
            <SearchIcon size={17} color={t.inkFaint} />
            <TextInput value={q} onChangeText={setQ} placeholder="Search chats" placeholderTextColor={t.inkFaint} style={{ flex: 1, fontSize: 14, color: t.ink }} />
          </View>
          <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled">
            {chats.map((c) => {
              const av = chatAvatar(c, me?.id);
              const done = sent.has(c.id);
              return (
                <Pressable key={c.id} onPress={() => void forward(c.id)} disabled={done} style={[styles.row, done && { opacity: 0.6 }]}>
                  <Avatar name={av.name} src={av.src} size={40} />
                  <Text numberOfLines={1} style={[styles.name, { color: t.ink }]}>{chatName(c, me?.id)}</Text>
                  {done ? <Text style={{ color: t.accent, fontSize: 13, fontWeight: '600' }}>Sent</Text> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', backgroundColor: 'rgba(21,21,26,0.4)', padding: 16, paddingTop: 72 },
  card: { width: '100%', maxWidth: 420, maxHeight: '80%', borderRadius: 28, borderWidth: 1, padding: 20 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '700' },
  iconBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 100, borderWidth: 1, paddingHorizontal: 14, height: 40, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 10 },
  name: { flex: 1, fontSize: 14.5, fontWeight: '600' },
});
