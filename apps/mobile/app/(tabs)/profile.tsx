import { ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '@/components/ui';
import { SignInButton } from '@/components/sign-in-button';
import { ProfileView } from '@/components/profile-view';
import { MOCK_AUTHORS } from '@/lib/mock';

// In UI-only mode we show a sample profile (signed-out) that mirrors the web layout.
export default function ProfileTab() {
  const t = useTheme();
  const sample = MOCK_AUTHORS['lagosbuild']!;

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.container}>
      <ProfileView author={sample} rightAction={<SignInButton />} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: 20 },
});
