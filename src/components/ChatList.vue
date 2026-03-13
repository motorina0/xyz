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
  margin: 10px 8px 6px;
  border-radius: 16px;
  border: 1px dashed color-mix(in srgb, var(--tg-border) 82%, #94a3b8 18%);
  background:
    linear-gradient(140deg, rgba(148, 163, 184, 0.08), rgba(148, 163, 184, 0.03)),
    color-mix(in srgb, var(--tg-panel-thread-bg) 92%, #f8fafc 8%);
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease,
    box-shadow 0.2s ease;
}

.requests-row:hover {
  border-color: color-mix(in srgb, var(--tg-border) 66%, #64748b 34%);
  box-shadow: 0 10px 18px rgba(15, 23, 42, 0.08);
}

.requests-row--active {
  border-style: solid;
  border-color: color-mix(in srgb, #2563eb 28%, var(--tg-border) 72%);
  background:
    linear-gradient(140deg, rgba(59, 130, 246, 0.14), rgba(148, 163, 184, 0.08)),
    color-mix(in srgb, var(--tg-panel-thread-bg) 90%, #eff6ff 10%);
}

.requests-row__icon-shell {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  color: #475569;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(148, 163, 184, 0.26);
}

.requests-row__main {
  min-width: 0;
}

.requests-row__title {
  font-weight: 700;
}

.requests-row__count {
  color: color-mix(in srgb, currentColor 70%, #64748b 30%);
}

.requests-row__caption {
  color: color-mix(in srgb, currentColor 64%, #64748b 36%);
}

body.body--dark .requests-row {
  border-color: color-mix(in srgb, var(--tg-border) 80%, #70839c 20%);
  background:
    linear-gradient(140deg, rgba(71, 85, 105, 0.24), rgba(71, 85, 105, 0.12)),
    color-mix(in srgb, var(--tg-panel-thread-bg) 94%, #0f172a 6%);
}

body.body--dark .requests-row:hover {
  box-shadow: 0 10px 22px rgba(2, 6, 23, 0.36);
}

body.body--dark .requests-row--active {
  border-color: color-mix(in srgb, #60a5fa 34%, var(--tg-border) 66%);
  background:
    linear-gradient(140deg, rgba(37, 99, 235, 0.24), rgba(71, 85, 105, 0.18)),
    color-mix(in srgb, var(--tg-panel-thread-bg) 92%, #172554 8%);
}

body.body--dark .requests-row__icon-shell {
  color: #dbe7f6;
  background: rgba(15, 23, 42, 0.58);
  border-color: rgba(148, 163, 184, 0.18);
}
</style>
