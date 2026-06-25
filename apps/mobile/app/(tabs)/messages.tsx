import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Card, Heading, useTheme } from '@/components/ui';

export default function MessagesScreen() {
  const t = useTheme();
  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.container}>
      <Heading>Messages</Heading>
      <Card style={{ marginTop: 20, padding: 32, alignItems: 'center' }}>
        <Text style={{ fontSize: 36 }}>✉️</Text>
        <Text style={{ color: t.ink, fontSize: 16, fontWeight: '600', marginTop: 12 }}>Coming soon</Text>
        <Text style={{ color: t.inkSoft, fontSize: 14, textAlign: 'center', marginTop: 4, lineHeight: 20 }}>
          Direct messages &amp; group chat — Phase 3, on the Sui Stack Messaging SDK (Seal-managed keys, Walrus attachments).
        </Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 100 },
});
