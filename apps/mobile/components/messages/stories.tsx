import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Modal,
  StyleSheet,
  TextInput,
  type ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Avatar, Button, useTheme } from '@/components/ui';
import { useMessaging } from '@/lib/messaging/provider';
import type { StatusGroup } from '@/lib/messaging/types';
import { PlusIcon, XIcon } from './icons';

const BGS = ['#0a84ff', '#18c2c2', '#ff8a5b', '#15151a', '#7c3aed', '#e2554a'];

/** Horizontal stories rail shown above the chat list. */
export function StoriesBar() {
  const t = useTheme();
  const { listStatus, me } = useMessaging();
  const [groups, setGroups] = useState<StatusGroup[]>([]);
  const [viewing, setViewing] = useState<StatusGroup | null>(null);
  const [composing, setComposing] = useState(false);

  const refresh = () => void listStatus().then(setGroups);
  useEffect(refresh, [listStatus]);

  const mine = groups.find((g) => g.user.id === me?.id);
  const others = groups.filter((g) => g.user.id !== me?.id);

  return (
    <View style={[styles.barWrap, { borderBottomColor: t.border }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bar}>
        <Pressable onPress={() => setComposing(true)} style={styles.storyBtn}>
          <View style={[styles.addRing, { borderColor: t.borderStrong }]}>
            <Avatar name={me?.username ?? 'you'} src={me?.avatarUrl} size={48} />
            <View style={[styles.addBadge, { backgroundColor: t.accent }]}>
              <PlusIcon size={12} color={t.onAccent} />
            </View>
          </View>
          <Text style={[styles.label, { color: t.inkSoft }]} numberOfLines={1}>Your story</Text>
        </Pressable>

        {mine ? <StoryAvatar group={mine} label="You" onPress={() => setViewing(mine)} /> : null}
        {others.map((g) => (
          <StoryAvatar key={g.user.id} group={g} label={g.user.displayName || g.user.username} onPress={() => setViewing(g)} />
        ))}
      </ScrollView>

      {viewing ? <StoryViewer group={viewing} onClose={() => { setViewing(null); refresh(); }} /> : null}
      {composing ? <StatusComposer onClose={() => { setComposing(false); refresh(); }} /> : null}
    </View>
  );
}

function StoryAvatar({ group, label, onPress }: { group: StatusGroup; label: string; onPress: () => void }) {
  const t = useTheme();
  const ring: ViewStyle = group.hasUnseen
    ? { borderColor: t.accent, borderWidth: 2 }
    : { borderColor: t.surfaceMuted, borderWidth: 2 };
  return (
    <Pressable onPress={onPress} style={styles.storyBtn}>
      <View style={[styles.ring, ring, { backgroundColor: t.surface }]}>
        <Avatar name={group.user.username} src={group.user.avatarUrl} size={48} />
      </View>
      <Text style={[styles.label, { color: t.inkSoft }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function StoryViewer({ group, onClose }: { group: StatusGroup; onClose: () => void }) {
  const { viewStatus, deleteStatus, me } = useMessaging();
  const [idx, setIdx] = useState(0);
  const items = group.items;
  const cur = items[idx];
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!cur) return;
    void viewStatus(cur.id);
    timer.current = setTimeout(() => {
      if (idx < items.length - 1) setIdx(idx + 1);
      else onClose();
    }, 4500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, cur?.id]);

  if (!cur) return null;
  const isMine = group.user.id === me?.id;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.viewerRoot}>
        {/* progress bars */}
        <View style={styles.progressRow}>
          {items.map((s, i) => (
            <View key={s.id} style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: i <= idx ? '100%' : '0%' }]} />
            </View>
          ))}
        </View>
        {/* header */}
        <View style={styles.viewerHeader}>
          <Avatar name={group.user.username} src={group.user.avatarUrl} size={32} />
          <Text style={styles.viewerName}>{isMine ? 'You' : group.user.displayName || group.user.username}</Text>
          <View style={{ flex: 1 }} />
          {isMine ? (
            <Pressable onPress={() => { void deleteStatus(cur.id); onClose(); }} style={styles.viewerIconBtn}>
              <Text style={{ fontSize: 18 }}>🗑</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={onClose} style={styles.viewerIconBtn}>
            <XIcon size={22} color="rgba(255,255,255,0.85)" />
          </Pressable>
        </View>
        {/* body */}
        <View style={styles.viewerBody}>
          {cur.type === 'image' && cur.mediaUrl ? (
            <Image source={{ uri: cur.mediaUrl }} style={styles.viewerImg} contentFit="contain" />
          ) : (
            <View style={[styles.viewerText, { backgroundColor: cur.bg ?? '#0a84ff' }]}>
              <Text style={styles.viewerTextContent}>{cur.content}</Text>
            </View>
          )}
          {/* tap zones */}
          <Pressable style={[styles.tapZone, { left: 0 }]} onPress={() => setIdx((i) => Math.max(0, i - 1))} />
          <Pressable style={[styles.tapZone, { right: 0 }]} onPress={() => (idx < items.length - 1 ? setIdx(idx + 1) : onClose())} />
        </View>
      </View>
    </Modal>
  );
}

