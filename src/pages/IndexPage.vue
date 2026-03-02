<template>
  <q-page class="home-page">
    <div class="home-shell" :class="{ 'home-shell--mobile': isMobile }">
      <aside v-if="!isMobile" class="rail-panel">
        <AppNavRail active="chats" @select="handleRailSelect" />
      </aside>

      <aside class="sidebar">
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
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import AppNavRail from 'src/components/AppNavRail.vue';
import ChatList from 'src/components/ChatList.vue';
import ChatThread from 'src/components/ChatThread.vue';
import { useChatStore } from 'src/stores/chatStore';
import { useMessageStore } from 'src/stores/messageStore';

const $q = useQuasar();
const router = useRouter();
const chatStore = useChatStore();
const messageStore = useMessageStore();

const isMobile = computed(() => $q.screen.lt.md);

onMounted(() => {
  void chatStore.init();
  void messageStore.init();
});

const currentMessages = computed(() => {
  return messageStore.getMessages(chatStore.selectedChatId);
});

const searchQuery = computed({
  get: () => chatStore.searchQuery,
  set: (value: string) => chatStore.setSearchQuery(value)
});

function handleRailSelect(section: 'chats' | 'contacts' | 'settings'): void {
  if (section === 'contacts') {
    void router.push({ name: 'contacts' });
    return;
  }

  if (section === 'settings') {
    void router.push({ name: 'settings' });
  }
}

function handleSelectChat(chatId: string): void {
  chatStore.selectChat(chatId);

  if (isMobile.value) {
    void router.push({ name: 'chat', params: { chatId } });
  }
}

async function handleSend(text: string): Promise<void> {
  if (!chatStore.selectedChatId) {
    return;
  }

  const created = await messageStore.sendMessage(chatStore.selectedChatId, text);

  if (created) {
    await chatStore.updateChatPreview(chatStore.selectedChatId, created.text, created.sentAt);
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
  grid-template-columns: 88px 340px minmax(0, 1fr);
  gap: 10px;
  height: 100%;
}

.home-shell--mobile {
  grid-template-columns: 1fr;
}

.rail-panel,
.sidebar,
.thread-panel {
  border: 1px solid var(--tg-border);
  border-radius: 16px;
  overflow: hidden;
  background: var(--tg-sidebar);
}

.rail-panel {
  background: var(--tg-rail);
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
