import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getEmojiEntryByValue } from 'src/data/topEmojis';
import { chatDataService } from 'src/services/chatDataService';
import { nostrEventDataService } from 'src/services/nostrEventDataService';
import { relaysService } from 'src/services/relaysService';
import { useNostrStore } from 'src/stores/nostrStore';
import type {
  DeletedMessageMetadata,
  Message,
  MessageReaction,
  MessageReplyPreview,
  NostrEventEntry
} from 'src/types/chat';
import {
  areMessageReactionsEqual,
  buildMetaWithReactions,
  normalizeMessageReactions
} from 'src/utils/messageReactions';

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

function normalizeEventId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim().toLowerCase();
  return normalizedValue || null;
}

function buildDeletedMessageMeta(
  deletedByPublicKey: string,
  deletedEventKind: number,
  deletedAt: string,
  deleteEventId?: string | null
): DeletedMessageMetadata {
  return {
    deletedAt,
    deletedByPublicKey,
    deletedEventKind,
    ...(normalizeEventId(deleteEventId) ? { deleteEventId: normalizeEventId(deleteEventId) } : {})
  };
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

  async function resolveRecipientRelayUrls(chatPublicKey: string): Promise<string[]> {
    const contactRelays = await relaysService.listRelaysByPublicKey(chatPublicKey);
    const preferredRelays = contactRelays.filter((relay) => relay.write).map((relay) => relay.url);
    const fallbackRelays = contactRelays.map((relay) => relay.url);
    return preferredRelays.length > 0 ? preferredRelays : fallbackRelays;
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

    const recipientRelayUrls = await resolveRecipientRelayUrls(chat.public_key);

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

    // const allRelays = await relaysService.listAllRelays();
    
    try {
      await nostrStore.sendDirectMessage(
        chat.public_key,
        newMessage.text,
        // recipientRelayUrls.concat(allRelays),
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
        return nextReaction ? areMessageReactionsEqual(reaction, nextReaction) : false;
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
    const alreadyExists = currentReactions.some((reaction) => {
      return (
        reaction.emoji === normalizedEmoji &&
        normalizeChatIdentifier(reaction.reactorPublicKey) === loggedInPublicKey
      );
    });
    if (alreadyExists) {
      return getMessageFromState(normalizedChatId, String(normalizedMessageId));
    }

    const updatedMessage = await updateMessageReactions(
      normalizedChatId,
      String(normalizedMessageId),
      (reactions) => {
        const emojiEntry = getEmojiEntryByValue(normalizedEmoji);
        return [
          ...reactions,
          {
            emoji: normalizedEmoji,
            name: emojiEntry?.label ?? normalizedEmoji,
            reactorPublicKey: loggedInPublicKey,
            eventId: null
          }
        ];
      }
    );

    if (!updatedMessage || !existingRow.event_id) {
      return updatedMessage;
    }

    const chat = await chatDataService.getChatByPublicKey(existingRow.chat_public_key);
    if (!chat) {
      return updatedMessage;
    }

    const recipientRelayUrls = await resolveRecipientRelayUrls(chat.public_key);
    // const allRelays = await relaysService.listAllRelays();

    const publishedReactionEvent = await nostrStore.sendDirectMessageReaction(
      chat.public_key,
      normalizedEmoji,
      existingRow.event_id,
      existingRow.author_public_key,
      // recipientRelayUrls.concat(allRelays),
      recipientRelayUrls,
      {
        createdAt: new Date().toISOString(),
        targetKind: updatedMessage.nostrEvent?.event.kind
      }
    );

    const publishedReactionEventId = normalizeEventId(publishedReactionEvent?.id);
    if (!publishedReactionEventId) {
      return updatedMessage;
    }

    return updateMessageReactions(
      normalizedChatId,
      String(normalizedMessageId),
      (reactions, currentLoggedInPublicKey) => {
        return reactions.map((reaction) => {
          const isMatchingReaction =
            reaction.emoji === normalizedEmoji &&
            normalizeChatIdentifier(reaction.reactorPublicKey) === currentLoggedInPublicKey &&
            !normalizeEventId(reaction.eventId);
          if (!isMatchingReaction) {
            return reaction;
          }

          return {
            ...reaction,
            eventId: publishedReactionEventId
          };
        });
      }
    );
  }

  async function removeReaction(
    chatId: string,
    messageId: string,
    reactionToRemove: MessageReaction
  ): Promise<Message | null> {
    const loggedInPublicKey = getLoggedInPublicKey();
    if (
      !loggedInPublicKey ||
      normalizeChatIdentifier(reactionToRemove.reactorPublicKey) !== loggedInPublicKey
    ) {
      return getMessageFromState(chatId, messageId);
    }

    const normalizedChatId = normalizeChatIdentifier(chatId);
    const normalizedMessageId = Number.parseInt(messageId, 10);
    if (!normalizedChatId || !Number.isInteger(normalizedMessageId) || normalizedMessageId <= 0) {
      return null;
    }

    await chatDataService.init();
    const existingRow = await chatDataService.getMessageById(normalizedMessageId);
    if (!existingRow) {
      return null;
    }

    const updatedMessage = await updateMessageReactions(chatId, messageId, (reactions) => {
      return reactions.filter((reaction) => {
        return !(
          reaction.emoji === reactionToRemove.emoji &&
          reaction.name === reactionToRemove.name &&
          normalizeChatIdentifier(reaction.reactorPublicKey) ===
            normalizeChatIdentifier(reactionToRemove.reactorPublicKey)
        );
      });
    });
    if (!updatedMessage) {
      return null;
    }

    const reactionEventId = normalizeEventId(reactionToRemove.eventId);
    if (!reactionEventId) {
      return updatedMessage;
    }

    const chat = await chatDataService.getChatByPublicKey(existingRow.chat_public_key);
    if (!chat) {
      return updatedMessage;
    }

    const recipientRelayUrls = await resolveRecipientRelayUrls(chat.public_key);
    await nostrStore.sendDirectMessageDeletion(
      chat.public_key,
      reactionEventId,
      7,
      recipientRelayUrls,
      {
        createdAt: new Date().toISOString()
      }
    );
    await nostrEventDataService.deleteEventsByIds([reactionEventId]);

    return updatedMessage;
  }

  async function deleteMessage(chatId: string, messageId: string): Promise<Message | null> {
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

    if (normalizeChatIdentifier(existingRow.author_public_key) !== loggedInPublicKey) {
      return getMessageFromState(normalizedChatId, String(normalizedMessageId));
    }

    if (!existingRow.event_id) {
      return getMessageFromState(normalizedChatId, String(normalizedMessageId));
    }

    const targetKind = Number.isInteger(existingRow.meta.kind)
      ? Number(existingRow.meta.kind)
      : 14;
    const updatedRow = await chatDataService.updateMessageMeta(
      normalizedMessageId,
      {
        ...existingRow.meta,
        deleted: buildDeletedMessageMeta(
          loggedInPublicKey,
          targetKind,
          new Date().toISOString()
        )
      }
    );
    if (!updatedRow) {
      return null;
    }

    const updatedMessage = await hydrateMessageRow(updatedRow, normalizedChatId);
    replaceMessageInState(normalizedChatId, updatedMessage);

    const chat = await chatDataService.getChatByPublicKey(existingRow.chat_public_key);
    if (!chat) {
      return updatedMessage;
    }

    const recipientRelayUrls = await resolveRecipientRelayUrls(chat.public_key);
    const deleteEvent = await nostrStore.sendDirectMessageDeletion(
      chat.public_key,
      existingRow.event_id,
      targetKind,
      recipientRelayUrls,
      {
        createdAt: new Date().toISOString()
      }
    );
    const deleteEventId = normalizeEventId(deleteEvent?.id);
    if (!deleteEventId) {
      return updatedMessage;
    }

    const rowWithDeleteEvent = await chatDataService.updateMessageMeta(
      normalizedMessageId,
      {
        ...updatedRow.meta,
        deleted: buildDeletedMessageMeta(
          loggedInPublicKey,
          targetKind,
          (updatedRow.meta.deleted as DeletedMessageMetadata | undefined)?.deletedAt ??
            new Date().toISOString(),
          deleteEventId
        )
      }
    );
    if (!rowWithDeleteEvent) {
      return updatedMessage;
    }

    const finalMessage = await hydrateMessageRow(rowWithDeleteEvent, normalizedChatId);
    replaceMessageInState(normalizedChatId, finalMessage);
    return finalMessage;
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
    deleteMessage,
    removeChatMessages,
    upsertPersistedMessage,
    refreshPersistedMessage
  };
});
