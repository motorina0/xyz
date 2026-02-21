<template>
  <q-page class="contacts-page">
    <div class="contacts-shell" :class="{ 'contacts-shell--mobile': isMobile }">
      <aside v-if="!isMobile" class="rail-panel">
        <AppNavRail active="contacts" @select="handleRailSelect" />
      </aside>

      <aside class="contacts-sidebar">
        <div class="contacts-sidebar__top">
          <div class="contacts-sidebar__row">
            <div class="contacts-sidebar__title">Contacts</div>
            <q-btn
              dense
              flat
              round
              icon="person_add_alt"
              aria-label="Add Contact"
            >
              <q-tooltip>Add Contact</q-tooltip>
            </q-btn>
          </div>

          <q-input
            v-model="contactQuery"
            dense
            outlined
            rounded
            placeholder="Filter contacts"
          />
        </div>

        <q-scroll-area class="contacts-list">
          <q-list>
            <q-item
              v-for="contact in filteredContacts"
              :key="contact.id"
              clickable
              class="contact-item"
              :active="contact.id === chatStore.selectedChatId"
              active-class="contact-item--active"
              @click="handleSelectContact(contact.id)"
            >
              <q-item-section avatar>
                <q-avatar color="primary" text-color="white">{{ contact.avatar }}</q-avatar>
              </q-item-section>

              <q-item-section>
                <q-item-label class="contact-item__name">{{ contact.name }}</q-item-label>
              </q-item-section>
            </q-item>

            <div v-if="filteredContacts.length === 0" class="contacts-empty">
              No contacts found.
            </div>
          </q-list>
        </q-scroll-area>
      </aside>

      <section v-if="!isMobile" class="contacts-thread-panel">
        <ChatThread :chat="chatStore.selectedChat" :messages="currentMessages" @send="handleSend" />
      </section>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import AppNavRail from 'src/components/AppNavRail.vue';
import ChatThread from 'src/components/ChatThread.vue';
import { useChatStore } from 'src/stores/chatStore';
import { useMessageStore } from 'src/stores/messageStore';

const $q = useQuasar();
const router = useRouter();
const chatStore = useChatStore();
const messageStore = useMessageStore();

const isMobile = computed(() => $q.screen.lt.md);
const contactQuery = ref('');

const sortedContacts = computed(() => {
  return [...chatStore.chats].sort((first, second) => first.name.localeCompare(second.name));
});

const filteredContacts = computed(() => {
  const query = contactQuery.value.trim().toLowerCase();

  if (!query) {
    return sortedContacts.value;
  }

  return sortedContacts.value.filter((contact) => contact.name.toLowerCase().includes(query));
});

const currentMessages = computed(() => messageStore.getMessages(chatStore.selectedChatId));

function handleRailSelect(section: 'chats' | 'contacts' | 'settings'): void {
  if (section === 'chats') {
    void router.push({ name: 'home' });
    return;
  }

  if (section === 'settings') {
    void router.push({ name: 'settings-profile' });
  }
}

function handleSelectContact(chatId: string): void {
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
.contacts-page {
  height: calc(100vh - env(safe-area-inset-top));
  padding: 10px;
}

.contacts-shell {
  display: grid;
  grid-template-columns: 88px 340px minmax(0, 1fr);
  gap: 10px;
  height: 100%;
}

.contacts-shell--mobile {
  grid-template-columns: 1fr;
}

.rail-panel,
.contacts-sidebar,
.contacts-thread-panel {
  border: 1px solid var(--tg-border);
  border-radius: 16px;
  overflow: hidden;
  background: var(--tg-sidebar);
}

.rail-panel {
  background: var(--tg-rail);
}

.contacts-sidebar {
  display: flex;
  flex-direction: column;
}

.contacts-sidebar__top {
  padding: 12px;
  border-bottom: 1px solid var(--tg-border);
}

.contacts-sidebar__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.contacts-sidebar__title {
  font-size: 22px;
  font-weight: 700;
}

.contacts-list {
  flex: 1;
}

.contact-item {
  border-radius: 12px;
  margin: 4px 8px;
}

.contact-item__name {
  font-weight: 600;
}

.contact-item--active {
  background: rgba(55, 119, 245, 0.12);
}

.contacts-empty {
  padding: 14px;
  text-align: center;
  opacity: 0.7;
}

@media (max-width: 1023px) {
  .contacts-page {
    padding: 0;
  }

  .contacts-sidebar {
    border-radius: 0;
    border-left: 0;
    border-right: 0;
    border-top: 0;
  }
}
</style>
