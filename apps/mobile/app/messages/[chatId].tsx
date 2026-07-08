import { useEffect } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/components/ui';
import { useMessaging } from '@/lib/messaging/provider';
import { ChatThread } from '@/components/messages/chat-thread';
import { Screen } from '@/components/screen';

export default function ChatThreadScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const { openChat, activeChat } = useMessaging();

  // ensure the provider's active chat matches this route (deep-link / remount safe)
  useEffect(() => {
    if (chatId && activeChat?.id !== chatId) openChat(chatId);
  }, [chatId]);

  return (
    <Screen style={{ backgroundColor: t.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top}
      >
        <ChatThread onBack={() => router.back()} />
      </KeyboardAvoidingView>
    </Screen>
  );
}
