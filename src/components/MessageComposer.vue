<template>
  <div class="composer">
    <q-input
      v-model="draft"
      class="composer__input"
      dense
      outlined
      rounded
      autogrow
      placeholder="Write a message"
      @keydown.enter.exact.prevent="handleSend"
    />
    <q-btn color="primary" label="Send" class="composer__send" @click="handleSend" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const draft = ref('');

const emit = defineEmits<{
  (event: 'send', text: string): void;
}>();

function handleSend(): void {
  const cleanText = draft.value.trim();

  if (!cleanText) {
    return;
  }

  emit('send', cleanText);
  draft.value = '';
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
</style>
