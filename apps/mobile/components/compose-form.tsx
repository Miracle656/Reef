import { useState } from 'react';
import { View, Alert, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Button, Textarea, Card, useTheme } from '@/components/ui';

interface ComposeFormProps {
  onSuccess?: () => void;
}

export function ComposeForm({ onSuccess }: ComposeFormProps) {
  const t = useTheme();
  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsMultipleSelection: true,
      selectionLimit: 2,
    });
    if (!result.canceled) {
      const uris = result.assets.map((a) => a.uri).slice(0, 2);
      setImages((prev) => [...prev, ...uris].slice(0, 2));
    }
  }

  function submit() {
    if (!text.trim()) return;
    Alert.alert(
      'Coming soon',
      'On-chain posting via Sui + Walrus will be wired in the next build.',
      [{ text: 'OK', onPress: () => { setText(''); setImages([]); onSuccess?.(); } }]
    );
  }

  const remaining = 560 - text.length;

  return (
    <View style={styles.container}>
      <Textarea
        value={text}
        onChangeText={setText}
        placeholder="What's on your mind?"
        maxLength={560}
        style={styles.textarea}
      />
      {images.length > 0 ? (
        <View style={styles.imageRow}>
          {images.map((uri, i) => (
            <Image key={i} source={{ uri }} style={styles.img} contentFit="cover" />
          ))}
        </View>
      ) : null}
      <View style={styles.actions}>
        <Button variant="ghost" size="sm" onPress={pickImage}>
          + Photo
        </Button>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {text.length > 0 ? (
            <View style={{ opacity: remaining < 20 ? 1 : 0.4 }}>
              <Button variant="ghost" size="sm">
                {String(remaining)}
              </Button>
            </View>
          ) : null}
          <Button
            variant="accent"
            size="sm"
            disabled={!text.trim()}
            onPress={submit}
          >
            Post
          </Button>
        </View>
      </View>
    </View>
  );
}

export function ComposeBox() {
  const t = useTheme();
  return (
    <Card style={{ padding: 16, backgroundColor: t.surface }}>
      <ComposeForm />
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  textarea: { minHeight: 100 },
  imageRow: { flexDirection: 'row', gap: 8 },
  img: { flex: 1, height: 120, borderRadius: 12 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
