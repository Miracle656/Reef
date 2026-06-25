import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSocialAccount } from '@/lib/account';
import { trpc } from '@/lib/trpc';
import { isConfigured } from '@/lib/config';
import { SignInButton } from '@/components/sign-in-button';
import { Feed } from '@/components/feed';
import { ComposeBox } from '@/components/compose-form';
import { Button, Card, useTheme } from '@/components/ui';

export default function HomeScreen() {
  const account = useSocialAccount();
  const t = useTheme();

  const profile = useQuery({
    queryKey: ['profile-by-addr', account?.address],
    queryFn: () => trpc.profileByAddress.query({ address: account!.address }),
    enabled: Boolean(account),
  });

  return (
    <ScrollView
      style={{ backgroundColor: t.background }}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {!isConfigured ? <ConfigBanner /> : null}

      {!account ? (
        <Hero />
      ) : profile.isLoading ? null : !profile.data ? (
        <OnboardCta />
      ) : (
        <View style={{ gap: 16 }}>
          <ComposeBox />
          <Feed />
        </View>
      )}
    </ScrollView>
  );
}

function Hero() {
  const t = useTheme();
  return (
    <View style={styles.hero}>
      <Text style={{ color: t.ink, fontSize: 32, fontWeight: '700', letterSpacing: -0.5, lineHeight: 38 }}>
        The social layer of Sui.
      </Text>
      <Text style={{ color: t.inkSoft, fontSize: 16, lineHeight: 24, marginTop: 12, maxWidth: 320 }}>
        Own your identity, your posts, and your audience — no seed phrases, no gas, no middlemen. Built for Lagos, on Walrus + zkLogin.
      </Text>
      <View style={{ marginTop: 24 }}>
        <SignInButton />
      </View>
    </View>
  );
}

function OnboardCta() {
  const t = useTheme();
  return (
    <Card style={{ padding: 24 }}>
      <Text style={{ color: t.ink, fontSize: 20, fontWeight: '700' }}>One step left</Text>
      <Text style={{ color: t.inkSoft, fontSize: 14, marginTop: 4 }}>
        Claim your handle and set up your profile to start posting.
      </Text>
      <View style={{ marginTop: 16 }}>
        <Link href="/onboarding" asChild>
          <Button>Set up profile</Button>
        </Link>
      </View>
    </Card>
  );
}

function ConfigBanner() {
  const t = useTheme();
  return (
    <Card style={{ padding: 12, marginBottom: 16, borderColor: t.danger }}>
      <Text style={{ color: t.danger, fontSize: 13 }}>
        <Text style={{ fontWeight: '600' }}>Demo not wired:</Text> set EXPO_PUBLIC_UMBRA_PACKAGE_ID / REGISTRY_ID after publishing to testnet.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 100 },
  hero: { paddingVertical: 32 },
});
