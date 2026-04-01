import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getEmojiEntryByValue } from 'src/data/topEmojis';
import { chatDataService, type ChatRow } from 'src/services/chatDataService';
import { contactsService } from 'src/services/contactsService';
import { inputSanitizerService } from 'src/services/inputSanitizerService';
import { nostrEventDataService } from 'src/services/nostrEventDataService';
import { useChatStore } from 'src/stores/chatStore';
import type {
  DeletedMessageMetadata,
  Message,
  MessageReaction,
  MessageReplyPreview,
  NostrEventEntry
} from 'src/types/chat';
import { resolvePreferredContactRelayUrls } from 'src/utils/contactRelayUrls';
import {
  areMessageReactionsEqual,
  buildMetaWithReactions,
  countUnseenReactionsForAuthor,
  markReactionsViewedByAuthor,
  normalizeMessageReactions
} from 'src/utils/messageReactions';

type MessageRow = Awaited<ReturnType<typeof chatDataService.listMessages>>[number];

interface RelaySendOptions {
  relayUrls?: string[];
}

type NostrStoreModule = typeof import('src/stores/nostrStore');
type NostrStore = ReturnType<NostrStoreModule['useNostrStore']>;
type RelayStoreModule = typeof import('src/stores/relayStore');
type RelayStore = ReturnType<RelayStoreModule['useRelayStore']>;

export class MissingContactRelaysError extends Error {
  readonly code = 'missing-contact-relays';
  readonly chatPublicKey: string;

  constructor(chatPublicKey: string) {
    super('Inbound relays not found for this contact.');
    this.name = 'MissingContactRelaysError';
    this.chatPublicKey = chatPublicKey;
  }
}

export function isMissingContactRelaysError(error: unknown): error is MissingContactRelaysError {
  return (
    error instanceof MissingContactRelaysError ||
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'missing-contact-relays')
  );
}

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

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue || null;
}

