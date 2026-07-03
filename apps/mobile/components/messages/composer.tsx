import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, TextInput } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '@/components/ui';
import { useMessaging } from '@/lib/messaging/provider';
import type { Message, Participant } from '@/lib/messaging/types';
import { PollComposer } from './poll-composer';
import { ImageIcon, PlusIcon, SendIcon, XIcon } from './icons';

export function Composer({
  chatId,
  participants = [],
  meId,
  replyTo,
  replyName,
  editing,
  onCancelReply,
  onCancelEdit,
}: {
  chatId: string;
  participants?: Participant[];
  meId?: string;
  replyTo?: Message | null;
  replyName?: string;
  editing?: Message | null;
  onCancelReply: () => void;
  onCancelEdit: () => void;
}) {
  const t = useTheme();
  const { send, editMessage, setTyping, uploadMedia } = useMessaging();
  const [text, setText] = useState('');
  const [attachOpen, setAttachOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const otherMembers = participants.filter((p) => p.id !== meId);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (editing) setText(editing.content);
  }, [editing]);

  const mentionMatches = useMemo(() => {
    if (mentionQuery == null) return [];
    const q = mentionQuery.toLowerCase();
    const base = participants.filter((p) => p.id !== meId && (p.username.toLowerCase().includes(q) || (p.displayName ?? '').toLowerCase().includes(q)));
    const everyone = { id: 'everyone', username: 'everyone', displayName: 'Everyone' } as Participant;
    const all = otherMembers.length > 1 && 'everyone'.includes(q) ? [everyone, ...base] : base;
    return all.slice(0, 5);
  }, [mentionQuery, participants, otherMembers.length, meId]);

  const detectMention = (v: string) => {
    const m = /(?:^|\s)@([a-zA-Z0-9_]*)$/.exec(v);
    setMentionQuery(m ? m[1] ?? '' : null);
  };

  const onChange = (v: string) => {
    setText(v);
    detectMention(v);
    if (!editing) {
      setTyping(chatId, true);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setTyping(chatId, false), 2000);
    }
  };

  const pickMention = (p: Participant) => {
    setText((prev) => prev.replace(/@([a-zA-Z0-9_]*)$/, `@${p.username} `));
    setMentionQuery(null);
  };

  const reset = () => setText('');

  const resolveMentionIds = (content: string): string[] => {
    const ids: string[] = [];
    for (const m of content.matchAll(/@([a-zA-Z0-9_]+)/g)) {
      const handle = m[1];
      if (!handle) continue;
      if (handle.toLowerCase() === 'everyone') {
        for (const p of otherMembers) ids.push(p.id);
        continue;
      }
      const u = participants.find((p) => p.username.toLowerCase() === handle.toLowerCase());
      if (u) ids.push(u.id);
    }
    return ids;
  };

  const submit = async () => {
    const content = text.trim();
    if (!content) return;
    if (editing) {
      reset();
      onCancelEdit();
      await editMessage(editing.id, content);
      return;
    }
    const replyId = replyTo?.id;
    const mentionIds = resolveMentionIds(content);
    reset();
    setTyping(chatId, false);
    onCancelReply();
    await send({ chatId, content, type: 'text', replyToId: replyId, mentionIds });
  };

  const pickImage = async () => {
    setAttachOpen(false);
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    setBusy(true);
    try {
      const up = await uploadMedia({ uri: a.uri, name: a.fileName ?? 'photo.jpg', size: a.fileSize ?? 0, mimeType: a.mimeType ?? 'image/jpeg' });
      await send({ chatId, type: 'image', content: '', fileUrl: up.url, fileName: up.name, fileSize: up.size, mimeType: up.mimeType, replyToId: replyTo?.id });
      onCancelReply();
    } finally {
      setBusy(false);
    }
  };

  const banner = editing || replyTo;

  return (
    <View style={[styles.wrap, { borderTopColor: t.border, backgroundColor: t.surface }]}>
      {/* mention autocomplete */}
      {mentionMatches.length ? (
        <View style={[styles.mentionBox, { backgroundColor: t.surface, borderColor: t.border }]}>
          {mentionMatches.map((p) => (
            <Pressable key={p.id} onPress={() => pickMention(p)} style={styles.mentionRow}>
              <Text style={[styles.mentionName, { color: t.ink }]}>{p.displayName || p.username}</Text>
              <Text style={[styles.mentionHandle, { color: t.inkFaint }]}>@{p.username}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {banner ? (
        <View style={[styles.banner, { borderBottomColor: t.border }]}>
          <View style={[styles.bannerBar, { backgroundColor: t.accent }]} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.bannerTitle, { color: t.accentInk }]}>{editing ? 'Editing message' : `Replying to ${replyName ?? ''}`}</Text>
            <Text numberOfLines={1} style={{ color: t.inkSoft, fontSize: 12.5 }}>{banner.content || 'media'}</Text>
          </View>
          <Pressable onPress={() => (editing ? onCancelEdit() : onCancelReply())} style={styles.iconBtn}>
            <XIcon size={16} color={t.inkSoft} />
          </Pressable>
        </View>
      ) : null}

      {/* attach menu */}
      {attachOpen ? (
        <View style={[styles.attachMenu, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Pressable onPress={() => void pickImage()} style={styles.attachItem}>
            <ImageIcon size={16} color={t.inkSoft} /><Text style={[styles.attachTxt, { color: t.ink }]}>Photo</Text>
          </Pressable>
          <Pressable onPress={() => { setAttachOpen(false); setPollOpen(true); }} style={styles.attachItem}>
            <Text style={{ fontSize: 15 }}>📊</Text><Text style={[styles.attachTxt, { color: t.ink }]}>Poll</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.inputRow}>
        <Pressable onPress={() => setAttachOpen((o) => !o)} disabled={!!editing || busy} style={styles.roundBtn} hitSlop={6}>
          <PlusIcon size={22} color={t.inkSoft} />
        </Pressable>

        <TextInput
          value={text}
          onChangeText={onChange}
          multiline
          placeholder={busy ? 'Uploading…' : editing ? 'Edit message' : 'Message'}
          placeholderTextColor={t.inkFaint}
          editable={!busy}
          style={[styles.input, { backgroundColor: t.surfaceGlass, borderColor: t.border, color: t.ink }]}
        />

        <Pressable
          onPress={() => void submit()}
          disabled={!text.trim() || busy}
          style={[styles.sendBtn, { backgroundColor: t.accent, opacity: !text.trim() || busy ? 0.4 : 1 }]}
        >
          <SendIcon size={20} color={t.onAccent} />
        </Pressable>
      </View>

      {pollOpen ? <PollComposer chatId={chatId} onClose={() => setPollOpen(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderTopWidth: 1 },
  mentionBox: { position: 'absolute', bottom: '100%', left: 12, marginBottom: 4, width: 240, borderRadius: 16, borderWidth: 1, padding: 6, zIndex: 20 },
  mentionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 6 },
  mentionName: { fontWeight: '600', fontSize: 13.5 },
  mentionHandle: { fontSize: 12 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, paddingHorizontal: 16, paddingVertical: 8 },
  bannerBar: { width: 3, height: 32, borderRadius: 2 },
  bannerTitle: { fontSize: 12, fontWeight: '600' },
  iconBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  attachMenu: { position: 'absolute', bottom: '100%', left: 8, marginBottom: 4, width: 180, borderRadius: 16, borderWidth: 1, padding: 6, zIndex: 20 },
  attachItem: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  attachTxt: { fontSize: 14 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingHorizontal: 12, paddingVertical: 10 },
  roundBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, minHeight: 44, maxHeight: 140, borderRadius: 20, borderWidth: 1, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, fontSize: 14.5 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
