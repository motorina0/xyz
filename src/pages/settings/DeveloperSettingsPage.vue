<template>
  <SettingsDetailLayout title="Developer" icon="terminal">
    <template #actions>
      <q-btn
        flat
        dense
        no-caps
        icon="refresh"
        label="Refresh"
        :loading="isRefreshingDiagnostics"
        @click="refreshDiagnostics"
      />
    </template>

    <div class="developer-page">
      <q-card flat bordered class="developer-card">
        <q-card-section class="developer-card__row">
          <div>
            <div class="text-body1">Debug logging</div>
            <div class="text-caption text-grey-6">
              Keep an in-app ring buffer of relay and ingest traces for this session.
            </div>
          </div>

          <q-toggle
            :model-value="nostrStore.developerDiagnosticsEnabled"
            color="primary"
            checked-icon="bug_report"
            unchecked-icon="bug_report"
            @update:model-value="handleDeveloperDiagnosticsToggle"
          />
        </q-card-section>
      </q-card>

      <q-card flat bordered class="developer-card">
        <q-card-section class="developer-card__header">
          <div>
            <div class="text-h6">Actions</div>
            <div class="text-caption text-grey-6">
              Restart subscriptions, reconnect relays, and export the current diagnostic bundle.
            </div>
          </div>
        </q-card-section>

        <q-card-section class="developer-actions">
          <div class="developer-actions__main">
            <q-btn
              unelevated
              no-caps
              color="primary"
              icon="restart_alt"
              label="Restart DM Subscription"
              :loading="isRestartingSubscription"
              @click="handleRestartSubscription"
            />
            <q-btn
              flat
              no-caps
              icon="sync"
              label="Reconnect All Relays"
              :loading="isReconnectingAllRelays"
              @click="handleReconnectAllRelays"
            />
            <q-btn
              flat
              no-caps
              icon="content_copy"
              label="Copy JSON"
              @click="handleCopyDiagnostics"
            />
            <q-btn
              flat
              no-caps
              icon="download"
              label="Download JSON"
              @click="handleDownloadDiagnostics"
            />
            <q-btn
              flat
              no-caps
              color="negative"
              icon="delete_sweep"
              label="Clear Trace"
              @click="handleClearTrace"
            />
          </div>

          <div class="developer-actions__replay">
            <q-input
              v-model.number="replayLookbackMinutes"
              outlined
              dense
              type="number"
              min="1"
              label="Replay lookback (minutes)"
              class="developer-actions__replay-input"
            />
            <q-btn
              outline
              no-caps
              icon="history"
              label="Reload From Lookback"
              :loading="isReloadingFromLookback"
              @click="handleReloadFromLookback"
            />
          </div>
        </q-card-section>
      </q-card>

      <q-card flat bordered class="developer-card">
        <q-card-section class="developer-card__header">
          <div>
            <div class="text-h6">Nostr Session</div>
            <div class="text-caption text-grey-6">
              Current login, relay resolution, and cursor state used by the app.
            </div>
          </div>
        </q-card-section>

        <q-card-section v-if="diagnostics" class="developer-card__section">
          <div class="developer-facts">
            <div class="developer-facts__label">Auth method</div>
            <div class="developer-facts__value">{{ diagnostics.session.authMethod ?? 'none' }}</div>

            <div class="developer-facts__label">Logged in pubkey</div>
            <div class="developer-facts__value developer-facts__value--mono">
              {{ diagnostics.session.loggedInPubkey ?? 'Not logged in' }}
            </div>

            <div class="developer-facts__label">Event cursor</div>
            <div class="developer-facts__value developer-facts__value--mono">
              {{ diagnostics.session.eventSince }}<span v-if="diagnostics.session.eventSinceIso"> · {{ diagnostics.session.eventSinceIso }}</span>
            </div>

            <div class="developer-facts__label">Filter since</div>
            <div class="developer-facts__value developer-facts__value--mono">
              {{ diagnostics.session.filterSince }}<span v-if="diagnostics.session.filterSinceIso"> · {{ diagnostics.session.filterSinceIso }}</span>
            </div>

            <div class="developer-facts__label">Startup restore</div>
            <div class="developer-facts__value">
              {{ diagnostics.session.isRestoringStartupState ? 'running' : 'idle' }}
            </div>

            <div class="developer-facts__label">NIP-07 extension</div>
            <div class="developer-facts__value">
              {{ diagnostics.session.hasNip07Extension ? 'available' : 'not detected' }}
            </div>
          </div>

          <div class="developer-chip-group">
            <div class="developer-chip-group__label">App relays</div>
            <div class="developer-chip-group__items">
              <q-chip
                v-for="relayUrl in diagnostics.session.appRelayUrls"
                :key="`app-${relayUrl}`"
                dense
                class="developer-chip developer-chip--mono"
              >
                {{ relayUrl }}
              </q-chip>
              <div v-if="diagnostics.session.appRelayUrls.length === 0" class="developer-empty-inline">
                No app relays configured.
              </div>
            </div>
          </div>

          <div class="developer-chip-group">
            <div class="developer-chip-group__label">My relays (NIP-65)</div>
            <div class="developer-chip-group__items">
              <q-chip
                v-for="relay in diagnostics.session.myRelayEntries"
                :key="`mine-${relay.url}`"
                dense
                class="developer-chip developer-chip--mono"
              >
                {{ relay.url }}
                <span class="developer-chip__meta">
                  {{ relay.read !== false ? 'R' : '' }}{{ relay.write !== false ? 'W' : '' }}
                </span>
              </q-chip>
              <div v-if="diagnostics.session.myRelayEntries.length === 0" class="developer-empty-inline">
                No NIP-65 relays found.
              </div>
            </div>
          </div>

          <div class="developer-chip-group">
            <div class="developer-chip-group__label">Effective read relays</div>
            <div class="developer-chip-group__items">
              <q-chip
                v-for="relayUrl in diagnostics.session.effectiveReadRelayUrls"
                :key="`read-${relayUrl}`"
                dense
                class="developer-chip developer-chip--mono"
              >
                {{ relayUrl }}
              </q-chip>
              <div v-if="diagnostics.session.effectiveReadRelayUrls.length === 0" class="developer-empty-inline">
                No read relays resolved.
              </div>
            </div>
          </div>

          <div class="developer-chip-group">
            <div class="developer-chip-group__label">Effective publish relays</div>
            <div class="developer-chip-group__items">
              <q-chip
                v-for="relayUrl in diagnostics.session.effectivePublishRelayUrls"
                :key="`publish-${relayUrl}`"
                dense
                class="developer-chip developer-chip--mono"
              >
                {{ relayUrl }}
              </q-chip>
              <div v-if="diagnostics.session.effectivePublishRelayUrls.length === 0" class="developer-empty-inline">
                No publish relays resolved.
              </div>
            </div>
          </div>
        </q-card-section>
      </q-card>

      <q-card flat bordered class="developer-card">
        <q-card-section class="developer-card__header">
          <div>
            <div class="text-h6">Private Messages Subscription</div>
            <div class="text-caption text-grey-6">
              Active DM subscription details, last event seen, and current relay set.
            </div>
          </div>
          <q-badge :color="subscriptionBadgeColor" outline>
            {{ diagnostics?.privateMessagesSubscription.active ? 'active' : 'inactive' }}
          </q-badge>
        </q-card-section>

        <q-card-section v-if="diagnostics" class="developer-card__section">
          <div class="developer-facts">
            <div class="developer-facts__label">Signature</div>
            <div class="developer-facts__value developer-facts__value--mono">
              {{ diagnostics.privateMessagesSubscription.signature ?? 'none' }}
            </div>

            <div class="developer-facts__label">Since</div>
            <div class="developer-facts__value developer-facts__value--mono">
              {{ diagnostics.privateMessagesSubscription.since ?? 'n/a' }}
              <span v-if="diagnostics.privateMessagesSubscription.sinceIso">
                · {{ diagnostics.privateMessagesSubscription.sinceIso }}
              </span>
            </div>

            <div class="developer-facts__label">Restore throttle</div>
            <div class="developer-facts__value">
              {{ diagnostics.privateMessagesSubscription.restoreThrottleMs }} ms
            </div>

            <div class="developer-facts__label">Started</div>
            <div class="developer-facts__value developer-facts__value--mono">
              {{ diagnostics.privateMessagesSubscription.startedAt ?? 'n/a' }}
            </div>

            <div class="developer-facts__label">Last event seen</div>
            <div class="developer-facts__value developer-facts__value--mono">
              {{ diagnostics.privateMessagesSubscription.lastEventSeenAt ?? 'n/a' }}
            </div>

            <div class="developer-facts__label">Last event id</div>
            <div class="developer-facts__value developer-facts__value--mono">
              {{ diagnostics.privateMessagesSubscription.lastEventId ?? 'n/a' }}
            </div>

            <div class="developer-facts__label">Last event created_at</div>
            <div class="developer-facts__value developer-facts__value--mono">
              {{ diagnostics.privateMessagesSubscription.lastEventCreatedAt ?? 'n/a' }}
              <span v-if="diagnostics.privateMessagesSubscription.lastEventCreatedAtIso">
                · {{ diagnostics.privateMessagesSubscription.lastEventCreatedAtIso }}
              </span>
            </div>

            <div class="developer-facts__label">Last EOSE</div>
            <div class="developer-facts__value developer-facts__value--mono">
              {{ diagnostics.privateMessagesSubscription.lastEoseAt ?? 'n/a' }}
            </div>
          </div>

          <div class="developer-chip-group">
            <div class="developer-chip-group__label">Subscription relays</div>
            <div class="developer-chip-group__items">
              <q-chip
                v-for="relayUrl in diagnostics.privateMessagesSubscription.relayUrls"
                :key="`subscription-${relayUrl}`"
                dense
                class="developer-chip developer-chip--mono"
              >
                {{ relayUrl }}
              </q-chip>
              <div
                v-if="diagnostics.privateMessagesSubscription.relayUrls.length === 0"
                class="developer-empty-inline"
              >
                No active DM subscription relays.
              </div>
            </div>
          </div>
        </q-card-section>
      </q-card>

      <q-card flat bordered class="developer-card">
        <q-card-section class="developer-card__header">
          <div>
            <div class="text-h6">Relay Status</div>
            <div class="text-caption text-grey-6">
              Effective relay set with connection state, roles, and quick reconnect actions.
            </div>
          </div>
        </q-card-section>

        <q-card-section v-if="diagnostics" class="developer-card__section developer-card__section--flush">
          <div v-if="diagnostics.relayRows.length === 0" class="developer-empty-state">
            No relay diagnostics available yet.
          </div>

          <q-markup-table v-else flat class="developer-table">
            <thead>
              <tr>
                <th class="text-left">Relay</th>
                <th class="text-left">Roles</th>
                <th class="text-left">Status</th>
                <th class="text-left">Attempts</th>
                <th class="text-left">Connected at</th>
                <th class="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="relay in diagnostics.relayRows" :key="relay.url">
                <td class="developer-table__mono">{{ relay.url }}</td>
                <td>{{ relayRoles(relay) }}</td>
                <td>
                  <q-badge :color="relay.connected ? 'positive' : 'negative'" outline>
                    {{ relay.statusName ?? (relay.connected ? 'CONNECTED' : 'MISSING') }}
                  </q-badge>
                </td>
                <td>{{ relay.attempts ?? 'n/a' }}</td>
                <td class="developer-table__mono">
                  {{ relay.connectedAt ? formatUnixTimestamp(relay.connectedAt) : 'n/a' }}
                </td>
                <td class="text-right">
                  <q-btn
                    flat
                    dense
                    no-caps
                    icon="sync"
                    label="Reconnect"
                    :loading="Boolean(reconnectingRelayUrls[relay.url])"
                    @click="handleReconnectRelay(relay.url)"
                  />
                </td>
              </tr>
            </tbody>
          </q-markup-table>
        </q-card-section>
      </q-card>

      <q-card flat bordered class="developer-card">
        <q-card-section class="developer-card__header">
          <div>
            <div class="text-h6">Pending Queues</div>
            <div class="text-caption text-grey-6">
              Incoming reactions and deletions waiting on their target messages or events.
            </div>
          </div>
        </q-card-section>

        <q-card-section v-if="diagnostics" class="developer-card__section">
          <div class="developer-queue-summary">
            <q-badge color="primary" outline>
              Reactions: {{ totalPendingReactions }}
            </q-badge>
            <q-badge color="secondary" outline>
              Deletions: {{ totalPendingDeletions }}
            </q-badge>
          </div>

          <div class="developer-queues">
            <div class="developer-queue">
              <div class="developer-queue__title">Pending reactions</div>
              <div v-if="diagnostics.pendingReactions.length === 0" class="developer-empty-inline">
                No pending reactions.
              </div>
              <q-expansion-item
                v-for="entry in diagnostics.pendingReactions"
                :key="`reaction-${entry.targetEventId}`"
                dense
                expand-separator
                class="developer-expansion"
                :label="`${entry.targetEventId} (${entry.count})`"
              >
                <pre class="developer-json">{{ formatJson(entry) }}</pre>
              </q-expansion-item>
            </div>

            <div class="developer-queue">
              <div class="developer-queue__title">Pending deletions</div>
              <div v-if="diagnostics.pendingDeletions.length === 0" class="developer-empty-inline">
                No pending deletions.
              </div>
              <q-expansion-item
                v-for="entry in diagnostics.pendingDeletions"
                :key="`deletion-${entry.targetEventId}`"
                dense
                expand-separator
                class="developer-expansion"
                :label="`${entry.targetEventId} (${entry.count})`"
              >
                <pre class="developer-json">{{ formatJson(entry) }}</pre>
              </q-expansion-item>
            </div>
          </div>
        </q-card-section>
      </q-card>

      <q-card flat bordered class="developer-card">
        <q-card-section class="developer-card__header">
          <div>
            <div class="text-h6">Recent Trace</div>
            <div class="text-caption text-grey-6">
              Most recent relay, subscription, and ingest diagnostics captured in-app.
            </div>
          </div>
          <q-badge color="primary" outline>{{ traceEntries.length }}</q-badge>
        </q-card-section>

        <q-card-section class="developer-card__section">
          <div v-if="traceEntries.length === 0" class="developer-empty-state">
            No trace entries captured yet.
          </div>

          <q-expansion-item
            v-for="entry in traceEntries"
            :key="entry.id"
            dense
            expand-separator
            class="developer-expansion"
          >
            <template #header>
              <div class="developer-trace__header">
                <q-badge :color="traceLevelColor(entry.level)" outline>
                  {{ entry.level }}
                </q-badge>
                <div class="developer-trace__title">
                  <span class="developer-trace__scope">{{ entry.scope }}</span>
                  <span class="developer-trace__phase">{{ entry.phase }}</span>
                </div>
                <div class="developer-trace__timestamp developer-facts__value--mono">
                  {{ entry.timestamp }}
                </div>
              </div>
            </template>

            <pre class="developer-json">{{ formatJson(entry.details) }}</pre>
          </q-expansion-item>
        </q-card-section>
      </q-card>
    </div>
  </SettingsDetailLayout>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import SettingsDetailLayout from 'src/components/SettingsDetailLayout.vue';
