import { Alert } from 'react-native';
import { Button } from '@/components/ui';

export function SignInButton() {
  return (
    <Button
      variant="accent"
      onPress={() =>
        Alert.alert('Coming soon', 'Google sign-in via zkLogin will be wired in the next build.')
      }
    >
      Continue with Google
    </Button>
  );
}
