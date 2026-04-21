<template>
  <div class="feed-list">
    <div v-if="loading && posts.length === 0" class="feed-list__status">
      <q-spinner color="primary" size="28px" />
    </div>

    <EmptyState
      v-else-if="errorMessage && posts.length === 0"
      title="Could not load posts"
      :subtitle="errorMessage"
    />

    <template v-else-if="posts.length">
      <PostCard
        v-for="post in posts"
        :key="post.id"
        :post="post"
        :preview-chars="previewChars"
      />

      <div ref="sentinelRef" class="feed-list__sentinel">
        <q-spinner v-if="loadingMore" color="primary" size="28px" />
        <span v-else-if="canLoadMore" class="text-scroll-soft">Loading more posts…</span>
      </div>
    </template>

    <EmptyState v-else :title="emptyTitle" :subtitle="emptySubtitle" />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import EmptyState from './EmptyState.vue';
import PostCard from './PostCard.vue';
import type { NostrNote } from '../../types/nostr';

interface Props {
  posts: NostrNote[];
  emptyTitle: string;
  emptySubtitle: string;
  loading?: boolean;
  errorMessage?: string;
  canLoadMore?: boolean;
  loadingMore?: boolean;
  previewChars?: number | null;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  errorMessage: '',
  canLoadMore: false,
  loadingMore: false,
  previewChars: null,
});

const emit = defineEmits<{
  'load-more': [];
}>();

const sentinelRef = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

function observeSentinel(): void {
  if (!sentinelRef.value || observer) {
    return;
  }

  observer = new IntersectionObserver(
    ([entry]) => {
      if (entry?.isIntersecting && props.canLoadMore && !props.loadingMore) {
        emit('load-more');
      }
    },
    {
      rootMargin: '260px 0px',
    },
  );

  observer.observe(sentinelRef.value);
}

onMounted(observeSentinel);

watch(sentinelRef, () => {
  if (!observer) {
    observeSentinel();
  }
});

onBeforeUnmount(() => {
  observer?.disconnect();
});
</script>

<style scoped>
.feed-list__status,
.feed-list__sentinel {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 74px;
  color: var(--scroll-text-soft);
}
</style>
