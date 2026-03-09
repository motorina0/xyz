<template>
  <div class="thread-root">
    <template v-if="chat">
      <div class="thread-header">
        <q-btn
          v-if="showBackButton"
          flat
          dense
          round
          icon="arrow_back"
          aria-label="Back"
          @click="handleBack"
        />
        <div class="thread-header__identity" @click="handleOpenProfile">
          <CachedAvatar
            :src="avatarImageUrl"
            :alt="chat.name"
            :fallback="chat.avatar"
            class="thread-header__avatar"
          />
          <div class="thread-header__meta">
            <div class="thread-header__name">{{ chat.name }}</div>
            <div class="thread-header__time">Last active {{ headerTime }}</div>
          </div>
        </div>
        <q-btn
          flat
          dense
          round
          icon="badge"
          aria-label="Open Profile"
          color="primary"
          class="thread-header__action"
          @click="handleOpenProfile"
        />
        <q-btn
          flat
          dense
          round
          icon="refresh"
          aria-label="Refresh Chat"
          color="primary"
          class="thread-header__action"
          @click="handleRefreshChat"
        >
          <AppTooltip>Refresh Chat</AppTooltip>
        </q-btn>
      </div>

      <div ref="threadBodyRef" class="thread-body" @scroll="handleThreadScroll">
        <div v-if="stickyDayLabel" class="thread-day-sticky" aria-hidden="true">
          <span class="thread-day-sticky__label">{{ stickyDayLabel }}</span>
        </div>
        <template v-for="item in threadItems" :key="item.key">
          <div v-if="item.type === 'separator'" class="thread-day-separator" aria-hidden="true">
            <span class="thread-day-separator__line" />
            <span class="thread-day-separator__label">{{ item.label }}</span>
            <span class="thread-day-separator__line" />
          </div>
          <div
            v-else
            class="thread-message-entry"
            :data-day-key="item.dayKey"
            :data-day-label="item.dayLabel"
          >
            <MessageBubble
              :message="item.message"
              :contact-name="chat.name"
            />
          </div>
        </template>
      </div>

      <MessageComposer @send="handleSend" />
    </template>

    <div v-else class="thread-empty" :class="{ 'thread-empty--loading': isInitializing }">
      <template v-if="isInitializing">
        <div class="thread-empty__progress">
          <q-linear-progress
            indeterminate
            rounded
            color="primary"
            track-color="grey-4"
          />
        </div>
        <div class="thread-empty__status">Restoring chats and messages...</div>
      </template>
      <template v-else>
        <div class="thread-empty__mark q-mb-md">...</div>
        <div>Select a chat to start messaging.</div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import AppTooltip from 'src/components/AppTooltip.vue';
import MessageBubble from 'src/components/MessageBubble.vue';
import MessageComposer from 'src/components/MessageComposer.vue';
import CachedAvatar from 'src/components/CachedAvatar.vue';
import type { Chat, Message } from 'src/types/chat';
import { reportUiError } from 'src/utils/uiErrorHandler';

const props = withDefaults(
  defineProps<{
    chat: Chat | null;
    messages: Message[];
    isInitializing?: boolean;
    showBackButton?: boolean;
  }>(),
  {
    isInitializing: false,
    showBackButton: false
  }
);

const emit = defineEmits<{
  (event: 'send', text: string): void;
  (event: 'back'): void;
  (event: 'open-profile', publicKey: string): void;
  (event: 'refresh-chat', chatId: string): void;
}>();

const threadBodyRef = ref<HTMLElement | null>(null);
const stickyDayLabel = ref('');
let scrollFrameId: number | null = null;

type ThreadItem =
  | {
      type: 'separator';
      key: string;
      label: string;
    }
  | {
      type: 'message';
      key: string;
      dayKey: string;
      dayLabel: string;
      message: Message;
    };

const headerTime = computed(() => {
  if (!props.chat) {
    return '';
  }

  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    day: 'numeric'
  }).format(new Date(props.chat.lastMessageAt));
});

const avatarImageUrl = computed(() => {
  if (!props.chat) {
    return '';
  }

  const picture = props.chat.meta.picture;
  if (typeof picture === 'string' && picture.trim()) {
    return picture.trim();
  }

  return '';
});

function getDayKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDayLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const isCurrentYear = date.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'long',
    ...(isCurrentYear ? {} : { year: 'numeric' })
  }).format(date);
}

