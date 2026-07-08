import { useState } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Avatar, Button, Card, Input, Textarea, useTheme } from '@/components/ui';
import { useTopInset } from '@/components/screen';

export default function OnboardingScreen() {
  const t = useTheme();
  const router = useRouter();
  const top = useTopInset();

  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  const handleOk = /^[a-z0-9_]{3,20}$/.test(handle);

  async function pickAvatar() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      setAvatarUri(result.assets[0].uri);
    }
  }

  function submit() {
    if (!handleOk) return;
    Alert.alert(
      'Coming soon',
      'On-chain profile creation via Sui + SuiNS will be wired in the next build.',
      [{ text: 'OK', onPress: () => router.push('/') }]
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: t.background }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100, paddingTop: top + 20 }}
    >
      <Pressable onPress={() => router.back()} style={styles.backBtn}>
        <Text style={{ color: t.inkSoft, fontSize: 16 }}>← Back</Text>
      </Pressable>

      <Text style={[styles.title, { color: t.ink }]}>Create your profile</Text>

      <Card style={styles.card}>
        {/* Avatar picker */}
        <Pressable onPress={pickAvatar} style={styles.avatarRow}>
          <Avatar name={handle || 'U'} src={avatarUri} size={64} />
          <View>
            <Text style={{ color: t.accent, fontWeight: '600', fontSize: 15 }}>Upload avatar</Text>
            <Text style={{ color: t.inkSoft, fontSize: 12 }}>JPG or PNG</Text>
          </View>
        </Pressable>

        {/* Handle */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: t.ink }]}>Handle</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
            <Text style={{ color: t.inkFaint, fontSize: 15 }}>@</Text>
            <Input
              style={{ flex: 1 }}
              value={handle}
              onChangeText={(v) => setHandle(v.toLowerCase())}
              placeholder="lagoskid"
              maxLength={20}
              autoCapitalize="none"
            />
          </View>
          {handle && !handleOk ? (
            <Text style={{ color: t.danger, fontSize: 12, marginTop: 4 }}>
              3–20 chars, a–z 0–9 _ only
            </Text>
          ) : handle ? (
            <Text style={{ color: t.inkFaint, fontSize: 12, marginTop: 4 }}>
              {handle}.umbra.sui
            </Text>
          ) : null}
        </View>

        {/* Display name */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: t.ink }]}>Display name</Text>
          <Input
            style={{ marginTop: 6 }}
            value={displayName}
            onChangeText={setDisplayName}
            maxLength={50}
          />
        </View>

        {/* Bio */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: t.ink }]}>Bio</Text>
          <Textarea
            style={{ marginTop: 6 }}
            value={bio}
            onChangeText={setBio}
            maxLength={280}
            numberOfLines={3}
          />
        </View>

        <Button disabled={!handleOk} onPress={submit} style={{ marginTop: 8 } as any}>
          Claim @{handle || 'handle'}
        </Button>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  backBtn: { marginBottom: 16 },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5, marginBottom: 24 },
  card: { padding: 20, gap: 4 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 },
  field: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600' },
});
