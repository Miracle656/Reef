import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/components/ui';
import { useMessaging } from '@/lib/messaging/provider';
import { ChatList } from '@/components/messages/chat-list';
import { NewChatModal } from '@/components/messages/new-chat-modal';

export default function MessagesTab() {
  const t = useTheme();
  const router = useRouter();
  const { openChat } = useMessaging();
  const [newChat, setNewChat] = useState<null | 'direct' | 'group'>(null);

  const open = (chatId: string) => {
    openChat(chatId);
    router.push(`/messages/${chatId}` as never);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <ChatList
        onOpen={open}
        onNew={() => setNewChat('direct')}
        onNewGroup={() => setNewChat('group')}
      />
      {newChat ? (
        <NewChatModal mode={newChat} onClose={() => setNewChat(null)} onOpened={open} />
      ) : null}
    </View>
  );
}
