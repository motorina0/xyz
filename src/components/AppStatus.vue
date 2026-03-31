<template>
  <div class="app-status" :class="{ 'app-status--compact': props.compact }">
    <q-expansion-item
      switch-toggle-side
      expand-separator
      expand-icon="keyboard_arrow_right"
      expanded-icon="keyboard_arrow_down"
      class="app-status__expansion"
    >
      <template #header>
        <q-item-section>
          <div class="app-status__header-main">
            <span class="app-status__summary">{{ statusHeadline }}</span>
            <span class="app-status__badge" :class="`app-status__badge--${overallTone}`">
              {{ overallLabel }}
            </span>
          </div>
        </q-item-section>
      </template>

      <div class="app-status__content">
        <div class="app-status__details">
          <div class="app-status__details-title">Startup history</div>

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
                <q-icon
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
      </div>
    </q-expansion-item>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { StartupStepSnapshot, StartupStepStatus } from 'src/stores/nostrStore';
import { useNostrStore } from 'src/stores/nostrStore';
import { useRelayStore } from 'src/stores/relayStore';

interface Props {
  compact?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  compact: false
});

const nostrStore = useNostrStore();
const relayStore = useRelayStore();

relayStore.init();

const relayConnectionSnapshot = computed(() => {
  void nostrStore.relayStatusVersion;

  const relayUrls = relayStore.relays;
  const connected = relayUrls.filter(
    (relayUrl) => nostrStore.getRelayConnectionState(relayUrl) === 'connected'
  );
  const offline = relayUrls.filter(
    (relayUrl) => nostrStore.getRelayConnectionState(relayUrl) !== 'connected'
  );

  return {
    total: relayUrls.length,
    connected,
    offline
  };
});

const startupSteps = computed(() => nostrStore.startupSteps);
const totalRelayCount = computed(() => relayConnectionSnapshot.value.total);
const connectedRelayCount = computed(() => relayConnectionSnapshot.value.connected.length);

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

const relaySummary = computed(() => {
  if (totalRelayCount.value === 0) {
    return 'No relays configured';
  }

  return `${connectedRelayCount.value}/${totalRelayCount.value} relays online`;
});

const hasHeaderActivity = computed(() => {
  return displayedStartupStep.value?.status === 'in_progress' || displayedStartupStep.value?.showProgress === true;
});

const relayHealthLabel = computed(() => {
  if (totalRelayCount.value === 0) {
    return 'No relays';
  }

  if (connectedRelayCount.value === totalRelayCount.value) {
    return 'Healthy';
  }

  if (connectedRelayCount.value > 0) {
    return 'Partial';
  }

  return 'Offline';
});

const relayHealthTone = computed(() => {
  if (totalRelayCount.value === 0) {
    return 'idle';
  }

  if (connectedRelayCount.value === totalRelayCount.value) {
    return 'good';
  }

  if (connectedRelayCount.value > 0) {
    return 'warn';
  }

  return 'issue';
});

const statusHeadline = computed(() => {
  if (hasHeaderActivity.value && displayedStartupStep.value) {
    return displayedStartupStep.value.label;
  }

  return relaySummary.value;
});

const overallLabel = computed(() => {
  if (hasHeaderActivity.value) {
    return 'Syncing';
  }

  return relayHealthLabel.value;
});

