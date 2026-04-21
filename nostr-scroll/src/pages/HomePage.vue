<template>
  <q-page class="timeline-page">
    <HomeTimelineHeader />
    <PostComposer :submitting="feedStore.publishingPost" @submit="void feedStore.createPost($event)" />
    <FeedList
      :posts="feedStore.homeTimeline"
      :preview-chars="300"
      empty-title="Nothing on the timeline yet"
      empty-subtitle="Recent public notes from your configured relays will appear here."
      :loading="feedStore.homeLoading"
      :error-message="feedStore.homeError"
      :can-load-more="feedStore.hasMoreHome"
      :loading-more="feedStore.loadingMore"
      @load-more="void feedStore.loadMoreHome()"
    />
  </q-page>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import FeedList from '../components/feed/FeedList.vue';
import PostComposer from '../components/feed/PostComposer.vue';
import HomeTimelineHeader from '../components/layout/HomeTimelineHeader.vue';
import { useFeedStore } from '../stores/feed';

const feedStore = useFeedStore();

onMounted(() => {
  void feedStore.ensureHydrated();
});
</script>
