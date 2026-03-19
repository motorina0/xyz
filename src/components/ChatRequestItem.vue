<template>
  <q-card flat bordered class="request-item">
    <q-item clickable class="request-item__content" @click="handleOpen">
      <q-item-section avatar>
        <CachedAvatar :src="avatarImageUrl" :alt="chatTitle" :fallback="chat.avatar" />
      </q-item-section>

      <q-item-section class="request-item__main">
        <q-item-label overline class="request-item__eyebrow">{{ requestEyebrow }}</q-item-label>
        <q-item-label class="request-item__name" lines="1">{{ chatTitle }}</q-item-label>
        <q-item-label class="request-item__caption" caption lines="2">
          {{ requestCaption }}
        </q-item-label>
      </q-item-section>

      <q-item-section side top class="request-item__meta">
        <q-item-label caption>{{ formattedTime }}</q-item-label>
        <q-badge v-if="chat.unreadCount > 0" rounded color="grey-8" class="q-mt-xs">
          {{ formatUnreadCount(chat.unreadCount) }}
        </q-badge>
      </q-item-section>
    </q-item>

    <div class="request-item__actions">
      <q-btn
        unelevated
        no-caps
        color="primary"
        label="Accept"
        class="request-item__action request-item__action--primary"
        @click.stop="handleAccept"
      />
      <q-btn
        flat
        no-caps
        color="grey-8"
        label="Delete"
        class="request-item__action"
        @click.stop="handleDelete"
      />
      <q-btn
        flat
        no-caps
        color="negative"
        label="Block"
        class="request-item__action"
        @click.stop="handleBlock"
      />
    </div>
  </q-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import CachedAvatar from 'src/components/CachedAvatar.vue';
import { useNostrStore } from 'src/stores/nostrStore';
import type { Chat } from 'src/types/chat';
import { reportUiError } from 'src/utils/uiErrorHandler';

const props = defineProps<{
  chat: Chat;
}>();

const emit = defineEmits<{
  (event: 'open', chatId: string): void;
  (event: 'accept', chatId: string): void;
  (event: 'delete-chat', chatId: string): void;
  (event: 'block', chatId: string): void;
}>();

const nostrStore = useNostrStore();

function readMetaString(key: string): string {
  const value = props.chat.meta[key];
  return typeof value === 'string' ? value.trim() : '';
}

const isGroupInviteRequest = computed(() => readMetaString('request_type') === 'group_invite');

const requestEyebrow = computed(() => {
  return isGroupInviteRequest.value ? 'Group invitation' : 'New contact';
});

const requestCaption = computed(() => {
  const explicitMessage = readMetaString('request_message');
  if (explicitMessage) {
    return explicitMessage;
  }

  if (isGroupInviteRequest.value) {
    return 'This is an invitation to a group.';
  }

  return props.chat.lastMessage || 'Open to review this request.';
});

function chatPubkeySnippet(value: string): string {
  return value.trim().slice(0, 32);
}

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

const formattedTime = computed(() => {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric'
  }).format(new Date(props.chat.lastMessageAt));
});

function formatUnreadCount(value: number): string {
  return value > 99 ? '99+' : String(value);
}

function handleOpen(): void {
  try {
    emit('open', props.chat.id);
  } catch (error) {
    reportUiError('Failed to open chat request', error);
  }
}

function handleAccept(): void {
  try {
    emit('accept', props.chat.id);
  } catch (error) {
    reportUiError('Failed to accept chat request', error);
  }
}

function handleDelete(): void {
  try {
    emit('delete-chat', props.chat.id);
  } catch (error) {
    reportUiError('Failed to delete chat request', error);
  }
}

function handleBlock(): void {
  try {
    emit('block', props.chat.id);
  } catch (error) {
    reportUiError('Failed to block chat request', error);
  }
}
</script>

<style scoped>
.request-item {
  border-radius: 18px;
  border-color: color-mix(in srgb, var(--tg-border) 88%, #a9b7c9 12%);
  background:
    linear-gradient(180deg, rgba(148, 163, 184, 0.06), rgba(148, 163, 184, 0.02)),
    var(--tg-panel-thread-bg);
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.06);
}

.request-item__content {
  padding-bottom: 10px;
}

.request-item__main {
  min-width: 0;
}

.request-item__eyebrow {
  color: color-mix(in srgb, currentColor 52%, #64748b 48%);
  letter-spacing: 0.08em;
}

.request-item__name {
  font-weight: 600;
}

.request-item__caption {
  color: color-mix(in srgb, currentColor 70%, #64748b 30%);
}

.request-item__meta {
  color: color-mix(in srgb, currentColor 58%, #64748b 42%);
}

.request-item__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 16px 16px;
}

.request-item__action {
  min-width: 84px;
  border-radius: 999px;
}

.request-item__action--primary {
  box-shadow: 0 10px 18px rgba(37, 99, 235, 0.18);
}

body.body--dark .request-item {
  border-color: color-mix(in srgb, var(--tg-border) 84%, #6c819a 16%);
  background:
    linear-gradient(180deg, rgba(71, 85, 105, 0.18), rgba(71, 85, 105, 0.08)),
    var(--tg-panel-thread-bg);
  box-shadow: 0 10px 22px rgba(2, 6, 23, 0.3);
}
</style>
