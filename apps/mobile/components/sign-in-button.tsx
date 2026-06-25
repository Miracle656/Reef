import { useState } from 'react';
import { useEnokiFlow } from '@mysten/enoki/react';
import * as WebBrowser from 'expo-web-browser';
import { AUTH_REDIRECT_URL, GOOGLE_CLIENT_ID, isAuthConfigured, NETWORK } from '@/lib/config';
import { Button, Spinner, useTheme } from './ui';

export function SignInButton() {
  const flow = useEnokiFlow();
  const [pending, setPending] = useState(false);
  const t = useTheme();

  if (!isAuthConfigured) {
    return (
      <Button variant="outline" size="sm" disabled>
        Sign-in not configured
      </Button>
    );
  }

  async function signIn() {
    setPending(true);
    try {
      const url = await flow.createAuthorizationURL({
        provider: 'google',
        clientId: GOOGLE_CLIENT_ID,
        redirectUrl: AUTH_REDIRECT_URL,
        network: NETWORK,
      });
      const result = await WebBrowser.openAuthSessionAsync(url, AUTH_REDIRECT_URL);
      if (result.type === 'success') {
        await flow.handleAuthCallback(result.url);
      }
    } catch {
      /* user closed browser or auth failed */
    } finally {
      setPending(false);
    }
  }

  return (
    <Button disabled={pending} onPress={signIn}>
      {pending ? <Spinner color={t.onInk} /> : null}
      Continue with Google
    </Button>
  );
}
