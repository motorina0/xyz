<template>
  <q-item
    clickable
    class="chat-item"
    :active="active"
    active-class="chat-item--active"
    @click="handleSelectChat"
  >
    <q-item-section avatar>
      <CachedAvatar
        :src="avatarImageUrl"
        :alt="chatTitle"
        :fallback="chat.avatar"
        class="chat-item__avatar"
      />
    </q-item-section>

    <q-item-section class="chat-item__main">
      <div class="chat-item__headline">
        <q-item-label class="chat-item__name" lines="1">{{ chatTitle }}</q-item-label>
        <q-item-label class="chat-item__time" caption>{{ formattedTime }}</q-item-label>
      </div>
      <q-item-label class="chat-item__caption" caption lines="1">{{ chat.lastMessage }}</q-item-label>
    </q-item-section>

    <q-item-section v-if="hasMetaBadges" side class="chat-item__meta">
      <div class="chat-item__badges">
        <div
          v-if="unseenReactionCount > 0"
          class="chat-item__reaction-badge"
          :aria-label="`${unseenReactionCount} unseen reactions`"
        >
          <span class="chat-item__reaction-icon-shell" aria-hidden="true">
            <q-icon name="favorite" size="13px" class="chat-item__reaction-icon" />
          </span>
          <span class="chat-item__reaction-count">{{ formatReactionCount(unseenReactionCount) }}</span>
        </div>

        <q-badge v-if="chat.unreadCount > 0" rounded color="primary">
          {{ chat.unreadCount }}
        </q-badge>
      </div>
    </q-item-section>

    <q-item-section side class="chat-item__actions">
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

function readMetaString(key: string): string {
  const value = props.chat.meta[key];
  return typeof value === 'string' ? value.trim() : '';
}

function readMetaCount(key: string): number {
  const value = props.chat.meta[key];
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return Math.max(0, Math.floor(numericValue));
}

function chatPubkeySnippet(value: string): string {
  return value.trim().slice(0, 32);
}

function getLoggedInPubkey(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.localStorage.getItem('npub')?.trim().toLowerCase() ?? '';
}

const formattedTime = computed(() => {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(props.chat.lastMessageAt));
});

const chatTitle = computed(() => {
  const loggedInPubkey = getLoggedInPubkey();
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
const unseenReactionCount = computed(() => readMetaCount('unseen_reaction_count'));
const hasMetaBadges = computed(() => props.chat.unreadCount > 0 || unseenReactionCount.value > 0);

function formatReactionCount(value: number): string {
  return value > 99 ? '99+' : String(value);
}

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
  min-height: 78px;
  margin: 0;
  padding: 0 12px;
  border-radius: 0;
  border-bottom: 1px solid var(--tg-border);
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
}

.chat-item:hover {
  background: var(--tg-hover);
}

.chat-item--active {
  background: var(--tg-active);
  color: var(--tg-active-text);
}

.chat-item__name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 15px;
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

.chat-item__headline {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.chat-item__meta {
  flex: 0 0 auto;
  justify-content: center;
  color: var(--tg-text-secondary);
}

.chat-item__actions {
  flex: 0 0 36px;
  min-width: 36px;
  padding-left: 0 !important;
  align-items: flex-end;
  justify-content: center;
}

.chat-item__time {
  flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
}

.chat-item__badges {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

.chat-item__reaction-badge {
  min-height: 24px;
  padding: 2px 7px 2px 3px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: var(--tg-reaction-accent-bg);
  border: 1px solid var(--tg-reaction-accent-border);
  color: var(--tg-reaction-accent-text);
}

.chat-item__reaction-icon-shell {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--tg-reaction-accent-icon-bg);
}

.chat-item__reaction-icon {
  color: #ffffff;
}

.chat-item__reaction-count {
  display: inline-block;
  min-width: 1.3em;
  font-size: 11px;
  line-height: 1;
  font-weight: 800;
  letter-spacing: 0;
  font-variant-numeric: tabular-nums;
}

.q-btn.chat-item__more {
  color: var(--tg-text-secondary);
  background: transparent !important;
  box-shadow: none !important;
  opacity: 0;
  transition: color 0.2s ease, opacity 0.2s ease;
}

.q-btn.chat-item__more::before {
  border-color: transparent !important;
}

.q-btn.chat-item__more:hover {
  color: var(--tg-text);
  background: transparent !important;
  box-shadow: none !important;
  transform: none !important;
}

.chat-item:hover .chat-item__more,
.chat-item:focus-within .chat-item__more,
.chat-item--active .chat-item__more {
  opacity: 1;
}

.chat-item :deep(.q-item__section--avatar) {
  min-width: 60px;
}

.chat-item :deep(.q-item__label--caption) {
  color: var(--tg-text-secondary);
}

.chat-item :deep(.chat-item__avatar) {
  width: 54px;
  height: 54px;
  font-size: 24px;
}

.chat-item--active .chat-item__meta,
.chat-item--active :deep(.q-item__label--caption),
.chat-item--active .q-btn.chat-item__more {
  color: var(--tg-active-subtext);
}

.chat-item--active .chat-item__reaction-badge {
  background: rgba(255, 255, 255, 0.16);
  border-color: rgba(255, 255, 255, 0.22);
  color: var(--tg-active-text);
}

.chat-item--active .chat-item__reaction-icon-shell {
  background: rgba(255, 255, 255, 0.22);
}
</style>
