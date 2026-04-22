<template>
  <div class="post-action-bar" @click.stop>
    <button class="post-action-bar__item post-action-bar__item--reply" type="button" @click="$emit('reply')">
      <span class="post-action-bar__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path
            d="M12 4.5c5.02 0 8.5 2.75 8.5 6.62 0 3.87-3.48 6.63-8.5 6.63-.8 0-1.58-.07-2.32-.22L5 20l1.12-4.18c-1.66-1.18-2.62-2.86-2.62-4.7C3.5 7.25 6.98 4.5 12 4.5Z"
          />
        </svg>
      </span>
      <span v-if="formatActionCount(post.stats.replies)">{{ formatActionCount(post.stats.replies) }}</span>
    </button>

    <button
      class="post-action-bar__item post-action-bar__item--repost"
      :class="{ 'post-action-bar__item--reposted': state.reposted }"
      type="button"
      :disabled="pending"
      @click="$emit('repost')"
    >
      <q-icon name="repeat" size="18px" />
      <span v-if="formatActionCount(post.stats.reposts)">{{ formatActionCount(post.stats.reposts) }}</span>
    </button>

    <button
      class="post-action-bar__item post-action-bar__item--like"
      :class="{ 'post-action-bar__item--liked': state.liked }"
      type="button"
      :disabled="pending"
      @click="$emit('like')"
    >
      <q-icon :name="state.liked ? 'favorite' : 'favorite_border'" size="18px" />
      <span v-if="formatActionCount(post.stats.likes)">{{ formatActionCount(post.stats.likes) }}</span>
    </button>

    <button
      class="post-action-bar__item post-action-bar__item--bookmark"
      :class="{ 'post-action-bar__item--bookmarked': state.bookmarked }"
      type="button"
      :disabled="pending"
      @click="$emit('bookmark')"
    >
      <q-icon :name="state.bookmarked ? 'bookmark' : 'bookmark_border'" size="18px" />
    </button>

    <button
      class="post-action-bar__item post-action-bar__item--share"
      type="button"
      :disabled="pending"
      @click="$emit('share')"
    >
      <q-icon name="share" size="18px" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { useFormatters } from '../../composables/useFormatters';
import type { NostrNote, ViewerPostState } from '../../types/nostr';

interface Props {
  post: NostrNote;
  state: ViewerPostState;
  pending?: boolean;
}

defineEmits<{
  reply: [];
  repost: [];
  like: [];
  bookmark: [];
  share: [];
}>();

withDefaults(defineProps<Props>(), {
  pending: false,
});

const { formatCompactCount } = useFormatters();

function formatActionCount(value?: number): string {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    return '';
  }

  return formatCompactCount(value);
}
</script>

<style scoped>
.post-action-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-top: 8px;
  max-width: 520px;
}

.post-action-bar__item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--scroll-text-soft);
  background: transparent;
  border: none;
  border-radius: 999px;
  padding: 6px 8px;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease;
}

.post-action-bar__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
}

.post-action-bar__icon svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.75;
}

.post-action-bar__item:hover:not(:disabled) {
  background: var(--scroll-hover);
}

.post-action-bar__item:disabled {
  cursor: default;
  opacity: 0.7;
}

.post-action-bar__item--reply:hover:not(:disabled),
.post-action-bar__item--bookmark:hover:not(:disabled),
.post-action-bar__item--share:hover:not(:disabled) {
  color: var(--scroll-accent);
  background: rgba(29, 155, 240, 0.12);
}

.post-action-bar__item--liked {
  color: var(--scroll-danger);
}

.post-action-bar__item--reposted {
  color: var(--scroll-success);
}

.post-action-bar__item--bookmarked {
  color: var(--scroll-accent-strong);
}

.post-action-bar__item--repost:hover:not(:disabled) {
  color: var(--scroll-success);
  background: rgba(0, 186, 124, 0.12);
}

.post-action-bar__item--like:hover:not(:disabled) {
  color: var(--scroll-danger);
  background: rgba(249, 24, 128, 0.12);
}
</style>
