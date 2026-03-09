<template>
  <div class="composer">
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
              <div class="emoji-grid">
                <button
                  v-for="entry in filteredEmojis"
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
                </button>
              </div>
              <div v-if="filteredEmojis.length === 0" class="emoji-menu__empty">
                No emoji found.
              </div>
            </div>
          </q-menu>
        </q-btn>
      </template>
    </q-input>

    <q-btn color="primary" label="Send" class="composer__send" @click="handleSend" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { TOP_500_EMOJIS } from 'src/data/topEmojis';
import { reportUiError } from 'src/utils/uiErrorHandler';

const draft = ref('');
const inputRef = ref<{ $el: HTMLElement } | null>(null);
const selectionStart = ref<number | null>(null);
const selectionEnd = ref<number | null>(null);
const emojiSearch = ref('');

const emit = defineEmits<{
  (event: 'send', text: string): void;
}>();

const filteredEmojis = computed(() => {
  const query = emojiSearch.value.trim().toLowerCase();

  if (!query) {
    return TOP_500_EMOJIS;
  }

  return TOP_500_EMOJIS.filter((entry) => entry.label.toLowerCase().includes(query));
});

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

    emit('send', cleanText);
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
  align-items: flex-end;
  gap: 10px;
  padding: 10px;
  border-top: 1px solid var(--tg-border);
  background: var(--tg-panel-header-bg);
}

.composer__input {
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

.emoji-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 4px;
  padding: 8px;
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
