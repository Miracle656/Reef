import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal, StyleSheet } from 'react-native';
import { Avatar, Button, useTheme } from '@/components/ui';
import { useMessaging } from '@/lib/messaging/provider';
import { chatAvatar, chatName, peerOf } from '@/lib/messaging/display';
import type { Chat } from '@/lib/messaging/types';
import { XIcon } from './icons';

export function ChatInfoModal({ chat, onClose }: { chat: Chat; onClose: () => void }) {
  const t = useTheme();
  const { me, leaveGroup, setChatSettings, blockUser, unblockUser, listBlocked, reportUser } = useMessaging();
  const isGroup = chat.type === 'group';
  const meId = me?.id;
  const av = chatAvatar(chat, meId);
  const peer = peerOf(chat, meId);
  const [blocked, setBlocked] = useState(false);
  const [reported, setReported] = useState(false);

  useEffect(() => {
    if (!peer) return;
    void listBlocked().then((list) => setBlocked(list.some((u) => u.id === peer.id)));
  }, [peer, listBlocked]);

  const toggleBlock = async () => {
    if (!peer) return;
    if (blocked) { await unblockUser(peer.id); setBlocked(false); }
    else { await blockUser(peer.id); setBlocked(true); onClose(); }
  };

  const report = async () => {
    if (!peer) return;
    await reportUser(peer.id, 'Reported from mobile', chat.id);
    setReported(true);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]} onPress={() => {}}>
          <View style={styles.head}>
            <Text style={[styles.title, { color: t.ink }]}>{isGroup ? 'Group info' : 'Contact info'}</Text>
            <Pressable onPress={onClose} style={styles.iconBtn}><XIcon size={20} color={t.inkSoft} /></Pressable>
          </View>

          <ScrollView style={{ flexGrow: 0 }}>
            {/* identity */}
            <View style={styles.identity}>
              <Avatar name={av.name} src={av.src} size={84} />
              <Text style={[styles.name, { color: t.ink }]}>{chatName(chat, meId)}</Text>
              {!isGroup && peer ? <Text style={[styles.handle, { color: t.inkFaint }]}>@{peer.username}</Text> : null}
              {chat.description ? <Text style={[styles.bio, { color: t.inkSoft }]}>{chat.description}</Text> : null}
              {!isGroup && peer?.bio ? <Text style={[styles.bio, { color: t.inkSoft }]}>{peer.bio}</Text> : null}
            </View>

            {/* settings */}
            <View style={[styles.settings, { borderColor: t.border }]}>
              <Toggle label="Mute notifications" checked={!!chat.muted} onChange={(v) => void setChatSettings(chat.id, { muted: v })} />
              <Toggle label="Archive chat" checked={!!chat.archived} onChange={(v) => void setChatSettings(chat.id, { archived: v })} />
            </View>

            {/* members */}
            {isGroup ? (
              <View style={{ marginTop: 12 }}>
                <Text style={[styles.membersLabel, { color: t.inkFaint }]}>{chat.participants.length} MEMBERS</Text>
                {chat.participants.map((p) => {
                  const admin = (chat.adminIds ?? []).includes(p.id);
                  const isMe = p.id === meId;
                  return (
                    <View key={p.id} style={styles.member}>
                      <Avatar name={p.username} src={p.avatarUrl} size={38} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={1} style={[styles.memberName, { color: t.ink }]}>{p.displayName || p.username}{isMe ? ' (you)' : ''}</Text>
                        <Text numberOfLines={1} style={[styles.memberHandle, { color: t.inkFaint }]}>@{p.username}</Text>
                      </View>
                      {admin ? <View style={[styles.adminBadge, { backgroundColor: t.accent + '26' }]}><Text style={[styles.adminTxt, { color: t.accentInk }]}>admin</Text></View> : null}
                    </View>
                  );
                })}
                <Button variant="danger" onPress={() => void leaveGroup(chat.id).then(onClose)} style={{ marginTop: 16 }}>Leave group</Button>
              </View>
            ) : null}

            {/* direct: block / report */}
            {!isGroup && peer ? (
              <View style={{ marginTop: 12, gap: 8 }}>
                <Pressable onPress={() => void toggleBlock()} style={[styles.dangerBtn, { borderColor: blocked ? t.border : t.danger + '66' }]}>
                  <Text style={{ color: blocked ? t.ink : t.danger, fontSize: 14, fontWeight: '600' }}>{blocked ? `Unblock @${peer.username}` : `Block @${peer.username}`}</Text>
                </Pressable>
                <Pressable onPress={() => void report()} disabled={reported} style={[styles.dangerBtn, { borderColor: t.danger + '66', opacity: reported ? 0.6 : 1 }]}>
                  <Text style={{ color: t.danger, fontSize: 14, fontWeight: '600' }}>{reported ? 'Report submitted ✓' : `Report @${peer.username}`}</Text>
                </Pressable>
              </View>
            ) : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={() => onChange(!checked)} style={styles.toggleRow}>
      <Text style={{ color: t.ink, fontSize: 14 }}>{label}</Text>
      <View style={[styles.track, { backgroundColor: checked ? t.accent : t.surfaceMuted }]}>
        <View style={[styles.knob, { left: checked ? 18 : 2 }]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', backgroundColor: 'rgba(21,21,26,0.4)', padding: 16, paddingTop: 56 },
  card: { width: '100%', maxWidth: 420, maxHeight: '86%', borderRadius: 28, borderWidth: 1, padding: 20 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  title: { fontSize: 18, fontWeight: '700' },
  iconBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  identity: { alignItems: 'center', gap: 6, paddingVertical: 12 },
  name: { fontSize: 20, fontWeight: '700' },
  handle: { fontSize: 13 },
  bio: { fontSize: 13.5, textAlign: 'center' },
  settings: { marginVertical: 8, borderRadius: 18, borderWidth: 1, padding: 6 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  track: { width: 40, height: 24, borderRadius: 12, justifyContent: 'center' },
  knob: { position: 'absolute', width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  membersLabel: { fontSize: 11, letterSpacing: 0.5, marginBottom: 6, paddingHorizontal: 4 },
  member: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, paddingHorizontal: 8, paddingVertical: 8 },
  memberName: { fontSize: 14, fontWeight: '600' },
  memberHandle: { fontSize: 11.5 },
  adminBadge: { borderRadius: 100, paddingHorizontal: 8, paddingVertical: 2 },
  adminTxt: { fontSize: 11, fontWeight: '600' },
  dangerBtn: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12 },
});
