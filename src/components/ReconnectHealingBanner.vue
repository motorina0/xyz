<template>
  <div
    v-if="isVisible"
    class="reconnect-healing-banner"
    :class="{ 'reconnect-healing-banner--expanded': isDetailsVisible }"
    :aria-live="isDetailsVisible ? 'polite' : 'off'"
  >
    <span v-if="isDetailsVisible" class="reconnect-healing-banner__label">
      {{ statusLabel }}
    </span>
    <q-linear-progress
      indeterminate
      color="primary"
      size="2px"
      class="reconnect-healing-banner__progress"
      aria-hidden="true"
    />
    <q-btn
      dense
      flat
      icon="more"
      size="xs"
      :ripple="false"
      class="reconnect-healing-banner__toggle"
      :aria-label="detailsButtonLabel"
      :aria-expanded="isDetailsVisible"
      @click="toggleDetails"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useNostrStore } from 'src/stores/nostrStore';

const nostrStore = useNostrStore();
const RECONNECT_HEALING_DETAILS_STORAGE_KEY = 'nostr-chat:reconnect-healing-details-visible';

const isDetailsVisible = ref(false);
const hasStartupActivity = computed(() =>
  nostrStore.startupSteps.some(
    (step) =>
      step.status === 'in_progress' ||
      step.internalTasks.some((task) => task.status === 'in_progress')
  )
);
const isVisible = computed(() => nostrStore.isReconnectHealing && !hasStartupActivity.value);
const statusLabel = computed(() => nostrStore.reconnectHealingStatusLabel ?? 'Preparing sync');
const detailsButtonLabel = computed(() =>
  isDetailsVisible.value ? 'Hide sync details' : 'Show sync details'
);

function toggleDetails(): void {
  isDetailsVisible.value = !isDetailsVisible.value;
}

function readStoredDetailsVisibility(): boolean {
  try {
    return window.localStorage.getItem(RECONNECT_HEALING_DETAILS_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeStoredDetailsVisibility(value: boolean): void {
  try {
    window.localStorage.setItem(RECONNECT_HEALING_DETAILS_STORAGE_KEY, String(value));
  } catch {
    // Ignore storage errors; the toggle should still work for the current session.
  }
}

onMounted(() => {
  isDetailsVisible.value = readStoredDetailsVisibility();
});

watch(isDetailsVisible, (value) => {
  writeStoredDetailsVisibility(value);
});
</script>

<style scoped>
.reconnect-healing-banner {
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  height: 0;
  min-height: 0;
  margin: 0;
  padding: 0;
  color: var(--nc-text-primary);
  font-size: 10px;
  font-weight: 600;
  line-height: 1.15;
  pointer-events: none;
}

.reconnect-healing-banner--expanded {
  position: relative;
  right: auto;
  bottom: auto;
  left: auto;
  z-index: auto;
  height: auto;
  min-height: 24px;
  margin: 6px -8px -8px;
  padding: 2px 34px 4px 8px;
  border-top: 1px solid var(--nc-border);
  background: color-mix(in srgb, var(--q-primary) 7%, var(--nc-panel-header-bg));
  pointer-events: auto;
}

.reconnect-healing-banner__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reconnect-healing-banner__progress {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  pointer-events: none;
}

.q-btn.reconnect-healing-banner__toggle {
  position: absolute;
  right: 3px;
  bottom: -4px;
  z-index: 1;
  min-height: 10px;
  min-width: 18px;
  width: 18px;
  height: 12px;
  padding: 0;
  color: var(--nc-text-secondary) !important;
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  transition: color 0.2s ease;
  pointer-events: auto;
}

.q-btn.reconnect-healing-banner__toggle :deep(.q-icon) {
  font-size: 14px;
}

.q-btn.reconnect-healing-banner__toggle:hover {
  color: var(--nc-text) !important;
}

.q-btn.reconnect-healing-banner__toggle::before {
  display: none;
  background: transparent;
  box-shadow: none;
}

.q-btn.reconnect-healing-banner__toggle :deep(.q-focus-helper) {
  display: none;
}
</style>
