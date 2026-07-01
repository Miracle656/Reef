import type { Chat, ChatUser, Message } from "./types";

/** The other participant in a direct chat (relative to me). */
export function peerOf(chat: Chat, meId: string | undefined): ChatUser | undefined {
  if (chat.type !== "direct") return undefined;
  return chat.participants.find((p) => p.id !== meId) ?? chat.participants[0];
}

/** Display name for a chat row / header. */
export function chatName(chat: Chat, meId: string | undefined): string {
  if (chat.type === "group") return chat.name || "Group";
  const peer = peerOf(chat, meId);
  return peer?.displayName || peer?.username || "Direct message";
}

/** Avatar url + fallback name for a chat. */
export function chatAvatar(chat: Chat, meId: string | undefined): { src?: string; name: string } {
  if (chat.type === "group") return { src: chat.avatarUrl, name: chat.name || "Group" };
  const peer = peerOf(chat, meId);
  return { src: peer?.avatarUrl, name: peer?.username || "?" };
}

/** Short one-line preview of the most recent message for the chat list. */
export function previewOf(chat: Chat, meId: string | undefined): string {
  const m = chat.lastMessage;
  if (!m) return "No messages yet";
  if (m.isDeleted) return "Message deleted";
  const mine = m.senderId === meId;
  const who = mine ? "You: " : chat.type === "group" ? `${m.sender?.username ?? ""}: ` : "";
  const body = bodyPreview(m);
  return `${who}${body}`;
}

function bodyPreview(m: Message): string {
  switch (m.type) {
    case "image":
      return "Photo";
    case "file":
      return m.fileName ?? "File";
    case "voice":
      return "Voice message";
    case "location":
      return "Location";
    case "poll":
      return m.poll?.question ?? "Poll";
    default:
      if (m.isWhisper) return "Whisper";
      return m.content || "";
  }
}
