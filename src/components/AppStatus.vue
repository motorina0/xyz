<template>
  <div class="app-status">
    <section class="app-status__card">
      <div class="app-status__card-header">
        <div class="app-status__card-copy">
          <div class="app-status__card-title">Startup History</div>
          <div class="app-status__card-subtitle">{{ cardSubtitle }}</div>
        </div>
        <span v-if="hasHeaderActivity" class="app-status__badge app-status__badge--busy">
          Syncing
        </span>
      </div>

      <div class="app-status__content">
        <div v-if="startupHistory.length === 0" class="app-status__details-copy">
          No startup steps recorded yet.
        </div>

        <div v-else class="app-status__history-scroll">
          <div class="app-status__history-list">
            <div
              v-for="step in startupHistory"
              :key="step.id"
              class="app-status__history-item"
            >
              <div v-if="step.status === 'in_progress'" class="app-status__progress-track">
                <q-linear-progress
                  indeterminate
                  rounded
                  color="primary"
                  track-color="transparent"
                  class="app-status__progress-bar"
                />
              </div>
              <q-icon
                v-else
                :name="startupStatusIcon(step.status)"
                :class="startupStatusClass(step.status)"
                size="16px"
              />
              <div class="app-status__history-copy">
                <div class="app-status__history-label">{{ step.label }}</div>
                <div class="app-status__history-meta">{{ startupStepMeta(step) }}</div>
              </div>
              <div class="app-status__history-duration">{{ startupStepDuration(step) }}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { StartupStepSnapshot, StartupStepStatus } from 'src/stores/nostrStore';
import { useNostrStore } from 'src/stores/nostrStore';

const nostrStore = useNostrStore();

const startupSteps = computed(() => nostrStore.startupSteps);

const displayedStartupStep = computed(() => {
  const displayStepId = nostrStore.startupDisplay.stepId;
  if (!displayStepId) {
    return null;
  }

  const step = startupSteps.value.find((entry) => entry.id === displayStepId);
  if (!step) {
    return null;
  }

  return {
    ...step,
    status: nostrStore.startupDisplay.status ?? step.status,
    showProgress: nostrStore.startupDisplay.showProgress
  };
});

const startupHistory = computed(() => {
  const inProgress = startupSteps.value
    .filter((step) => step.status === 'in_progress')
    .sort((first, second) => (second.startedAt ?? 0) - (first.startedAt ?? 0));
  const finished = startupSteps.value
    .filter((step) => step.status === 'success' || step.status === 'error')
    .sort((first, second) => (second.completedAt ?? 0) - (first.completedAt ?? 0));
  const pending = startupSteps.value
    .filter((step) => step.status === 'pending')
    .sort((first, second) => first.order - second.order);

  return [...inProgress, ...finished, ...pending];
});

const hasHeaderActivity = computed(() => {
  return displayedStartupStep.value?.status === 'in_progress' || displayedStartupStep.value?.showProgress === true;
});

const cardSubtitle = computed(() => {
  if (hasHeaderActivity.value && displayedStartupStep.value) {
    return displayedStartupStep.value.label;
  }

  return 'Recent startup and sync activity.';
});

function startupStatusIcon(status: StartupStepStatus | null): string {
  if (status === 'success') {
    return 'check_circle';
  }

  if (status === 'error') {
    return 'cancel';
  }

  if (status === 'in_progress') {
    return 'radio_button_unchecked';
  }

  return 'more_horiz';
}

function startupStatusClass(status: StartupStepStatus | null): string {
  if (status === 'success') {
    return 'app-status__status-icon app-status__status-icon--success';
  }

  if (status === 'error') {
    return 'app-status__status-icon app-status__status-icon--error';
  }

  if (status === 'in_progress') {
    return 'app-status__status-icon app-status__status-icon--progress';
  }

  return 'app-status__status-icon app-status__status-icon--pending';
}

