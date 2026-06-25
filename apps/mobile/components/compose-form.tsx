import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useQueryClient } from '@tanstack/react-query';
import { buildCreatePostTx, walrus } from '@umbra/core';
import { umbraConfig } from '@/lib/config';
import { useGasless } from '@/lib/gasless';
import { Button, Card, Spinner, useTheme } from './ui';

const MAX = 560;
const MAX_IMAGES = 2;

export function ComposeForm({
  autoFocus = false,
  onPosted,
}: {
  autoFocus?: boolean;
  onPosted?: () => void;
}) {
  const [text, setText] = useState('');
  const [assets, setAssets] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useGasless();
  const qc = useQueryClient();
  const t = useTheme();

  const canPost = (text.trim().length > 0 || assets.length > 0) && text.length <= MAX && !busy;

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGES - assets.length,
      quality: 0.85,
    });
    if (result.canceled) return;
    setAssets((prev) => [...prev, ...result.assets].slice(0, MAX_IMAGES));
  }

  function removeAt(i: number) {
    setAssets((prev) => prev.filter((_, j) => j !== i));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const media: string[] = [];
      for (const asset of assets.slice(0, 4)) {
        const response = await fetch(asset.uri);
        const bytes = new Uint8Array(await response.arrayBuffer());
        media.push((await walrus.upload(umbraConfig, bytes)).blobId);
      }
      await run(buildCreatePostTx(umbraConfig, { text: text.trim(), media }));
      setText('');
      setAssets([]);
      const refresh = () => {
        qc.invalidateQueries({ queryKey: ['feed'] });
        qc.invalidateQueries({ queryKey: ['posts-by-author'] });
      };
      refresh();
      setTimeout(refresh, 4500);
      onPosted?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to post');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View>
      <TextInput
        autoFocus={autoFocus}
        multiline
        numberOfLines={4}
        value={text}
        maxLength={MAX}
        onChangeText={setText}
        placeholder="What's happening in Lagos?"
        placeholderTextColor={t.inkFaint}
        style={{
          color: t.ink,
          fontSize: 15,
          lineHeight: 22,
          minHeight: 80,
          textAlignVertical: 'top',
        }}
      />

      {assets.length > 0 ? (
        <View style={[styles.mediaGrid, assets.length > 1 && styles.mediaGrid2]}>
          {assets.map((asset, i) => (
            <View key={asset.uri} style={styles.mediaWrap}>
              <Image source={{ uri: asset.uri }} style={styles.mediaImg} contentFit="cover" />
              <Pressable onPress={() => removeAt(i)} style={styles.removeBtn}>
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>✕</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {error ? <Text style={{ color: t.danger, fontSize: 13, marginTop: 8 }}>{error}</Text> : null}

      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          <Pressable
            onPress={pickImage}
            disabled={assets.length >= MAX_IMAGES}
            style={{ opacity: assets.length >= MAX_IMAGES ? 0.4 : 1 }}
          >
            <Text style={{ color: t.accent, fontSize: 14, fontWeight: '500' }}>
              + Image{assets.length > 0 ? ` (${assets.length}/${MAX_IMAGES})` : ''}
            </Text>
          </Pressable>
          <Text style={{ color: text.length > MAX ? t.danger : t.inkFaint, fontSize: 12 }}>
            {text.length}/{MAX}
          </Text>
        </View>
        <Button size="sm" disabled={!canPost} onPress={submit}>
          {busy ? <Spinner color="#fff" /> : null}
          Post
        </Button>
      </View>
    </View>
  );
}

export function ComposeBox() {
  return (
    <Card style={{ padding: 16 }}>
      <ComposeForm />
    </Card>
  );
}

const styles = StyleSheet.create({
  mediaGrid: { marginTop: 12, gap: 8 },
  mediaGrid2: { flexDirection: 'row' },
  mediaWrap: { position: 'relative', flex: 1 },
  mediaImg: { width: '100%', height: 200, borderRadius: 16 },
  removeBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  footerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
