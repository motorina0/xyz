<template>
  <div class="settings-detail-layout">
    <div class="settings-detail-layout__header">
      <q-btn
        v-if="showMobileBackButton"
        flat
        dense
        round
        icon="arrow_back"
        aria-label="Back to settings"
        class="settings-detail-layout__back"
        @click="goBack"
      />
      <q-icon v-if="icon" :name="icon" size="20px" class="settings-detail-layout__icon" />
      <div class="settings-detail-layout__title">{{ title }}</div>
      <div class="settings-detail-layout__spacer" />
      <div class="settings-detail-layout__actions">
        <slot name="actions" />
      </div>
    </div>

    <div class="settings-detail-layout__body">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useQuasar } from 'quasar';
import { useRoute, useRouter } from 'vue-router';

defineProps<{
  title: string;
  icon?: string;
}>();

const $q = useQuasar();
const route = useRoute();
const router = useRouter();

const showMobileBackButton = computed(() => {
  return $q.screen.lt.md && String(route.name ?? '').startsWith('settings-');
});

function goBack(): void {
  void router.push({ name: 'settings' });
}
</script>

<style scoped>
.settings-detail-layout {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--tg-thread-bg);
}

.settings-detail-layout__header {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid var(--tg-border);
  background: var(--tg-sidebar);
}

.settings-detail-layout__title {
  font-size: 16px;
  font-weight: 600;
}

.settings-detail-layout__spacer {
  flex: 1;
}

.settings-detail-layout__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.settings-detail-layout__icon {
  margin-right: 10px;
  opacity: 0.82;
}

.settings-detail-layout__back {
  margin-right: 8px;
}

.settings-detail-layout__body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}
</style>
