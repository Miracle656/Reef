import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Avatar, useTheme } from '@/components/ui';
import { timeShort } from '@/lib/messaging/format';
import type { Message } from '@/lib/messaging/types';
import { PollView } from './poll-view';
import { CheckIcon, CheckCheckIcon } from './icons';

export interface ReplyPreview {
  name: string;
  text: string;
}

export function MessageBubble({
  message,
  mine,
  meId,
  showSender,
  showAvatar,
  replyPreview,
  onOpenActions,
  onOpenImage,
  onToggleReaction,
  onJumpToReply,
  onVotePoll,
  onViewOnce,
}: {
  message: Message;
  mine: boolean;
  meId?: string;
  showSender: boolean;
  showAvatar: boolean;
  replyPreview?: ReplyPreview;
  onOpenActions: (m: Message) => void;
  onOpenImage: (url: string) => void;
  onToggleReaction: (m: Message, emoji: string) => void;
  onJumpToReply?: (messageId: string) => void;
  onVotePoll: (messageId: string, idx: number) => void;
  onViewOnce: (m: Message) => void;
}) {
  const t = useTheme();
  const m = message;
  const reactions = groupReactions(m, meId);
  const redacted = m.redacted;

  const bubbleBg = mine ? t.accent : t.surface;
  const textColor = mine ? t.onAccent : t.ink;
  const faint = mine ? 'rgba(255,255,255,0.7)' : t.inkFaint;

  return (
    <View style={[styles.row, { justifyContent: mine ? 'flex-end' : 'flex-start' }]}>
      {!mine ? (
        <View style={styles.avatarSlot}>
          {showAvatar ? <Avatar name={m.sender?.username ?? '?'} src={m.sender?.avatarUrl} size={28} /> : null}
        </View>
      ) : null}

      <View style={[styles.col, { alignItems: mine ? 'flex-end' : 'flex-start' }]}>
        {showSender && !mine ? (
          <Text style={[styles.sender, { color: t.accentInk }]}>{m.sender?.displayName || m.sender?.username}</Text>
        ) : null}

        <Pressable
          onLongPress={() => onOpenActions(m)}
          delayLongPress={250}
          style={[
            styles.bubble,
            {
              backgroundColor: bubbleBg,
              borderColor: mine ? 'transparent' : t.border,
              borderWidth: mine ? 0 : 1,
              borderBottomRightRadius: mine ? 6 : 18,
              borderBottomLeftRadius: mine ? 18 : 6,
            },
            m.failed && { opacity: 0.7, borderWidth: 1, borderColor: t.danger },
          ]}
        >
          {m.audienceIds?.length && !redacted && !m.isDeleted ? (
            <Text style={[styles.tagLine, { color: faint }]}>🔒 Aside · {m.audienceIds.length} can see</Text>
          ) : null}

          {m.isForwarded && !m.isDeleted ? (
            <Text style={[styles.tagLine, { color: faint }]}>↪ Forwarded</Text>
          ) : null}

          {replyPreview && !m.isDeleted ? (
            <Pressable
              onPress={() => m.replyToId && onJumpToReply?.(m.replyToId)}
              style={[styles.reply, { borderLeftColor: mine ? 'rgba(255,255,255,0.5)' : t.accent, backgroundColor: mine ? 'rgba(255,255,255,0.1)' : t.accent + '14' }]}
            >
              <Text style={[styles.replyName, { color: mine ? t.onAccent : t.accentInk }]}>{replyPreview.name}</Text>
              <Text numberOfLines={1} style={{ color: mine ? 'rgba(255,255,255,0.8)' : t.inkSoft, fontSize: 12.5 }}>{replyPreview.text}</Text>
            </Pressable>
          ) : null}

          {m.isDeleted ? (
            <Text style={[styles.italic, { color: textColor }]}>Message deleted</Text>
          ) : redacted ? (
            <Text style={[styles.italic, { color: textColor }]}>🔒 This message is an aside you can’t read</Text>
          ) : (
            <Content message={m} mine={mine} onOpenImage={onOpenImage} onVotePoll={onVotePoll} onViewOnce={onViewOnce} />
          )}

          <View style={styles.metaRow}>
            {m.expiresAt && !m.isDeleted ? <Text style={[styles.metaTxt, { color: faint }]}>⏲ {fmtExpiry(m.expiresAt)}</Text> : null}
            {m.isEdited && !m.isDeleted ? <Text style={[styles.metaTxt, { color: faint }]}>edited</Text> : null}
            <Text style={[styles.metaTxt, { color: faint }]}>{timeShort(m.createdAt)}</Text>
            {mine && !m.isDeleted ? <Ticks message={m} faint={faint} /> : null}
          </View>
        </Pressable>

        {reactions.length ? (
          <View style={[styles.reactRow, { justifyContent: mine ? 'flex-end' : 'flex-start' }]}>
            {reactions.map((r) => (
              <Pressable
                key={r.emoji}
                onPress={() => onToggleReaction(m, r.emoji)}
                style={[styles.reactChip, { borderColor: r.mine ? t.accent : t.border, backgroundColor: r.mine ? t.accent + '26' : t.surface }]}
              >
                <Text style={{ fontSize: 12 }}>{r.emoji}</Text>
                <Text style={[styles.reactCount, { color: r.mine ? t.accentInk : t.inkSoft }]}>{r.count}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {m.failed ? <Text style={[styles.failed, { color: t.danger }]}>Not delivered</Text> : null}
      </View>
    </View>
  );
}

function Content({
  message: m,
  mine,
  onOpenImage,
  onVotePoll,
  onViewOnce,
}: {
  message: Message;
  mine: boolean;
  onOpenImage: (url: string) => void;
  onVotePoll: (messageId: string, idx: number) => void;
  onViewOnce: (m: Message) => void;
}) {
  const t = useTheme();
  const textColor = mine ? t.onAccent : t.ink;

  if (m.isWhisper) return <Whisper message={m} mine={mine} />;
  if (m.viewOnce && (m.type === 'image' || m.fileUrl)) {
    return m.viewOnceViewed ? (
      <Text style={[styles.italic, { color: textColor }]}>👁 Opened</Text>
    ) : (
      <Pressable onPress={() => onViewOnce(m)}><Text style={[styles.underline, { color: textColor }]}>📷 View once · tap to open</Text></Pressable>
    );
  }
  if (m.type === 'voice' && m.fileUrl) {
    return <Text style={{ color: textColor }}>🎤 Voice message</Text>;
  }
  if (m.type === 'poll' && m.poll) return <PollView message={m} mine={mine} onVote={(i) => onVotePoll(m.id, i)} />;
  if (m.type === 'image' && m.fileUrl) {
    return (
      <View>
        <Pressable onPress={() => onOpenImage(m.fileUrl!)}>
          <Image source={{ uri: m.fileUrl }} style={styles.image} contentFit="cover" />
        </Pressable>
        {m.content ? <Text style={[styles.body, { color: textColor, marginTop: 4 }]}>{highlightMentions(m.content, mine, t)}</Text> : null}
      </View>
    );
  }
  if (m.type === 'file' && m.fileUrl) {
    return <Text style={[styles.underline, { color: textColor }]}>📎 {m.fileName ?? 'File'}</Text>;
  }
  if (m.type === 'location') return <Text style={{ color: textColor }}>📍 {m.content || 'Shared a location'}</Text>;
  return <Text style={[styles.body, { color: textColor }]}>{highlightMentions(m.content, mine, t)}</Text>;
}

function Whisper({ message: m, mine }: { message: Message; mine: boolean }) {
  const t = useTheme();
  const [revealed, setRevealed] = useState(false);
  const textColor = mine ? t.onAccent : t.ink;
  if (revealed) return <Text style={[styles.body, { color: textColor }]}>{highlightMentions(m.content, mine, t)}</Text>;
  return (
    <Pressable onPress={() => setRevealed(true)}>
      <Text style={[styles.italic, { color: mine ? 'rgba(255,255,255,0.8)' : t.inkSoft }]}>👁 Tap to reveal whisper</Text>
    </Pressable>
  );
}

function Ticks({ message: m, faint }: { message: Message; faint: string }) {
  if (m.pending) return <Text style={[styles.metaTxt, { color: faint }]}>·</Text>;
  if (m.status === 'read') return <CheckCheckIcon size={14} color="#bfe0ff" />;
  if (m.status === 'delivered') return <CheckCheckIcon size={14} color={faint} />;
  return <CheckIcon size={14} color={faint} />;
}

function groupReactions(m: Message, meId?: string): { emoji: string; count: number; mine: boolean }[] {
  if (!m.reactions?.length) return [];
  const map = new Map<string, { count: number; mine: boolean }>();
  for (const r of m.reactions) {
    const cur = map.get(r.emoji) ?? { count: 0, mine: false };
    cur.count++;
    if (r.userId === meId) cur.mine = true;
    map.set(r.emoji, cur);
  }
  return [...map.entries()].map(([emoji, v]) => ({ emoji, ...v }));
}

function fmtExpiry(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return '';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const mm = Math.floor(s / 60);
  if (mm < 60) return `${mm}m`;
  const h = Math.floor(mm / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** Bold @mentions inside message text (RN: nested Text spans). */
function highlightMentions(text: string, mine: boolean, t: ReturnType<typeof useTheme>) {
  const parts = text.split(/(@[a-zA-Z0-9_]+)/g);
  return parts.map((p, i) =>
    p.startsWith('@') ? (
      <Text key={i} style={{ fontWeight: '700', color: mine ? t.onAccent : t.accentInk }}>{p}</Text>
    ) : (
      <Text key={i}>{p}</Text>
    ),
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, width: '100%', marginVertical: 1 },
  avatarSlot: { width: 28 },
  col: { maxWidth: '80%', flexShrink: 1 },
  sender: { marginBottom: 2, paddingHorizontal: 4, fontSize: 12, fontWeight: '600' },
  bubble: { borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7 },
  tagLine: { fontSize: 11, fontStyle: 'italic', marginBottom: 2 },
  reply: { borderLeftWidth: 2, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 4 },
  replyName: { fontWeight: '600', fontSize: 12.5 },
  italic: { fontStyle: 'italic', fontSize: 14.5 },
  underline: { textDecorationLine: 'underline', fontSize: 14.5, fontWeight: '500' },
  body: { fontSize: 14.5, lineHeight: 20 },
  image: { width: 220, height: 220, maxWidth: '100%', borderRadius: 12 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 2 },
  metaTxt: { fontSize: 10 },
  reactRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  reactChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 100, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  reactCount: { fontSize: 10.5 },
  failed: { marginTop: 2, paddingHorizontal: 4, fontSize: 11 },
});
