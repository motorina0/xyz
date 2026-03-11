<template>
  <q-item
    clickable
    class="chat-item"
    :active="active"
    active-class="chat-item--active"
    @click="handleSelectChat"
  >
    <q-item-section avatar>
      <CachedAvatar :src="avatarImageUrl" :alt="chatTitle" :fallback="chat.avatar" />
    </q-item-section>

    <q-item-section class="chat-item__main">
      <q-item-label class="chat-item__name" lines="1">{{ chatTitle }}</q-item-label>
      <q-item-label class="chat-item__caption" caption lines="1">{{ chat.lastMessage }}</q-item-label>
    </q-item-section>

    <q-item-section side top class="chat-item__meta">
      <q-item-label caption>{{ formattedTime }}</q-item-label>
      <q-badge v-if="chat.unreadCount > 0" rounded color="primary" class="q-mt-xs">
        {{ chat.unreadCount }}
      </q-badge>
    </q-item-section>

    <q-item-section side>
      <q-btn
        flat
        dense
        round
        icon="more_vert"
        class="chat-item__more"
        aria-label="Chat actions"
        @click.stop
      >
        <q-menu anchor="bottom right" self="top right" class="tg-pop-menu">
          <q-list dense class="tg-pop-menu__list">
            <q-item clickable v-close-popup @click="emitViewProfile">
              <q-item-section>View Profile</q-item-section>
            </q-item>
            <q-item clickable v-close-popup @click="emitRefreshProfile">
              <q-item-section>Refresh Profile</q-item-section>
            </q-item>
            <q-item clickable v-close-popup @click="emitRefreshChat">
              <q-item-section>Refresh Chat</q-item-section>
            </q-item>
            <q-item clickable v-close-popup :disable="isMuted" @click="emitMute">
              <q-item-section>Mute</q-item-section>
            </q-item>
            <q-item clickable v-close-popup @click="emitMarkAsRead">
              <q-item-section>Mark as Read</q-item-section>
            </q-item>
            <q-item clickable v-close-popup @click="emitDeleteChat">
              <q-item-section class="text-negative">Delete Chat</q-item-section>
            </q-item>
          </q-list>
        </q-menu>
      </q-btn>
    </q-item-section>
  </q-item>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Chat } from 'src/types/chat';
import CachedAvatar from 'src/components/CachedAvatar.vue';
import { useNostrStore } from 'src/stores/nostrStore';
import { reportUiError } from 'src/utils/uiErrorHandler';

const props = defineProps<{
  chat: Chat;
  active: boolean;
}>();

const emit = defineEmits<{
  (event: 'select', chatId: string): void;
  (event: 'view-profile', chatId: string): void;
  (event: 'refresh-profile', chatId: string): void;
  (event: 'refresh-chat', chatId: string): void;
  (event: 'mute', chatId: string): void;
  (event: 'mark-as-read', chatId: string): void;
  (event: 'delete-chat', chatId: string): void;
}>();

const nostrStore = useNostrStore();

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
  const loggedInPubkey = nostrStore.getLoggedInPublicKeyHex();
  if (loggedInPubkey && props.chat.publicKey.trim().toLowerCase() === loggedInPubkey) {
    return 'My Self';
  }

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

const isMuted = computed(() => props.chat.meta.muted === true);

function handleSelectChat(): void {
  try {
    emit('select', props.chat.id);
  } catch (error) {
    reportUiError('Failed to select chat item', error);
  }
}

function emitViewProfile(): void {
  try {
    emit('view-profile', props.chat.id);
  } catch (error) {
    reportUiError('Failed to emit chat profile action', error);
  }
}

function emitRefreshProfile(): void {
  try {
    emit('refresh-profile', props.chat.id);
  } catch (error) {
    reportUiError('Failed to emit chat refresh action', error);
  }
}

function emitRefreshChat(): void {
  try {
    emit('refresh-chat', props.chat.id);
  } catch (error) {
    reportUiError('Failed to emit chat reload action', error);
  }
}

function emitMute(): void {
  try {
    emit('mute', props.chat.id);
  } catch (error) {
    reportUiError('Failed to emit chat mute action', error);
  }
}

function emitMarkAsRead(): void {
  try {
    emit('mark-as-read', props.chat.id);
  } catch (error) {
    reportUiError('Failed to emit mark-as-read action', error);
  }
}

function emitDeleteChat(): void {
  try {
    emit('delete-chat', props.chat.id);
  } catch (error) {
    reportUiError('Failed to emit chat delete action', error);
  }
}
</script>

<style scoped>
.chat-item {
  min-width: 0;
  border-radius: 14px;
  margin: 6px 8px;
  border: 1px solid transparent;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.chat-item:hover {
  background: linear-gradient(130deg, rgba(52, 137, 255, 0.1), rgba(28, 186, 137, 0.08));
  border-color: color-mix(in srgb, var(--tg-border) 78%, #8aa5c5 22%);
  box-shadow: 0 8px 16px rgba(53, 110, 186, 0.1);
}

.chat-item--active {
  background: linear-gradient(130deg, rgba(52, 137, 255, 0.18), rgba(28, 186, 137, 0.14));
  border-color: rgba(56, 136, 255, 0.34);
  box-shadow: 0 10px 20px rgba(53, 110, 186, 0.14);
}

.chat-item__name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-item__caption {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-item__main {
  flex: 1 1 auto;
  min-width: 0;
}

.chat-item__meta {
  flex: 0 0 auto;
}

.chat-item__more {
  color: color-mix(in srgb, var(--tg-border) 20%, #5f718a 80%);
  transition: background-color 0.2s ease, color 0.2s ease;
}

.chat-item__more:hover {
  color: color-mix(in srgb, var(--tg-border) 10%, #4f637e 90%);
  background: color-mix(in srgb, var(--tg-sidebar) 86%, #dce8f9 14%);
}
</style>