import type {
  DeveloperDiagnosticsSnapshot,
  DeveloperRelayRow,
  DeveloperTraceEntry,
  DeveloperTraceLevel
} from 'src/stores/nostrStore';
import { useNostrStore } from 'src/stores/nostrStore';
import { reportUiError } from 'src/utils/uiErrorHandler';

const $q = useQuasar();
const nostrStore = useNostrStore();

const diagnostics = ref<DeveloperDiagnosticsSnapshot | null>(null);
const isRefreshingDiagnostics = ref(false);
const isRestartingSubscription = ref(false);
const isReconnectingAllRelays = ref(false);
const isReloadingFromLookback = ref(false);
const reconnectingRelayUrls = ref<Record<string, boolean>>({});
const replayLookbackMinutes = ref(180);

let refreshRequestId = 0;
let refreshDebounceId: ReturnType<typeof globalThis.setTimeout> | null = null;

const traceEntries = computed<DeveloperTraceEntry[]>(() => {
  return [...nostrStore.developerTraceEntries].reverse();
});

const totalPendingReactions = computed(() => {
  return diagnostics.value?.pendingReactions.reduce((sum, entry) => sum + entry.count, 0) ?? 0;
});

const totalPendingDeletions = computed(() => {
  return diagnostics.value?.pendingDeletions.reduce((sum, entry) => sum + entry.count, 0) ?? 0;
});

