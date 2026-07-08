import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { ComposeForm } from '@/components/compose-form';
import { useTheme } from '@/components/ui';
import { useTopInset } from '@/components/screen';

export default function ComposeModal() {
  const t = useTheme();
  const router = useRouter();
  const top = useTopInset();

  return (
    <View style={[styles.container, { backgroundColor: t.background }]}>
      <View style={[styles.header, { borderBottomColor: t.border, paddingTop: top + 16 }]}>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: t.inkSoft, fontSize: 16 }}>Cancel</Text>
        </Pressable>
        <Text style={[styles.title, { color: t.ink }]}>New post</Text>
        <View style={{ width: 56 }} />
      </View>
      <View style={styles.body}>
        <ComposeForm onSuccess={() => router.back()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 17, fontWeight: '600' },
  body: { padding: 20 },
});
