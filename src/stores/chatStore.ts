import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { chatDataService } from 'src/services/chatDataService';
import { contactsService } from 'src/services/contactsService';
import { nostrEventDataService } from 'src/services/nostrEventDataService';
import type { Chat } from 'src/types/chat';
import type { ContactRecord } from 'src/types/contact';

interface ChatContactContext {
  picture: string;
  givenName: string;
  contactName: string;
}

interface LiveChatPreviewInput {
  publicKey: string;
  fallbackName: string;
  messageText: string;
  at: string;
  unreadCount: number;
  meta?: Record<string, unknown>;
}

const LAST_SEEN_RECEIVED_ACTIVITY_AT_META_KEY = 'last_seen_received_activity_at';

function sortByLatest(chats: Chat[]): Chat[] {
  const toTimestamp = (value: string): number => {
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  return [...chats].sort(
    (first, second) => toTimestamp(second.lastMessageAt) - toTimestamp(first.lastMessageAt)
  );
}

function buildAvatar(identifier: string): string {
  const parts = identifier
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  const compact = identifier.replace(/\s+/g, '').toUpperCase();
  return compact.slice(0, 2) || 'NA';
}

function normalizeChatIdentifier(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim().toLowerCase();
  return normalizedValue || null;
}

function readMetaString(meta: Record<string, unknown>, key: string): string {
  const value = meta[key];
  return typeof value === 'string' ? value.trim() : '';
}

function getLoggedInPublicKey(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return normalizeChatIdentifier(window.localStorage.getItem('npub'));
}

function toComparableTimestamp(value: string | null | undefined): number {
  if (typeof value !== 'string' || !value.trim()) {
    return 0;
  }

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function readMetaNumber(meta: Record<string, unknown>, key: string): number | null {
  const value = meta[key];
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return Math.max(0, Math.floor(numericValue));
}

function syncMetaString(
  meta: Record<string, unknown>,
  key: string,
  value: string
): boolean {
  const normalizedValue = value.trim();
  const currentValue = readMetaString(meta, key);

  if (!normalizedValue) {
    if (!currentValue) {
      return false;
    }

    delete meta[key];
    return true;
  }

  if (currentValue === normalizedValue) {
    return false;
  }

  meta[key] = normalizedValue;
  return true;
}

function resolvePictureFromContactMeta(meta: Record<string, unknown>): string {
  const picture = meta.picture;
  if (typeof picture === 'string' && picture.trim()) {
    return picture.trim();
  }

  return '';
}

function toContactContext(contact: ContactRecord): ChatContactContext {
  return {
    picture: resolvePictureFromContactMeta(contact.meta as Record<string, unknown>),
    givenName: contact.given_name?.trim() ?? '',
    contactName: contact.name.trim()
  };
}

function syncChatMeta(
  meta: Record<string, unknown>,
  contactContext: ChatContactContext | undefined,
  avatarSeed: string
): Record<string, unknown> {
  let nextMeta = meta;

  const ensureWritableMeta = (): Record<string, unknown> => {
    if (nextMeta === meta) {
      nextMeta = { ...meta };
    }

    return nextMeta;
  };

  if (contactContext) {
    const writableMeta = ensureWritableMeta();
    const didChangePicture = syncMetaString(writableMeta, 'picture', contactContext.picture);
    const didChangeGivenName = syncMetaString(writableMeta, 'given_name', contactContext.givenName);
    const didChangeContactName = syncMetaString(
      writableMeta,
      'contact_name',
      contactContext.contactName
    );

    if (!didChangePicture && !didChangeGivenName && !didChangeContactName && nextMeta !== meta) {
      nextMeta = meta;
    }
  }

  const nextAvatar = buildAvatar(avatarSeed);
  const currentAvatar = readMetaString(nextMeta, 'avatar');
  if (currentAvatar !== nextAvatar) {
    ensureWritableMeta().avatar = nextAvatar;
  }

  return nextMeta;
}

function mapChatRowToChat(
  row: Awaited<ReturnType<typeof chatDataService.listChats>>[number],
  contactContext?: ChatContactContext
): Chat {
  const nextName = contactContext?.contactName || row.name;
  const nextMeta = syncChatMeta(
    row.meta,
    contactContext,
    contactContext?.givenName || nextName || row.public_key
  );
  const avatarFromMeta = readMetaString(nextMeta, 'avatar');
  const avatar = avatarFromMeta || buildAvatar(nextName || row.public_key);

  return {
    id: row.public_key,
    publicKey: row.public_key,
    name: nextName,
    avatar,
    lastMessage: row.last_message || '',
    lastMessageAt: row.last_message_at || new Date(0).toISOString(),
    unreadCount: row.unread_count,
    meta: nextMeta
  };
}

export const useChatStore = defineStore('chatStore', () => {
  const chats = ref<Chat[]>([]);
  const selectedChatId = ref<string | null>(null);
  const visibleChatId = ref<string | null>(null);
  const searchQuery = ref('');
  const isLoaded = ref(false);
  let initPromise: Promise<void> | null = null;

  const selectedChat = computed(
    () => chats.value.find((chat) => chat.id === selectedChatId.value) ?? null
  );

  async function loadChatsIntoState(): Promise<void> {
    await Promise.all([chatDataService.init(), contactsService.init()]);
    const [rows, contacts] = await Promise.all([
      chatDataService.listChats(),
      contactsService.listContacts()
    ]);
    const contactContextByPublicKey = new Map<string, ChatContactContext>();

    for (const contact of contacts) {
      contactContextByPublicKey.set(contact.public_key.toLowerCase(), toContactContext(contact));
    }

    chats.value = sortByLatest(
      rows.map((row) =>
        mapChatRowToChat(
          row,
          contactContextByPublicKey.get(row.public_key.toLowerCase())
        )
      )
    );

    if (selectedChatId.value && chats.value.some((chat) => chat.id === selectedChatId.value)) {
      return;
    }

    selectedChatId.value = chats.value[0]?.id ?? null;
  }

  async function init(): Promise<void> {
    if (!initPromise) {
      initPromise = (async () => {
        try {
          await loadChatsIntoState();
        } catch (error) {
          console.error('Failed to initialize chats', error);
          chats.value = [];
          selectedChatId.value = null;
        } finally {
          isLoaded.value = true;
        }
      })();
    }

    try {
      await initPromise;
    } finally {
      initPromise = null;
    }
  }

  async function reload(): Promise<void> {
    if (initPromise) {
      await initPromise;
    }

    try {
      await loadChatsIntoState();
    } catch (error) {
      console.error('Failed to reload chats', error);
      throw error;
    } finally {
      isLoaded.value = true;
    }
  }

  function selectChat(chatId: string): void {
    const normalizedChatId = normalizeChatIdentifier(chatId);
    if (!normalizedChatId) {
      return;
    }

    selectedChatId.value = normalizedChatId;
    void markAsRead(normalizedChatId);
  }

  function setVisibleChatId(chatId: string | null): void {
    const nextChatId = normalizeChatIdentifier(chatId);
    visibleChatId.value = nextChatId;

    if (nextChatId) {
      void markAsRead(nextChatId);
    }
  }

  async function getLatestIncomingMessageAt(chatId: string): Promise<string | null> {
    const normalizedChatId = normalizeChatIdentifier(chatId);
    const loggedInPublicKey = getLoggedInPublicKey();
    if (!normalizedChatId || !loggedInPublicKey) {
      return null;
    }

    await chatDataService.init();
    const rows = await chatDataService.listMessages(normalizedChatId);

    let latestIncomingMessageAt: string | null = null;
    for (const row of rows) {
      if (normalizeChatIdentifier(row.author_public_key) === loggedInPublicKey) {
        continue;
      }

      if (
        !latestIncomingMessageAt ||
        toComparableTimestamp(row.created_at) > toComparableTimestamp(latestIncomingMessageAt)
      ) {
        latestIncomingMessageAt = row.created_at;
      }
    }

    return latestIncomingMessageAt;
  }

  async function setLastSeenReceivedActivityAt(chatId: string, at: string): Promise<void> {
    const normalizedChatId = normalizeChatIdentifier(chatId);
    const normalizedAt = at.trim();
    if (!normalizedChatId || !normalizedAt) {
      return;
    }

    let nextMetaToPersist: Record<string, unknown> | null = null;
    const existingChat = chats.value.find((chat) => chat.id === normalizedChatId) ?? null;

    if (existingChat) {
      const currentMeta = existingChat.meta as Record<string, unknown>;
      const currentAt = readMetaString(currentMeta, LAST_SEEN_RECEIVED_ACTIVITY_AT_META_KEY);
      if (toComparableTimestamp(currentAt) >= toComparableTimestamp(normalizedAt)) {
        return;
      }

      nextMetaToPersist = {
        ...currentMeta,
        [LAST_SEEN_RECEIVED_ACTIVITY_AT_META_KEY]: normalizedAt
      };

      chats.value = chats.value.map((chat) =>
        chat.id === normalizedChatId
          ? {
              ...chat,
              meta: nextMetaToPersist ?? chat.meta
            }
          : chat
      );
    } else {
      await chatDataService.init();
      const existingRow = await chatDataService.getChatByPublicKey(normalizedChatId);
      if (!existingRow) {
        return;
      }

      const currentAt = readMetaString(
        existingRow.meta,
        LAST_SEEN_RECEIVED_ACTIVITY_AT_META_KEY
      );
      if (toComparableTimestamp(currentAt) >= toComparableTimestamp(normalizedAt)) {
        return;
      }

      nextMetaToPersist = {
        ...existingRow.meta,
        [LAST_SEEN_RECEIVED_ACTIVITY_AT_META_KEY]: normalizedAt
      };
    }

    if (!nextMetaToPersist) {
      return;
    }

    try {
      await chatDataService.updateChatMeta(normalizedChatId, nextMetaToPersist);
    } catch (error) {
      console.error('Failed to persist last seen received activity for chat', error);
    }
  }

  async function markAsRead(chatId: string): Promise<void> {
    const normalizedChatId = normalizeChatIdentifier(chatId);
    if (!normalizedChatId) {
      return;
    }

    chats.value = chats.value.map((chat) =>
      chat.id === normalizedChatId ? { ...chat, unreadCount: 0 } : chat
    );

    try {
      await chatDataService.markChatAsRead(normalizedChatId);
    } catch (error) {
      console.error('Failed to mark chat as read', error);
    }
  }

  async function muteChat(chatId: string): Promise<void> {
    const normalizedChatId = normalizeChatIdentifier(chatId);
    if (!normalizedChatId) {
      return;
    }

    const targetChat = chats.value.find((chat) => chat.id === normalizedChatId);
    if (!targetChat) {
      return;
    }

    const isAlreadyMuted = targetChat.meta.muted === true;
    if (isAlreadyMuted) {
      return;
    }

    const nextMeta = {
      ...(targetChat.meta as Record<string, unknown>),
      muted: true
    };

    chats.value = chats.value.map((chat) =>
      chat.id === normalizedChatId
        ? {
            ...chat,
            meta: nextMeta
          }
        : chat
    );

    try {
      await chatDataService.updateChatMeta(normalizedChatId, nextMeta);
    } catch (error) {
      console.error('Failed to mute chat', error);
    }
  }

  async function deleteChat(chatId: string): Promise<boolean> {
    const normalizedChatId = normalizeChatIdentifier(chatId);
    if (!normalizedChatId) {
      return false;
    }

    try {
      const existingMessages = await chatDataService.listMessages(normalizedChatId);
      const deleted = await chatDataService.deleteChat(normalizedChatId);
      if (!deleted) {
        return false;
      }

      try {
        await nostrEventDataService.deleteEventsByIds(
          existingMessages
            .map((message) => message.event_id)
            .filter((eventId): eventId is string => typeof eventId === 'string' && eventId.trim().length > 0)
        );
      } catch (error) {
        console.error('Failed to delete nostr events for chat', error);
      }

      const nextChats = chats.value.filter((chat) => chat.id !== normalizedChatId);
      chats.value = nextChats;

      if (selectedChatId.value === normalizedChatId) {
        selectedChatId.value = nextChats[0]?.id ?? null;
      }

      return true;
    } catch (error) {
      console.error('Failed to delete chat', error);
      return false;
    }
  }

  function setSearchQuery(query: string): void {
    searchQuery.value = query;
  }

  async function updateChatPreview(chatId: string, text: string, at: string): Promise<void> {
    const normalizedChatId = normalizeChatIdentifier(chatId);
    if (!normalizedChatId) {
      return;
    }

    let nextUnreadCount = 0;
    chats.value = sortByLatest(
      chats.value.map((chat) => {
        if (chat.id !== normalizedChatId) {
          return chat;
        }

        nextUnreadCount = visibleChatId.value === normalizedChatId ? 0 : chat.unreadCount;
        return {
          ...chat,
          lastMessage: text,
          lastMessageAt: at,
          unreadCount: nextUnreadCount
        };
      })
    );

    try {
      await chatDataService.updateChatPreview(
        normalizedChatId,
        text,
        at,
        nextUnreadCount
      );
    } catch (error) {
      console.error('Failed to update chat preview', error);
    }
  }

  function setUnseenReactionCount(chatId: string, count: number): void {
    const normalizedChatId = normalizeChatIdentifier(chatId);
    if (!normalizedChatId) {
      return;
    }

    const normalizedCount = Math.max(0, Math.floor(Number(count) || 0));

    chats.value = chats.value.map((chat) => {
      if (chat.id !== normalizedChatId) {
        return chat;
      }

      const currentMeta = chat.meta as Record<string, unknown>;
      const currentCount = readMetaNumber(currentMeta, 'unseen_reaction_count') ?? 0;
      if (currentCount === normalizedCount) {
        return chat;
      }

      const nextMeta = { ...currentMeta };
      if (normalizedCount > 0) {
        nextMeta.unseen_reaction_count = normalizedCount;
      } else {
        delete nextMeta.unseen_reaction_count;
      }

      return {
        ...chat,
        meta: nextMeta
      };
    });
  }

  function applyIncomingMessage(input: LiveChatPreviewInput): void {
    const nextPublicKey = normalizeChatIdentifier(input.publicKey);

    if (!nextPublicKey) {
      return;
    }

    const fallbackName = input.fallbackName.trim() || nextPublicKey;
    const nextChatId = nextPublicKey;
    const existingChat = chats.value.find((chat) => chat.id === nextChatId) ?? null;
    const currentMeta =
      (existingChat?.meta as Record<string, unknown> | undefined) ??
      (input.meta ? { ...input.meta } : {});
    const nextName = existingChat?.name || fallbackName;
    const nextMeta = syncChatMeta(
      currentMeta,
      undefined,
      nextName || nextPublicKey
    );
    const nextAvatar =
      readMetaString(nextMeta, 'avatar') ||
      existingChat?.avatar ||
      buildAvatar(nextName || nextPublicKey);
    const nextChat: Chat = {
      id: nextChatId,
      publicKey: existingChat?.publicKey || nextPublicKey,
      name: nextName,
      avatar: nextAvatar,
      lastMessage: input.messageText,
      lastMessageAt: input.at,
      unreadCount: visibleChatId.value === nextChatId ? 0 : Math.max(0, input.unreadCount),
      meta: nextMeta
    };

    if (existingChat) {
      chats.value = sortByLatest(
        chats.value.map((chat) => (chat.id === nextChatId ? nextChat : chat))
      );
      return;
    }

    chats.value = sortByLatest([...chats.value, nextChat]);
  }

  async function addContact(
    nameOrIdentifier: string,
    publicKey = nameOrIdentifier
  ): Promise<Chat | null> {
    const cleanName = nameOrIdentifier.trim();
    const cleanPublicKey = normalizeChatIdentifier(publicKey) ?? normalizeChatIdentifier(cleanName) ?? '';

    if (!cleanName || !cleanPublicKey) {
      return null;
    }

    await contactsService.init();
    const contact = await contactsService.getContactByPublicKey(cleanPublicKey);
    const contactContext = contact ? toContactContext(contact) : undefined;

    const existingInStore = chats.value.find(
      (chat) => chat.publicKey.toLowerCase() === cleanPublicKey.toLowerCase()
    );
    if (existingInStore) {
      const nextName = contactContext?.contactName || existingInStore.name;
      const nextMeta = syncChatMeta(
        existingInStore.meta as Record<string, unknown>,
        contactContext,
        contactContext?.givenName || nextName || cleanPublicKey
      );
      if (nextMeta === existingInStore.meta && nextName === existingInStore.name) {
        return existingInStore;
      }

      let nextChat: Chat | null = null;
      chats.value = chats.value.map((chat) => {
        if (chat.id !== existingInStore.id) {
          return chat;
        }

        nextChat = {
          ...chat,
          name: nextName,
          avatar: readMetaString(nextMeta, 'avatar') || chat.avatar,
          meta: nextMeta
        };
        return nextChat;
      });

      return nextChat ?? existingInStore;
    }

    const existingInDb = await chatDataService.getChatByPublicKey(cleanPublicKey);
    if (existingInDb) {
      const mapped = mapChatRowToChat(existingInDb, contactContext);
      if (!chats.value.some((chat) => chat.id === mapped.id)) {
        chats.value = sortByLatest([...chats.value, mapped]);
      }

      return mapped;
    }

    const now = new Date().toISOString();
    const created = await chatDataService.createChat({
      public_key: cleanPublicKey,
      name: cleanName,
      last_message: '',
      last_message_at: now,
      unread_count: 0,
      meta: {
        avatar: buildAvatar(contactContext?.givenName || contactContext?.contactName || cleanName),
        ...(contactContext?.picture ? { picture: contactContext.picture } : {}),
        ...(contactContext?.givenName ? { given_name: contactContext.givenName } : {}),
        ...(contactContext?.contactName ? { contact_name: contactContext.contactName } : {})
      }
    });
    if (!created) {
      return null;
    }

    const newChat = mapChatRowToChat(created, contactContext);
    chats.value = sortByLatest([...chats.value, newChat]);
    return newChat;
  }

  async function syncContactProfile(publicKey: string): Promise<void> {
    const normalizedPublicKey = publicKey.trim().toLowerCase();
    if (!normalizedPublicKey) {
      return;
    }

    await Promise.all([chatDataService.init(), contactsService.init()]);

    const existingChatRow = await chatDataService.getChatByPublicKey(normalizedPublicKey);
    const existingChatInStore = chats.value.find(
      (chat) => chat.publicKey.trim().toLowerCase() === normalizedPublicKey
    );
    if (!existingChatRow && !existingChatInStore) {
      return;
    }

    const contact = await contactsService.getContactByPublicKey(normalizedPublicKey);
    if (!contact) {
      return;
    }

    const contactContext = toContactContext(contact);
    const currentName = existingChatRow?.name || existingChatInStore?.name || normalizedPublicKey;
    const nextName = contactContext.contactName || currentName;
    const currentMeta =
      (existingChatRow?.meta as Record<string, unknown> | undefined) ??
      (existingChatInStore?.meta as Record<string, unknown> | undefined) ??
      {};
    const nextMeta = syncChatMeta(
      currentMeta,
      contactContext,
      contactContext.givenName || nextName || normalizedPublicKey
    );
    const nextAvatar = readMetaString(nextMeta, 'avatar') || buildAvatar(nextName || normalizedPublicKey);

    if (existingChatRow) {
      await chatDataService.updateChat(existingChatRow.id, {
        name: nextName,
        meta: nextMeta
      });
    }

    if (!isLoaded.value || !existingChatInStore) {
      await reload();
      return;
    }

    chats.value = sortByLatest(
      chats.value.map((chat) =>
        chat.publicKey.trim().toLowerCase() === normalizedPublicKey
          ? {
              ...chat,
              name: nextName,
              avatar: nextAvatar,
              meta: nextMeta
            }
          : chat
      )
    );
  }

  void init().catch((error) => {
    console.error('Failed to preload chats', error);
  });

  return {
    chats,
    isLoaded,
    searchQuery,
    selectedChat,
    selectedChatId,
    visibleChatId,
    markAsRead,
    muteChat,
    deleteChat,
    init,
    reload,
    selectChat,
    setVisibleChatId,
    setSearchQuery,
    updateChatPreview,
    setLastSeenReceivedActivityAt,
    setUnseenReactionCount,
    applyIncomingMessage,
    addContact,
    syncContactProfile
  };
});
