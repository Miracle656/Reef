import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, useTheme } from '@/components/ui';
import { Screen } from '@/components/screen';
import { BackIcon } from '@/components/messages/icons';

export default function SettingsScreen() {
  const t = useTheme();
  const router = useRouter();

  return (
    <Screen style={{ backgroundColor: t.background }}>
      <View style={[styles.header, { borderBottomColor: t.border }]}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <BackIcon size={22} color={t.ink} />
        </Pressable>
        <Text style={[styles.title, { color: t.ink }]}>Settings</Text>
      </View>

      <View style={styles.body}>
        <Text style={{ color: t.inkSoft, fontSize: 14 }}>Manage your account.</Text>

        <Button
          variant="outline"
          style={{ marginTop: 24 }}
          onPress={() => Alert.alert('Coming soon', 'On-chain sign-out will be wired in the next build.')}
        >
          Sign out
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 8, borderBottomWidth: 1 },
  back: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 19, fontWeight: '800' },
  body: { padding: 20 },
});