const overallTone = computed(() => {
  if (hasHeaderActivity.value) {
    return 'busy';
  }

  return relayHealthTone.value;
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
    return step.showProgress === true ? 'Fetching from relays...' : 'In progress';
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
  flex-shrink: 0;
  border-top: 1px solid var(--tg-border);
  background: var(--tg-panel-header-bg);
}

.app-status__expansion {
  background: transparent;
}

.app-status__expansion :deep(.q-item) {
  align-items: center;
  min-height: 60px;
  padding: 10px;
}

.app-status__expansion :deep(.q-item__section--side) {
  color: var(--tg-text-secondary);
  padding-left: 12px;
}

.app-status__expansion :deep(.q-expansion-item__content) {
  background: var(--tg-surface-soft);
}

.app-status__header-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 40px;
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

.app-status__badge--good {
  color: #0f5f43;
  background: rgba(28, 166, 121, 0.16);
}

.app-status__badge--warn {
  color: #9a5b00;
  background: rgba(245, 158, 11, 0.16);
}

.app-status__badge--issue {
  color: #b42318;
  background: rgba(239, 68, 68, 0.14);
}

.app-status__badge--busy,
.app-status__badge--idle {
  color: #235e97;
  background: rgba(59, 130, 246, 0.14);
}

.app-status__summary {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
  color: var(--tg-text-secondary);
}

.app-status__content {
  padding: 0 13px 13px;
  display: grid;
  gap: 12px;
}

.app-status__details {
  padding: 12px;
  border-radius: 12px;
  background: var(--tg-surface-soft-strong);
}

.app-status__details-title {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 8px;
}

.app-status__details-copy {
  font-size: 12px;
  line-height: 1.5;
  color: var(--tg-text-secondary);
}

.app-status__history-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: start;
  min-height: var(--app-status-history-item-height);
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
  color: var(--tg-text-secondary);
}

.app-status__history-list {
  display: grid;
  gap: 10px;
}

.app-status__history-scroll {
  max-height: calc(var(--app-status-history-item-height) * 5);
  overflow-y: auto;
  padding-right: 4px;
}

.app-status__history-item + .app-status__history-item {
  padding-top: 10px;
  border-top: 1px solid var(--tg-border);
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

body.body--dark .app-status__expansion :deep(.q-item__section--side) {
  color: var(--tg-text-secondary);
}

body.body--dark .app-status__badge--good {
  color: #79e0b2;
  background: rgba(18, 122, 91, 0.34);
}

body.body--dark .app-status__badge--warn {
  color: #ffd18a;
  background: rgba(180, 118, 0, 0.26);
}

body.body--dark .app-status__badge--issue {
  color: #ffb2a7;
  background: rgba(185, 28, 28, 0.28);
}

body.body--dark .app-status__badge--busy,
body.body--dark .app-status__badge--idle {
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
  color: var(--tg-text-secondary);
}

.app-status--compact {
  --app-status-history-item-height: 50px;
}

.app-status--compact .app-status__expansion :deep(.q-item) {
  min-height: 48px;
  padding: 8px 10px;
}

.app-status--compact .app-status__header-main {
  min-height: 30px;
}

.app-status--compact .app-status__summary {
  font-size: 12px;
}

.app-status--compact .app-status__badge {
  min-height: 20px;
  padding: 0 8px;
  font-size: 10px;
}

.app-status--compact .app-status__content {
  padding: 0 10px 10px;
}

.app-status--compact .app-status__details {
  padding: 10px;
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

  .app-status__expansion :deep(.q-item) {
    min-height: 50px;
    padding: 7px 10px;
  }

  .app-status__expansion :deep(.q-item__section--side) {
    padding-left: 8px;
  }

  .app-status__header-main {
    gap: 10px;
    min-height: 32px;
  }

  .app-status__summary {
    font-size: 12px;
  }

  .app-status__badge {
    min-height: 20px;
    padding: 0 8px;
    font-size: 10px;
    letter-spacing: 0.06em;
  }

  .app-status__content {
    padding: 0 10px 10px;
    gap: 10px;
  }

  .app-status__details {
    padding: 10px;
    border-radius: 10px;
  }

  .app-status__details-title {
    font-size: 12px;
    margin-bottom: 6px;
  }

  .app-status__details-copy,
  .app-status__history-meta,
  .app-status__history-duration {
    font-size: 11px;
  }

  .app-status__history-label {
    font-size: 12px;
  }

  .app-status__history-list {
    gap: 8px;
  }

  .app-status__history-scroll {
    max-height: calc(var(--app-status-history-item-height) * 4);
    padding-right: 2px;
  }

  .app-status__history-item + .app-status__history-item {
    padding-top: 8px;
  }
}
</style>
