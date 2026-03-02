<template>
  <q-page class="chat-page">
    <div class="chat-page__thread">
      <ChatThread
        :chat="activeChat"
        :messages="messages"
        :show-back-button="true"
        @send="handleSend"
        @back="goBack"
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

const $q = useQuasar();
const route = useRoute();
const router = useRouter();
const chatStore = useChatStore();
const messageStore = useMessageStore();

const activeChatId = computed(() => String(route.params.chatId ?? ''));

const activeChat = computed(() => {
  return chatStore.chats.find((chat) => chat.id === activeChatId.value) ?? null;
});

const messages = computed(() => messageStore.getMessages(activeChatId.value));

watch(
  activeChatId,
  async (chatId) => {
    await chatStore.init();

    if (!chatId) {
      void router.replace({ name: 'home' });
      return;
    }

    const exists = chatStore.chats.some((chat) => chat.id === chatId);
    if (!exists) {
      void router.replace({ name: 'home' });
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
      void router.replace({ name: 'home' });
    }
  },
  { immediate: true }
);

function goBack(): void {
  void router.push({ name: 'home' });
}

async function handleSend(text: string): Promise<void> {
  if (!activeChatId.value) {
    return;
  }

  const created = await messageStore.sendMessage(activeChatId.value, text);

  if (created) {
    await chatStore.updateChatPreview(activeChatId.value, created.text, created.sentAt);
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