const subscriptionBadgeColor = computed(() => {
  return diagnostics.value?.privateMessagesSubscription.active ? 'positive' : 'negative';
});

watch(
  [() => nostrStore.relayStatusVersion, () => nostrStore.developerDiagnosticsVersion],
  () => {
    if (refreshDebounceId !== null) {
      globalThis.clearTimeout(refreshDebounceId);
    }

    refreshDebounceId = globalThis.setTimeout(() => {
      refreshDebounceId = null;
      void refreshDiagnostics();
    }, 120);
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  if (refreshDebounceId !== null) {
    globalThis.clearTimeout(refreshDebounceId);
    refreshDebounceId = null;
  }
});

async function refreshDiagnostics(): Promise<void> {
  const requestId = ++refreshRequestId;
  isRefreshingDiagnostics.value = true;

  try {
    const snapshot = await nostrStore.getDeveloperDiagnosticsSnapshot();
    if (requestId !== refreshRequestId) {
      return;
    }

    diagnostics.value = snapshot;
  } catch (error) {
    reportUiError('Failed to refresh developer diagnostics', error, 'Failed to refresh developer diagnostics.');
  } finally {
    if (requestId === refreshRequestId) {
      isRefreshingDiagnostics.value = false;
    }
  }
}

function handleDeveloperDiagnosticsToggle(enabled: boolean): void {
  nostrStore.setDeveloperDiagnosticsEnabled(enabled);
}

