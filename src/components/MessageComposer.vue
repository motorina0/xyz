<template>
  <div class="composer">
    <div v-if="replyTo" class="composer__reply">
      <div class="composer__reply-accent" aria-hidden="true" />
      <div class="composer__reply-copy">
        <div class="composer__reply-title">Reply to {{ replyTo.authorName }}</div>
        <div class="composer__reply-text">{{ replyTo.text }}</div>
      </div>
      <q-btn
        flat
        dense
        round
        icon="close"
        aria-label="Cancel reply"
        class="composer__reply-close"
        @click="$emit('cancel-reply')"
      />
    </div>

    <div class="composer__row">
      <q-input
        ref="inputRef"
        v-model="draft"
        class="composer__input tg-input"
        dense
        outlined
        rounded
        autogrow
        placeholder="Write a message"
        @focus="rememberSelection"
        @click="rememberSelection"
        @keyup="rememberSelection"
        @select="rememberSelection"
        @keydown.enter.exact.prevent="handleSend"
      >
        <template #prepend>
          <q-btn
            flat
            round
            dense
            icon="sentiment_satisfied"
            aria-label="Add emoji"
            @click="rememberSelection"
          >
            <q-menu
              v-model="isEmojiMenuOpen"
              anchor="top right"
              self="bottom right"
              @show="handleEmojiMenuShow"
              @hide="handleEmojiMenuHide"
            >
              <EmojiPickerPanel
                ref="emojiPickerRef"
                width="360px"
                max-height="300px"
                :columns="6"
                item-min-height="42px"
                item-padding="10px 6px"
                @select="insertEmoji"
              />
            </q-menu>
          </q-btn>
        </template>
      </q-input>

      <q-btn color="primary" label="Send" class="composer__send" @click="handleSend" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import EmojiPickerPanel from 'src/components/EmojiPickerPanel.vue';
import type { MessageReplyPreview } from 'src/types/chat';
import { reportUiError } from 'src/utils/uiErrorHandler';

const props = defineProps<{
  replyTo?: MessageReplyPreview | null;
}>();

const draft = ref('');
const inputRef = ref<{ $el: HTMLElement } | null>(null);
const selectionStart = ref<number | null>(null);
const selectionEnd = ref<number | null>(null);
const emojiPickerRef = ref<{ reset: () => void } | null>(null);
const isEmojiMenuOpen = ref(false);
const shouldRefocusAfterEmojiMenuHide = ref(false);

const emit = defineEmits<{
  (event: 'send', payload: { text: string }): void;
  (event: 'cancel-reply'): void;
}>();

function getInputElement(): HTMLInputElement | HTMLTextAreaElement | null {
  return inputRef.value?.$el.querySelector('textarea, input') ?? null;
}

function focusInputAtEnd(): void {
  const nextCursor = draft.value.length;

  void nextTick(() => {
    window.setTimeout(() => {
      const inputElement = getInputElement();

      if (!inputElement) {
        return;
      }

      inputElement.focus();
      inputElement.setSelectionRange(nextCursor, nextCursor);
      selectionStart.value = nextCursor;
      selectionEnd.value = nextCursor;
    }, 0);
  });
}

function rememberSelection(): void {
  try {
    const inputElement = getInputElement();

    if (!inputElement) {
      return;
    }

    selectionStart.value = inputElement.selectionStart ?? draft.value.length;
    selectionEnd.value = inputElement.selectionEnd ?? draft.value.length;
  } catch (error) {
    reportUiError('Failed to track message input cursor', error);
  }
}

function insertEmoji(emoji: string): void {
  try {
    const start = selectionStart.value ?? draft.value.length;
    const end = selectionEnd.value ?? draft.value.length;

    draft.value = `${draft.value.slice(0, start)}${emoji}${draft.value.slice(end)}`;

    const nextCursor = start + emoji.length;
    selectionStart.value = nextCursor;
    selectionEnd.value = nextCursor;
    shouldRefocusAfterEmojiMenuHide.value = true;
  } catch (error) {
    reportUiError('Failed to insert emoji', error);
  }
}

function handleEmojiMenuShow(): void {
  void nextTick(() => {
    emojiPickerRef.value?.reset();
  });
}

function handleEmojiMenuHide(): void {
  if (!shouldRefocusAfterEmojiMenuHide.value) {
    return;
  }

  shouldRefocusAfterEmojiMenuHide.value = false;
  focusInputAtEnd();
}

function handleSend(): void {
  try {
    const cleanText = draft.value.trim();

    if (!cleanText) {
      return;
    }

    emit('send', { text: cleanText });
    draft.value = '';
    selectionStart.value = 0;
    selectionEnd.value = 0;
  } catch (error) {
    reportUiError('Failed to submit message input', error);
  }
}

watch(
  () => props.replyTo?.messageId ?? null,
  (nextMessageId, previousMessageId) => {
    if (!nextMessageId || nextMessageId === previousMessageId) {
      return;
    }

    focusInputAtEnd();
  }
);

defineExpose({
  focusInputAtEnd
});
</script>

<style scoped>
.composer {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  padding: 10px;
  border-top: 1px solid var(--tg-border);
  background: var(--tg-panel-header-bg);
}

.composer__reply {
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--tg-sidebar) 76%, transparent);
}

.composer__reply-accent {
  flex: 0 0 3px;
  align-self: stretch;
  border-radius: 999px;
  background: var(--q-primary);
}

.composer__reply-copy {
  flex: 1;
  min-width: 0;
}

.composer__reply-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--q-primary);
}

.composer__reply-text {
  font-size: 12px;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.8;
}

.composer__reply-close {
  flex: 0 0 auto;
  color: #64748b;
}

.composer__row {
  width: 100%;
  display: flex;
  align-items: flex-end;
  gap: 10px;
}

.composer__input {
  width: 100%;
  flex: 1;
}

.composer__send {
  border-radius: 999px;
  min-width: 74px;
}
</style>
