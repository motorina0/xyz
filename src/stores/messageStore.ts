import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getEmojiEntryByValue } from 'src/data/topEmojis';
import { chatDataService } from 'src/services/chatDataService';
import { nostrEventDataService } from 'src/services/nostrEventDataService';
import { relaysService } from 'src/services/relaysService';
import { useNostrStore } from 'src/stores/nostrStore';
import type {
  Message,
  MessageReaction,
  MessageReplyPreview,
  NostrEventEntry
} from 'src/types/chat';

type MessageRow = Awaited<ReturnType<typeof chatDataService.listMessages>>[number];

function normalizeChatIdentifier(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim().toLowerCase();
  return normalizedValue || null;
}

function getLoggedInPublicKey(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return normalizeChatIdentifier(window.localStorage.getItem('npub'));
}

function isMessageReaction(value: unknown): value is MessageReaction {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<MessageReaction>;
  return (
    typeof candidate.emoji === 'string' &&
    candidate.emoji.trim().length > 0 &&
    typeof candidate.name === 'string' &&
    candidate.name.trim().length > 0 &&
    typeof candidate.reactorPublicKey === 'string' &&
    candidate.reactorPublicKey.trim().length > 0
  );
}

function normalizeMessageReactions(value: unknown): MessageReaction[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isMessageReaction)
    .map((reaction) => ({
      emoji: reaction.emoji.trim(),
      name: reaction.name.trim(),
      reactorPublicKey: reaction.reactorPublicKey.trim().toLowerCase()
    }));
}

function buildMetaWithReactions(
  meta: Record<string, unknown>,
  reactions: MessageReaction[]
): Record<string, unknown> {
  const nextMeta = { ...meta };

  if (reactions.length === 0) {
    delete nextMeta.reactions;
    return nextMeta;
  }

  nextMeta.reactions = reactions.map((reaction) => ({ ...reaction }));
  return nextMeta;
}