async function handleRestartSubscription(): Promise<void> {
  if (isRestartingSubscription.value) {
    return;
  }

  isRestartingSubscription.value = true;
  try {
    await nostrStore.restartPrivateMessagesDiagnosticsSubscription();
    $q.notify({
      type: 'positive',
      message: 'Private messages subscription restarted.',
      position: 'top-right'
    });
  } catch (error) {
    reportUiError('Failed to restart private messages subscription', error, 'Failed to restart DM subscription.');
  } finally {
    isRestartingSubscription.value = false;
  }
}

async function handleReconnectAllRelays(): Promise<void> {
  if (isReconnectingAllRelays.value) {
    return;
  }

  isReconnectingAllRelays.value = true;
  try {
    await nostrStore.reconnectAllDeveloperRelays();
    $q.notify({
      type: 'positive',
      message: 'Reconnect attempt started for all relays.',
      position: 'top-right'
    });
  } catch (error) {
    reportUiError('Failed to reconnect all relays', error, 'Failed to reconnect relays.');
  } finally {
    isReconnectingAllRelays.value = false;
  }
}

async function handleReconnectRelay(relayUrl: string): Promise<void> {
  reconnectingRelayUrls.value = {
    ...reconnectingRelayUrls.value,
    [relayUrl]: true
  };

  try {
    await nostrStore.reconnectDeveloperRelay(relayUrl);
    $q.notify({
      type: 'positive',
      message: `Reconnect attempt started for ${relayUrl}.`,
      position: 'top-right'
    });
  } catch (error) {
    reportUiError('Failed to reconnect relay', error, 'Failed to reconnect relay.');
  } finally {
    reconnectingRelayUrls.value = {
      ...reconnectingRelayUrls.value,
      [relayUrl]: false
    };
  }
}

