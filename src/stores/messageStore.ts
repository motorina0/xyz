import { defineStore } from 'pinia';
import { ref } from 'vue';
import { chatDataService } from 'src/services/chatDataService';
import { relaysService } from 'src/services/relaysService';
import { useNostrStore } from 'src/stores/nostrStore';
import type { Message, MessageRelayStatus } from 'src/types/chat';

function parseChatId(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function mapMessageRowToMessage(
  row: Awaited<ReturnType<typeof chatDataService.listMessages>>[number]
): Message {
  const authorKey = row.author_public_key.trim();
  const isMine = authorKey.toLowerCase() === window.localStorage.getItem('npub')?.toLowerCase();

  return {
    id: String(row.id),
    chatId: String(row.chat_id),
    text: row.message,
    sender: isMine ? 'me' : 'them',
    sentAt: row.created_at,
    authorPublicKey: authorKey,
    meta: row.meta
  };
}

function buildPendingRelayStatuses(
  relayUrls: string[],
  scope: 'recipient' | 'self'
): MessageRelayStatus[] {
  const updatedAt = new Date().toISOString();
  const uniqueRelayUrls = Array.from(new Set(relayUrls.map((relay) => relay.trim()).filter(Boolean)));

  return uniqueRelayUrls.map((relayUrl) => ({
    relay_url: relayUrl,
    direction: 'outbound',
    status: 'pending',
    scope,
    updated_at: updatedAt
  }));
}

export const useMessageStore = defineStore('messageStore', () => {
  const nostrStore = useNostrStore();
  const messagesByChat = ref<Record<string, Message[]>>({});
  const loadedChatIds = new Set<string>();
  const loadingChatPromises = new Map<string, Promise<void>>();

  function compareMessages(first: Message, second: Message): number {
    const firstTimestamp = new Date(first.sentAt).getTime();
    const secondTimestamp = new Date(second.sentAt).getTime();

    if (firstTimestamp !== secondTimestamp) {
      return firstTimestamp - secondTimestamp;
    }

    const firstId = Number.parseInt(first.id, 10);
    const secondId = Number.parseInt(second.id, 10);
    if (Number.isInteger(firstId) && Number.isInteger(secondId) && firstId !== secondId) {
      return firstId - secondId;
    }

    return first.id.localeCompare(second.id);
  }

  function getMessages(chatId: string | null): Message[] {
    if (!chatId) {
      return [];
    }

    if (!loadedChatIds.has(chatId) && !loadingChatPromises.has(chatId)) {
      void loadMessages(chatId);
    }

    return messagesByChat.value[chatId] ?? [];
  }

  async function init(): Promise<void> {
    await chatDataService.init();
  }

  function replaceMessageInState(chatId: string, message: Message): void {
    const existingMessages = messagesByChat.value[chatId] ?? [];
    const existingIndex = existingMessages.findIndex((entry) => entry.id === message.id);
    if (existingIndex === -1) {
      return;
    }

    const nextMessages = [...existingMessages];
    nextMessages[existingIndex] = message;
    messagesByChat.value[chatId] = nextMessages;
  }

  function upsertMessageInState(chatId: string, message: Message): void {
    const existingMessages = messagesByChat.value[chatId] ?? [];
    const existingIndex = existingMessages.findIndex((entry) => entry.id === message.id);
    if (existingIndex >= 0) {
      const nextMessages = [...existingMessages];
      nextMessages[existingIndex] = message;
      messagesByChat.value[chatId] = nextMessages;
      return;
    }

    const lastMessage = existingMessages[existingMessages.length - 1] ?? null;
    if (!lastMessage || compareMessages(lastMessage, message) <= 0) {
      messagesByChat.value[chatId] = [...existingMessages, message];
      return;
    }

    messagesByChat.value[chatId] = [...existingMessages, message].sort(compareMessages);
  }

  function upsertPersistedMessage(
    row: Awaited<ReturnType<typeof chatDataService.listMessages>>[number]
  ): void {
    const chatId = String(row.chat_id);
    if (!loadedChatIds.has(chatId) && !messagesByChat.value[chatId]) {
      return;
    }

    upsertMessageInState(chatId, mapMessageRowToMessage(row));
  }

  async function refreshPersistedMessage(messageId: number): Promise<void> {
    if (!Number.isInteger(messageId) || messageId <= 0) {
      return;
    }

    await chatDataService.init();
    const row = await chatDataService.getMessageById(messageId);
    if (!row) {
      return;
    }

    upsertPersistedMessage(row);
  }

  async function loadMessages(chatId: string, force = false): Promise<void> {
    const chatNumericId = parseChatId(chatId);
    if (!chatNumericId) {
      return;
    }

    if (!force && loadedChatIds.has(chatId)) {
      return;
    }

    const existingLoad = loadingChatPromises.get(chatId);
    if (existingLoad) {
      await existingLoad;
      return;
    }

    const loadPromise = (async () => {
      try {
        const rows = await chatDataService.listMessages(chatNumericId);
        messagesByChat.value[chatId] = rows.map((row) => mapMessageRowToMessage(row));
        loadedChatIds.add(chatId);
      } catch (error) {
        console.error('Failed to load messages for chat', chatId, error);
      }
    })();

    loadingChatPromises.set(chatId, loadPromise);
    try {
      await loadPromise;
    } finally {
      loadingChatPromises.delete(chatId);
    }
  }

  async function sendMessage(chatId: string, text: string): Promise<Message | null> {
    const cleanText = text.trim();

    if (!cleanText) {
      return null;
    }

    const chatNumericId = parseChatId(chatId);
    if (!chatNumericId) {
      return null;
    }

    await chatDataService.init();
    const chat = await chatDataService.getChatById(chatNumericId);
    if (!chat) {
      return null;
    }

    const contactRelays = await relaysService.listRelaysByPublicKey(chat.public_key);
    const preferredRelays = contactRelays.filter((relay) => relay.write).map((relay) => relay.url);
    const fallbackRelays = contactRelays.map((relay) => relay.url);
    const recipientRelayUrls = preferredRelays.length > 0 ? preferredRelays : fallbackRelays;
    const loggedInPubkey = window.localStorage.getItem('npub')?.trim() ?? '';
    const selfRelayUrls = loggedInPubkey
      ? (await relaysService.listRelaysByPublicKey(loggedInPubkey))
          .filter((relay) => relay.write)
          .map((relay) => relay.url)
      : [];

    const created = await chatDataService.createMessage({
      chat_id: chatNumericId,
      author_public_key: window.localStorage.getItem('npub'),
      message: cleanText,
      created_at: new Date().toISOString(),
      meta: {
        relay_statuses: [
          ...buildPendingRelayStatuses(recipientRelayUrls, 'recipient'),
          ...buildPendingRelayStatuses(selfRelayUrls, 'self')
        ]
      }
    });
    if (!created) {
      return null;
    }

    const newMessage = mapMessageRowToMessage(created);

    if (!messagesByChat.value[chatId]) {
      messagesByChat.value[chatId] = [];
    }

    loadedChatIds.add(chatId);
    messagesByChat.value[chatId] = [...messagesByChat.value[chatId], newMessage];
    let sendError: unknown = null;

    try {
      await nostrStore.sendDirectMessage(
        chat.public_key,
        newMessage.text,
        recipientRelayUrls,
        {
          localMessageId: created.id,
          createdAt: created.created_at
        }
      );
    } catch (error) {
      sendError = error;
    }

    const updatedMessageRow = await chatDataService.getMessageById(created.id);
    const finalMessage = updatedMessageRow ? mapMessageRowToMessage(updatedMessageRow) : newMessage;
    replaceMessageInState(chatId, finalMessage);

    if (sendError) {
      throw sendError;
    }

    return finalMessage;
  }

  function removeChatMessages(chatId: string): void {
    if (!chatId) {
      return;
    }

    delete messagesByChat.value[chatId];
    loadedChatIds.delete(chatId);
    loadingChatPromises.delete(chatId);
  }

  void init().catch((error) => {
    console.error('Failed to preload message store', error);
  });

  return {
    messagesByChat,
    init,
    loadMessages,
    getMessages,
    sendMessage,
    removeChatMessages,
    upsertPersistedMessage,
    refreshPersistedMessage
  };
});
