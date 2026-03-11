<template>
  <div class="composer">
    <div
      v-if="isEmojiAutocompleteVisible"
      class="composer__emoji-autocomplete"
      role="listbox"
      aria-label="Emoji suggestions"
    >
      <button
        v-for="(entry, index) in emojiAutocompleteEntries"
        :key="`${entry.emoji}-${entry.label}`"
        type="button"
        class="composer__emoji-option"
        :class="{ 'composer__emoji-option--active': index === activeEmojiAutocompleteIndex }"
        :aria-selected="index === activeEmojiAutocompleteIndex ? 'true' : 'false'"
        @mousedown.prevent
        @click="handleEmojiAutocompleteSelect(entry.emoji)"
      >
        <span class="composer__emoji-option-char">{{ entry.emoji }}</span>
        <span class="composer__emoji-option-label">{{ entry.label }}</span>
      </button>

      <div v-if="emojiAutocompleteEntries.length === 0" class="composer__emoji-empty">
        No emoji found.
      </div>
    </div>

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
        @update:model-value="handleDraftUpdate"
        @focus="rememberSelection"
        @click="rememberSelection"
        @keyup="rememberSelection"
        @select="rememberSelection"
        @keydown.enter.exact="handleEnterKey"
        @keydown.down="handleAutocompleteArrowDown"
        @keydown.up="handleAutocompleteArrowUp"
        @keydown.tab="handleAutocompleteTab"
        @keydown.esc="handleAutocompleteEscape"
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
import { computed, nextTick, ref, watch } from 'vue';
import EmojiPickerPanel from 'src/components/EmojiPickerPanel.vue';
import { TOP_500_EMOJIS, filterEmojiEntries, type EmojiOption } from 'src/data/topEmojis';
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
const activeEmojiAutocompleteIndex = ref(0);
const dismissedEmojiAutocompleteToken = ref('');
const MAX_EMOJI_AUTOCOMPLETE_RESULTS = 8;

const emit = defineEmits<{
  (event: 'send', payload: { text: string }): void;
  (event: 'cancel-reply'): void;
}>();

function getInputElement(): HTMLInputElement | HTMLTextAreaElement | null {
  return inputRef.value?.$el.querySelector('textarea, input') ?? null;
}

