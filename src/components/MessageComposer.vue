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
            dense
            icon="sentiment_satisfied"
            aria-label="Add emoji"
           
            @click="rememberSelection"
          >
            <q-menu
              v-model="isEmojiMenuOpen"
              anchor="top right"
              self="bottom right"
              class="tg-pop-menu"
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

      <q-btn
        color="primary"
        icon="send"
        class="composer__send"
        @touchstart.prevent.stop="handleSendTouchStart"
        @click="handleSendClick"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import EmojiPickerPanel from 'src/components/EmojiPickerPanel.vue';
import { TOP_500_EMOJIS, filterEmojiEntries, type EmojiOption } from 'src/data/topEmojis';
import { useChatStore } from 'src/stores/chatStore';
import type { MessageReplyPreview } from 'src/types/chat';
import { reportUiError } from 'src/utils/uiErrorHandler';

const props = defineProps<{
  chatId?: string | null;
  replyTo?: MessageReplyPreview | null;
}>();

const chatStore = useChatStore();
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
let suppressNextSendClick = false;

const emit = defineEmits<{
  (event: 'send', payload: { text: string }): void;
  (event: 'cancel-reply'): void;
}>();

function normalizeChatIdentifier(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim().toLowerCase();
  return normalizedValue || null;
}

const activeChatId = computed(() => normalizeChatIdentifier(props.chatId));

function setDraftValue(nextDraft: string, options: { persist?: boolean } = {}): void {
  draft.value = nextDraft;

  if (options.persist === false || !activeChatId.value) {
    return;
  }

  chatStore.setComposerDraft(activeChatId.value, nextDraft);
}

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
  if (activeChatId.value) {
    chatStore.setComposerDraft(activeChatId.value, draft.value);
  }

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
  setDraftValue(`${draft.value.slice(0, start)}${replacement}${draft.value.slice(end)}`);
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

  if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
    return;
  }

  event.preventDefault();
  submitDraft();
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

function shouldKeepKeyboardOpenAfterSend(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
}

function handleSendTouchStart(event: TouchEvent): void {
  if (!shouldKeepKeyboardOpenAfterSend()) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  suppressNextSendClick = true;
  submitDraft();
}

function handleSendClick(): void {
  if (suppressNextSendClick) {
    suppressNextSendClick = false;
    return;
  }

  submitDraft();
}

function submitDraft(): void {
  try {
    const cleanText = draft.value.trim();

    if (!cleanText) {
      return;
    }

    emit('send', { text: cleanText });
    setDraftValue('');
    selectionStart.value = 0;
    selectionEnd.value = 0;
  } catch (error) {
    reportUiError('Failed to submit message input', error);
  }
}

watch(
  activeChatId,
  (nextChatId) => {
    const nextDraft = nextChatId ? chatStore.getComposerDraft(nextChatId) : '';
    setDraftValue(nextDraft, { persist: false });
    selectionStart.value = nextDraft.length;
    selectionEnd.value = nextDraft.length;
    dismissedEmojiAutocompleteToken.value = '';
    activeEmojiAutocompleteIndex.value = 0;
    isEmojiMenuOpen.value = false;
    shouldRefocusAfterEmojiMenuHide.value = false;
  },
  { immediate: true }
);

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
  gap: 8px;
  padding: 10px 16px;
  padding-bottom: calc(10px + env(safe-area-inset-bottom));
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
  border: 1px solid var(--tg-border);
  border-radius: 12px;
  background: var(--tg-panel-sidebar-bg);
  box-shadow: var(--tg-shadow-md);
}

.composer__emoji-option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    background-color 0.16s ease,
    border-color 0.16s ease,
    transform 0.16s ease;
}

.composer__emoji-option:hover,
.composer__emoji-option--active {
  transform: none;
  border-color: transparent;
  background: var(--tg-hover);
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
  color: var(--tg-text-secondary);
}

.composer__reply {
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--tg-surface-soft-strong);
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
  color: var(--tg-text-secondary);
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

.composer__emoji-trigger {
  color: var(--tg-text-secondary);
}

.composer__send {
  border-radius: 999px;
  min-width: 42px;
  width: 42px;
  height: 42px;
  padding: 0;
  box-shadow: none !important;
}

