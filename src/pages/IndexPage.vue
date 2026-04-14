<template>
  <q-page class="home-page" :style-fn="homePageStyleFn">
    <div
      ref="shellRef"
      class="home-shell"
      :class="{ 'home-shell--mobile': isMobile }"
      :style="shellStyle"
    >
      <aside v-if="!isMobile || !isMobileThreadOpen" class="sidebar">
        <div class="sidebar-top">
          <div class="sidebar-top__row" :class="{ 'sidebar-top__row--mobile': isMobile }">
            <div v-if="!isMobile" class="sidebar-top__title">Chats</div>
            <q-input
              v-if="isMobile"
              v-model="searchQuery"
              class="tg-input sidebar-top__search sidebar-top__search--mobile"
              dense
              outlined
              rounded
              clearable
              clear-icon="close"
              placeholder="Search"
            />
            <div class="sidebar-top__actions">
              <q-btn-dropdown
                flat
                dense
                icon="refresh"
                dropdown-icon="arrow_drop_down"
                class="sidebar-top__action"
                aria-label="Refresh Chats"
              >
                <q-list separator>
                  <q-item
                    v-for="option in chatRefreshRangeOptions"
                    :key="option.id"
                    clickable
                    v-close-popup
                    @click="handleRefreshChatsForRange(option)"
                  >
                    <q-item-section>
                      <q-item-label>{{ option.label }}</q-item-label>
                    </q-item-section>
                    <q-item-section side>
                      <q-icon
                        v-if="option.id === selectedChatRefreshRangeId"
                        name="check"
                        size="18px"
                      />
                    </q-item-section>
                  </q-item>
                </q-list>
              </q-btn-dropdown>
              <q-btn
                flat
                dense
                round
                icon="group_add"
                class="sidebar-top__action"
                data-testid="start-new-chat-button"
                aria-label="Start New Chat"
                :loading="isCreatingGroup"
              >
                <q-menu anchor="bottom right" self="top right" class="tg-pop-menu">
                  <q-list dense class="tg-pop-menu__list">
                    <q-item
                      clickable
                      v-close-popup
                      data-testid="start-new-chat-menu-item"
                      @click="handleNewChat"
                    >
                      <q-item-section>New Chat</q-item-section>
                    </q-item>
                    <q-item
                      clickable
                      v-close-popup
                      data-testid="start-new-group-menu-item"
                      @click="handleNewGroup"
                    >
                      <q-item-section>New Group</q-item-section>
                    </q-item>
                  </q-list>
                </q-menu>
              </q-btn>
            </div>
          </div>

          <q-input
            v-if="!isMobile"
            v-model="searchQuery"
            class="tg-input"
            dense
            outlined
            rounded
            clearable
            clear-icon="close"
            placeholder="Search"
          />
        </div>

        <ChatList
          class="sidebar-list"
          :chats="sidebarChats"
          :selected-chat-id="selectedChatId"
          :show-requests-row="showRequestsRow"
          :request-count="requestCount"
          :requests-active="requestsRowActive"
          @select="handleSelectChat"
          @open-requests="handleOpenRequests"
          @view-profile="handleViewChatProfile"
          @refresh-profile="handleRefreshChatProfile"
          @refresh-chat="handleRefreshChat"
          @mute="handleMuteChat"
          @mark-as-read="handleMarkChatAsRead"
          @delete-chat="handleDeleteChat"
        />
        <AppNavRail
          v-if="!isMobile"
          class="sidebar-nav"
          active="chats"
          @select="handleRailSelect"
        />
      </aside>

      <div
        v-if="!isMobile"
        class="app-shell__resize-handle"
        role="separator"
        aria-label="Resize left panel"
        aria-orientation="vertical"
        :aria-valuemin="minSidebarWidth"
        :aria-valuemax="maxSidebarWidth"
        :aria-valuenow="sidebarWidth"
        tabindex="0"
        @pointerdown="startSidebarResize"
        @keydown="handleSidebarResizeKeydown"
      />

      <section
        v-if="!isMobile || isMobileThreadOpen"
        class="thread-panel"
        :class="{ 'thread-panel--mobile': isMobile }"
      >
        <ChatRequestsPage
          v-if="isRequestsRoute"
          :requests="requestChats"
          :show-back-button="isMobile"
          @back="handleBackToChatList"
          @open="handleOpenRequestChat"
          @accept="handleAcceptRequest"
          @delete-chat="handleDeleteChat"
          @block="handleBlockChat"
        />

        <ChatThread
          v-else
          :chat="activeChat"
          :messages="currentMessages"
          :is-initializing="isThreadInitializing"
          :show-back-button="isMobile"
          @send="handleSend"
          @back="handleBackToChatList"
          @open-profile="handleOpenProfile"
          @react="handleReactToMessage"
          @delete-message="handleDeleteMessage"
          @remove-reaction="handleRemoveReaction"
        />
      </section>

      <q-dialog v-model="isCreateGroupDialogOpen" :persistent="isCreatingGroup">
        <q-card class="create-group-dialog" data-testid="create-group-dialog">
          <q-card-section class="create-group-dialog__header">
            <div class="create-group-dialog__title">New Group</div>
          </q-card-section>

          <q-card-section>
            <q-input
              v-model="newGroupName"
              class="tg-input"
              data-testid="create-group-name-input"
              dense
              outlined
              rounded
              autofocus
              label="Name"
              @keydown.enter.prevent="handleConfirmNewGroup"
            />

            <q-input
              v-model="newGroupAbout"
              class="q-mt-sm tg-input"
              data-testid="create-group-about-input"
              dense
              outlined
              rounded
              label="About"
            />
          </q-card-section>

          <q-card-actions align="right" class="create-group-dialog__actions">
            <q-btn
              flat
              label="Cancel"
              color="primary"
              :disable="isCreatingGroup"
              @click="closeCreateGroupDialog()"
            />
            <q-btn
              unelevated
              label="OK"
              color="primary"
              data-testid="create-group-submit"
              :loading="isCreatingGroup"
              @click="handleConfirmNewGroup"
            />
          </q-card-actions>
        </q-card>
      </q-dialog>

      <ContactLookupDialog
        v-model="isNewChatDialogOpen"
        purpose="chat"
        @resolved="handleResolvedContactForNewChat"
      />
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import ChatList from 'src/components/ChatList.vue';
import { useSectionShell } from 'src/composables/useSectionShell';
import { useVisibleViewportHeight } from 'src/composables/useVisibleViewportHeight';
import { useChatStore } from 'src/stores/chatStore';
import {
  isMissingContactRelaysError,
  useMessageStore
} from 'src/stores/messageStore';
import type { Message, MessageReaction, MessageReplyPreview } from 'src/types/chat';
import type { ContactRecord } from 'src/types/contact';
import { resolveContactAppRelayFallback } from 'src/utils/messageRelayFallback';
import { reportUiError } from 'src/utils/uiErrorHandler';
import ContactLookupDialog from 'src/components/ContactLookupDialog.vue';

