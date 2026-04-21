<template>
  <div class="home-timeline-header scroll-elevated scroll-divider">
    <q-tabs
      v-model="activeTab"
      no-caps
      dense
      class="home-timeline-header__tabs"
      active-color="white"
      indicator-color="primary"
      narrow-indicator
    >
      <q-tab name="all" label="All" />
      <q-tab name="following" label="Following" />
    </q-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useUiStore } from '../../stores/ui';
import type { HomeTimelineTab } from '../../types/nostr';

const uiStore = useUiStore();

const activeTab = computed<HomeTimelineTab>({
  get: () => uiStore.homeTimelineTab,
  set: (tab) => {
    uiStore.setHomeTimelineTab(tab);
  },
});
</script>

<style scoped>
.home-timeline-header {
  position: sticky;
  top: 0;
  z-index: 20;
}

.home-timeline-header__tabs {
  min-height: 53px;
}

.home-timeline-header__tabs :deep(.q-tab) {
  min-height: 53px;
  color: var(--scroll-text-muted);
  font-weight: 700;
}

.home-timeline-header__tabs :deep(.q-tab:hover) {
  background: var(--scroll-hover);
}

.home-timeline-header__tabs :deep(.q-tab--active) {
  color: var(--scroll-text);
}
</style>
