import { useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet, TextInput } from 'react-native';
import { Button, useTheme } from '@/components/ui';
import { useMessaging } from '@/lib/messaging/provider';
import { PlusIcon, XIcon } from './icons';

export function PollComposer({ chatId, onClose }: { chatId: string; onClose: () => void }) {
  const t = useTheme();
  const { createPoll } = useMessaging();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [multi, setMulti] = useState(false);
  const [busy, setBusy] = useState(false);

  const valid = question.trim() && options.filter((o) => o.trim()).length >= 2;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    await createPoll(chatId, question.trim(), options.map((o) => o.trim()).filter(Boolean), multi);
    onClose();
  };

  const inputStyle = { backgroundColor: t.surfaceGlass, borderColor: t.border, color: t.ink };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]} onPress={() => {}}>
          <View style={styles.head}>
            <Text style={[styles.title, { color: t.ink }]}>New poll</Text>
            <Pressable onPress={onClose} style={styles.iconBtn}><XIcon size={20} color={t.inkSoft} /></Pressable>
          </View>
          <TextInput
            value={question}
            onChangeText={setQuestion}
            placeholder="Ask a question"
            placeholderTextColor={t.inkFaint}
            style={[styles.qInput, inputStyle]}
          />
          <View style={{ gap: 8 }}>
            {options.map((o, i) => (
              <View key={i} style={styles.optRow}>
                <TextInput
                  value={o}
                  onChangeText={(v) => setOptions((prev) => prev.map((x, j) => (j === i ? v : x)))}
                  placeholder={`Option ${i + 1}`}
                  placeholderTextColor={t.inkFaint}
                  style={[styles.optInput, inputStyle]}
                />
                {options.length > 2 ? (
                  <Pressable onPress={() => setOptions((prev) => prev.filter((_, j) => j !== i))} style={styles.iconBtn}>
                    <XIcon size={16} color={t.inkFaint} />
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
          {options.length < 6 ? (
            <Pressable onPress={() => setOptions((p) => [...p, ''])} style={styles.addRow}>
              <PlusIcon size={16} color={t.accent} />
              <Text style={[styles.addTxt, { color: t.accent }]}>Add option</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => setMulti((v) => !v)} style={styles.checkRow}>
            <View style={[styles.checkbox, { borderColor: t.borderStrong, backgroundColor: multi ? t.accent : 'transparent' }]}>
              {multi ? <Text style={{ color: t.onAccent, fontSize: 12 }}>✓</Text> : null}
            </View>
            <Text style={{ color: t.ink, fontSize: 14 }}>Allow multiple answers</Text>
          </Pressable>
          <Button onPress={() => void submit()} disabled={!valid || busy} style={{ marginTop: 16 }}>Create poll</Button>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', backgroundColor: 'rgba(21,21,26,0.4)', padding: 16, paddingTop: 72 },
  card: { width: '100%', maxWidth: 420, borderRadius: 28, borderWidth: 1, padding: 20 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '700' },
  iconBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  qInput: { height: 44, borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, fontSize: 15, marginBottom: 12 },
  optRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  optInput: { flex: 1, height: 40, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, fontSize: 14 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  addTxt: { fontSize: 13.5, fontWeight: '600' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
