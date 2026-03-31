<template>
  <q-scroll-area class="chat-list-scroll">
    <q-list>
      <q-item
        v-if="showRequestsRow"
        clickable
        class="requests-row"
        :active="requestsActive"
        active-class="requests-row--active"
        @click="$emit('open-requests')"
      >
        <q-item-section avatar>
          <div class="requests-row__icon-shell" aria-hidden="true">
            <q-icon name="mark_email_unread" size="18px" />
          </div>
        </q-item-section>

        <q-item-section class="requests-row__main">
          <q-item-label class="requests-row__title">
            Requests <span class="requests-row__count">({{ formatRequestCount(requestCount) }})</span>
          </q-item-label>
          <q-item-label caption class="requests-row__caption" lines="1">
            Unknown inbound chats stay here until you reply or accept.
          </q-item-label>
        </q-item-section>
      </q-item>

      <ChatItem
        v-for="chat in chats"
        :key="chat.id"
        :chat="chat"
        :active="chat.id === selectedChatId"
        @select="$emit('select', $event)"
        @view-profile="$emit('view-profile', $event)"
        @refresh-profile="$emit('refresh-profile', $event)"
        @refresh-chat="$emit('refresh-chat', $event)"
        @mute="$emit('mute', $event)"
        @mark-as-read="$emit('mark-as-read', $event)"
        @delete-chat="$emit('delete-chat', $event)"
      />
    </q-list>
  </q-scroll-area>
</template>

<script setup lang="ts">
import ChatItem from 'src/components/ChatItem.vue';
import type { Chat } from 'src/types/chat';

const props = withDefaults(defineProps<{
  chats: Chat[];
  selectedChatId: string | null;
  showRequestsRow?: boolean;
  requestCount?: number;
  requestsActive?: boolean;
}>(), {
  showRequestsRow: false,
  requestCount: 0,
  requestsActive: false
});

defineEmits<{
  (event: 'select', chatId: string): void;
  (event: 'view-profile', chatId: string): void;
  (event: 'refresh-profile', chatId: string): void;
  (event: 'refresh-chat', chatId: string): void;
  (event: 'mute', chatId: string): void;
  (event: 'mark-as-read', chatId: string): void;
  (event: 'delete-chat', chatId: string): void;
  (event: 'open-requests'): void;
}>();

function formatRequestCount(value: number): string {
  const normalizedCount = Math.max(0, Math.floor(props.requestCount));
  return normalizedCount > 99 ? '99+' : String(normalizedCount);
}
</script>

<style scoped>
.chat-list-scroll {
  height: 100%;
  overflow-x: hidden;
}

.chat-list-scroll :deep(.q-scrollarea__container),
.chat-list-scroll :deep(.q-scrollarea__content),
.chat-list-scroll :deep(.q-list) {
  overflow-x: hidden !important;
  min-width: 0;
  width: 100%;
}

.requests-row {
  margin: 0;
  min-height: 56px;
  padding: 0 12px;
  border-radius: 0;
  border-bottom: 1px solid var(--tg-border);
  background: var(--tg-surface-soft);
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease;
}

.requests-row:hover {
  background: var(--tg-hover);
}

.requests-row--active {
  border-color: var(--tg-border);
  background: var(--tg-active);
  color: var(--tg-active-text);
}

.requests-row__icon-shell {
  width: 42px;
  height: 42px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  color: var(--tg-text);
  background: var(--tg-surface-soft-strong);
  border: 0;
}

.requests-row__main {
  min-width: 0;
}

.requests-row__title {
  font-weight: 600;
}

.requests-row__count {
  color: var(--tg-text-secondary);
}

.requests-row__caption {
  color: var(--tg-text-secondary);
}

.requests-row--active .requests-row__count,
.requests-row--active .requests-row__caption {
  color: var(--tg-active-subtext);
}

.requests-row--active .requests-row__icon-shell {
  color: var(--tg-active-text);
  background: rgba(255, 255, 255, 0.18);
}
</style>