const threadItems = computed<ThreadItem[]>(() => {
  const items: ThreadItem[] = [];
  let lastDayKey = '';

  for (const message of props.messages) {
    const dayKey = getDayKey(message.sentAt);
    const dayLabel = formatDayLabel(message.sentAt);
    if (dayKey !== lastDayKey) {
      items.push({
        type: 'separator',
        key: `separator-${dayKey}`,
        label: dayLabel
      });
      lastDayKey = dayKey;
    }

    items.push({
      type: 'message',
      key: message.id,
      dayKey,
      dayLabel,
      message
    });
  }

  return items;
});

async function scrollToBottom(): Promise<void> {
  await nextTick();

  if (threadBodyRef.value) {
    threadBodyRef.value.scrollTop = threadBodyRef.value.scrollHeight;
  }

  updateStickyDayLabel();
}

function updateStickyDayLabel(): void {
  const threadBody = threadBodyRef.value;
  if (!threadBody) {
    stickyDayLabel.value = '';
    return;
  }

  const threadRect = threadBody.getBoundingClientRect();
  const messageEntries = threadBody.querySelectorAll<HTMLElement>('.thread-message-entry');

  for (const entry of messageEntries) {
    const rect = entry.getBoundingClientRect();
    if (rect.bottom > threadRect.top) {
      stickyDayLabel.value = entry.dataset.dayLabel?.trim() ?? '';
      return;
    }
  }

  stickyDayLabel.value =
    messageEntries[messageEntries.length - 1]?.dataset.dayLabel?.trim() ?? '';
}

function handleThreadScroll(): void {
  if (scrollFrameId !== null) {
    cancelAnimationFrame(scrollFrameId);
  }

  scrollFrameId = window.requestAnimationFrame(() => {
    scrollFrameId = null;
    updateStickyDayLabel();
  });
}

function handleBack(): void {
  try {
    emit('back');
  } catch (error) {
    reportUiError('Failed to go back from chat thread', error);
  }
}

function handleSend(text: string): void {
  try {
    emit('send', text);
  } catch (error) {
    reportUiError('Failed to emit chat thread send event', error);
  }
}

function handleOpenProfile(): void {
  try {
    if (!props.chat?.publicKey) {
      return;
    }

    emit('open-profile', props.chat.publicKey);
  } catch (error) {
    reportUiError('Failed to open profile from chat thread', error);
  }
}

function handleRefreshChat(): void {
  try {
    if (!props.chat?.id) {
      return;
    }

    emit('refresh-chat', props.chat.id);
  } catch (error) {
    reportUiError('Failed to refresh chat from thread header', error);
  }
}

watch(
  () => [props.chat?.id, props.messages.length],
  () => {
    void scrollToBottom();
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  if (scrollFrameId !== null) {
    cancelAnimationFrame(scrollFrameId);
  }
});
</script>

<style scoped>
.thread-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: transparent;
}

.thread-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--tg-border);
  background: var(--tg-panel-header-bg);
}

.thread-header__identity {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
  cursor: pointer;
}

.thread-header__meta {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.thread-header__name {
  font-weight: 600;
}

.thread-header__time {
  font-size: 12px;
  opacity: 0.65;
}

.thread-header__action {
  color: #64748b;
}

.thread-body {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  position: relative;
}

.thread-day-sticky {
  position: sticky;
  top: 0;
  z-index: 3;
  display: flex;
  justify-content: center;
  padding: 2px 0 8px;
  pointer-events: none;
}

.thread-day-sticky__label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 4px 12px;
  border-radius: 999px;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--tg-sidebar) 94%, #dbe8ff 6%),
      color-mix(in srgb, var(--tg-sidebar) 98%, #ffffff 2%)
    );
  border: 1px solid color-mix(in srgb, var(--tg-border) 84%, #8ca3bf 16%);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.14);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: color-mix(in srgb, var(--q-primary) 40%, var(--tg-text) 60%);
  backdrop-filter: blur(10px);
}

.thread-day-separator {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 14px 0 12px;
}

.thread-day-separator__line {
  flex: 1;
  height: 1px;
  background: color-mix(in srgb, var(--tg-border) 76%, transparent);
}

.thread-day-separator__label {
  flex: 0 0 auto;
  padding: 4px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--tg-sidebar) 72%, transparent);
  border: 1px solid color-mix(in srgb, var(--tg-border) 70%, transparent);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: color-mix(in srgb, var(--q-primary) 45%, var(--tg-text) 55%);
  white-space: nowrap;
}

.thread-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 100%;
  padding: 24px;
  text-align: center;
  opacity: 0.7;
}

.thread-empty--loading {
  opacity: 1;
}

.thread-empty__mark {
  font-size: 48px;
  line-height: 1;
}

.thread-empty__progress {
  width: min(220px, 72%);
}

.thread-empty__status {
  font-weight: 600;
  color: color-mix(in srgb, var(--q-primary) 55%, currentColor 45%);
}
</style>
