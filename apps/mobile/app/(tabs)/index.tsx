import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { Card, Button, useTheme } from '@/components/ui';
import { SignInButton } from '@/components/sign-in-button';
import { Feed } from '@/components/feed';
import { ComposeBox } from '@/components/compose-form';

export default function HomeTab() {
  const t = useTheme();
  // In UI-only mode the user is always "signed out" — feed is still visible below the hero.
  return (
    <ScrollView
      style={{ backgroundColor: t.background }}
      contentContainerStyle={styles.container}
    >
      <Hero />
      <View style={{ marginTop: 24, gap: 12 }}>
        <ComposeBox />
        <Feed />
      </View>
    </ScrollView>
  );
}

function Hero() {
  const t = useTheme();
  return (
    <View style={styles.hero}>
      <Text style={[styles.heroTitle, { color: t.ink }]}>
        The social layer of Sui.
      </Text>
      <Text style={[styles.heroSub, { color: t.inkSoft }]}>
        Own your identity, your posts, and your audience — no seed phrases, no gas, no middlemen.
        Built for Lagos, on Walrus + zkLogin.
      </Text>
      <View style={styles.ctaRow}>
        <SignInButton />
        <Link href="/onboarding" asChild>
          <Button variant="outline" size="sm">Create profile</Button>
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 120 },
  hero: { paddingVertical: 32 },
  heroTitle: { fontSize: 30, fontWeight: '800', letterSpacing: -0.8, lineHeight: 36 },
  heroSub: { fontSize: 15, lineHeight: 22, marginTop: 12 },
  ctaRow: { flexDirection: 'row', gap: 12, marginTop: 20, flexWrap: 'wrap' },
});