const AppNavRail = defineAsyncComponent(() => import('src/components/AppNavRail.vue'));
const ChatRequestsPage = defineAsyncComponent(() => import('src/components/ChatRequestsPage.vue'));
const ChatThread = defineAsyncComponent(() => import('src/components/ChatThread.vue'));

type NostrStoreModule = typeof import('src/stores/nostrStore');
type NostrStore = ReturnType<NostrStoreModule['useNostrStore']>;
type RelayStoreModule = typeof import('src/stores/relayStore');
type RelayStore = ReturnType<RelayStoreModule['useRelayStore']>;

const $q = useQuasar();
const route = useRoute();
const router = useRouter();
const chatStore = useChatStore();
const messageStore = useMessageStore();
const { visibleViewportHeight } = useVisibleViewportHeight(() => $q.screen.height);
const {
  isMobile,
  shellRef,
  shellStyle,
  sidebarWidth,
  minSidebarWidth,
  maxSidebarWidth,
  startSidebarResize,
  handleSidebarResizeKeydown,
  buildPageStyle: homePageStyleFn,
  handleRailSelect
} = useSectionShell({
  activeSection: 'chats',
  errorContext: 'Failed to navigate from chats rail',
  resolveHeight: (height) => visibleViewportHeight.value ?? height
});
const isNewChatDialogOpen = ref(false);
const isCreateGroupDialogOpen = ref(false);
const isCreatingGroup = ref(false);
const newGroupName = ref('');
const newGroupAbout = ref('');
type ChatRefreshRangeId = 'last-24-hours' | 'last-2-days' | 'last-week' | 'last-month' | 'custom';

