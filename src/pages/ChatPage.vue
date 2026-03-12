<template>
  <q-page class="chat-page">
    <div class="chat-page__thread">
      <ChatThread
        :chat="activeChat"
        :messages="messages"
        :is-initializing="isThreadInitializing"
        :show-back-button="true"
        @send="handleSend"
        @back="goBack"
        @open-profile="handleOpenProfile"
        @react="handleReactToMessage"
        @delete-message="handleDeleteMessage"
        @remove-reaction="handleRemoveReaction"
        @refresh-chat="handleRefreshChat"
      />
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
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

const messages = computed(() => messageStore.getMessages(activeChatId.value));
const isThreadInitializing = computed(() => {
  return !chatStore.isLoaded || nostrStore.isRestoringStartupState;
});

watch(
  activeChatId,
  async (chatId) => {
    await chatStore.init();

    if (!chatId) {
      void router.replace({ name: 'chats' });
      return;
    }

    const exists = chatStore.chats.some((chat) => chat.id === chatId);
    if (!exists) {
      void router.replace({ name: 'chats' });
      return;
    }

    chatStore.selectChat(chatId);
    await messageStore.loadMessages(chatId);
  },
  { immediate: true }
);

watch(
  () => $q.screen.lt.md,
  (isMobile) => {
    if (!isMobile && activeChatId.value) {
      void router.replace({ name: 'chats', params: { pubkey: activeChatId.value } });
    }
  },
  { immediate: true }
);

function goBack(): void {
  try {
    void router.push({ name: 'chats' });
  } catch (error) {
    reportUiError('Failed to navigate back from chat page', error);
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
    reportUiError('Failed to send message from chat page', error, 'Failed to send message.');
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
    reportUiError('Failed to add reaction from chat page', error, 'Failed to add reaction.');
  }
}

async function handleDeleteMessage(message: Message): Promise<void> {
  try {
    await messageStore.deleteMessage(message.chatId, message.id);
  } catch (error) {
    reportUiError('Failed to delete message from chat page', error, 'Failed to delete message.');
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
    reportUiError(
      'Failed to remove reaction from chat page',
      error,
      'Failed to remove reaction.'
    );
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
    reportUiError('Failed to open profile from chat page', error);
  }
}

async function handleRefreshChat(chatId: string): Promise<void> {
  try {
    if (!chatId || chatId !== activeChatId.value) {
      return;
    }

    await nostrStore.subscribePrivateMessagesForLoggedInUser(true);
    await chatStore.reload();
    await messageStore.loadMessages(chatId, true);
  } catch (error) {
    reportUiError('Failed to refresh chat from chat page', error, 'Failed to refresh chat.');
  }
}
</script>

<style scoped>
.chat-page {
  display: flex;
  flex-direction: column;
  height: calc(100vh - env(safe-area-inset-top));
  padding: 10px;
}

.chat-page__thread {
  flex: 1;
  border: 1px solid var(--tg-border);
  border-radius: 16px;
  overflow: hidden;
}

@media (min-width: 1024px) {
  .chat-page {
    display: none;
  }
}

@media (max-width: 1023px) {
  .chat-page {
    padding: 0;
  }

  .chat-page__thread {
    border-radius: 0;
    border-left: 0;
    border-right: 0;
    border-bottom: 0;
  }
}
</style>