function mapMessageRowToMessage(
  row: MessageRow,
  chatId: string,
  nostrEvent: NostrEventEntry | null = null
): Message {
  const authorKey = row.author_public_key.trim();
  const isMine = authorKey.toLowerCase() === window.localStorage.getItem('npub')?.toLowerCase();

  return {
    id: String(row.id),
    chatId,
    text: row.message,
    sender: isMine ? 'me' : 'them',
    sentAt: row.created_at,
    authorPublicKey: authorKey,
    eventId: row.event_id,
    nostrEvent,
    meta: row.meta
  };
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
    const normalizedChatId = normalizeChatIdentifier(chatId);
    if (!normalizedChatId) {
      return [];
    }

    if (!loadedChatIds.has(normalizedChatId) && !loadingChatPromises.has(normalizedChatId)) {
      void loadMessages(normalizedChatId);
    }

    return messagesByChat.value[normalizedChatId] ?? [];
  }

  async function init(): Promise<void> {
    await Promise.all([chatDataService.init(), nostrEventDataService.init()]);
  }

  async function hydrateMessageRows(rows: MessageRow[], chatId: string): Promise<Message[]> {
    const eventIds = rows
      .map((row) => row.event_id)
      .filter((eventId): eventId is string => typeof eventId === 'string' && eventId.trim().length > 0);
    const eventsById = await nostrEventDataService.getEventsByIds(eventIds);

    return rows.map((row) =>
      mapMessageRowToMessage(
        row,
        chatId,
        row.event_id ? eventsById.get(row.event_id) ?? null : null
      )
    );
  }

  async function hydrateMessageRow(row: MessageRow, chatId?: string): Promise<Message> {
    const resolvedChatId =
      normalizeChatIdentifier(chatId) ??
      normalizeChatIdentifier(row.chat_public_key);
    if (!resolvedChatId) {
      throw new Error('Failed to resolve message chat public key.');
    }

    const nostrEvent = row.event_id ? await nostrEventDataService.getEventById(row.event_id) : null;
    return mapMessageRowToMessage(row, resolvedChatId, nostrEvent);
  }

  function replaceMessageInState(chatId: string, message: Message): void {
    const normalizedChatId = normalizeChatIdentifier(chatId);
    if (!normalizedChatId) {
      return;
    }

    const existingMessages = messagesByChat.value[normalizedChatId] ?? [];
    const existingIndex = existingMessages.findIndex((entry) => entry.id === message.id);
    if (existingIndex === -1) {
      return;
    }

    const nextMessages = [...existingMessages];
    nextMessages[existingIndex] = message;
    messagesByChat.value[normalizedChatId] = nextMessages;
  }

  function getMessageFromState(chatId: string, messageId: string): Message | null {
    const normalizedChatId = normalizeChatIdentifier(chatId);
    if (!normalizedChatId) {
      return null;
    }

    return (
      messagesByChat.value[normalizedChatId]?.find((message) => message.id === messageId) ?? null
    );
  }

  function upsertMessageInState(chatId: string, message: Message): void {
    const normalizedChatId = normalizeChatIdentifier(chatId);
    if (!normalizedChatId) {
      return;
    }

    const existingMessages = messagesByChat.value[normalizedChatId] ?? [];
    const existingIndex = existingMessages.findIndex((entry) => entry.id === message.id);
    if (existingIndex >= 0) {
      const nextMessages = [...existingMessages];
      nextMessages[existingIndex] = message;
      messagesByChat.value[normalizedChatId] = nextMessages;
      return;
    }

    const lastMessage = existingMessages[existingMessages.length - 1] ?? null;
    if (!lastMessage || compareMessages(lastMessage, message) <= 0) {
      messagesByChat.value[normalizedChatId] = [...existingMessages, message];
      return;
    }

    messagesByChat.value[normalizedChatId] = [...existingMessages, message].sort(compareMessages);
  }

  function upsertPersistedMessage(
    row: MessageRow
  ): Promise<void> {
    const chatId = normalizeChatIdentifier(row.chat_public_key);
    if (!chatId || (!loadedChatIds.has(chatId) && !messagesByChat.value[chatId])) {
      return Promise.resolve();
    }

    return hydrateMessageRow(row, chatId).then((message) => {
      upsertMessageInState(chatId, message);
    });
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

    await upsertPersistedMessage(row);
  }

  async function loadMessages(chatId: string, force = false): Promise<void> {
    const normalizedChatId = normalizeChatIdentifier(chatId);
    if (!normalizedChatId) {
      return;
    }

    if (!force && loadedChatIds.has(normalizedChatId)) {
      return;
    }

    const existingLoad = loadingChatPromises.get(normalizedChatId);
    if (existingLoad) {
      await existingLoad;
      return;
    }

    const loadPromise = (async () => {
      try {
        const rows = await chatDataService.listMessages(normalizedChatId);
        messagesByChat.value[normalizedChatId] = await hydrateMessageRows(rows, normalizedChatId);
        loadedChatIds.add(normalizedChatId);
      } catch (error) {
        console.error('Failed to load messages for chat', normalizedChatId, error);
      }
    })();

    loadingChatPromises.set(normalizedChatId, loadPromise);
    try {
      await loadPromise;
    } finally {
      loadingChatPromises.delete(normalizedChatId);
    }
  }

  async function reloadLoadedMessages(): Promise<void> {
    const chatIds = Array.from(loadedChatIds);
    if (chatIds.length === 0) {
      return;
    }

    await Promise.all(chatIds.map((chatId) => loadMessages(chatId, true)));
  }

  async function sendMessage(
    chatId: string,
    text: string,
    replyTo: MessageReplyPreview | null = null
  ): Promise<Message | null> {
    const cleanText = text.trim();

    if (!cleanText) {
      return null;
    }

    const normalizedChatId = normalizeChatIdentifier(chatId);
    if (!normalizedChatId) {
      return null;
    }

    await chatDataService.init();
    const chat = await chatDataService.getChatByPublicKey(normalizedChatId);
    if (!chat) {
      return null;
    }

    const contactRelays = await relaysService.listRelaysByPublicKey(chat.public_key);
    const preferredRelays = contactRelays.filter((relay) => relay.write).map((relay) => relay.url);
    const fallbackRelays = contactRelays.map((relay) => relay.url);
    const recipientRelayUrls = preferredRelays.length > 0 ? preferredRelays : fallbackRelays;

    const created = await chatDataService.createMessage({
      chat_public_key: chat.public_key,
      author_public_key: window.localStorage.getItem('npub'),
      message: cleanText,
      created_at: new Date().toISOString(),
      ...(replyTo ? { meta: { reply: replyTo } } : {})
    });
    if (!created) {
      return null;
    }

    const newMessage = mapMessageRowToMessage(created, normalizedChatId);

    if (!messagesByChat.value[normalizedChatId]) {
      messagesByChat.value[normalizedChatId] = [];
    }

    loadedChatIds.add(normalizedChatId);
    messagesByChat.value[normalizedChatId] = [...messagesByChat.value[normalizedChatId], newMessage];
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
    const finalMessage = updatedMessageRow
      ? await hydrateMessageRow(updatedMessageRow, normalizedChatId)
      : newMessage;
    replaceMessageInState(normalizedChatId, finalMessage);

    if (sendError) {
      throw sendError;
    }

    return finalMessage;
  }

  async function updateMessageReactions(
    chatId: string,
    messageId: string,
    transform: (reactions: MessageReaction[], loggedInPublicKey: string) => MessageReaction[]
  ): Promise<Message | null> {
    const normalizedChatId = normalizeChatIdentifier(chatId);
    const normalizedMessageId = Number.parseInt(messageId, 10);
    const loggedInPublicKey = getLoggedInPublicKey();

    if (!normalizedChatId || !Number.isInteger(normalizedMessageId) || normalizedMessageId <= 0) {
      return null;
    }

    if (!loggedInPublicKey) {
      return null;
    }

    await chatDataService.init();
    const existingRow = await chatDataService.getMessageById(normalizedMessageId);
    if (!existingRow) {
      return null;
    }

    const currentReactions = normalizeMessageReactions(existingRow.meta.reactions);
    const nextReactions = transform(currentReactions, loggedInPublicKey);
    const noChanges =
      currentReactions.length === nextReactions.length &&
      currentReactions.every((reaction, index) => {
        const nextReaction = nextReactions[index];
        return (
          nextReaction?.emoji === reaction.emoji &&
          nextReaction?.name === reaction.name &&
          nextReaction?.reactorPublicKey === reaction.reactorPublicKey
        );
      });

    if (noChanges) {
      return getMessageFromState(normalizedChatId, String(normalizedMessageId));
    }

    const updatedRow = await chatDataService.updateMessageMeta(
      normalizedMessageId,
      buildMetaWithReactions(existingRow.meta, nextReactions)
    );
    if (!updatedRow) {
      return null;
    }

    const updatedMessage = await hydrateMessageRow(updatedRow, normalizedChatId);
    replaceMessageInState(normalizedChatId, updatedMessage);
    return updatedMessage;
  }

  async function addReaction(
    chatId: string,
    messageId: string,
    emoji: string
  ): Promise<Message | null> {
    const normalizedEmoji = emoji.trim();
    if (!normalizedEmoji) {
      return null;
    }

    return updateMessageReactions(chatId, messageId, (reactions, loggedInPublicKey) => {
      const alreadyExists = reactions.some((reaction) => {
        return (
          reaction.emoji === normalizedEmoji &&
          normalizeChatIdentifier(reaction.reactorPublicKey) === loggedInPublicKey
        );
      });

      if (alreadyExists) {
        return reactions;
      }

      const emojiEntry = getEmojiEntryByValue(normalizedEmoji);
      return [
        ...reactions,
        {
          emoji: normalizedEmoji,
          name: emojiEntry?.label ?? normalizedEmoji,
          reactorPublicKey: loggedInPublicKey
        }
      ];
    });
  }

  async function removeReaction(
    chatId: string,
    messageId: string,
    reactionToRemove: MessageReaction
  ): Promise<Message | null> {
    return updateMessageReactions(chatId, messageId, (reactions) => {
      return reactions.filter((reaction) => {
        return !(
          reaction.emoji === reactionToRemove.emoji &&
          reaction.name === reactionToRemove.name &&
          normalizeChatIdentifier(reaction.reactorPublicKey) ===
            normalizeChatIdentifier(reactionToRemove.reactorPublicKey)
        );
      });
    });
  }

  function removeChatMessages(chatId: string): void {
    const normalizedChatId = normalizeChatIdentifier(chatId);
    if (!normalizedChatId) {
      return;
    }

    delete messagesByChat.value[normalizedChatId];
    loadedChatIds.delete(normalizedChatId);
    loadingChatPromises.delete(normalizedChatId);
  }

  void init().catch((error) => {
    console.error('Failed to preload message store', error);
  });

  return {
    messagesByChat,
    init,
    loadMessages,
    reloadLoadedMessages,
    getMessages,
    sendMessage,
    addReaction,
    removeReaction,
    removeChatMessages,
    upsertPersistedMessage,
    refreshPersistedMessage
  };
});
