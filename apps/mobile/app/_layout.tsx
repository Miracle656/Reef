import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { FloatingTabBar } from '@/components/floating-tab-bar';
import { MessagingProvider } from '@/lib/messaging/provider';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <MessagingProvider>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="trade" options={{ headerShown: false }} />
            <Stack.Screen name="onboarding" options={{ headerShown: false }} />
            <Stack.Screen name="u/[handle]" options={{ headerShown: false }} />
            <Stack.Screen name="p/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="messages/[chatId]" options={{ headerShown: false }} />
            <Stack.Screen name="notifications" options={{ headerShown: false }} />
            <Stack.Screen name="settings" options={{ headerShown: false }} />
            <Stack.Screen name="compose" options={{ presentation: 'modal', headerShown: false }} />
          </Stack>
          <FloatingTabBar />
          <StatusBar style="auto" />
        </MessagingProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
