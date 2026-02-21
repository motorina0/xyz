<template>
  <q-page class="home-page">
    <div class="home-shell" :class="{ 'home-shell--mobile': isMobile }">
      <aside class="sidebar">
        <div class="sidebar-top">
          <div class="sidebar-top__row">
            <div class="sidebar-top__title">Chats</div>
            <q-btn
              dense
              flat
              no-caps
              :label="$q.dark.isActive ? 'Light' : 'Dark'"
              @click="toggleDarkMode"
            />
          </div>

          <q-input
            v-model="searchQuery"
            dense
            outlined
            rounded
            placeholder="Search"
          />
        </div>

        <ChatList
          class="sidebar-list"
          :chats="chatStore.chats"
          :selected-chat-id="chatStore.selectedChatId"
          @select="handleSelectChat"
        />
      </aside>

      <section v-if="!isMobile" class="thread-panel">
        <ChatThread :chat="chatStore.selectedChat" :messages="currentMessages" @send="handleSend" />
      </section>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import ChatList from 'src/components/ChatList.vue';
import ChatThread from 'src/components/ChatThread.vue';
import { useChatStore } from 'src/stores/chatStore';
import { useMessageStore } from 'src/stores/messageStore';

const $q = useQuasar();
const router = useRouter();
const chatStore = useChatStore();
const messageStore = useMessageStore();

const isMobile = computed(() => $q.screen.lt.md);

const currentMessages = computed(() => {
  return messageStore.getMessages(chatStore.selectedChatId);
});

const searchQuery = computed({
  get: () => chatStore.searchQuery,
  set: (value: string) => chatStore.setSearchQuery(value)
});

function toggleDarkMode(): void {
  $q.dark.toggle();
}

function handleSelectChat(chatId: string): void {
  chatStore.selectChat(chatId);

  if (isMobile.value) {
    void router.push({ name: 'chat', params: { chatId } });
  }
}

function handleSend(text: string): void {
  if (!chatStore.selectedChatId) {
    return;
  }

  const created = messageStore.sendMessage(chatStore.selectedChatId, text);

  if (created) {
    chatStore.updateChatPreview(chatStore.selectedChatId, created.text, created.sentAt);
  }
}
</script>

<style scoped>
.home-page {
  height: calc(100vh - env(safe-area-inset-top));
  padding: 10px;
}

.home-shell {
  display: grid;
  grid-template-columns: 340px 1fr;
  gap: 10px;
  height: 100%;
}

.home-shell--mobile {
  grid-template-columns: 1fr;
}

.sidebar,
.thread-panel {
  border: 1px solid var(--tg-border);
  border-radius: 16px;
  overflow: hidden;
  background: var(--tg-sidebar);
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
  padding: 12px;
  border-bottom: 1px solid var(--tg-border);
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
}
</style>
