<template>
  <q-page class="home-page" :style-fn="homePageStyleFn">
    <div class="home-shell" :class="{ 'home-shell--mobile': isMobile }">
      <aside v-if="!isMobile" class="rail-panel">
        <AppNavRail active="chats" @select="handleRailSelect" />
      </aside>

      <aside v-if="!isMobile || !isMobileThreadOpen" class="sidebar">
        <div class="sidebar-top">
          <div class="sidebar-top__row">
            <div class="sidebar-top__title">Chats</div>
          </div>

          <q-input
            v-model="searchQuery"
            class="tg-input"
            dense
            outlined
            rounded
            placeholder="Search"
          />
        </div>

        <ChatList
          class="sidebar-list"
          :chats="chatStore.chats"
          :selected-chat-id="selectedChatId"
          @select="handleSelectChat"
          @view-profile="handleViewChatProfile"
          @refresh-profile="handleRefreshChatProfile"
          @refresh-chat="handleRefreshChat"
          @mute="handleMuteChat"
          @mark-as-read="handleMarkChatAsRead"
          @delete-chat="handleDeleteChat"
        />
      </aside>

      <section
        v-if="!isMobile || isMobileThreadOpen"
        class="thread-panel"
        :class="{ 'thread-panel--mobile': isMobile }"
      >
      <ChatThread
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
        @refresh-chat="handleRefreshChat"
      />
      </section>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import AppNavRail from 'src/components/AppNavRail.vue';
import ChatList from 'src/components/ChatList.vue';
import ChatThread from 'src/components/ChatThread.vue';
import { useChatStore } from 'src/stores/chatStore';
import {
  isMissingContactRelaysError,
  useMessageStore
} from 'src/stores/messageStore';
import { useNostrStore } from 'src/stores/nostrStore';
import { useRelayStore } from 'src/stores/relayStore';
import type { Message, MessageReaction, MessageReplyPreview } from 'src/types/chat';
import { resolveContactAppRelayFallback } from 'src/utils/messageRelayFallback';
import { reportUiError } from 'src/utils/uiErrorHandler';

const $q = useQuasar();
const route = useRoute();
const router = useRouter();
const chatStore = useChatStore();
const messageStore = useMessageStore();
const nostrStore = useNostrStore();
const relayStore = useRelayStore();

relayStore.init();

const isMobile = computed(() => $q.screen.lt.md);
const visibleViewportHeight = ref<number | null>(null);
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
const selectedChatId = computed(() => activeChatId.value || null);
const isMobileThreadOpen = computed(() => isMobile.value && Boolean(activeChatId.value));
const chatIdSignature = computed(() => chatStore.chats.map((chat) => chat.id).join('|'));
const isThreadInitializing = computed(() => {
  return !chatStore.isLoaded || nostrStore.isRestoringStartupState;
});

const currentMessages = computed(() => {
  return messageStore.getMessages(activeChatId.value || null);
});

const searchQuery = computed({
  get: () => chatStore.searchQuery,
  set: (value: string) => chatStore.setSearchQuery(value)
});

function getVisibleViewportHeight(fallbackHeight: number): number {
  if (typeof window === 'undefined') {
    return fallbackHeight;
  }

  return Math.round(window.visualViewport?.height ?? window.innerHeight ?? fallbackHeight);
}

function updateVisibleViewportHeight(): void {
  visibleViewportHeight.value = getVisibleViewportHeight($q.screen.height);
}

function homePageStyleFn(offset: number, height: number): Record<string, string> {
  const pageHeight = Math.max((visibleViewportHeight.value ?? height) - offset, 0);

  return {
    height: `${pageHeight}px`,
    minHeight: `${pageHeight}px`
  };
}

function handleRailSelect(section: 'chats' | 'contacts' | 'settings'): void {
  try {
    if (section === 'contacts') {
      void router.push({ name: 'contacts' });
      return;
    }

    if (section === 'settings') {
      void router.push({ name: 'settings' });
    }
  } catch (error) {
    reportUiError('Failed to navigate from chats rail', error);
  }
}

function handleSelectChat(chatId: string): void {
  try {
    void router.push({ name: 'chats', params: { pubkey: chatId } });
  } catch (error) {
    reportUiError('Failed to select chat', error);
  }
}

async function resolveFallbackRelayUrls(chatPublicKey: string): Promise<string[] | null> {
  return resolveContactAppRelayFallback($q, chatPublicKey, relayStore.relays);
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

    await nostrStore.refreshContactByPublicKey(chat.publicKey, chat.name);
  } catch (error) {
    reportUiError('Failed to refresh chat contact profile', error, 'Failed to refresh profile.');
  }
}

