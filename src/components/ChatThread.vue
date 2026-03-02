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
          @click="$emit('back')"
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
      </div>

      <div ref="threadBodyRef" class="thread-body">
        <MessageBubble v-for="message in messages" :key="message.id" :message="message" />
      </div>

      <MessageComposer @send="$emit('send', $event)" />
    </template>

    <div v-else class="thread-empty">
      <div class="thread-empty__mark q-mb-md">...</div>
      <div>Select a chat to start messaging.</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import MessageBubble from 'src/components/MessageBubble.vue';
import MessageComposer from 'src/components/MessageComposer.vue';
import CachedAvatar from 'src/components/CachedAvatar.vue';
import type { Chat, Message } from 'src/types/chat';

const props = withDefaults(
  defineProps<{
    chat: Chat | null;
    messages: Message[];
    showBackButton?: boolean;
  }>(),
  {
    showBackButton: false
  }
);

const emit = defineEmits<{
  (event: 'send', text: string): void;
  (event: 'back'): void;
  (event: 'open-profile', publicKey: string): void;
}>();

const threadBodyRef = ref<HTMLElement | null>(null);

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

async function scrollToBottom(): Promise<void> {
  await nextTick();

  if (threadBodyRef.value) {
    threadBodyRef.value.scrollTop = threadBodyRef.value.scrollHeight;
  }
}

function handleOpenProfile(): void {
  if (!props.chat?.publicKey) {
    return;
  }

  emit('open-profile', props.chat.publicKey);
}

watch(
  () => [props.chat?.id, props.messages.length],
  () => {
    void scrollToBottom();
  },
  { immediate: true }
);
</script>

<style scoped>
.thread-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--tg-thread-bg);
}

.thread-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--tg-border);
  background: var(--tg-sidebar);
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
}

.thread-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  opacity: 0.7;
}

.thread-empty__mark {
  font-size: 48px;
  line-height: 1;
}
</style>
