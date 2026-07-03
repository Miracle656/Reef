import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal, StyleSheet, TextInput } from 'react-native';
import { Avatar, Button, Spinner, useTheme } from '@/components/ui';
import { useMessaging } from '@/lib/messaging/provider';
import type { Participant } from '@/lib/messaging/types';
import { SearchIcon, XIcon } from './icons';

export function NewChatModal({
  mode,
  onClose,
  onOpened,
}: {
  mode: 'direct' | 'group';
  onClose: () => void;
  onOpened: (chatId: string) => void;
}) {
  const t = useTheme();
  const { searchUsers, startDirect, createGroup } = useMessaging();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<Participant[]>([]);
  const [groupName, setGroupName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const needle = q.trim();
    if (!needle) {
      setResults([]);
      return;
    }
    let live = true;
    setLoading(true);
    const timer = setTimeout(async () => {
      const r = await searchUsers(needle);
      if (live) {
        setResults(r);
        setLoading(false);
      }
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q, searchUsers]);

  const pickedIds = useMemo(() => new Set(picked.map((p) => p.id)), [picked]);

  const choose = async (u: Participant) => {
    if (mode === 'direct') {
      setBusy(true);
      const id = await startDirect(u.id);
      onClose();
      onOpened(id);
    } else {
      setPicked((prev) => (pickedIds.has(u.id) ? prev.filter((p) => p.id !== u.id) : [...prev, u]));
    }
  };

  const submitGroup = async () => {
    if (!groupName.trim() || picked.length === 0) return;
    setBusy(true);
    const id = await createGroup({ name: groupName.trim(), participantIds: picked.map((p) => p.id) });
    onClose();
    onOpened(id);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]} onPress={() => {}}>
          <View style={styles.head}>
            <Text style={[styles.title, { color: t.ink }]}>{mode === 'direct' ? 'New message' : 'New group'}</Text>
            <Pressable onPress={onClose} style={styles.iconBtn}><XIcon size={20} color={t.inkSoft} /></Pressable>
          </View>

          {mode === 'group' ? (
            <TextInput
              value={groupName}
              onChangeText={setGroupName}
              placeholder="Group name"
              placeholderTextColor={t.inkFaint}
              style={[styles.groupInput, { backgroundColor: t.surfaceGlass, borderColor: t.border, color: t.ink }]}
            />
          ) : null}

          {mode === 'group' && picked.length ? (
            <View style={styles.chips}>
              {picked.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => setPicked((prev) => prev.filter((x) => x.id !== p.id))}
                  style={[styles.chip, { backgroundColor: t.accent + '26' }]}
                >
                  <Text style={[styles.chipText, { color: t.accentInk }]}>{p.displayName || p.username}</Text>
                  <XIcon size={12} color={t.accentInk} />
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={[styles.searchBox, { backgroundColor: t.surfaceGlass, borderColor: t.border }]}>
            <SearchIcon size={17} color={t.inkFaint} />
            <TextInput
              autoFocus
              value={q}
              onChangeText={setQ}
              placeholder="Search people"
              placeholderTextColor={t.inkFaint}
              style={{ flex: 1, fontSize: 14, color: t.ink, paddingVertical: 2 }}
            />
          </View>

          <ScrollView style={styles.results} keyboardShouldPersistTaps="handled">
            {loading ? (
              <View style={styles.center}><Spinner /></View>
            ) : results.length === 0 ? (
              <Text style={[styles.emptyText, { color: t.inkFaint }]}>{q ? 'No people found.' : 'Search by name or handle.'}</Text>
            ) : (
              results.map((u) => (
                <Pressable
                  key={u.id}
                  onPress={() => void choose(u)}
                  style={[styles.userRow, pickedIds.has(u.id) && { backgroundColor: t.accent + '1a' }]}
                >
                  <Avatar name={u.username} src={u.avatarUrl} size={40} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={[styles.userName, { color: t.ink }]}>{u.displayName || u.username}</Text>
                    <Text numberOfLines={1} style={[styles.userHandle, { color: t.inkFaint }]}>@{u.username}</Text>
                  </View>
                  {mode === 'group' && pickedIds.has(u.id) ? <Text style={{ color: t.accent, fontSize: 16 }}>✓</Text> : null}
                </Pressable>
              ))
            )}
          </ScrollView>

          {mode === 'group' ? (
            <Button
              onPress={() => void submitGroup()}
              disabled={!groupName.trim() || picked.length === 0 || busy}
              style={{ marginTop: 12 }}
            >
              {`Create group${picked.length ? ` · ${picked.length}` : ''}`}
            </Button>
          ) : null}
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
  groupInput: { height: 44, borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, fontSize: 15, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: 12.5, fontWeight: '600' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 100, borderWidth: 1, paddingHorizontal: 14, height: 40, marginBottom: 8 },
  results: { flexGrow: 0 },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 32 },
  emptyText: { textAlign: 'center', fontSize: 14, paddingVertical: 32 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 10 },
  userName: { fontSize: 14.5, fontWeight: '600' },
  userHandle: { fontSize: 12 },
});
