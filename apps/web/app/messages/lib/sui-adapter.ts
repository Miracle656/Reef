/**
 * ── ON-CHAIN ADAPTER (TO BE IMPLEMENTED) ────────────────────────────────────
 *
 * This is the file the next dev fills in to take messaging on-chain. Implement
 * the `Messaging` interface (see ./messaging.ts) on top of the Sui stack:
 *
 *   - DMs / groups        @mysten/sui-stack-messaging  (channels, members)
 *   - attachments         @mysten/walrus               (blob upload → blobId)
 *   - gated / vault / E2E  @mysten/seal                 (key management)
 *   - identity            zkLogin address from `setCurrentUser(me)`
 *   - real-time           poll the messaging SDK / indexer and feed `subscribe`
 *
 * Then flip the selector in ./index.ts from `MockMessaging` to `SuiMessaging`.
 * The UI imports only the interface, so no component changes are needed.
 *
 * Until implemented, every method throws so a mis-flip fails loudly rather than
 * silently returning empty data.
 */

import type {
  Chat,
  Me,
  Message,
  Participant,
  StatusGroup,
} from "./types";
import type {
  ChosenConfig,
  CreateGroupInput,
  GroupPatch,
  Messaging,
  MessagingEventHandler,
  SendMessageInput,
  StatusInput,
  UploadResult,
} from "./messaging";

const TODO = (method: string): never => {
  throw new Error(`SuiMessaging.${method}() not implemented — wire up the Sui Stack Messaging SDK`);
};

export class SuiMessaging implements Messaging {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setCurrentUser(_me: Me): void {
    TODO("setCurrentUser");
  }
  listChats(): Promise<Chat[]> {
    return TODO("listChats");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getChat(_chatId: string): Promise<Chat | null> {
    return TODO("getChat");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  createDirect(_participantId: string): Promise<Chat> {
    return TODO("createDirect");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  createGroup(_input: CreateGroupInput): Promise<Chat> {
    return TODO("createGroup");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  markRead(_chatId: string): Promise<void> {
    return TODO("markRead");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  listMessages(_chatId: string, _cursor?: string | null): Promise<{ messages: Message[]; nextCursor: string | null }> {
    return TODO("listMessages");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sendMessage(_input: SendMessageInput): Promise<Message> {
    return TODO("sendMessage");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  editMessage(_messageId: string, _content: string): Promise<void> {
    return TODO("editMessage");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  deleteMessage(_messageId: string): Promise<void> {
    return TODO("deleteMessage");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  addReaction(_messageId: string, _emoji: string): Promise<void> {
    return TODO("addReaction");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  removeReaction(_messageId: string, _emoji: string): Promise<void> {
    return TODO("removeReaction");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  searchMessages(_chatId: string, _query: string): Promise<Message[]> {
    return TODO("searchMessages");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setDisappearing(_chatId: string, _seconds: number): Promise<void> {
    return TODO("setDisappearing");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  pinMessage(_messageId: string, _pinned: boolean): Promise<void> {
    return TODO("pinMessage");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  listPinned(_chatId: string): Promise<Message[]> {
    return TODO("listPinned");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  saveMessage(_messageId: string): Promise<void> {
    return TODO("saveMessage");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  unsaveMessage(_messageId: string): Promise<void> {
    return TODO("unsaveMessage");
  }
  listSaved(): Promise<Message[]> {
    return TODO("listSaved");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  createPoll(_chatId: string, _question: string, _options: string[], _allowMultiple: boolean): Promise<Message> {
    return TODO("createPoll");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  votePoll(_messageId: string, _optionIndex: number): Promise<void> {
    return TODO("votePoll");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  markViewOnce(_messageId: string): Promise<void> {
    return TODO("markViewOnce");
  }
  vaultStatus(): Promise<{ hasPasscode: boolean; unlocked: boolean }> {
    return TODO("vaultStatus");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  vaultSetup(_passcode: string, _currentPasscode?: string): Promise<void> {
    return TODO("vaultSetup");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  vaultUnlock(_passcode: string): Promise<boolean> {
    return TODO("vaultUnlock");
  }
  lockVault(): void {
    TODO("lockVault");
  }
  listVaultChats(): Promise<Chat[]> {
    return TODO("listVaultChats");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setChatVaulted(_chatId: string, _vaulted: boolean): Promise<void> {
    return TODO("setChatVaulted");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  updateGroup(_chatId: string, _patch: GroupPatch): Promise<Chat> {
    return TODO("updateGroup");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  addParticipants(_chatId: string, _userIds: string[]): Promise<Chat> {
    return TODO("addParticipants");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  removeParticipant(_chatId: string, _userId: string): Promise<Chat> {
    return TODO("removeParticipant");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setAdmin(_chatId: string, _userId: string, _admin: boolean): Promise<Chat> {
    return TODO("setAdmin");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  leaveGroup(_chatId: string): Promise<void> {
    return TODO("leaveGroup");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setChatSettings(_chatId: string, _settings: { muted?: boolean; archived?: boolean }): Promise<void> {
    return TODO("setChatSettings");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setTyping(_chatId: string, _isTyping: boolean): void {
    TODO("setTyping");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  searchUsers(_query: string): Promise<Participant[]> {
    return TODO("searchUsers");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  blockUser(_userId: string): Promise<void> {
    return TODO("blockUser");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  unblockUser(_userId: string): Promise<void> {
    return TODO("unblockUser");
  }
  listBlocked(): Promise<Participant[]> {
    return TODO("listBlocked");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  reportUser(_userId: string, _reason: string, _chatId?: string): Promise<void> {
    return TODO("reportUser");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  uploadMedia(_file: File): Promise<UploadResult> {
    return TODO("uploadMedia");
  }
  listStatus(): Promise<StatusGroup[]> {
    return TODO("listStatus");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  postStatus(_input: StatusInput): Promise<void> {
    return TODO("postStatus");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  viewStatus(_statusId: string): Promise<void> {
    return TODO("viewStatus");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  deleteStatus(_statusId: string): Promise<void> {
    return TODO("deleteStatus");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  chosenStart(_chatId: string, _config: ChosenConfig): Promise<void> {
    return TODO("chosenStart");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  chosenJoin(_chatId: string): Promise<void> {
    return TODO("chosenJoin");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  chosenLeave(_chatId: string): Promise<void> {
    return TODO("chosenLeave");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  chosenTap(_chatId: string): Promise<void> {
    return TODO("chosenTap");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  chosenPick(_chatId: string, _n: number): Promise<void> {
    return TODO("chosenPick");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  chosenNext(_chatId: string): Promise<void> {
    return TODO("chosenNext");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  chosenEnd(_chatId: string): Promise<void> {
    return TODO("chosenEnd");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  chosenSync(_chatId: string): Promise<void> {
    return TODO("chosenSync");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  subscribe(_handler: MessagingEventHandler): () => void {
    return TODO("subscribe");
  }
}