interface ChatRefreshRangeOption {
  id: ChatRefreshRangeId;
  label: string;
  lookbackMinutes: number | null;
}

const chatRefreshRangeOptions: ChatRefreshRangeOption[] = [
  {
    id: 'last-24-hours',
    label: 'Last 24 hours',
    lookbackMinutes: 24 * 60
  },
  {
    id: 'last-2-days',
    label: 'Last 2 days',
    lookbackMinutes: 2 * 24 * 60
  },
  {
    id: 'last-week',
    label: 'Last week',
    lookbackMinutes: 7 * 24 * 60
  },
  {
    id: 'last-month',
    label: 'Last month',
    lookbackMinutes: 30 * 24 * 60
  },
  {
    id: 'custom',
    label: 'Custom',
    lookbackMinutes: null
  }
];

const selectedChatRefreshRangeId = ref<ChatRefreshRangeId>('last-24-hours');
const isRequestsRoute = computed(() => route.name === 'chat-requests');
const activeChatId = computed(() => {
  const rawChatId = route.params.pubkey;
  if (Array.isArray(rawChatId)) {
    return rawChatId[0]?.trim().toLowerCase() ?? '';
  }

  return typeof rawChatId === 'string' ? rawChatId.trim().toLowerCase() : '';
});
const activeChat = computed(() => {
  return chatStore.chats.find((chat) => chat.id === activeChatId.value) ?? null;
});
const sidebarChats = computed(() => chatStore.visibleChats);
const requestChats = computed(() => chatStore.requestChats);
const showRequestsRow = computed(() => chatStore.requestCount > 0 || isRequestsRoute.value);
const requestCount = computed(() => chatStore.requestCount);
const requestsRowActive = computed(() => {
  return isRequestsRoute.value || chatStore.isRequestChat(activeChatId.value);
});
const selectedChatId = computed(() => {
  if (isRequestsRoute.value || chatStore.isRequestChat(activeChatId.value)) {
    return null;
  }

  return activeChatId.value || null;
});
const isMobileThreadOpen = computed(() => {
  return isMobile.value && (isRequestsRoute.value || Boolean(activeChatId.value));
});
const chatIdSignature = computed(() => chatStore.chats.map((chat) => chat.id).join('|'));
const isThreadInitializing = computed(() => {
  return !chatStore.isLoaded;
});

const currentMessages = computed(() => {
  return messageStore.getMessages(activeChatId.value || null);
});

const searchQuery = computed({
  get: () => chatStore.searchQuery,
  set: (value: string | null) => chatStore.setSearchQuery(typeof value === 'string' ? value : '')
});
let nostrStorePromise: Promise<NostrStore> | null = null;
let relayStorePromise: Promise<RelayStore> | null = null;

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

function handleSelectChat(chatId: string): void {
  try {
    void router.push({ name: 'chats', params: { pubkey: chatId } });
  } catch (error) {
    reportUiError('Failed to select chat', error);
  }
}

function handleOpenRequests(): void {
  try {
    void router.push({ name: 'chat-requests' });
  } catch (error) {
    reportUiError('Failed to open requests page', error);
  }
}

function formatRelayList(relayUrls: string[]): string {
  return relayUrls.join(', ');
}