function focusInputAt(nextCursor: number): void {
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

function handleDraftUpdate(): void {
  void nextTick(() => {
    rememberSelection();
  });
}

interface EmojiAutocompleteMatch {
  start: number;
  end: number;
  query: string;
}

const emojiAutocompleteMatch = computed<EmojiAutocompleteMatch | null>(() => {
  const start = selectionStart.value ?? draft.value.length;
  const end = selectionEnd.value ?? start;
  if (start !== end) {
    return null;
  }

  const beforeCursor = draft.value.slice(0, start);
  const colonIndex = beforeCursor.lastIndexOf(':');
  if (colonIndex < 0) {
    return null;
  }

  if (colonIndex > 0) {
    const previousChar = beforeCursor.charAt(colonIndex - 1);
    if (!/[\s([{]/u.test(previousChar)) {
      return null;
    }
  }

  const tokenQuery = beforeCursor.slice(colonIndex + 1);
  if (/\s/u.test(tokenQuery)) {
    return null;
  }

  return {
    start: colonIndex,
    end: start,
    query: tokenQuery
  };
});

const emojiAutocompleteEntries = computed<EmojiOption[]>(() => {
  const match = emojiAutocompleteMatch.value;
  if (!match || isEmojiMenuOpen.value) {
    return [];
  }

  const entries = match.query.trim()
    ? filterEmojiEntries(match.query)
    : TOP_500_EMOJIS;
  return entries.slice(0, MAX_EMOJI_AUTOCOMPLETE_RESULTS);
});

const isEmojiAutocompleteVisible = computed(() => {
  const match = emojiAutocompleteMatch.value;
  if (!match || isEmojiMenuOpen.value) {
    return false;
  }

  return dismissedEmojiAutocompleteToken.value !== `${match.start}:${match.query}`;
});

watch(
  emojiAutocompleteEntries,
  (entries) => {
    if (entries.length === 0) {
      activeEmojiAutocompleteIndex.value = 0;
      return;
    }

    activeEmojiAutocompleteIndex.value = Math.min(
      activeEmojiAutocompleteIndex.value,
      entries.length - 1
    );
  },
  { immediate: true }
);

watch(emojiAutocompleteMatch, () => {
  activeEmojiAutocompleteIndex.value = 0;
  const match = emojiAutocompleteMatch.value;
  if (!match) {
    dismissedEmojiAutocompleteToken.value = '';
    return;
  }

  const tokenKey = `${match.start}:${match.query}`;
  if (dismissedEmojiAutocompleteToken.value !== tokenKey) {
    dismissedEmojiAutocompleteToken.value = '';
  }
});

function replaceDraftRange(start: number, end: number, replacement: string): void {
  draft.value = `${draft.value.slice(0, start)}${replacement}${draft.value.slice(end)}`;
  const nextCursor = start + replacement.length;
  selectionStart.value = nextCursor;
  selectionEnd.value = nextCursor;
  focusInputAt(nextCursor);
}

function insertEmoji(emoji: string): void {
  try {
    const start = selectionStart.value ?? draft.value.length;
    const end = selectionEnd.value ?? draft.value.length;
    replaceDraftRange(start, end, emoji);
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
  focusInputAt(selectionStart.value ?? draft.value.length);
}

function handleEmojiAutocompleteSelect(emoji: string): void {
  try {
    const match = emojiAutocompleteMatch.value;
    if (!match) {
      return;
    }

    dismissedEmojiAutocompleteToken.value = '';
    const suffix = draft.value.slice(match.end);
    const nextEmoji = suffix.length === 0 ? `${emoji} ` : emoji;
    replaceDraftRange(match.start, match.end, nextEmoji);
  } catch (error) {
    reportUiError('Failed to autocomplete emoji', error);
  }
}

function handleEnterKey(event: KeyboardEvent): void {
  if (isEmojiAutocompleteVisible.value && emojiAutocompleteEntries.value.length > 0) {
    event.preventDefault();
    const entry = emojiAutocompleteEntries.value[activeEmojiAutocompleteIndex.value] ?? null;
    if (entry) {
      handleEmojiAutocompleteSelect(entry.emoji);
    }
    return;
  }

  event.preventDefault();
  handleSend();
}

function handleAutocompleteArrowDown(event: KeyboardEvent): void {
  if (!isEmojiAutocompleteVisible.value || emojiAutocompleteEntries.value.length === 0) {
    return;
  }

  event.preventDefault();
  activeEmojiAutocompleteIndex.value =
    (activeEmojiAutocompleteIndex.value + 1) % emojiAutocompleteEntries.value.length;
}

function handleAutocompleteArrowUp(event: KeyboardEvent): void {
  if (!isEmojiAutocompleteVisible.value || emojiAutocompleteEntries.value.length === 0) {
    return;
  }

  event.preventDefault();
  activeEmojiAutocompleteIndex.value =
    (activeEmojiAutocompleteIndex.value - 1 + emojiAutocompleteEntries.value.length) %
    emojiAutocompleteEntries.value.length;
}

function handleAutocompleteTab(event: KeyboardEvent): void {
  if (!isEmojiAutocompleteVisible.value || emojiAutocompleteEntries.value.length === 0) {
    return;
  }

  event.preventDefault();
  const entry = emojiAutocompleteEntries.value[activeEmojiAutocompleteIndex.value] ?? null;
  if (entry) {
    handleEmojiAutocompleteSelect(entry.emoji);
  }
}

function handleAutocompleteEscape(event: KeyboardEvent): void {
  if (!isEmojiAutocompleteVisible.value) {
    return;
  }

  event.preventDefault();
  const match = emojiAutocompleteMatch.value;
  if (!match) {
    return;
  }

  dismissedEmojiAutocompleteToken.value = `${match.start}:${match.query}`;
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

    focusInputAt(draft.value.length);
  }
);

defineExpose({
  focusInputAtEnd: () => focusInputAt(draft.value.length)
});
</script>

<style scoped>
.composer {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  padding: 10px;
  border-top: 1px solid var(--tg-border);
  background: var(--tg-panel-header-bg);
}

.composer__emoji-autocomplete {
  width: min(100%, 360px);
  align-self: flex-start;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border: 1px solid color-mix(in srgb, var(--tg-border) 88%, #90a6c1 12%);
  border-radius: 16px;
  background:
    radial-gradient(circle at top left, rgba(96, 165, 250, 0.12), transparent 42%),
    color-mix(in srgb, var(--tg-sidebar) 94%, #f8fbff 6%);
  box-shadow: var(--tg-shadow-md);
}

.composer__emoji-option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: var(--tg-btn-soft-bg);
  box-shadow: var(--tg-btn-soft-shadow);
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    background-color 0.16s ease,
    border-color 0.16s ease,
    transform 0.16s ease,
    box-shadow 0.16s ease;
}

.composer__emoji-option:hover,
.composer__emoji-option--active {
  transform: translateY(-1px);
  border-color: var(--tg-btn-soft-border);
  background: var(--tg-btn-soft-hover-bg);
}

.composer__emoji-option-char {
  flex: 0 0 auto;
  font-size: 20px;
  line-height: 1;
}

.composer__emoji-option-label {
  min-width: 0;
  font-size: 13px;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.composer__emoji-empty {
  padding: 8px 10px;
  font-size: 13px;
  color: color-mix(in srgb, currentColor 64%, #64748b 36%);
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
