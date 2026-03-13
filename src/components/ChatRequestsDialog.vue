<template>
  <AppDialog
    :model-value="modelValue"
    title="Requests"
    subtitle="First-contact chats stay here until you reply or accept them."
    max-width="560px"
    body-class="requests-dialog__body"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div v-if="requests.length === 0" class="requests-dialog__empty">
      <div class="requests-dialog__empty-title">No pending requests</div>
      <div class="requests-dialog__empty-copy">Unknown inbound chats will appear here.</div>
    </div>

    <q-scroll-area v-else class="requests-dialog__scroll">
      <div class="requests-dialog__list">
        <ChatRequestItem
          v-for="chat in requests"
          :key="chat.id"
          :chat="chat"
          @open="emit('open', $event)"
          @accept="emit('accept', $event)"
          @delete-chat="emit('delete-chat', $event)"
          @block="emit('block', $event)"
        />
      </div>
    </q-scroll-area>
  </AppDialog>
</template>

<script setup lang="ts">
import AppDialog from 'src/components/AppDialog.vue';
import ChatRequestItem from 'src/components/ChatRequestItem.vue';
import type { Chat } from 'src/types/chat';

defineProps<{
  modelValue: boolean;
  requests: Chat[];
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void;
  (event: 'open', chatId: string): void;
  (event: 'accept', chatId: string): void;
  (event: 'delete-chat', chatId: string): void;
  (event: 'block', chatId: string): void;
}>();
</script>

<style scoped>
.requests-dialog__body {
  padding-top: 12px;
}

.requests-dialog__scroll {
  max-height: min(62vh, 560px);
}

.requests-dialog__list {
  display: grid;
  gap: 12px;
}

.requests-dialog__empty {
  padding: 18px 6px 10px;
  text-align: center;
}

.requests-dialog__empty-title {
  font-family: var(--tg-title-font);
  font-size: 16px;
  font-weight: 700;
}

.requests-dialog__empty-copy {
  margin-top: 6px;
  color: color-mix(in srgb, currentColor 68%, #64748b 32%);
}
</style>
