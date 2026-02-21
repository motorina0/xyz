<template>
  <q-scroll-area class="chat-list-scroll">
    <q-list>
      <ChatItem
        v-for="chat in chats"
        :key="chat.id"
        :chat="chat"
        :active="chat.id === selectedChatId"
        @select="$emit('select', $event)"
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
}>();
</script>

<style scoped>
.chat-list-scroll {
  height: 100%;
}
</style>
