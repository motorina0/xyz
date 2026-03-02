<template>
  <q-item
    clickable
    class="chat-item"
    :active="active"
    active-class="chat-item--active"
    @click="$emit('select', chat.id)"
  >
    <q-item-section avatar>
      <CachedAvatar :src="avatarImageUrl" :alt="chatTitle" :fallback="chat.avatar" />
    </q-item-section>

    <q-item-section>
      <q-item-label class="chat-item__name">{{ chatTitle }}</q-item-label>
      <q-item-label caption lines="1">{{ chat.lastMessage }}</q-item-label>
    </q-item-section>

    <q-item-section side top>
      <q-item-label caption>{{ formattedTime }}</q-item-label>
      <q-badge v-if="chat.unreadCount > 0" rounded color="primary" class="q-mt-xs">
        {{ chat.unreadCount }}
      </q-badge>
    </q-item-section>
  </q-item>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Chat } from 'src/types/chat';
import CachedAvatar from 'src/components/CachedAvatar.vue';

const props = defineProps<{
  chat: Chat;
  active: boolean;
}>();

defineEmits<{
  (event: 'select', chatId: string): void;
}>();

function readMetaString(key: string): string {
  const value = props.chat.meta[key];
  return typeof value === 'string' ? value.trim() : '';
}

function chatPubkeySnippet(value: string): string {
  return value.trim().slice(0, 32);
}

const formattedTime = computed(() => {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(props.chat.lastMessageAt));
});

const chatTitle = computed(() => {
  const givenName = readMetaString('given_name');
  if (givenName) {
    return givenName;
  }

  const contactName = readMetaString('contact_name');
  if (contactName) {
    return contactName;
  }

  const name = props.chat.name.trim();
  if (name) {
    return name;
  }

  return chatPubkeySnippet(props.chat.publicKey);
});

const avatarImageUrl = computed(() => {
  const picture = props.chat.meta.picture;
  if (typeof picture === 'string' && picture.trim()) {
    return picture.trim();
  }

  return '';
});
</script>

<style scoped>
.chat-item {
  border-radius: 12px;
  margin: 4px 8px;
  transition: background-color 0.2s ease, transform 0.2s ease;
}

.chat-item:hover {
  transform: translateX(2px);
  background: rgba(55, 119, 245, 0.07);
}

.chat-item--active {
  background: rgba(55, 119, 245, 0.12);
}

.chat-item__name {
  font-weight: 600;
}
</style>
