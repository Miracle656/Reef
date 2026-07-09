import { useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMessaging } from "@/lib/messaging/provider";
import { ChatList } from "@/components/messages/chat-list";
import { NewChatModal } from "@/components/messages/new-chat-modal";
import { BottomNav } from "@/components/bottom-nav";

/**
 * Messages — full chat experience on the mock adapter (same Messaging
 * interface as web; the Sui adapter drops in later without UI changes).
 */
export default function Messages() {
  const router = useRouter();
  const { openChat } = useMessaging();
  const [newChat, setNewChat] = useState<null | "direct" | "group">(null);

  const open = (chatId: string) => {
    openChat(chatId);
    router.push(`/messages/${chatId}` as never);
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View style={{ flex: 1 }}>
        <ChatList
          onOpen={open}
          onNew={() => setNewChat("direct")}
          onNewGroup={() => setNewChat("group")}
        />
        {newChat ? (
          <NewChatModal mode={newChat} onClose={() => setNewChat(null)} onOpened={open} />
        ) : null}
      </View>
      <BottomNav />
    </SafeAreaView>
  );
}