@media (max-width: 1023px) {
  .composer {
    gap: 5px;
    padding: 3px 10px calc(6px + env(safe-area-inset-bottom));
    border-top: 0;
    background: transparent;
    backdrop-filter: none;
  }

  .composer__reply {
    border-radius: 16px;
    padding: 10px 12px;
    background: color-mix(in srgb, var(--tg-panel-header-bg) 94%, transparent);
    box-shadow: 0 8px 24px rgba(23, 35, 52, 0.08);
  }

  .composer__row {
    align-items: center;
    gap: 5px;
    padding: 4px;
    border: 1px solid color-mix(in srgb, var(--tg-border) 92%, #c5d1dc 8%);
    border-radius: 22px;
    background: color-mix(in srgb, var(--tg-panel-header-bg) 99%, rgba(255, 255, 255, 0.96) 1%);
    box-shadow: 0 8px 20px rgba(23, 35, 52, 0.1);
  }

  .composer__input.q-textarea.q-field--dense :deep(.q-field__control) {
    min-height: 34px !important;
    padding-left: 4px !important;
    border-radius: 18px !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  .composer__input.q-textarea.q-field--dense :deep(.q-field__control-container) {
    min-height: 34px;
    padding-left: 8px !important;
    padding-top: 0 !important;
    padding-bottom: 0 !important;
    display: flex;
    align-items: center;
  }

  .composer__input.q-field--outlined :deep(.q-field__control)::before,
  .composer__input.q-field--outlined :deep(.q-field__control)::after,
  .composer__input.q-field--focused :deep(.q-field__control)::before,
  .composer__input.q-field--focused :deep(.q-field__control)::after {
    border-color: transparent !important;
  }

  .composer__input.q-field--focused :deep(.q-field__control) {
    box-shadow: none !important;
  }

  .composer__input.q-textarea.q-field--dense :deep(.q-field__native),
  .composer__input.q-textarea.q-field--dense :deep(.q-field__input) {
    min-height: 18px !important;
    padding-top: 0 !important;
    padding-bottom: 0 !important;
    font-size: 13px;
    line-height: 18px !important;
    display: block;
  }

  .composer__input.q-textarea.q-field--dense :deep(.q-field__native::placeholder),
  .composer__input.q-textarea.q-field--dense :deep(.q-field__input::placeholder) {
    color: #98a4af;
    opacity: 1;
  }

  .composer__input.q-textarea.q-field--dense :deep(textarea.q-field__native) {
    max-height: 132px;
  }

  .composer__input :deep(.q-field__prepend) {
    padding-left: 0;
    padding-right: 2px;
    margin-left: 0;
  }

  .composer__emoji-trigger {
    width: 30px;
    min-width: 30px;
    height: 30px;
    padding: 0;
    border: 1px solid #e1e5e9;
    border-radius: 999px;
    color: #7c8793 !important;
    background: #f4f6f7 !important;
  }

  .composer__emoji-trigger :deep(.q-btn__content) {
    justify-content: center;
  }

  .composer__emoji-trigger :deep(.q-icon) {
    font-size: 18px;
  }

  .composer__send {
    width: 36px;
    min-width: 36px;
    height: 36px;
    margin-bottom: 0;
    border: 0;
    border-radius: 999px !important;
    overflow: hidden;
    box-shadow: none !important;
  }

  .composer__send::before {
    border-radius: 999px !important;
  }

  .composer__send :deep(.q-icon) {
    font-size: 16px;
  }
}

body.body--dark .composer__reply {
  box-shadow: none;
}

@media (max-width: 1023px) {
  body.body--dark .composer {
    background: transparent;
  }

  body.body--dark .composer__row {
    border-color: color-mix(in srgb, var(--tg-border) 90%, #5b738b 10%);
    background: color-mix(in srgb, var(--tg-panel-header-bg) 96%, rgba(13, 20, 27, 0.78) 4%);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28);
  }

  body.body--dark .composer__reply {
    background: color-mix(in srgb, var(--tg-panel-header-bg) 94%, transparent);
  }

  body.body--dark .composer__emoji-trigger {
    border-color: #516173;
    background: color-mix(in srgb, var(--tg-panel-header-bg) 94%, #263341 6%) !important;
    color: #a9b8c8 !important;
  }
}
</style>