function StatusComposer({ onClose }: { onClose: () => void }) {
  const t = useTheme();
  const { postStatus, uploadMedia } = useMessaging();
  const [text, setText] = useState('');
  const [bg, setBg] = useState(BGS[0]!);
  const [busy, setBusy] = useState(false);

  const postText = async () => {
    if (!text.trim()) return;
    setBusy(true);
    await postStatus({ type: 'text', content: text.trim(), bg });
    onClose();
  };

  const postImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    setBusy(true);
    const up = await uploadMedia({ uri: a.uri, name: a.fileName ?? 'photo.jpg', size: a.fileSize ?? 0, mimeType: a.mimeType ?? 'image/jpeg' });
    await postStatus({ type: 'image', content: '', mediaUrl: up.url });
    onClose();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.composerBackdrop} onPress={onClose}>
        <Pressable style={[styles.composerCard, { backgroundColor: t.surface, borderColor: t.border }]} onPress={() => {}}>
          <View style={styles.composerHead}>
            <Text style={[styles.composerTitle, { color: t.ink }]}>New story</Text>
            <Pressable onPress={onClose} style={styles.viewerIconBtn}><XIcon size={20} color={t.inkSoft} /></Pressable>
          </View>
          <View style={[styles.composerPreview, { backgroundColor: bg }]}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Type something…"
              placeholderTextColor="rgba(255,255,255,0.7)"
              multiline
              style={styles.composerInput}
            />
          </View>
          <View style={styles.swatchRow}>
            {BGS.map((c) => (
              <Pressable
                key={c}
                onPress={() => setBg(c)}
                style={[styles.swatch, { backgroundColor: c, borderColor: bg === c ? t.ink : 'transparent' }]}
              />
            ))}
          </View>
          <View style={styles.composerActions}>
            <Button onPress={() => void postText()} disabled={!text.trim() || busy} style={{ flex: 1 }}>Post text</Button>
            <Button variant="outline" onPress={() => void postImage()} disabled={busy}>Photo</Button>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  barWrap: { borderBottomWidth: 1 },
  bar: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  storyBtn: { alignItems: 'center', gap: 4, width: 68 },
  addRing: {
    width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  addBadge: {
    position: 'absolute', bottom: -2, right: 2, width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  ring: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, maxWidth: 60 },
  // viewer
  viewerRoot: { flex: 1, backgroundColor: 'rgba(21,21,26,0.94)' },
  progressRow: { flexDirection: 'row', gap: 4, padding: 12, paddingTop: 48 },
  progressTrack: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#fff' },
  viewerHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  viewerName: { fontSize: 14, fontWeight: '600', color: '#fff' },
  viewerIconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  viewerBody: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  viewerImg: { width: '100%', height: '100%' },
  viewerText: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  viewerTextContent: { fontSize: 26, fontWeight: '700', color: '#fff', textAlign: 'center' },
  tapZone: { position: 'absolute', top: 0, bottom: 0, width: '33%' },
  // composer
  composerBackdrop: { flex: 1, backgroundColor: 'rgba(21,21,26,0.4)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  composerCard: { width: '100%', maxWidth: 380, borderRadius: 28, borderWidth: 1, padding: 20 },
  composerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  composerTitle: { fontSize: 18, fontWeight: '700' },
  composerPreview: { borderRadius: 18, padding: 24, marginBottom: 12, minHeight: 120, justifyContent: 'center' },
  composerInput: { color: '#fff', fontSize: 20, fontWeight: '700', textAlign: 'center', minHeight: 72 },
  swatchRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 2 },
  composerActions: { flexDirection: 'row', gap: 8 },
});