function notifyGroupSecretSave(result: Awaited<ReturnType<NostrStore['createGroupChat']>>): void {
  const { relayUrls, publishedRelayUrls, failedRelayUrls, errorMessage } = result.groupSecretSave;

  if (publishedRelayUrls.length > 0 && failedRelayUrls.length === 0) {
    $q.notify({
      type: 'positive',
      message: 'Group created.',
      caption: `Identity secret saved to ${formatRelayList(publishedRelayUrls)}.`,
      position: 'top-right',
      timeout: 5000
    });
    return;
  }

  if (publishedRelayUrls.length > 0) {
    $q.notify({
      type: 'warning',
      message: 'Group created with partial relay backup.',
      caption: `Saved to ${formatRelayList(publishedRelayUrls)}. Failed on ${formatRelayList(failedRelayUrls)}.`,
      position: 'top-right',
      timeout: 6500
    });
    return;
  }

  $q.notify({
    type: 'warning',
    message: 'Group created locally.',
    caption:
      errorMessage ??
      (relayUrls.length > 0
        ? `Failed to save the identity secret to ${formatRelayList(relayUrls)}.`
        : 'Failed to save the identity secret to relays.'),
    position: 'top-right',
    timeout: 6500
  });
}

function handleNewChat(): void {
  try {
    isNewChatDialogOpen.value = true;
  } catch (error) {
    reportUiError('Failed to open new chat flow', error);
  }
}

async function handleResolvedContactForNewChat(contact: ContactRecord): Promise<void> {
  try {
    const contactPubkey = contact.public_key.trim();
    if (!contactPubkey) {
      return;
    }

    await chatStore.init();
    const fallbackName = contactPubkey.slice(0, 32);
    const chatName =
      contact.meta.display_name?.trim() ||
      contact.given_name?.trim() ||
      contact.name.trim() ||
      fallbackName;
    const chat = await chatStore.addContact(chatName, contactPubkey);
    if (!chat) {
      return;
    }

    chatStore.selectChat(chat.id);
    void router.push({ name: 'chats', params: { pubkey: chat.publicKey } });
  } catch (error) {
    reportUiError('Failed to open chat for resolved contact', error);
  }
}

function openCreateGroupDialog(): void {
  isCreateGroupDialogOpen.value = true;
}

function closeCreateGroupDialog(force = false): void {
  if (isCreatingGroup.value && !force) {
    return;
  }

  isCreateGroupDialogOpen.value = false;
  newGroupName.value = '';
  newGroupAbout.value = '';
}

function handleNewGroup(): void {
  try {
    openCreateGroupDialog();
  } catch (error) {
    reportUiError('Failed to open create group dialog', error);
  }
}

async function handleConfirmNewGroup(): Promise<void> {
  if (isCreatingGroup.value) {
    return;
  }

  isCreatingGroup.value = true;

  try {
    const [nostrStore, relayStore] = await Promise.all([getNostrStore(), getRelayStore()]);
    const createdGroup = await nostrStore.createGroupChat({
      name: newGroupName.value,
      about: newGroupAbout.value,
      relayUrls: relayStore.relays
    });

    notifyGroupSecretSave(createdGroup);

    if (createdGroup.memberListSyncError) {
      $q.notify({
        type: 'warning',
        message: 'Group created, but member list sync failed.',
        caption: createdGroup.memberListSyncError,
        position: 'top-right',
        timeout: 6500
      });
    }

    if (createdGroup.contactListSyncError) {
      $q.notify({
        type: 'warning',
        message: 'Group created, but contact list sync failed.',
        caption: createdGroup.contactListSyncError,
        position: 'top-right',
        timeout: 6500
      });
    }

    closeCreateGroupDialog(true);
    void router.push({
      name: 'contacts',
      params: { pubkey: createdGroup.groupPublicKey }
    });
  } catch (error) {
    reportUiError('Failed to create group from chats page', error, 'Failed to create group.');
  } finally {
    isCreatingGroup.value = false;
  }
}

function getFallbackSidebarChatId(): string {
  return chatStore.inboxChats[0]?.id ?? '';
}

