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
import { useMessageStore } from 'src/stores/messageStore';
import { useNostrStore } from 'src/stores/nostrStore';
import { reportUiError } from 'src/utils/uiErrorHandler';

const $q = useQuasar();
const route = useRoute();
const router = useRouter();
const chatStore = useChatStore();
const messageStore = useMessageStore();
const nostrStore = useNostrStore();

const activeChatId = computed(() => String(route.params.chatId ?? ''));

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
      void router.replace({ name: 'chats', params: { chatId: activeChatId.value } });
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

async function handleSend(text: string): Promise<void> {
  try {
    if (!activeChatId.value) {
      return;
    }

    const created = await messageStore.sendMessage(activeChatId.value, text);

    if (created) {
      await chatStore.updateChatPreview(activeChatId.value, created.text, created.sentAt);
    }
  } catch (error) {
    reportUiError('Failed to send message from chat page', error, 'Failed to send message.');
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
