<template>
  <q-page class="timeline-page">
    <HomeTimelineHeader />
    <PostComposer :submitting="feedStore.publishingPost" @submit="void feedStore.createPost($event)" />
    <FeedList
      :posts="posts"
      :preview-chars="300"
      :empty-title="emptyTitle"
      :empty-subtitle="emptySubtitle"
      :loading="isLoading"
      :error-message="errorMessage"
      :can-load-more="canLoadMore"
      :loading-more="isLoadingMore"
      @load-more="void feedStore.loadMoreHome(activeTab)"
    />
  </q-page>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import FeedList from '../components/feed/FeedList.vue';
import PostComposer from '../components/feed/PostComposer.vue';
import HomeTimelineHeader from '../components/layout/HomeTimelineHeader.vue';
import { useFeedStore } from '../stores/feed';
import { useUiStore } from '../stores/ui';

const feedStore = useFeedStore();
const uiStore = useUiStore();

const activeTab = computed(() => uiStore.homeTimelineTab);
const posts = computed(() => feedStore.getHomeTimeline(activeTab.value));
const isLoading = computed(() => feedStore.isHomeTimelineLoading(activeTab.value));
const errorMessage = computed(() => feedStore.getHomeTimelineError(activeTab.value));
const canLoadMore = computed(() => feedStore.canLoadMoreHome(activeTab.value));
const isLoadingMore = computed(() => feedStore.isHomeTimelineLoadingMore(activeTab.value));
const emptyTitle = computed(() =>
  activeTab.value === 'following' && feedStore.isFollowingListEmpty()
    ? 'No followed accounts yet'
    : 'Nothing on the timeline yet',
);
const emptySubtitle = computed(() =>
  activeTab.value === 'following' && feedStore.isFollowingListEmpty()
    ? 'Your follow list is empty.\nStart following someone or check what everyone is doing on the "All" tab'
    : 'Recent public notes from your configured relays will appear here.',
);

watch(
  activeTab,
  (tab) => {
    void feedStore.ensureHomeTimelineLoaded(tab);
  },
  { immediate: true },
);
</script>