async function handleReloadFromLookback(): Promise<void> {
  if (isReloadingFromLookback.value) {
    return;
  }

  isReloadingFromLookback.value = true;
  try {
    await nostrStore.restartPrivateMessagesDiagnosticsSubscription({
      lookbackMinutes: replayLookbackMinutes.value
    });
    $q.notify({
      type: 'positive',
      message: `DM reload started from the last ${Math.max(1, Math.floor(replayLookbackMinutes.value || 0))} minutes.`,
      position: 'top-right'
    });
  } catch (error) {
    reportUiError('Failed to replay private messages from lookback', error, 'Failed to reload messages from lookback.');
  } finally {
    isReloadingFromLookback.value = false;
  }
}

function handleClearTrace(): void {
  nostrStore.clearDeveloperTraceEntries();
}

async function handleCopyDiagnostics(): Promise<void> {
  try {
    const payload = await buildDiagnosticsExport();
    if (!navigator.clipboard?.writeText) {
      throw new Error('Clipboard API is not available.');
    }

    await navigator.clipboard.writeText(payload);
    $q.notify({
      type: 'positive',
      message: 'Developer diagnostics copied to the clipboard.',
      position: 'top-right'
    });
  } catch (error) {
    reportUiError('Failed to copy developer diagnostics', error, 'Failed to copy developer diagnostics.');
  }
}