async function handleRefreshChat(chatId: string): Promise<void> {
  try {
    const chat = findChatById(chatId);
    if (!chat) {
      return;
    }

    await nostrStore.subscribePrivateMessagesForLoggedInUser(true);
    await chatStore.reload();
    await messageStore.loadMessages(chatId, true);
  } catch (error) {
    reportUiError('Failed to refresh chat', error, 'Failed to refresh chat.');
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
        const nextChatId = !isMobile.value ? chatStore.selectedChatId : null;
        if (nextChatId) {
          void router.replace({ name: 'chats', params: { pubkey: nextChatId } });
        } else {
          void router.replace({ name: 'chats' });
        }
      }
    }
  } catch (error) {
    reportUiError('Failed to delete chat', error);
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
    await Promise.all([chatStore.init(), messageStore.init()]);

    const chatId = activeChatId.value;
    if (!chatId) {
      if (isMobile.value) {
        return;
      }

      const fallbackChatId = chatStore.chats[0]?.id ?? '';
      if (fallbackChatId) {
        await router.replace({ name: 'chats', params: { pubkey: fallbackChatId } });
      }
      return;
    }

    const matchingChat = chatStore.chats.find((chat) => chat.id === chatId) ?? null;
    if (!matchingChat) {
      const fallbackChatId = !isMobile.value ? chatStore.chats[0]?.id ?? '' : '';
      if (fallbackChatId) {
        await router.replace({ name: 'chats', params: { pubkey: fallbackChatId } });
      } else {
        await router.replace({ name: 'chats' });
      }
      return;
    }

    if (chatStore.selectedChatId !== chatId) {
      chatStore.selectChat(chatId);
    }

    await messageStore.loadMessages(chatId);
  } catch (error) {
    reportUiError('Failed to synchronize chat route', error);
  }
}

watch([activeChatId, isMobile, chatIdSignature], () => {
  void syncChatRoute();
}, { immediate: true });

onMounted(() => {
  updateVisibleViewportHeight();

  const visualViewport = window.visualViewport;
  window.addEventListener('resize', updateVisibleViewportHeight);
  window.addEventListener('orientationchange', updateVisibleViewportHeight);
  visualViewport?.addEventListener('resize', updateVisibleViewportHeight);
  visualViewport?.addEventListener('scroll', updateVisibleViewportHeight);
});

onBeforeUnmount(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const visualViewport = window.visualViewport;
  window.removeEventListener('resize', updateVisibleViewportHeight);
  window.removeEventListener('orientationchange', updateVisibleViewportHeight);
  visualViewport?.removeEventListener('resize', updateVisibleViewportHeight);
  visualViewport?.removeEventListener('scroll', updateVisibleViewportHeight);
});
</script>

<style scoped>
.home-page {
  padding: 12px;
  overflow: hidden;
  width: 100%;
  max-width: 100%;
}

.home-shell {
  display: grid;
  grid-template-columns: 76px 340px minmax(0, 1fr);
  gap: 12px;
  height: 100%;
  min-height: 0;
  width: 100%;
  max-width: 100%;
}

.home-shell--mobile {
  grid-template-columns: 1fr;
}

.rail-panel,
.sidebar,
.thread-panel {
  border: 1px solid color-mix(in srgb, var(--tg-border) 88%, #8ea4c0 12%);
  border-radius: 18px;
  overflow: hidden;
  background: var(--tg-panel-sidebar-bg);
  box-shadow: var(--tg-shadow-sm);
}

.rail-panel {
  background: var(--tg-panel-rail-bg);
}

.sidebar {
  display: flex;
  flex-direction: column;
}

.sidebar-list {
  flex: 1;
  min-height: 0;
}

.sidebar-top {
  padding: 13px;
  border-bottom: 1px solid color-mix(in srgb, var(--tg-border) 90%, #8fa5c1 10%);
  background: var(--tg-panel-header-bg);
  backdrop-filter: blur(10px);
}

.sidebar-top__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.sidebar-top__title {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.1;
}

.thread-panel {
  display: flex;
  min-height: 0;
  min-width: 0;
  width: 100%;
  background: var(--tg-panel-thread-bg);
}

@media (max-width: 1023px) {
  .home-page {
    padding: 0;
  }

  .sidebar {
    border-radius: 0;
    border-left: 0;
    border-right: 0;
  }

  .thread-panel--mobile {
    border-radius: 0;
    border-left: 0;
    border-right: 0;
    border-bottom: 0;
  }
}
</style>
