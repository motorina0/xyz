<template>
  <q-scroll-area class="chat-list-scroll">
    <q-list>
      <ChatItem
        v-for="chat in chats"
        :key="chat.id"
        :chat="chat"
        :active="chat.id === selectedChatId"
        @select="$emit('select', $event)"
        @view-profile="$emit('view-profile', $event)"
        @refresh-profile="$emit('refresh-profile', $event)"
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

defineProps<{
  chats: Chat[];
  selectedChatId: string | null;
}>();

defineEmits<{
  (event: 'select', chatId: string): void;
  (event: 'view-profile', chatId: string): void;
  (event: 'refresh-profile', chatId: string): void;
  (event: 'mute', chatId: string): void;
  (event: 'mark-as-read', chatId: string): void;
  (event: 'delete-chat', chatId: string): void;
}>();
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
</style>