function toComparableTimestamp(value: string | null | undefined): number {
  if (typeof value !== 'string' || !value.trim()) {
    return 0;
  }

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
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
  const chatStore = useChatStore();
  const messagesByChat = ref<Record<string, Message[]>>({});
  const loadedChatIds = new Set<string>();
  const loadingChatPromises = new Map<string, Promise<void>>();
  const unseenReactionSyncPromises = new Map<string, Promise<number>>();
  let nostrStorePromise: Promise<NostrStore> | null = null;
  let relayStorePromise: Promise<RelayStore> | null = null;

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

  async function getNostrStore(): Promise<NostrStore> {
    if (!nostrStorePromise) {
      nostrStorePromise = import('src/stores/nostrStore').then(({ useNostrStore }) => useNostrStore());
    }

    return nostrStorePromise;
  }

  async function getRelayStore(): Promise<RelayStore> {
    if (!relayStorePromise) {
      relayStorePromise = import('src/stores/relayStore').then(({ useRelayStore }) => {
        const relayStore = useRelayStore();
        relayStore.init();
        return relayStore;
      });
    }

    return relayStorePromise;
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

  function areReactionListsEqual(
    currentReactions: MessageReaction[],
    nextReactions: MessageReaction[]
  ): boolean {
    return (
      currentReactions.length === nextReactions.length &&
      currentReactions.every((reaction, index) => {
        const nextReaction = nextReactions[index];
        return nextReaction ? areMessageReactionsEqual(reaction, nextReaction) : false;
      })
    );
  }

  function readUnseenReactionCountFromMeta(meta: Record<string, unknown>): number {
    const rawValue = meta.unseen_reaction_count;
    const numericValue = typeof rawValue === 'number' ? rawValue : Number(rawValue);
    if (!Number.isFinite(numericValue)) {
      return 0;
    }

    return Math.max(0, Math.floor(numericValue));
  }

  function readMetaString(meta: Record<string, unknown>, key: string): string {
    const value = meta[key];
    return typeof value === 'string' ? value.trim() : '';
  }

  function buildChatMetaWithUnseenReactionCount(
    meta: Record<string, unknown>,
    unseenReactionCount: number
  ): Record<string, unknown> {
    const normalizedCount = Math.max(0, Math.floor(Number(unseenReactionCount) || 0));
    const nextMeta = { ...meta };

    if (normalizedCount > 0) {
      nextMeta.unseen_reaction_count = normalizedCount;
      return nextMeta;
    }

    delete nextMeta.unseen_reaction_count;
    return nextMeta;
  }

  async function performSyncChatUnseenReactionCount(chatId: string): Promise<number> {
    const normalizedChatId = normalizeChatIdentifier(chatId);
    if (!normalizedChatId) {
      return 0;
    }

    await chatDataService.init();

    const [chatRow, messageRows] = await Promise.all([
      chatDataService.getChatByPublicKey(normalizedChatId),
      chatDataService.listMessages(normalizedChatId)
    ]);
    const loggedInPublicKey = getLoggedInPublicKey();
    const nextUnseenReactionCount = loggedInPublicKey
      ? messageRows.reduce((count, row) => {
          if (normalizeChatIdentifier(row.author_public_key) !== loggedInPublicKey) {
            return count;
          }

          return (
            count +
            countUnseenReactionsForAuthor(
              normalizeMessageReactions(row.meta.reactions),
              loggedInPublicKey
            )
          );
        }, 0)
      : 0;

    if (chatRow) {
      const currentCount = readUnseenReactionCountFromMeta(chatRow.meta);
      if (currentCount !== nextUnseenReactionCount) {
        await chatDataService.updateChatMeta(
          normalizedChatId,
          buildChatMetaWithUnseenReactionCount(chatRow.meta, nextUnseenReactionCount)
        );
      }
    }

    chatStore.setUnseenReactionCount(normalizedChatId, nextUnseenReactionCount);
    return nextUnseenReactionCount;
  }

  async function syncChatUnseenReactionCount(chatId: string): Promise<number> {
    const normalizedChatId = normalizeChatIdentifier(chatId);
    if (!normalizedChatId) {
      return 0;
    }

    const existingSync = unseenReactionSyncPromises.get(normalizedChatId) ?? Promise.resolve(0);
    const nextSync = existingSync
      .catch(() => 0)
      .then(() => performSyncChatUnseenReactionCount(normalizedChatId));

    unseenReactionSyncPromises.set(normalizedChatId, nextSync);

    try {
      return await nextSync;
    } finally {
      if (unseenReactionSyncPromises.get(normalizedChatId) === nextSync) {
        unseenReactionSyncPromises.delete(normalizedChatId);
      }
    }
  }

  async function resolveAppRelayUrls(): Promise<string[]> {
    const relayStore = await getRelayStore();
    return inputSanitizerService.normalizeStringArray(relayStore.relays);
  }

  async function resolveRecipientRelayUrls(chatPublicKey: string): Promise<string[]> {
    await contactsService.init();
    const contact = await contactsService.getContactByPublicKey(chatPublicKey);
    const contactRelayUrls = resolvePreferredContactRelayUrls(contact?.relays);
    const appRelayUrls = contact?.sendMessagesToAppRelays ? await resolveAppRelayUrls() : [];
    return inputSanitizerService.normalizeStringArray([...contactRelayUrls, ...appRelayUrls]);
  }

  async function resolveSendRelayUrls(
    chatPublicKey: string,
    relayUrls: string[] | undefined
  ): Promise<string[]> {
    const normalizedRelayUrls = Array.isArray(relayUrls)
      ? inputSanitizerService.normalizeStringArray(relayUrls)
      : await resolveRecipientRelayUrls(chatPublicKey);

    if (normalizedRelayUrls.length === 0) {
      if (Array.isArray(relayUrls)) {
        throw new Error('Cannot send encrypted event without application relays.');
      }

      throw new MissingContactRelaysError(chatPublicKey);
    }

    return normalizedRelayUrls;
  }

  function resolveChatRecipientPublicKey(chat: ChatRow): string {
    return chat.type === 'group'
      ? (typeof chat.meta.current_epoch_public_key === 'string'
          ? chat.meta.current_epoch_public_key.trim().toLowerCase()
          : '')
      : chat.public_key;
  }

  async function resolveChatDeliveryTarget(
    chatPublicKey: string,
    relayUrls: string[] | undefined
  ): Promise<{
    chat: ChatRow;
    recipientPublicKey: string;
    relayUrls: string[];
    publishSelfCopy: boolean;
  } | null> {
    const chat = await chatDataService.getChatByPublicKey(chatPublicKey);
    if (!chat) {
      return null;
    }

    const recipientPublicKey = resolveChatRecipientPublicKey(chat);
    if (!recipientPublicKey) {
      throw new Error('Group chat is missing the current epoch public key.');
    }

    return {
      chat,
      recipientPublicKey,
      relayUrls: await resolveSendRelayUrls(chat.public_key, relayUrls),
      publishSelfCopy: chat.type !== 'group'
    };
  }

  async function resolveReplyTargetEventId(
    replyTo: MessageReplyPreview | null
  ): Promise<string | null> {
    const directEventId = normalizeEventId(replyTo?.eventId);
    if (directEventId) {
      return directEventId;
    }

    const localMessageId = Number.parseInt(replyTo?.messageId ?? '', 10);
    if (!Number.isInteger(localMessageId) || localMessageId <= 0) {
      return null;
    }

    await chatDataService.init();
    const replyMessageRow = await chatDataService.getMessageById(localMessageId);
    return normalizeEventId(replyMessageRow?.event_id);
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
    replyTo: MessageReplyPreview | null = null,
    options: RelaySendOptions = {}
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

    const recipientPublicKey = resolveChatRecipientPublicKey(chat);
    if (!recipientPublicKey) {
      throw new Error('Group chat is missing the current epoch public key.');
    }

    const recipientRelayUrls = await resolveSendRelayUrls(chat.public_key, options.relayUrls);

    const replyTargetEventId = await resolveReplyTargetEventId(replyTo);
    const replyPreview = replyTo
      ? {
          ...replyTo,
          eventId: replyTargetEventId ?? replyTo.eventId
        }
      : null;

    const created = await chatDataService.createMessage({
      chat_public_key: chat.public_key,
      author_public_key: window.localStorage.getItem('npub'),
      message: cleanText,
      created_at: new Date().toISOString(),
      ...(replyPreview ? { meta: { reply: replyPreview } } : {})
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
      const nostrStore = await getNostrStore();
      await nostrStore.sendDirectMessage(
        recipientPublicKey,
        newMessage.text,
        recipientRelayUrls,
        {
          localMessageId: created.id,
          createdAt: created.created_at,
          replyToEventId: replyTargetEventId,
          publishSelfCopy: chat.type !== 'group'
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

    try {
      const nostrStore = await getNostrStore();
      await nostrStore.ensureRespondedPubkeyIsContact(chat.public_key, chat.name);
    } catch (error) {
      console.warn('Failed to add responded pubkey to contacts', chat.public_key, error);
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
    if (areReactionListsEqual(currentReactions, nextReactions)) {
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
    await syncChatUnseenReactionCount(normalizedChatId);
    return updatedMessage;
  }

  async function addReaction(
    chatId: string,
    messageId: string,
    emoji: string,
    options: RelaySendOptions = {}
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

    let reactionRecipientPublicKey: string | null = null;
    let reactionRelayUrls: string[] = [];
    let shouldPublishReactionSelfCopy = true;
    if (existingRow.event_id) {
      const deliveryTarget = await resolveChatDeliveryTarget(
        existingRow.chat_public_key,
        options.relayUrls
      );
      if (deliveryTarget) {
        reactionRecipientPublicKey = deliveryTarget.recipientPublicKey;
        reactionRelayUrls = deliveryTarget.relayUrls;
        shouldPublishReactionSelfCopy = deliveryTarget.publishSelfCopy;
      }
    }

    const updatedMessage = await updateMessageReactions(
      normalizedChatId,
      String(normalizedMessageId),
      (reactions) => {
        const emojiEntry = getEmojiEntryByValue(normalizedEmoji);
        const isOwnMessage = normalizeChatIdentifier(existingRow.author_public_key) === loggedInPublicKey;
        const createdAt = new Date().toISOString();
        return [
          ...reactions,
          {
            emoji: normalizedEmoji,
            name: emojiEntry?.label ?? normalizedEmoji,
            reactorPublicKey: loggedInPublicKey,
            eventId: null,
            createdAt,
            ...(isOwnMessage ? { viewedByAuthorAt: createdAt } : {})
          }
        ];
      }
    );

    if (!updatedMessage || !existingRow.event_id) {
      return updatedMessage;
    }

    if (!reactionRecipientPublicKey || reactionRelayUrls.length === 0) {
      return updatedMessage;
    }

    const createdAt = new Date().toISOString();
    const nostrStore = await getNostrStore();

    const publishedReactionEvent = await nostrStore.sendDirectMessageReaction(
      reactionRecipientPublicKey,
      normalizedEmoji,
      existingRow.event_id,
      existingRow.author_public_key,
      reactionRelayUrls,
      {
        createdAt,
        targetKind: updatedMessage.nostrEvent?.event.kind,
        publishSelfCopy: shouldPublishReactionSelfCopy
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

    const reactionEventId = normalizeEventId(reactionToRemove.eventId);
    let reactionDeletionRecipientPublicKey: string | null = null;
    let reactionDeletionRelayUrls: string[] = [];
    let shouldPublishReactionDeletionSelfCopy = true;
    if (reactionEventId) {
      const deliveryTarget = await resolveChatDeliveryTarget(existingRow.chat_public_key, undefined);
      if (deliveryTarget) {
        reactionDeletionRecipientPublicKey = deliveryTarget.recipientPublicKey;
        reactionDeletionRelayUrls = deliveryTarget.relayUrls;
        shouldPublishReactionDeletionSelfCopy = deliveryTarget.publishSelfCopy;
      }
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

    if (!reactionEventId) {
      return updatedMessage;
    }

    if (!reactionDeletionRecipientPublicKey || reactionDeletionRelayUrls.length === 0) {
      return updatedMessage;
    }

    const nostrStore = await getNostrStore();
    await nostrStore.sendDirectMessageDeletion(
      reactionDeletionRecipientPublicKey,
      reactionEventId,
      7,
      reactionDeletionRelayUrls,
      {
        createdAt: new Date().toISOString(),
        publishSelfCopy: shouldPublishReactionDeletionSelfCopy
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
    let deletionRecipientPublicKey: string | null = null;
    let deletionRelayUrls: string[] = [];
    let shouldPublishDeletionSelfCopy = true;
    const deliveryTarget = await resolveChatDeliveryTarget(existingRow.chat_public_key, undefined);
    if (deliveryTarget) {
      deletionRecipientPublicKey = deliveryTarget.recipientPublicKey;
      deletionRelayUrls = deliveryTarget.relayUrls;
      shouldPublishDeletionSelfCopy = deliveryTarget.publishSelfCopy;
    }

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

    if (!deletionRecipientPublicKey || deletionRelayUrls.length === 0) {
      return updatedMessage;
    }

    const nostrStore = await getNostrStore();
    const deleteEvent = await nostrStore.sendDirectMessageDeletion(
      deletionRecipientPublicKey,
      existingRow.event_id,
      targetKind,
      deletionRelayUrls,
      {
        createdAt: new Date().toISOString(),
        publishSelfCopy: shouldPublishDeletionSelfCopy
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

  async function markMessagesReactionsViewed(
    chatId: string,
    messageIds: string[]
  ): Promise<void> {
    const normalizedChatId = normalizeChatIdentifier(chatId);
    const loggedInPublicKey = getLoggedInPublicKey();
    const normalizedMessageIds = Array.from(
      new Set(
        messageIds
          .map((messageId) => Number.parseInt(messageId, 10))
          .filter((messageId) => Number.isInteger(messageId) && messageId > 0)
      )
    );

    if (!normalizedChatId || !loggedInPublicKey || normalizedMessageIds.length === 0) {
      return;
    }

    await chatDataService.init();

    const viewedAt = new Date().toISOString();
    let didChange = false;
    let latestViewedIncomingReactionAt: string | null = null;

    for (const messageId of normalizedMessageIds) {
      const existingRow = await chatDataService.getMessageById(messageId);
      if (!existingRow || normalizeChatIdentifier(existingRow.chat_public_key) !== normalizedChatId) {
        continue;
      }

      if (normalizeChatIdentifier(existingRow.author_public_key) !== loggedInPublicKey) {
        continue;
      }

      const currentReactions = normalizeMessageReactions(existingRow.meta.reactions);
      if (countUnseenReactionsForAuthor(currentReactions, loggedInPublicKey) === 0) {
        continue;
      }

      const nextReactions = markReactionsViewedByAuthor(
        currentReactions,
        loggedInPublicKey,
        viewedAt
      );
      if (areReactionListsEqual(currentReactions, nextReactions)) {
        continue;
      }

      const updatedRow = await chatDataService.updateMessageMeta(
        messageId,
        buildMetaWithReactions(existingRow.meta, nextReactions)
      );
      if (!updatedRow) {
        continue;
      }

      didChange = true;
      nextReactions.forEach((reaction) => {
        const reactionCreatedAt = normalizeTimestamp(reaction.createdAt);
        if (
          reaction.viewedByAuthorAt !== viewedAt ||
          normalizeChatIdentifier(reaction.reactorPublicKey) === loggedInPublicKey ||
          !reactionCreatedAt
        ) {
          return;
        }

        if (
          !latestViewedIncomingReactionAt ||
          toComparableTimestamp(reactionCreatedAt) >
            toComparableTimestamp(latestViewedIncomingReactionAt)
        ) {
          latestViewedIncomingReactionAt = reactionCreatedAt;
        }
      });
      await upsertPersistedMessage(updatedRow);
    }

    if (didChange) {
      if (latestViewedIncomingReactionAt) {
        await chatStore.setLastSeenReceivedActivityAt(
          normalizedChatId,
          latestViewedIncomingReactionAt
        );
      }
      await syncChatUnseenReactionCount(normalizedChatId);
    }
  }

  async function syncChatsReadStateFromSeenBoundary(
    chatIds: string[] = []
  ): Promise<{
    chatCount: number;
    boundaryAdvancedCount: number;
    unreadCountAdjustedCount: number;
    reactionMessageCount: number;
    reactionsMarkedCount: number;
  }> {
    const normalizedChatIds = Array.from(
      new Set(
        chatIds
          .map((chatId) => normalizeChatIdentifier(chatId))
          .filter((chatId): chatId is string => Boolean(chatId))
      )
    );
    const targetChatIds = normalizedChatIds.length > 0 ? new Set(normalizedChatIds) : null;
    const loggedInPublicKey = getLoggedInPublicKey();
    const summary = {
      chatCount: 0,
      boundaryAdvancedCount: 0,
      unreadCountAdjustedCount: 0,
      reactionMessageCount: 0,
      reactionsMarkedCount: 0
    };

    await Promise.all([chatDataService.init(), contactsService.init()]);

    const [chatRows, messageRows, contacts] = await Promise.all([
      chatDataService.listChats(),
      chatDataService.listAllMessages(),
      contactsService.listContacts()
    ]);
    const messageRowsByChat = new Map<string, MessageRow[]>();
    const seenBoundaryByChat = new Map<string, string>();

    for (const contact of contacts) {
      const normalizedChatId = normalizeChatIdentifier(contact.public_key);
      if (!normalizedChatId || (targetChatIds && !targetChatIds.has(normalizedChatId))) {
        continue;
      }

      const contactMeta =
        contact.meta && typeof contact.meta === 'object' && !Array.isArray(contact.meta)
          ? (contact.meta as Record<string, unknown>)
          : {};
      const seenBoundaryAt = readMetaString(contactMeta, 'last_seen_incoming_activity_at');
      if (toComparableTimestamp(seenBoundaryAt) <= 0) {
        continue;
      }

      seenBoundaryByChat.set(normalizedChatId, seenBoundaryAt);
    }

    for (const row of messageRows) {
      const normalizedChatId = normalizeChatIdentifier(row.chat_public_key);
      if (!normalizedChatId || (targetChatIds && !targetChatIds.has(normalizedChatId))) {
        continue;
      }

      const chatMessageRows = messageRowsByChat.get(normalizedChatId) ?? [];
      chatMessageRows.push(row);
      messageRowsByChat.set(normalizedChatId, chatMessageRows);
    }

    for (const chatRow of chatRows) {
      const normalizedChatId = normalizeChatIdentifier(chatRow.public_key);
      if (!normalizedChatId || (targetChatIds && !targetChatIds.has(normalizedChatId))) {
        continue;
      }

      summary.chatCount += 1;

      const currentLastSeenReceivedActivityAt = readMetaString(
        chatRow.meta,
        'last_seen_received_activity_at'
      );
      const contactLastSeenIncomingActivityAt = seenBoundaryByChat.get(normalizedChatId) ?? '';
      const boundaryAt =
        toComparableTimestamp(contactLastSeenIncomingActivityAt) >
        toComparableTimestamp(currentLastSeenReceivedActivityAt)
          ? contactLastSeenIncomingActivityAt
          : currentLastSeenReceivedActivityAt;
      const boundaryTimestamp = toComparableTimestamp(boundaryAt);

      if (
        boundaryTimestamp > 0 &&
        boundaryTimestamp > toComparableTimestamp(currentLastSeenReceivedActivityAt)
      ) {
        await chatDataService.updateChatMeta(normalizedChatId, {
          ...chatRow.meta,
          last_seen_received_activity_at: boundaryAt
        });
        summary.boundaryAdvancedCount += 1;
      }

      const chatMessageRows = messageRowsByChat.get(normalizedChatId) ?? [];
      const nextUnreadCount = chatMessageRows.reduce((count, row) => {
        if (normalizeChatIdentifier(row.author_public_key) === loggedInPublicKey) {
          return count;
        }

        return count + (toComparableTimestamp(row.created_at) > boundaryTimestamp ? 1 : 0);
      }, 0);

      if (Number(chatRow.unread_count ?? 0) !== nextUnreadCount) {
        await chatDataService.updateChatUnreadCount(normalizedChatId, nextUnreadCount);
        summary.unreadCountAdjustedCount += 1;
      }

      if (!loggedInPublicKey) {
        continue;
      }

      if (boundaryTimestamp <= 0) {
        continue;
      }

      for (const row of chatMessageRows) {
        if (normalizeChatIdentifier(row.author_public_key) !== loggedInPublicKey) {
          continue;
        }

        const currentReactions = normalizeMessageReactions(row.meta.reactions);
        let markedReactionCount = 0;
        const nextReactions = currentReactions.map((reaction) => {
          const reactionCreatedAt = normalizeTimestamp(reaction.createdAt);
          if (
            !reactionCreatedAt ||
            reaction.viewedByAuthorAt ||
            normalizeChatIdentifier(reaction.reactorPublicKey) === loggedInPublicKey ||
            toComparableTimestamp(reactionCreatedAt) > boundaryTimestamp
          ) {
            return reaction;
          }

          markedReactionCount += 1;
          return {
            ...reaction,
            viewedByAuthorAt: boundaryAt
          };
        });

        if (markedReactionCount === 0) {
          continue;
        }

        const updatedRow = await chatDataService.updateMessageMeta(
          row.id,
          buildMetaWithReactions(row.meta, nextReactions)
        );
        if (!updatedRow) {
          continue;
        }

        summary.reactionMessageCount += 1;
        summary.reactionsMarkedCount += markedReactionCount;
        await upsertPersistedMessage(updatedRow);
      }
    }

    return summary;
  }

  async function markMessageReactionsViewed(chatId: string, messageId: string): Promise<void> {
    await markMessagesReactionsViewed(chatId, [messageId]);
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
    markMessageReactionsViewed,
    markMessagesReactionsViewed,
    syncChatsReadStateFromSeenBoundary,
    syncChatUnseenReactionCount,
    removeChatMessages,
    upsertPersistedMessage,
    refreshPersistedMessage
  };
});
