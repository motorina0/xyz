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
            <q-menu anchor="top right" self="bottom right" class="emoji-menu">
              <div class="emoji-menu__search">
                <q-input
                  v-model="emojiSearch"
                  class="tg-input"
                  dense
                  outlined
                  rounded
                  clearable
                  placeholder="Search emoji"
                >
                  <template #prepend>
                    <q-icon name="search" />
                  </template>
                </q-input>
              </div>

              <div class="emoji-menu__scroll">
                <div v-for="group in groupedEmojis" :key="group.key" class="emoji-group">
                  <div class="emoji-group__title">{{ group.label }}</div>
                  <div class="emoji-grid">
                    <button
                      v-for="entry in group.emojis"
                      :key="entry.emoji"
                      type="button"
                      class="emoji-grid__item"
                      v-close-popup
                      @mousedown.prevent
                      @click="insertEmoji(entry.emoji)"
                      :title="entry.label"
                      :aria-label="entry.label"
                    >
                      <span class="emoji-grid__char">{{ entry.emoji }}</span>
                      <span class="emoji-grid__label">{{ entry.label }}</span>
                    </button>
                  </div>
                </div>
                <div v-if="groupedEmojis.length === 0" class="emoji-menu__empty">
                  No emoji found.
                </div>
              </div>
            </q-menu>
          </q-btn>
        </template>
      </q-input>

      <q-btn color="primary" label="Send" class="composer__send" @click="handleSend" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { filterEmojiEntries, groupEmojiEntries } from 'src/data/topEmojis';
import type { MessageReplyPreview } from 'src/types/chat';
import { reportUiError } from 'src/utils/uiErrorHandler';

defineProps<{
  replyTo?: MessageReplyPreview | null;
}>();

const draft = ref('');
const inputRef = ref<{ $el: HTMLElement } | null>(null);
const selectionStart = ref<number | null>(null);
const selectionEnd = ref<number | null>(null);
const emojiSearch = ref('');

const emit = defineEmits<{
  (event: 'send', payload: { text: string }): void;
  (event: 'cancel-reply'): void;
}>();

const filteredEmojis = computed(() => filterEmojiEntries(emojiSearch.value));
const groupedEmojis = computed(() => groupEmojiEntries(filteredEmojis.value));

function getInputElement(): HTMLInputElement | HTMLTextAreaElement | null {
  return inputRef.value?.$el.querySelector('textarea, input') ?? null;
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

    void nextTick(() => {
      const inputElement = getInputElement();

      if (!inputElement) {
        return;
      }

      inputElement.focus();
      inputElement.setSelectionRange(nextCursor, nextCursor);
    });
  } catch (error) {
    reportUiError('Failed to insert emoji', error);
  }
}

function handleSend(): void {
  try {
    const cleanText = draft.value.trim();

    if (!cleanText) {
      return;
    }

    emit('send', { text: cleanText });
    draft.value = '';
    emojiSearch.value = '';
    selectionStart.value = 0;
    selectionEnd.value = 0;
  } catch (error) {
    reportUiError('Failed to submit message input', error);
  }
}
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

.emoji-menu {
  width: 360px;
}

.emoji-menu__search {
  padding: 8px;
  border-bottom: 1px solid var(--tg-border);
  background: var(--tg-sidebar);
}

.emoji-menu__scroll {
  max-height: 300px;
  overflow-y: auto;
  width: 100%;
}

.emoji-group {
  padding: 8px 8px 0;
}

.emoji-group:last-child {
  padding-bottom: 8px;
}

.emoji-group__title {
  padding: 0 4px 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--q-primary) 58%, var(--tg-text) 42%);
}

.emoji-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 4px;
}

.emoji-grid__item {
  border: 0;
  border-radius: 8px;
  background: transparent;
  line-height: 1;
  padding: 8px 6px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.emoji-grid__item:hover {
  background: rgba(55, 119, 245, 0.14);
}

.emoji-grid__char {
  font-size: 21px;
}

.emoji-grid__label {
  font-size: 10px;
  line-height: 1.15;
  max-width: 100%;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.72;
}

.emoji-menu__empty {
  padding: 10px;
  text-align: center;
  font-size: 12px;
  opacity: 0.7;
}
</style>