function startupStepMeta(
  step: StartupStepSnapshot | (StartupStepSnapshot & { showProgress?: boolean })
): string {
  if (step.status === 'error') {
    return step.errorMessage?.trim() || 'Failed';
  }

  if (step.status === 'success') {
    return `Completed in ${startupStepDuration(step)}`;
  }

  if (step.status === 'in_progress') {
    return 'showProgress' in step && step.showProgress === true
      ? 'Fetching from relays...'
      : 'In progress';
  }

  return 'Pending';
}

function startupStepDuration(step: StartupStepSnapshot): string {
  if (typeof step.durationMs !== 'number' || !Number.isFinite(step.durationMs)) {
    return step.status === 'in_progress' ? 'Running' : 'Pending';
  }

  if (step.durationMs < 1000) {
    return `${Math.max(1, Math.round(step.durationMs))} ms`;
  }

  return `${(step.durationMs / 1000).toFixed(step.durationMs >= 10000 ? 0 : 1)} s`;
}
</script>

<style scoped>
.app-status {
  --app-status-history-item-height: 58px;
  height: 100%;
  min-height: 0;
}

.app-status__card {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  border: 1px solid color-mix(in srgb, var(--nc-border) 88%, #8ea4c0 12%);
  border-radius: 14px;
  overflow: hidden;
  background: color-mix(in srgb, var(--nc-sidebar) 92%, transparent);
}

.app-status__card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--nc-border) 90%, transparent);
  background: color-mix(in srgb, var(--nc-panel-header-bg) 92%, rgba(255, 255, 255, 0.08));
}

.app-status__card-copy {
  min-width: 0;
  flex: 1;
}

.app-status__card-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--nc-text);
}

.app-status__card-subtitle {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--nc-text-secondary);
}

.app-status__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
}

.app-status__badge--busy {
  color: #235e97;
  background: rgba(59, 130, 246, 0.14);
}

.app-status__content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 14px 16px 16px;
}

.app-status__details-copy {
  font-size: 12px;
  line-height: 1.5;
  color: var(--nc-text-secondary);
}

.app-status__history-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: start;
  min-height: var(--app-status-history-item-height);
}

.app-status__progress-track {
  width: 26px;
  padding-top: 7px;
}

.app-status__progress-bar {
  height: 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--nc-border) 70%, transparent);
}

.app-status__history-copy {
  min-width: 0;
}

.app-status__history-label {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
}

.app-status__history-meta,
.app-status__history-duration {
  font-size: 12px;
  line-height: 1.45;
  color: var(--nc-text-secondary);
}

.app-status__history-list {
  display: grid;
  gap: 10px;
}

.app-status__history-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}

.app-status__history-item + .app-status__history-item {
  padding-top: 10px;
  border-top: 1px solid var(--nc-border);
}

.app-status__history-duration {
  white-space: nowrap;
}

.app-status__status-icon {
  margin-top: 1px;
}

.app-status__status-icon--success {
  color: #16a34a;
}

.app-status__status-icon--error {
  color: #dc2626;
}

.app-status__status-icon--progress,
.app-status__status-icon--pending {
  color: #74839b;
}

body.body--dark .app-status__badge--busy {
  color: #a8d0ff;
  background: rgba(37, 99, 235, 0.24);
}

body.body--dark .app-status__status-icon--success {
  color: #7ee2a8;
}

body.body--dark .app-status__status-icon--error {
  color: #ff9b90;
}

body.body--dark .app-status__status-icon--progress,
body.body--dark .app-status__status-icon--pending {
  color: var(--nc-text-secondary);
}

@media (max-width: 420px) {
  .app-status__history-item {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .app-status__history-duration {
    grid-column: 2;
  }
}

@media (max-width: 1023px) {
  .app-status {
    --app-status-history-item-height: 52px;
  }

  .app-status__card-header {
    padding: 12px 14px;
  }

  .app-status__badge {
    min-height: 22px;
    padding: 0 9px;
    font-size: 10px;
  }

  .app-status__content {
    padding: 12px 14px 14px;
  }

  .app-status__history-scroll {
    min-height: 0;
  }
}
</style>
