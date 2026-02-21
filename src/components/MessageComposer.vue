<template>
  <div class="composer">
    <q-input
      ref="inputRef"
      v-model="draft"
      class="composer__input"
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
      <template #append>
        <q-btn
          flat
          round
          dense
          icon="sentiment_satisfied"
          aria-label="Add emoji"
          @click="rememberSelection"
        >
          <q-menu anchor="top right" self="bottom right" class="emoji-menu">
            <q-scroll-area class="emoji-menu__scroll">
              <div class="emoji-grid">
                <button
                  v-for="emoji in TOP_500_EMOJIS"
                  :key="emoji"
                  type="button"
                  class="emoji-grid__item"
                  v-close-popup
                  @mousedown.prevent
                  @click="insertEmoji(emoji)"
                >
                  {{ emoji }}
                </button>
              </div>
            </q-scroll-area>
          </q-menu>
        </q-btn>
      </template>
    </q-input>

    <q-btn color="primary" label="Send" class="composer__send" @click="handleSend" />
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref } from 'vue';
import { TOP_500_EMOJIS } from 'src/data/topEmojis';

const draft = ref('');
const inputRef = ref<{ $el: HTMLElement } | null>(null);
const selectionStart = ref<number | null>(null);
const selectionEnd = ref<number | null>(null);

const emit = defineEmits<{
  (event: 'send', text: string): void;
}>();

function getInputElement(): HTMLInputElement | HTMLTextAreaElement | null {
  return inputRef.value?.$el.querySelector('textarea, input') ?? null;
}

function rememberSelection(): void {
  const inputElement = getInputElement();

  if (!inputElement) {
    return;
  }

  selectionStart.value = inputElement.selectionStart ?? draft.value.length;
  selectionEnd.value = inputElement.selectionEnd ?? draft.value.length;
}

function insertEmoji(emoji: string): void {
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
}

function handleSend(): void {
  const cleanText = draft.value.trim();

  if (!cleanText) {
    return;
  }

  emit('send', cleanText);
  draft.value = '';
  selectionStart.value = 0;
  selectionEnd.value = 0;
}
</script>

<style scoped>
.composer {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding: 10px;
  border-top: 1px solid var(--tg-border);
  background: var(--tg-sidebar);
}

.composer__input {
  flex: 1;
}

.composer__send {
  border-radius: 999px;
  min-width: 74px;
}

.emoji-menu {
  width: 324px;
}

.emoji-menu__scroll {
  height: 280px;
  width: 100%;
}

.emoji-grid {
  display: grid;
  grid-template-columns: repeat(9, minmax(0, 1fr));
  gap: 2px;
  padding: 8px;
}

.emoji-grid__item {
  border: 0;
  border-radius: 8px;
  background: transparent;
  font-size: 21px;
  line-height: 1;
  padding: 6px 0;
  cursor: pointer;
}

.emoji-grid__item:hover {
  background: rgba(55, 119, 245, 0.14);
}
</style>
