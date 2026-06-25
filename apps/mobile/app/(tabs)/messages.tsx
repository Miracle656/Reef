import { View, Text, StyleSheet } from 'react-native';
import { Card, useTheme } from '@/components/ui';

export default function MessagesTab() {
  const t = useTheme();
  return (
    <View style={[styles.center, { backgroundColor: t.background }]}>
      <Text style={[styles.heading, { color: t.ink }]}>Messages</Text>
      <Card style={styles.card}>
        <Text style={styles.icon}>✉️</Text>
        <Text style={[styles.title, { color: t.ink }]}>Coming soon</Text>
        <Text style={[styles.sub, { color: t.inkSoft }]}>
          Direct messages & group chat — Phase 3, on the Sui Stack Messaging SDK (Seal-managed keys, Walrus attachments).
        </Text>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, padding: 24 },
  heading: { fontSize: 22, fontWeight: '700', marginBottom: 20 },
  card: { padding: 32, alignItems: 'center' },
  icon: { fontSize: 36, marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  sub: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