function getFallbackChatsRoute(): { name: 'chats'; params?: { pubkey: string } } | { name: 'chat-requests' } {
  const fallbackChatId = getFallbackSidebarChatId();
  if (fallbackChatId) {
    return {
      name: 'chats',
      params: { pubkey: fallbackChatId }
    };
  }

  if (chatStore.requestChats.length > 0) {
    return { name: 'chat-requests' };
  }

  return { name: 'chats' };
}

function handleOpenRequestChat(chatId: string): void {
  handleSelectChat(chatId);
}

async function resolveFallbackRelayUrls(chatPublicKey: string): Promise<string[] | null> {
  const relayStore = await getRelayStore();

  return resolveContactAppRelayFallback($q, chatPublicKey, relayStore.relays, {
    fallbackName: activeChat.value?.name ?? ''
  });
}

async function handleSend(payload: { text: string; replyTo: MessageReplyPreview | null }): Promise<void> {
  try {
    if (!activeChatId.value) {
      return;
    }

    let created;
    try {
      created = await messageStore.sendMessage(
        activeChatId.value,
        payload.text,
        payload.replyTo
      );
    } catch (error) {
      if (!isMissingContactRelaysError(error)) {
        throw error;
      }

      const fallbackRelayUrls = await resolveFallbackRelayUrls(error.chatPublicKey);
      if (!fallbackRelayUrls) {
        return;
      }

      created = await messageStore.sendMessage(
        activeChatId.value,
        payload.text,
        payload.replyTo,
        {
          relayUrls: fallbackRelayUrls
        }
      );
    }

    if (created) {
      await chatStore.updateChatPreview(activeChatId.value, created.text, created.sentAt);
      await chatStore.acceptChat(activeChatId.value, {
        lastOutgoingMessageAt: created.sentAt
      });
    }
  } catch (error) {
    reportUiError('Failed to send chat message', error, 'Failed to send message.');
  }
}

async function handleReactToMessage(payload: { message: Message; emoji: string }): Promise<void> {
  try {
    try {
      await messageStore.addReaction(payload.message.chatId, payload.message.id, payload.emoji);
    } catch (error) {
      if (!isMissingContactRelaysError(error)) {
        throw error;
      }

      const fallbackRelayUrls = await resolveFallbackRelayUrls(error.chatPublicKey);
      if (!fallbackRelayUrls) {
        return;
      }

      await messageStore.addReaction(
        payload.message.chatId,
        payload.message.id,
        payload.emoji,
        {
          relayUrls: fallbackRelayUrls
        }
      );
    }
  } catch (error) {
    reportUiError('Failed to add message reaction', error, 'Failed to add reaction.');
  }
}

async function handleDeleteMessage(message: Message): Promise<void> {
  try {
    await messageStore.deleteMessage(message.chatId, message.id);
  } catch (error) {
    reportUiError('Failed to delete message', error, 'Failed to delete message.');
  }
}

async function handleRemoveReaction(payload: {
  message: Message;
  reaction: MessageReaction;
}): Promise<void> {
  try {
    await messageStore.removeReaction(
      payload.message.chatId,
      payload.message.id,
      payload.reaction
    );
  } catch (error) {
    reportUiError('Failed to remove message reaction', error, 'Failed to remove reaction.');
  }
}

function handleOpenProfile(publicKey: string): void {
  try {
    const normalized = publicKey.trim();
    if (!normalized) {
      return;
    }

    void router.push({ name: 'contacts', params: { pubkey: normalized } });
  } catch (error) {
    reportUiError('Failed to open contact profile from chat', error);
  }
}

function findChatById(chatId: string) {
  return chatStore.chats.find((chat) => chat.id === chatId) ?? null;
}

function handleViewChatProfile(chatId: string): void {
  try {
    const chat = findChatById(chatId);
    if (!chat) {
      return;
    }

    void router.push({ name: 'contacts', params: { pubkey: chat.publicKey } });
  } catch (error) {
    reportUiError('Failed to open profile from chat actions', error);
  }
}

