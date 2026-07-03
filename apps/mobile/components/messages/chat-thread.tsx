import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Avatar, useTheme } from '@/components/ui';
import { useMessaging } from '@/lib/messaging/provider';
import { chatAvatar, chatName, peerOf } from '@/lib/messaging/display';
import { dayLabel } from '@/lib/messaging/format';
import type { Chat, Message } from '@/lib/messaging/types';
import { MessageBubble, type ReplyPreview } from './message-bubble';
import { MessageActions } from './message-actions';
import { ForwardModal } from './forward-modal';
import { ChatInfoModal } from './chat-info-modal';
import { SearchPanel } from './search-panel';
import { SavedModal } from './saved-modal';
import { ImageViewer } from './image-viewer';
import { Composer } from './composer';
import { BackIcon, MoreIcon, SearchIcon } from './icons';

const DISAPPEAR_OPTIONS = [
  { label: 'Off', seconds: 0 },
  { label: '1 hour', seconds: 3600 },
  { label: '24 hours', seconds: 86400 },
  { label: '7 days', seconds: 604800 },
];

export function ChatThread({ onBack }: { onBack: () => void }) {
  const t = useTheme();
  const { state, me, activeChat, toggleReaction, votePoll, markViewOnce } = useMessaging();
  const scrollRef = useRef<ScrollView>(null);
  const chat = activeChat;
  const messages = useMemo(() => (chat ? state.messages[chat.id] ?? [] : []), [chat, state.messages]);
  const typing = chat ? state.typingUsers[chat.id] ?? [] : [];

  const [actionMsg, setActionMsg] = useState<Message | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const hasExpiring = useMemo(() => messages.some((m) => m.expiresAt), [messages]);
  useEffect(() => {
    if (!hasExpiring) return;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [hasExpiring]);

  const visible = useMemo(
    () => messages.filter((m) => !m.expiresAt || new Date(m.expiresAt).getTime() > nowMs),
    [messages, nowMs],
  );
  const byId = useMemo(() => new Map(visible.map((m) => [m.id, m])), [visible]);
  const pinned = useMemo(() => visible.filter((m) => m.isPinned && !m.isDeleted), [visible]);

  useEffect(() => {
    setActionMsg(null); setReplyTo(null); setEditing(null); setForwardMsg(null);
    setInfoOpen(false); setSearchOpen(false); setMenuOpen(false);
  }, [chat?.id]);

  if (!chat) {
    return (
      <View style={[styles.emptyRoot, { backgroundColor: t.background }]}>
        <View style={[styles.emptyIcon, { backgroundColor: t.surfaceMuted }]}><Text style={{ fontSize: 24 }}>🐚</Text></View>
        <Text style={[styles.emptyTitle, { color: t.ink }]}>Your messages</Text>
        <Text style={[styles.emptySub, { color: t.inkSoft }]}>Pick a conversation, or start a new one.</Text>
      </View>
    );
  }

  const av = chatAvatar(chat, me?.id);
  const peer = peerOf(chat, me?.id);
  const online = peer ? state.onlineUserIds.includes(peer.id) : false;
  const statusLine = typing.length
    ? chat.type === 'group' ? `${typing.join(', ')} typing…` : 'typing…'
    : chat.type === 'group' ? `${chat.participants.length} members` : online ? 'online' : 'offline';
  const replyName = replyTo ? (replyTo.senderId === me?.id ? 'yourself' : replyTo.sender?.displayName || replyTo.sender?.username || '') : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      {/* header */}
      <View style={[styles.header, { borderBottomColor: t.border, backgroundColor: t.surface }]}>
        <Pressable onPress={onBack} style={styles.hBtn} hitSlop={6}><BackIcon size={22} color={t.inkSoft} /></Pressable>
        <Pressable onPress={() => setInfoOpen(true)} style={styles.hCenter}>
          <Avatar name={av.name} src={av.src} size={40} />
          <View style={{ minWidth: 0, flexShrink: 1 }}>
            <Text numberOfLines={1} style={[styles.hName, { color: t.ink }]}>{chatName(chat, me?.id)}</Text>
            <Text numberOfLines={1} style={[styles.hStatus, { color: typing.length ? t.accent : t.inkFaint }]}>{statusLine}</Text>
          </View>
        </Pressable>
        <Pressable onPress={() => setSearchOpen(true)} style={styles.hBtn} hitSlop={6}><SearchIcon size={19} color={t.inkSoft} /></Pressable>
        <Pressable onPress={() => setMenuOpen((o) => !o)} style={styles.hBtn} hitSlop={6}><MoreIcon size={19} color={t.inkSoft} /></Pressable>
        {menuOpen ? (
          <HeaderMenu
            chat={chat}
            onClose={() => setMenuOpen(false)}
            onInfo={() => { setMenuOpen(false); setInfoOpen(true); }}
            onSaved={() => { setMenuOpen(false); setSavedOpen(true); }}
          />
        ) : null}
      </View>

      {/* pinned bar */}
      {pinned.length ? (
        <View style={[styles.pinned, { borderBottomColor: t.border, backgroundColor: t.accent + '0d' }]}>
          <Text style={{ fontSize: 13 }}>📌</Text>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.pinnedTitle, { color: t.accentInk }]}>Pinned · {pinned.length}</Text>
            <Text numberOfLines={1} style={{ color: t.inkSoft, fontSize: 12.5 }}>{pinned[pinned.length - 1]!.content || 'media'}</Text>
          </View>
        </View>
      ) : null}

      {/* messages */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {visible.length === 0 ? (
          <View style={styles.sayHi}><Text style={{ color: t.inkFaint, fontSize: 14 }}>Say hi 👋</Text></View>
        ) : (
          renderRuns(visible, me?.id, chat.type === 'group', byId, {
            onOpenActions: setActionMsg,
            onOpenImage: setViewerUrl,
            onToggleReaction: (m, e) => void toggleReaction(m, e),
            onJumpToReply: () => setSearchOpen(false),
            onVotePoll: (id, i) => void votePoll(id, i),
            onViewOnce: (m) => { if (m.fileUrl) setViewerUrl(m.fileUrl); void markViewOnce(m); },
          })
        )}
        {typing.length ? <TypingDots /> : null}
      </ScrollView>

      <Composer
        chatId={chat.id}
        participants={chat.type === 'group' ? chat.participants : []}
        meId={me?.id}
        replyTo={replyTo}
        replyName={replyName}
        editing={editing}
        onCancelReply={() => setReplyTo(null)}
        onCancelEdit={() => setEditing(null)}
      />

      {/* overlays */}
      {searchOpen ? <SearchPanel chatId={chat.id} onClose={() => setSearchOpen(false)} /> : null}
      {actionMsg ? (
        <MessageActions
          message={actionMsg}
          mine={actionMsg.senderId === me?.id}
          onReply={(m) => { setReplyTo(m); setEditing(null); }}
          onForward={(m) => setForwardMsg(m)}
          onEdit={(m) => { setEditing(m); setReplyTo(null); }}
          onClose={() => setActionMsg(null)}
        />
      ) : null}
      {forwardMsg ? <ForwardModal message={forwardMsg} onClose={() => setForwardMsg(null)} /> : null}
      {infoOpen ? <ChatInfoModal chat={chat} onClose={() => setInfoOpen(false)} /> : null}
      {savedOpen ? <SavedModal onClose={() => setSavedOpen(false)} /> : null}
      {viewerUrl ? <ImageViewer url={viewerUrl} onClose={() => setViewerUrl(null)} /> : null}
    </View>
  );
}

