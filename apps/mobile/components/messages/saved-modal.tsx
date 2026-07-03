import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal, StyleSheet } from 'react-native';
import { Avatar, Spinner, useTheme } from '@/components/ui';
import { useMessaging } from '@/lib/messaging/provider';
import { timeShort } from '@/lib/messaging/format';
import type { Message } from '@/lib/messaging/types';
import { XIcon } from './icons';

export function SavedModal({ onClose }: { onClose: () => void }) {
  const t = useTheme();
  const { listSaved, unsaveMessage } = useMessaging();
  const [items, setItems] = useState<Message[] | null>(null);

  useEffect(() => {
    void listSaved().then(setItems);
  }, [listSaved]);

  const remove = async (id: string) => {
    await unsaveMessage(id);
    setItems((prev) => (prev ? prev.filter((m) => m.id !== id) : prev));
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]} onPress={() => {}}>
          <View style={styles.head}>
            <Text style={[styles.title, { color: t.ink }]}>Saved messages</Text>
            <Pressable onPress={onClose} style={styles.iconBtn}><XIcon size={20} color={t.inkSoft} /></Pressable>
          </View>
          <ScrollView style={{ flexGrow: 0 }}>
            {items === null ? (
              <View style={styles.center}><Spinner /></View>
            ) : items.length === 0 ? (
              <Text style={[styles.empty, { color: t.inkFaint }]}>Nothing saved yet. Save a message from its menu.</Text>
            ) : (
              items.map((m) => (
                <View key={m.id} style={styles.row}>
                  <Avatar name={m.sender?.username ?? '?'} src={m.sender?.avatarUrl} size={36} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.rowTop}>
                      <Text numberOfLines={1} style={[styles.name, { color: t.ink }]}>{m.sender?.displayName || m.sender?.username || 'You'}</Text>
                      <Text style={[styles.time, { color: t.inkFaint }]}>{timeShort(m.createdAt)}</Text>
                    </View>
                    <Text numberOfLines={1} style={{ color: t.inkSoft, fontSize: 13.5 }}>
                      {m.content || (m.type === 'image' ? '📷 Photo' : m.type === 'file' ? '📎 File' : 'media')}
                    </Text>
                  </View>
                  <Pressable onPress={() => void remove(m.id)} style={styles.iconBtn}><XIcon size={16} color={t.inkFaint} /></Pressable>
                </View>
              ))
            )}
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
  center: { alignItems: 'center', paddingVertical: 40 },
  empty: { textAlign: 'center', fontSize: 14, paddingVertical: 40 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 10 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, fontSize: 13.5, fontWeight: '600' },
  time: { fontSize: 11 },
});