async function handleRefreshChatProfile(chatId: string): Promise<void> {
  try {
    const chat = findChatById(chatId);
    if (!chat) {
      return;
    }

    const nostrStore = await getNostrStore();
    await nostrStore.refreshContactByPublicKey(chat.publicKey, chat.name);
  } catch (error) {
    reportUiError('Failed to refresh chat contact profile', error, 'Failed to refresh profile.');
  }
}

async function refreshChats(
  chatId = '',
  options: {
    lookbackMinutes?: number;
  } = {}
): Promise<void> {
  const nostrStore = await getNostrStore();

  if (typeof options.lookbackMinutes === 'number' && Number.isFinite(options.lookbackMinutes)) {
    await nostrStore.refreshPrivateMessages({
      lookbackMinutes: options.lookbackMinutes
    });
  } else {
    await nostrStore.subscribePrivateMessagesForLoggedInUser(true);
  }
  await chatStore.reload();

  const targetChatId = chatId.trim() || activeChatId.value;
  if (!targetChatId) {
    return;
  }

  const chat = findChatById(targetChatId);
  if (!chat) {
    return;
  }

  await messageStore.loadMessages(targetChatId, true);
}

async function handleRefreshChat(chatId: string): Promise<void> {
  try {
    await refreshChats(chatId);
  } catch (error) {
    reportUiError('Failed to refresh chat', error, 'Failed to refresh chat.');
  }
}

async function handleRefreshChatsForRange(option: ChatRefreshRangeOption): Promise<void> {
  if (option.id === 'custom' || option.lookbackMinutes === null) {
    $q.notify({
      type: 'info',
      message: 'Custom chat refresh range is not implemented yet.',
      position: 'top-right'
    });
    return;
  }

  try {
    selectedChatRefreshRangeId.value = option.id;
    await refreshChats('', {
      lookbackMinutes: option.lookbackMinutes
    });
    $q.notify({
      type: 'positive',
      message: `Chat refresh started for ${option.label.toLowerCase()}.`,
      position: 'top-right'
    });
  } catch (error) {
    reportUiError('Failed to refresh chats for selected range', error, 'Failed to refresh chats.');
  }
}

async function handleAcceptRequest(chatId: string): Promise<void> {
  try {
    const chat = findChatById(chatId);
    await chatStore.acceptChat(chatId);
    if (!chat) {
      return;
    }

    try {
      const nostrStore = await getNostrStore();
      const requestType =
        chat.meta && typeof chat.meta.request_type === 'string'
          ? chat.meta.request_type.trim()
          : '';
      if (requestType === 'group_invite') {
        await nostrStore.ensureGroupInvitePubkeyIsContact(chat.publicKey, chat.name);
      } else {
        await nostrStore.ensureRespondedPubkeyIsContact(chat.publicKey, chat.name);
      }
    } catch (error) {
      console.warn('Failed to add accepted chat to contacts', chat.publicKey, error);
    }
  } catch (error) {
    reportUiError('Failed to accept chat request', error, 'Failed to accept request.');
  }
}

async function handleMuteChat(chatId: string): Promise<void> {
  try {
    await chatStore.muteChat(chatId);
  } catch (error) {
    reportUiError('Failed to mute chat', error);
  }
}

async function handleMarkChatAsRead(chatId: string): Promise<void> {
  try {
    await chatStore.markAsRead(chatId);
  } catch (error) {
    reportUiError('Failed to mark chat as read', error);
  }
}

async function handleDeleteChat(chatId: string): Promise<void> {
  try {
    const isActiveChat = activeChatId.value === chatId;
    const deleted = await chatStore.deleteChat(chatId);
    if (deleted) {
      messageStore.removeChatMessages(chatId);

      if (isActiveChat) {
        if (!isMobile.value) {
          void router.replace(getFallbackChatsRoute());
        } else {
          void router.replace({ name: 'chats' });
        }
      }
    }
  } catch (error) {
    reportUiError('Failed to delete chat', error);
  }
}

