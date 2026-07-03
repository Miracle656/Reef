import { View, Pressable, Modal, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { XIcon } from './icons';

export function ImageViewer({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.root} onPress={onClose}>
        <Pressable style={styles.closeBtn} onPress={onClose}>
          <XIcon size={22} color="#fff" />
        </Pressable>
        <Image source={{ uri: url }} style={styles.img} contentFit="contain" />
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(21,21,26,0.9)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  closeBtn: { position: 'absolute', right: 16, top: 48, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  img: { width: '100%', height: '100%' },
});
