import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { Avatar, Spinner, useTheme } from '@/components/ui';
import { useMessaging } from '@/lib/messaging/provider';
import { chatAvatar, chatName, previewOf } from '@/lib/messaging/display';
import { timeAgo } from '@/lib/messaging/format';
import type { Chat } from '@/lib/messaging/types';
import { StoriesBar } from './stories';
import { PlusIcon, SearchIcon, UsersIcon } from './icons';

export function ChatList({
  onOpen,
  onNew,
  onNewGroup,
}: {
  onOpen: (chatId: string) => void;
  onNew: () => void;
  onNewGroup: () => void;
}) {
  const t = useTheme();
  const { state, me } = useMessaging();
  const [q, setQ] = useState('');

  const chats = useMemo(() => {
    const list = state.chats.filter((c) => !c.archived);
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((c) => chatName(c, me?.id).toLowerCase().includes(needle));
  }, [state.chats, q, me?.id]);

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      {/* header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: t.ink }]}>Messages</Text>
        <Pressable onPress={onNewGroup} style={styles.headerBtn} hitSlop={8}>
          <UsersIcon size={20} color={t.inkSoft} />
        </Pressable>
        <Pressable onPress={onNew} style={[styles.headerBtn, styles.fab, { backgroundColor: t.accent }]} hitSlop={8}>
          <PlusIcon size={20} color={t.onAccent} />
        </Pressable>
      </View>

      {/* search */}
      <View style={styles.searchWrap}>
        <View style={[styles.searchBox, { backgroundColor: t.surfaceGlass, borderColor: t.border }]}>
          <SearchIcon size={17} color={t.inkFaint} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search chats"
            placeholderTextColor={t.inkFaint}
            style={{ flex: 1, fontSize: 14, color: t.ink, paddingVertical: 2 }}
          />
        </View>
      </View>

      <StoriesBar />

      {/* list */}
      {state.loadingChats ? (
        <View style={styles.center}><Spinner /></View>
      ) : chats.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ color: t.inkSoft, fontSize: 14 }}>{q ? 'No matches.' : 'No conversations yet.'}</Text>
          {!q ? (
            <Pressable onPress={onNew}><Text style={[styles.startLink, { color: t.accent }]}>Start a conversation</Text></Pressable>
          ) : null}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
          {chats.map((c) => (
            <ChatRow key={c.id} chat={c} meId={me?.id} onPress={() => onOpen(c.id)} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function ChatRow({ chat, meId, onPress }: { chat: Chat; meId?: string; onPress: () => void }) {
  const t = useTheme();
  const av = chatAvatar(chat, meId);
  const unread = chat.unreadCount ?? 0;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: t.surfaceMuted }]}
    >
      <View>
        <Avatar name={av.name} src={av.src} size={48} />
        {chat.muted ? (
          <View style={[styles.muteBadge, { backgroundColor: t.surface }]}><Text style={{ fontSize: 9 }}>🔕</Text></View>
        ) : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.rowTop}>
          <Text numberOfLines={1} style={[styles.name, { color: t.ink, fontWeight: unread ? '800' : '600' }]}>
            {chatName(chat, meId)}
          </Text>
          <Text style={[styles.time, { color: t.inkFaint }]}>{timeAgo(chat.lastMessageAt)}</Text>
        </View>
        <View style={styles.rowBottom}>
          <Text numberOfLines={1} style={[styles.preview, { color: unread ? t.inkSoft : t.inkFaint }]}>
            {previewOf(chat, meId)}
          </Text>
          {chat.mentioned ? <Text style={[styles.mention, { color: t.accent }]}>@</Text> : null}
          {unread > 0 ? (
            <View style={[styles.unread, { backgroundColor: t.accent }]}>
              <Text style={[styles.unreadText, { color: t.onAccent }]}>{unread > 99 ? '99+' : unread}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  title: { flex: 1, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  headerBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  fab: {},
  searchWrap: { paddingHorizontal: 16, paddingBottom: 8 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 100, borderWidth: 1, paddingHorizontal: 14, height: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 64 },
  empty: { paddingHorizontal: 16, paddingVertical: 64, alignItems: 'center', gap: 12 },
  startLink: { fontSize: 14, fontWeight: '600' },
  listContent: { paddingHorizontal: 8, paddingBottom: 120 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, paddingHorizontal: 10, paddingVertical: 10 },
  muteBadge: { position: 'absolute', bottom: -2, right: -2, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontSize: 15 },
  time: { fontSize: 11, fontVariant: ['tabular-nums'] },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  preview: { flex: 1, fontSize: 13 },
  mention: { fontSize: 12, fontWeight: '700' },
  unread: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  unreadText: { fontSize: 11, fontWeight: '700' },
});