async function handleBlockChat(chatId: string): Promise<void> {
  try {
    const isActiveChat = activeChatId.value === chatId;
    await chatStore.blockChat(chatId);

    if (isActiveChat) {
      if (!isMobile.value) {
        void router.replace(getFallbackChatsRoute());
      } else {
        void router.replace({ name: 'chats' });
      }
    }
  } catch (error) {
    reportUiError('Failed to block chat request', error, 'Failed to block request.');
  }
}

function handleBackToChatList(): void {
  try {
    void router.push({ name: 'chats' });
  } catch (error) {
    reportUiError('Failed to navigate back to chat list', error);
  }
}

async function syncChatRoute(): Promise<void> {
  try {
    await chatStore.init();

    if (isRequestsRoute.value) {
      return;
    }

    const chatId = activeChatId.value;
    if (!chatId) {
      if (isMobile.value) {
        return;
      }

      await router.replace(getFallbackChatsRoute());
      return;
    }

    const matchingChat = chatStore.chats.find((chat) => chat.id === chatId) ?? null;
    const isBlockedChat =
      matchingChat !== null &&
      !chatStore.inboxChats.some((chat) => chat.id === chatId) &&
      !chatStore.requestChats.some((chat) => chat.id === chatId);
    if (!matchingChat || isBlockedChat) {
      if (!isMobile.value) {
        await router.replace(getFallbackChatsRoute());
      } else {
        await router.replace({ name: 'chats' });
      }
      return;
    }

    if (chatStore.selectedChatId !== chatId) {
      chatStore.selectChat(chatId);
    }

    await messageStore.init();
    await messageStore.loadMessages(chatId);
  } catch (error) {
    reportUiError('Failed to synchronize chat route', error);
  }
}

watch([activeChatId, isMobile, chatIdSignature, isRequestsRoute], () => {
  void syncChatRoute();
}, { immediate: true });
</script>

<style scoped>
.home-page {
  padding: 0;
  overflow: hidden;
  width: 100%;
  max-width: 100%;
  background: var(--tg-app-background);
}

.home-shell {
  display: grid;
  grid-template-columns: var(--desktop-sidebar-width, 360px) 0px minmax(0, 1fr);
  gap: 0;
  height: 100%;
  min-height: 0;
  width: 100%;
  max-width: 100%;
  background: var(--tg-panel-thread-bg);
}

.home-shell--mobile {
  grid-template-columns: 1fr;
}

.sidebar,
.thread-panel {
  overflow: hidden;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

.sidebar {
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--tg-panel-sidebar-bg);
  border-right: 0;
}

.sidebar-list {
  flex: 1;
  min-height: 0;
}

.sidebar-top {
  padding: 12px;
  border-bottom: 1px solid var(--tg-border);
  background: var(--tg-panel-header-bg);
}

.sidebar-top__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.sidebar-top__row--mobile {
  gap: 8px;
  margin-bottom: 0;
}

.sidebar-top__title {
  font-size: 20px;
  font-weight: 600;
  line-height: 1.2;
}

.sidebar-top__search--mobile {
  flex: 1;
  min-width: 0;
}

.sidebar-top__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  flex-shrink: 0;
}

.sidebar-top__action {
  flex-shrink: 0;
}

.sidebar-top__action:deep(.q-btn-dropdown__arrow) {
  margin-left: 0;
}

body.body--dark .q-btn.sidebar-top__action {
  color: var(--tg-text-secondary) !important;
}

.create-group-dialog {
  width: min(420px, calc(100vw - 32px));
  border-radius: 12px;
}

.create-group-dialog__header {
  padding-bottom: 8px;
}

.create-group-dialog__title {
  font-size: 18px;
  font-weight: 700;
}

.create-group-dialog__actions {
  padding: 0 16px 16px;
}

.thread-panel {
  display: flex;
  min-height: 0;
  min-width: 0;
  width: 100%;
  background: var(--tg-panel-thread-bg);
}

.sidebar-nav {
  border-top: 1px solid var(--tg-border);
}

@media (max-width: 1023px) {
  .sidebar {
    border-right: 0;
  }

  .thread-panel--mobile {
    border-bottom: 0;
  }
}
</style>