async function handleDownloadDiagnostics(): Promise<void> {
  try {
    const payload = await buildDiagnosticsExport();
    const file = new Blob([payload], { type: 'application/json;charset=utf-8' });
    const objectUrl = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `developer-diagnostics-${new Date().toISOString().replaceAll(':', '-')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    reportUiError('Failed to download developer diagnostics', error, 'Failed to download developer diagnostics.');
  }
}

async function buildDiagnosticsExport(): Promise<string> {
  const snapshot = diagnostics.value ?? (await nostrStore.getDeveloperDiagnosticsSnapshot());
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      diagnostics: snapshot,
      traceEntries: nostrStore.developerTraceEntries
    },
    null,
    2
  );
}

function relayRoles(relay: DeveloperRelayRow): string {
  const roles: string[] = [];

  if (relay.inReadSet) {
    roles.push('read');
  }

  if (relay.inPublishSet) {
    roles.push('publish');
  }

  if (relay.inPrivateMessagesSubscription) {
    roles.push('dm-sub');
  }

  if (relay.isConfigured) {
    roles.push('configured');
  }

  return roles.length > 0 ? roles.join(', ') : 'n/a';
}

function traceLevelColor(level: DeveloperTraceLevel): string {
  if (level === 'warn') {
    return 'warning';
  }

  if (level === 'error') {
    return 'negative';
  }

  return 'primary';
}

function formatUnixTimestamp(value: number): string {
  return new Date(value).toISOString();
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
</script>

<style scoped>
.developer-page {
  display: grid;
  gap: 16px;
}

.developer-card {
  background: color-mix(in srgb, var(--tg-sidebar) 92%, transparent);
  border-color: color-mix(in srgb, var(--tg-border) 88%, #8ea4c0 12%);
}

.developer-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--tg-border) 90%, #8fa5c1 10%);
}

.developer-card__section {
  display: grid;
  gap: 16px;
}

.developer-card__section--flush {
  padding: 0;
}

.developer-card__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.developer-actions {
  display: grid;
  gap: 16px;
}

.developer-actions__main {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.developer-actions__replay {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.developer-actions__replay-input {
  min-width: 220px;
}

.developer-facts {
  display: grid;
  grid-template-columns: minmax(160px, 220px) minmax(0, 1fr);
  gap: 10px 14px;
}

.developer-facts__label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--tg-text-secondary) 88%, #59708f 12%);
}

.developer-facts__value {
  min-width: 0;
  overflow-wrap: anywhere;
}

.developer-facts__value--mono,
.developer-table__mono,
.developer-json {
  font-family: 'SFMono-Regular', 'Menlo', 'Consolas', monospace;
  font-size: 12px;
}

.developer-chip-group {
  display: grid;
  gap: 8px;
}

.developer-chip-group__label,
.developer-queue__title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--tg-text-secondary) 88%, #59708f 12%);
}

.developer-chip-group__items {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.developer-chip {
  max-width: 100%;
  background: color-mix(in srgb, var(--tg-panel-thread-bg) 88%, transparent);
}

.developer-chip--mono {
  font-family: 'SFMono-Regular', 'Menlo', 'Consolas', monospace;
}

.developer-chip__meta {
  margin-left: 8px;
  opacity: 0.65;
  font-size: 11px;
}

.developer-table {
  width: 100%;
}

.developer-table th,
.developer-table td {
  padding: 10px 12px;
}

.developer-queue-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.developer-queues {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.developer-queue {
  display: grid;
  gap: 8px;
}

.developer-expansion {
  border: 1px solid color-mix(in srgb, var(--tg-border) 90%, #8fa5c1 10%);
  border-radius: 14px;
  background: color-mix(in srgb, var(--tg-panel-thread-bg) 86%, transparent);
}

.developer-json {
  margin: 0;
  padding: 12px;
  overflow-x: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.developer-trace__header {
  width: 100%;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
}

.developer-trace__title {
  min-width: 0;
  display: flex;
  gap: 8px;
  align-items: baseline;
  overflow: hidden;
}

.developer-trace__scope {
  font-weight: 700;
  overflow-wrap: anywhere;
}

.developer-trace__phase {
  color: var(--tg-text-secondary);
  overflow-wrap: anywhere;
}

.developer-trace__timestamp {
  text-align: right;
}

.developer-empty-state,
.developer-empty-inline {
  color: var(--tg-text-secondary);
}

@media (max-width: 900px) {
  .developer-facts {
    grid-template-columns: 1fr;
  }

  .developer-queues {
    grid-template-columns: 1fr;
  }

  .developer-trace__header {
    grid-template-columns: 1fr;
  }

  .developer-trace__timestamp {
    text-align: left;
  }
}
</style>
