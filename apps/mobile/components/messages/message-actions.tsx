import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { useTheme } from '@/components/ui';
import type { Message } from '@/lib/messaging/types';
import { useMessaging } from '@/lib/messaging/provider';
import { EditIcon, ForwardIcon, ReplyIcon, TrashIcon, PinIcon } from './icons';

const QUICK = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export function MessageActions({
  message,
  mine,
  onReply,
  onForward,
  onEdit,
  onClose,
}: {
  message: Message;
  mine: boolean;
  onReply: (m: Message) => void;
  onForward: (m: Message) => void;
  onEdit: (m: Message) => void;
  onClose: () => void;
}) {
  const t = useTheme();
  const { toggleReaction, deleteMessage, pinMessage, saveMessage } = useMessaging();
  const canEdit = mine && message.type === 'text' && !message.isDeleted;
  const canDelete = mine && !message.isDeleted;

  const act = (fn: () => void) => {
    fn();
    onClose();
  };

  const Item = ({ icon, label, danger, onPress }: { icon: React.ReactNode; label: string; danger?: boolean; onPress: () => void }) => (
    <Pressable onPress={() => act(onPress)} style={({ pressed }) => [styles.item, pressed && { backgroundColor: t.surfaceMuted }]}>
      <View style={{ width: 20, alignItems: 'center' }}>{icon}</View>
      <Text style={[styles.itemTxt, { color: danger ? t.danger : t.ink }]}>{label}</Text>
    </Pressable>
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: t.surface, borderColor: t.border }]} onPress={() => {}}>
          {/* quick reactions */}
          <View style={[styles.reactBar, { backgroundColor: t.surfaceMuted }]}>
            {QUICK.map((e) => (
              <Pressable key={e} onPress={() => act(() => void toggleReaction(message, e))} style={styles.reactBtn}>
                <Text style={{ fontSize: 22 }}>{e}</Text>
              </Pressable>
            ))}
          </View>

          <Item icon={<ReplyIcon size={18} color={t.inkSoft} />} label="Reply" onPress={() => onReply(message)} />
          <Item icon={<ForwardIcon size={18} color={t.inkSoft} />} label="Forward" onPress={() => onForward(message)} />
          <Item icon={<PinIcon size={18} color={t.inkSoft} />} label={message.isPinned ? 'Unpin' : 'Pin'} onPress={() => void pinMessage(message.id, !message.isPinned)} />
          <Item icon={<Text style={{ color: t.inkSoft, fontSize: 15 }}>🔖</Text>} label="Save" onPress={() => void saveMessage(message.id)} />
          {canEdit ? <Item icon={<EditIcon size={18} color={t.inkSoft} />} label="Edit" onPress={() => onEdit(message)} /> : null}
          {canDelete ? <Item icon={<TrashIcon size={18} color={t.danger} />} label="Delete" danger onPress={() => void deleteMessage(message.id)} /> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(21,21,26,0.3)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, padding: 12, paddingBottom: 32 },
  reactBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', borderRadius: 18, padding: 6, marginBottom: 8 },
  reactBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 11 },
  itemTxt: { fontSize: 14.5, fontWeight: '500' },
});