function HeaderMenu({ chat, onClose, onInfo, onSaved }: { chat: Chat; onClose: () => void; onInfo: () => void; onSaved: () => void }) {
  const t = useTheme();
  const { setChatSettings, setDisappearing } = useMessaging();
  const [disOpen, setDisOpen] = useState(false);
  const curDis = chat.disappearingSeconds ?? 0;
  const Item = ({ label, onPress, right }: { label: string; onPress: () => void; right?: string }) => (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: t.surfaceMuted }]}>
      <Text style={[styles.menuTxt, { color: t.ink }]}>{label}</Text>
      {right ? <Text style={{ color: t.inkFaint, fontSize: 11 }}>{right}</Text> : null}
    </Pressable>
  );
  return (
    <>
      <Pressable style={styles.menuScrim} onPress={onClose} />
      <View style={[styles.menu, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Item label={chat.type === 'group' ? 'Group info' : 'Contact info'} onPress={onInfo} />
        <Item label="Saved messages" onPress={onSaved} />
        <Item
          label="Disappearing"
          right={DISAPPEAR_OPTIONS.find((o) => o.seconds === curDis)?.label ?? 'Off'}
          onPress={() => setDisOpen((d) => !d)}
        />
        {disOpen
          ? DISAPPEAR_OPTIONS.map((o) => (
              <Pressable
                key={o.seconds}
                onPress={() => { void setDisappearing(chat.id, o.seconds); onClose(); }}
                style={({ pressed }) => [styles.menuSubItem, pressed && { backgroundColor: t.surfaceMuted }]}
              >
                <Text style={{ color: o.seconds === curDis ? t.accentInk : t.inkSoft, fontSize: 13.5, fontWeight: o.seconds === curDis ? '600' : '400' }}>{o.label}</Text>
              </Pressable>
            ))
          : null}
        <Item label={chat.muted ? 'Unmute' : 'Mute'} onPress={() => { void setChatSettings(chat.id, { muted: !chat.muted }); onClose(); }} />
        <Item label={chat.archived ? 'Unarchive' : 'Archive'} onPress={() => { void setChatSettings(chat.id, { archived: !chat.archived }); onClose(); }} />
      </View>
    </>
  );
}

function renderRuns(
  messages: Message[],
  meId: string | undefined,
  isGroup: boolean,
  byId: Map<string, Message>,
  handlers: {
    onOpenActions: (m: Message) => void;
    onOpenImage: (url: string) => void;
    onToggleReaction: (m: Message, emoji: string) => void;
    onJumpToReply: (id: string) => void;
    onVotePoll: (messageId: string, idx: number) => void;
    onViewOnce: (m: Message) => void;
  },
) {
  const out: ReactNode[] = [];
  let lastDay = '';
  messages.forEach((m, i) => {
    const day = m.createdAt.slice(0, 10);
    if (day !== lastDay) {
      out.push(<DaySeparator key={`day-${day}-${i}`} iso={m.createdAt} />);
      lastDay = day;
    }
    const mine = m.senderId === meId;
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const sameAsPrev = prev && prev.senderId === m.senderId && prev.createdAt.slice(0, 10) === day;
    const sameAsNext = next && next.senderId === m.senderId && next.createdAt.slice(0, 10) === day;
    const replyPreview = resolveReply(m, byId, meId);
    out.push(
      <MessageBubble
        key={m.id}
        message={m}
        mine={mine}
        meId={meId}
        showSender={isGroup && !mine && !sameAsPrev}
        showAvatar={!mine && !sameAsNext}
        replyPreview={replyPreview}
        {...handlers}
      />,
    );
  });
  return out;
}

function DaySeparator({ iso }: { iso: string }) {
  const t = useTheme();
  return (
    <View style={styles.dayRow}>
      <Text style={[styles.dayChip, { backgroundColor: t.surfaceMuted, color: t.inkFaint }]}>{dayLabel(iso).toUpperCase()}</Text>
    </View>
  );
}

function resolveReply(m: Message, byId: Map<string, Message>, meId: string | undefined): ReplyPreview | undefined {
  if (!m.replyToId) return undefined;
  const tgt = byId.get(m.replyToId);
  if (!tgt) return { name: '', text: 'Original message' };
  const name = tgt.senderId === meId ? 'You' : tgt.sender?.displayName || tgt.sender?.username || '';
  const text = tgt.isDeleted ? 'Message deleted' : tgt.content || (tgt.type === 'image' ? '📷 Photo' : tgt.type === 'file' ? '📎 File' : 'media');
  return { name, text };
}

function TypingDots() {
  const t = useTheme();
  return (
    <View style={styles.typing}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={[styles.dot, { backgroundColor: t.inkFaint }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  emptyRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 15, fontWeight: '600' },
  emptySub: { fontSize: 14, textAlign: 'center', maxWidth: 260 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: 1, paddingHorizontal: 8, paddingVertical: 8 },
  hBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  hCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  hName: { fontSize: 15.5, fontWeight: '700' },
  hStatus: { fontSize: 12 },
  pinned: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, paddingHorizontal: 16, paddingVertical: 8 },
  pinnedTitle: { fontSize: 11, fontWeight: '600' },
  list: { paddingHorizontal: 12, paddingVertical: 16 },
  sayHi: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  dayRow: { alignItems: 'center', marginVertical: 12 },
  dayChip: { borderRadius: 100, paddingHorizontal: 12, paddingVertical: 4, fontSize: 10.5, letterSpacing: 0.5 },
  typing: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  // header menu
  menuScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: -1000, zIndex: 20 },
  menu: { position: 'absolute', right: 8, top: 52, width: 210, borderRadius: 16, borderWidth: 1, padding: 6, zIndex: 30 },
  menuItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  menuSubItem: { borderRadius: 10, paddingHorizontal: 20, paddingVertical: 7 },
  menuTxt: { fontSize: 14 },
});
