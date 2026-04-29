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
      <q-card flat bordered class="developer-card developer-card--recent-trace">
        <q-card-section class="developer-card__row">
          <div>
            <div class="text-body1">Debug logging</div>
            <div class="text-caption text-grey-6">
              Store relay and ingest traces in IndexedDB for developer diagnostics.
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
        <q-card-section
          class="developer-card__header developer-card__header--clickable"
          role="button"
          tabindex="0"
          @click="toggleExpandableCard('relayStatus')"
          @keydown.enter.prevent="toggleExpandableCard('relayStatus')"
          @keydown.space.prevent="toggleExpandableCard('relayStatus')"
        >
          <div class="developer-card__header-main">
            <div class="text-h6">Relay Status</div>
            <div class="text-caption text-grey-6">
              Effective relay set with connection state, roles, and quick reconnect actions.
            </div>
          </div>

          <div class="developer-card__header-side">
            <q-icon
              :name="expandedCards.relayStatus ? 'expand_less' : 'expand_more'"
              size="20px"
              class="developer-card__header-icon"
            />
          </div>
        </q-card-section>

        <q-slide-transition>
          <div v-show="expandedCards.relayStatus">
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
          </div>
        </q-slide-transition>
      </q-card>

      <q-card flat bordered class="developer-card">
        <q-card-section
          class="developer-card__header developer-card__header--clickable"
          role="button"
          tabindex="0"
          @click="toggleExpandableCard('groupMessagesSubscription')"
          @keydown.enter.prevent="toggleExpandableCard('groupMessagesSubscription')"
          @keydown.space.prevent="toggleExpandableCard('groupMessagesSubscription')"
        >
          <div class="developer-card__header-main">
            <div class="text-h6">Group Messages Subscription</div>
            <div class="text-caption text-grey-6">
              Group epoch inboxes currently included in the app message subscription.
            </div>
          </div>

          <div class="developer-card__header-side">
            <q-badge color="primary" outline>
              {{ diagnostics?.groupMessagesSubscription.length ?? 0 }}
            </q-badge>
            <q-icon
              :name="expandedCards.groupMessagesSubscription ? 'expand_less' : 'expand_more'"
              size="20px"
              class="developer-card__header-icon"
            />
          </div>
        </q-card-section>

        <q-slide-transition>
          <div v-show="expandedCards.groupMessagesSubscription">
            <q-card-section v-if="diagnostics" class="developer-card__section developer-card__section--flush">
              <div
                v-if="diagnostics.groupMessagesSubscription.length === 0"
                class="developer-empty-state"
              >
                No group subscriptions are active.
              </div>

              <q-markup-table v-else flat class="developer-table">
                <thead>
                  <tr>
                    <th class="text-left">Name</th>
                    <th class="text-left">Pubkey</th>
                    <th class="text-left">Epoch Pubkey</th>
                    <th class="text-left">Epoch Number</th>
                    <th class="text-left">Subscription</th>
                    <th class="text-left">Details</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="entry in diagnostics.groupMessagesSubscription"
                    :key="`${entry.pubkey}:${entry.epochPubkey}`"
                  >
                    <td>{{ entry.name }}</td>
                    <td class="developer-table__mono">{{ entry.pubkey }}</td>
                    <td class="developer-table__mono">{{ entry.epochPubkey }}</td>
                    <td>{{ entry.epochNumber ?? 'n/a' }}</td>
                    <td class="developer-subscription-table__details-cell">
                      <q-expansion-item
                        dense
                        expand-separator
                        expand-icon="keyboard_arrow_right"
                        expanded-icon="keyboard_arrow_down"
                        class="developer-expansion"
                        label="JSON"
                      >
                        <pre class="developer-json developer-json--table">{{
                          formatJson(buildGroupSubscriptionPayload(entry))
                        }}</pre>
                      </q-expansion-item>
                    </td>
                    <td class="developer-subscription-table__details-cell">
                      <q-expansion-item
                        dense
                        expand-separator
                        expand-icon="keyboard_arrow_right"
                        expanded-icon="keyboard_arrow_down"
                        class="developer-expansion"
                        label="JSON"
                      >
                        <pre class="developer-json developer-json--table">{{ formatJson(entry.details) }}</pre>
                      </q-expansion-item>
                    </td>
                  </tr>
                </tbody>
              </q-markup-table>
            </q-card-section>
          </div>
        </q-slide-transition>
      </q-card>

      <q-card flat bordered class="developer-card">
        <q-card-section
          class="developer-card__header developer-card__header--clickable"
          role="button"
          tabindex="0"
          @click="toggleExpandableCard('nostrSession')"
          @keydown.enter.prevent="toggleExpandableCard('nostrSession')"
          @keydown.space.prevent="toggleExpandableCard('nostrSession')"
        >
          <div class="developer-card__header-main">
            <div class="text-h6">Nostr Session</div>
            <div class="text-caption text-grey-6">
              Current login, relay resolution, and cursor state used by the app.
            </div>
          </div>

          <div class="developer-card__header-side">
            <q-icon
              :name="expandedCards.nostrSession ? 'expand_less' : 'expand_more'"
              size="20px"
              class="developer-card__header-icon"
            />
          </div>
        </q-card-section>

        <q-slide-transition>
          <div v-show="expandedCards.nostrSession">
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
          </div>
        </q-slide-transition>
      </q-card>

      <q-card flat bordered class="developer-card">
        <q-card-section
          class="developer-card__header developer-card__header--clickable"
          role="button"
          tabindex="0"
          @click="toggleExpandableCard('privateMessagesSubscription')"
          @keydown.enter.prevent="toggleExpandableCard('privateMessagesSubscription')"
          @keydown.space.prevent="toggleExpandableCard('privateMessagesSubscription')"
        >
          <div class="developer-card__header-main">
            <div class="text-h6">Private Messages Subscription</div>
            <div class="text-caption text-grey-6">
              Active DM subscription details, last event seen, and current relay set.
            </div>
          </div>

          <div class="developer-card__header-side">
            <q-badge :color="subscriptionBadgeColor" outline>
              {{ diagnostics?.privateMessagesSubscription.active ? 'active' : 'inactive' }}
            </q-badge>
            <q-icon
              :name="expandedCards.privateMessagesSubscription ? 'expand_less' : 'expand_more'"
              size="20px"
              class="developer-card__header-icon"
            />
          </div>
        </q-card-section>

        <q-slide-transition>
          <div v-show="expandedCards.privateMessagesSubscription">
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
          </div>
        </q-slide-transition>
      </q-card>

      <q-card flat bordered class="developer-card">
        <q-card-section
          class="developer-card__header developer-card__header--clickable"
          role="button"
          tabindex="0"
          @click="toggleExpandableCard('pendingQueues')"
          @keydown.enter.prevent="toggleExpandableCard('pendingQueues')"
          @keydown.space.prevent="toggleExpandableCard('pendingQueues')"
        >
          <div class="developer-card__header-main">
            <div class="text-h6">Pending Queues</div>
            <div class="text-caption text-grey-6">
              Incoming reactions and deletions waiting on their target messages or events.
            </div>
          </div>

          <div class="developer-card__header-side">
            <q-btn
              flat
              dense
              no-caps
              icon="refresh"
              label="Refresh"
              class="developer-card__refresh-button"
              :loading="isRefreshingPendingQueues"
              @click.stop="handleRefreshPendingQueues"
            />
            <q-icon
              :name="expandedCards.pendingQueues ? 'expand_less' : 'expand_more'"
              size="20px"
              class="developer-card__header-icon"
            />
          </div>
        </q-card-section>

        <q-slide-transition>
          <div v-show="expandedCards.pendingQueues">
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
                expand-icon="keyboard_arrow_right"
                expanded-icon="keyboard_arrow_down"
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
                expand-icon="keyboard_arrow_right"
                expanded-icon="keyboard_arrow_down"
                class="developer-expansion"
                :label="`${entry.targetEventId} (${entry.count})`"
              >
                <pre class="developer-json">{{ formatJson(entry) }}</pre>
              </q-expansion-item>
            </div>
          </div>
            </q-card-section>
          </div>
        </q-slide-transition>
      </q-card>

      <q-card flat bordered class="developer-card">
        <q-card-section
          class="developer-card__header developer-card__header--clickable"
          role="button"
          tabindex="0"
          @click="toggleExpandableCard('recentTrace')"
          @keydown.enter.prevent="toggleExpandableCard('recentTrace')"
          @keydown.space.prevent="toggleExpandableCard('recentTrace')"
        >
          <div class="developer-card__header-main">
            <div class="text-h6">Recent Trace</div>
            <div class="text-caption text-grey-6">
              Most recent relay, subscription, and ingest diagnostics captured in-app.
            </div>
          </div>

          <div class="developer-card__header-side">
            <q-badge color="primary" outline>{{ displayedTraceEntries.length }}</q-badge>
            <q-btn
              flat
              dense
              no-caps
              class="developer-card__refresh-button"
              @click.stop="handleRefreshRecentTrace"
            >
              <span>Refresh</span>
              <q-badge
                v-if="newTraceEntryCount > 0"
                color="primary"
                rounded
                class="developer-card__refresh-badge"
              >
                {{ newTraceEntryCount }}
              </q-badge>
            </q-btn>
            <q-icon
              :name="expandedCards.recentTrace ? 'expand_less' : 'expand_more'"
              size="20px"
              class="developer-card__header-icon"
            />
          </div>
        </q-card-section>

        <q-slide-transition>
          <div v-show="expandedCards.recentTrace">
            <q-card-section class="developer-card__section">
              <div v-if="displayedTraceEntries.length === 0" class="developer-empty-state">
                No trace entries captured yet.
              </div>

              <div v-else class="developer-trace-table-shell">
                <div class="developer-trace-filters">
                  <q-select
                    v-model="traceLevelFilter"
                    dense
                    outlined
                    clearable
                    options-dense
                    :options="traceLevelOptions"
                    label="Level"
                    class="developer-trace-filters__field"
                  />

                  <q-select
                    v-model="traceScopeFilter"
                    dense
                    outlined
                    clearable
                    options-dense
                    :options="traceScopeOptions"
                    label="Scope"
                    class="developer-trace-filters__field"
                  />

                  <q-select
                    v-model="tracePhaseFilter"
                    dense
                    outlined
                    clearable
                    options-dense
                    :options="tracePhaseOptions"
                    label="Phase"
                    class="developer-trace-filters__field"
                  />
                </div>

                <div v-if="filteredTraceEntries.length === 0" class="developer-empty-state">
                  No trace entries match the current filters.
                </div>

                <q-markup-table v-else flat class="developer-table developer-trace-table">
                  <thead>
                    <tr>
                      <th class="text-left">Timestamp</th>
                      <th class="text-left">Level</th>
                      <th class="text-left">Scope</th>
                      <th class="text-left">Phase</th>
                      <th class="text-left">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="entry in paginatedTraceEntries" :key="entry.id">
                      <td class="developer-table__mono">{{ entry.timestamp }}</td>
                      <td>
                        <q-badge :color="traceLevelColor(entry.level)" outline>
                          {{ entry.level }}
                        </q-badge>
                      </td>
                      <td>{{ entry.scope }}</td>
                      <td>{{ entry.phase }}</td>
                      <td class="developer-trace-table__details-cell">
                        <div class="developer-trace-details">
                          <q-btn
                            flat
                            dense
                            no-caps
                            label="..."
                            class="developer-trace-details__toggle"
                            @click.stop="toggleTraceDetail(entry.id)"
                          />

                          <pre
                            v-if="expandedTraceDetailIds[entry.id] === true"
                            class="developer-json developer-json--table"
                          >{{ formatJson(entry.details) }}</pre>

                          <div
                            v-else
                            class="developer-trace-details__preview developer-table__mono"
                          >
                            {{ formatTraceDetailsPreview(entry.details) }}
                          </div>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </q-markup-table>

                <div v-if="totalTracePages > 1" class="developer-trace-table__pagination">
                  <q-pagination
                    v-model="tracePage"
                    :max="totalTracePages"
                    :max-pages="6"
                    direction-links
                    boundary-links
                    color="primary"
                  />
                </div>
              </div>
            </q-card-section>
          </div>
        </q-slide-transition>
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
  DeveloperGroupMessageSubscriptionSnapshot,
  DeveloperRelayRow,
  DeveloperTraceEntry,
  DeveloperTraceLevel
} from 'src/stores/nostrStore';
import { useNostrStore } from 'src/stores/nostrStore';
import { reportUiError } from 'src/utils/uiErrorHandler';

const $q = useQuasar();
const nostrStore = useNostrStore();

type ExpandableDeveloperCardKey =
  | 'nostrSession'
  | 'privateMessagesSubscription'
  | 'groupMessagesSubscription'
  | 'relayStatus'
  | 'pendingQueues'
  | 'recentTrace';

const diagnostics = ref<DeveloperDiagnosticsSnapshot | null>(null);
const isRefreshingDiagnostics = ref(false);
const isRestartingSubscription = ref(false);
const isReconnectingAllRelays = ref(false);
const isReloadingFromLookback = ref(false);
const isRefreshingPendingQueues = ref(false);
const reconnectingRelayUrls = ref<Record<string, boolean>>({});
const replayLookbackMinutes = ref(180);
const expandedCards = ref<Record<ExpandableDeveloperCardKey, boolean>>({
  nostrSession: false,
  privateMessagesSubscription: false,
  groupMessagesSubscription: false,
  relayStatus: true,
  pendingQueues: true,
  recentTrace: true
});

let refreshRequestId = 0;
let refreshDebounceId: ReturnType<typeof globalThis.setTimeout> | null = null;
let traceRefreshDebounceId: ReturnType<typeof globalThis.setTimeout> | null = null;
const TRACE_PAGE_SIZE = 20;
const displayedTraceEntries = ref<DeveloperTraceEntry[]>([]);
const latestTraceEntries = ref<DeveloperTraceEntry[]>([]);
const traceLevelFilter = ref<DeveloperTraceLevel | null>(null);
const traceScopeFilter = ref<string | null>(null);
const tracePhaseFilter = ref<string | null>(null);
const tracePage = ref(1);
const expandedTraceDetailIds = ref<Record<string, boolean>>({});

const displayedTraceEntryIds = computed(() => {
  return new Set(displayedTraceEntries.value.map((entry) => entry.id));
});

const newTraceEntryCount = computed(() => {
  return latestTraceEntries.value.filter((entry) => !displayedTraceEntryIds.value.has(entry.id)).length;
});

const traceLevelOptions = computed<DeveloperTraceLevel[]>(() => {
  const availableLevels = new Set(displayedTraceEntries.value.map((entry) => entry.level));
  return (['info', 'warn', 'error'] as DeveloperTraceLevel[]).filter((level) =>
    availableLevels.has(level)
  );
});

const traceScopeOptions = computed(() => {
  return listDistinctTraceFilterValues(displayedTraceEntries.value, (entry) => entry.scope);
});

const tracePhaseOptions = computed(() => {
  return listDistinctTraceFilterValues(
    displayedTraceEntries.value.filter((entry) =>
      matchesSelectedTraceFilters(entry, { includePhase: false })
    ),
    (entry) => entry.phase
  );
});

const filteredTraceEntries = computed(() => {
  return displayedTraceEntries.value.filter((entry) => matchesSelectedTraceFilters(entry));
});

const totalTracePages = computed(() => {
  return Math.max(1, Math.ceil(filteredTraceEntries.value.length / TRACE_PAGE_SIZE));
});

const paginatedTraceEntries = computed(() => {
  const startIndex = (tracePage.value - 1) * TRACE_PAGE_SIZE;
  return filteredTraceEntries.value.slice(startIndex, startIndex + TRACE_PAGE_SIZE);
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

watch(
  () => nostrStore.developerTraceVersion,
  () => {
    if (traceRefreshDebounceId !== null) {
      globalThis.clearTimeout(traceRefreshDebounceId);
    }

    traceRefreshDebounceId = globalThis.setTimeout(() => {
      traceRefreshDebounceId = null;
      void refreshLatestTraceEntries().catch((error) => {
        reportUiError('Failed to refresh latest trace data', error, 'Failed to refresh recent trace.');
      });
    }, 120);
  }
);

watch([traceLevelFilter, traceScopeFilter, tracePhaseFilter], () => {
  syncTraceFiltersWithAvailableOptions();
  tracePage.value = 1;
});

onBeforeUnmount(() => {
  if (refreshDebounceId !== null) {
    globalThis.clearTimeout(refreshDebounceId);
    refreshDebounceId = null;
  }

  if (traceRefreshDebounceId !== null) {
    globalThis.clearTimeout(traceRefreshDebounceId);
    traceRefreshDebounceId = null;
  }
});

void refreshRecentTraceEntries().catch((error) => {
  reportUiError('Failed to load recent trace data', error, 'Failed to load recent trace.');
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

function toggleExpandableCard(key: ExpandableDeveloperCardKey): void {
  expandedCards.value[key] = !expandedCards.value[key];
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
      position: 'top'
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
      position: 'top'
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
      position: 'top'
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
      position: 'top'
    });
  } catch (error) {
    reportUiError('Failed to replay private messages from lookback', error, 'Failed to reload messages from lookback.');
  } finally {
    isReloadingFromLookback.value = false;
  }
}

async function handleRefreshPendingQueues(): Promise<void> {
  if (isRefreshingPendingQueues.value) {
    return;
  }

  isRefreshingPendingQueues.value = true;
  try {
    const summary = await nostrStore.refreshDeveloperPendingQueues();
    await refreshDiagnostics();

    if (summary.initialEntryCount === 0) {
      $q.notify({
        type: 'info',
        message: 'No pending queue items to refresh.',
        position: 'top'
      });
      return;
    }

    const clearedEntryCount = Math.max(0, summary.initialEntryCount - summary.remainingEntryCount);
    const clearedEntryLabel = clearedEntryCount === 1 ? 'item' : 'items';
    const checkedTargetLabel =
      summary.initialTargetCount === 1 ? 'pending target' : 'pending targets';
    const pendingEntryLabel = summary.remainingEntryCount === 1 ? 'item' : 'items';

    $q.notify({
      type: summary.remainingEntryCount === 0 ? 'positive' : 'info',
      message:
        summary.remainingEntryCount === 0
          ? `Pending queues refreshed. Cleared ${clearedEntryCount} ${clearedEntryLabel}.`
          : `Pending queues refreshed. Checked ${summary.initialTargetCount} ${checkedTargetLabel}; ${summary.remainingEntryCount} ${pendingEntryLabel} still pending.`,
      position: 'top'
    });
  } catch (error) {
    reportUiError('Failed to refresh pending queues', error, 'Failed to refresh pending queues.');
  } finally {
    isRefreshingPendingQueues.value = false;
  }
}

async function handleClearTrace(): Promise<void> {
  try {
    await nostrStore.clearDeveloperTraceEntries();
    await refreshRecentTraceEntries();
  } catch (error) {
    reportUiError('Failed to clear developer trace', error, 'Failed to clear developer trace.');
  }
}

async function refreshLatestTraceEntries(): Promise<void> {
  latestTraceEntries.value = await nostrStore.listDeveloperTraceEntries();
}

async function refreshRecentTraceEntries(): Promise<void> {
  await refreshLatestTraceEntries();
  displayedTraceEntries.value = [...latestTraceEntries.value];
  syncTraceFiltersWithAvailableOptions();
  tracePage.value = 1;
  expandedTraceDetailIds.value = {};
}

async function handleRefreshRecentTrace(): Promise<void> {
  try {
    await refreshRecentTraceEntries();
  } catch (error) {
    reportUiError('Failed to refresh recent trace', error, 'Failed to refresh recent trace.');
  }
}

function toggleTraceDetail(entryId: string): void {
  expandedTraceDetailIds.value = {
    ...expandedTraceDetailIds.value,
    [entryId]: expandedTraceDetailIds.value[entryId] !== true
  };
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
      position: 'top'
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
  const traceEntries = await nostrStore.listDeveloperTraceEntries();
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      diagnostics: snapshot,
      traceEntries
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

function formatCompactDeveloperKey(value: string | null | undefined): string | null {
  const normalizedValue = value?.trim() ?? '';
  if (!normalizedValue) {
    return null;
  }

  if (normalizedValue.length <= 18) {
    return normalizedValue;
  }

  return `${normalizedValue.slice(0, 8)}...${normalizedValue.slice(-8)}`;
}

function buildGroupSubscriptionPayload(
  entry: DeveloperGroupMessageSubscriptionSnapshot
): Record<string, unknown> {
  const privateMessagesSubscription = diagnostics.value?.privateMessagesSubscription ?? null;
  const compactGroupPubkey = formatCompactDeveloperKey(entry.pubkey);
  const compactEpochPubkey = formatCompactDeveloperKey(entry.epochPubkey);
  const statusLog = latestTraceEntries.value
    .filter((traceEntry) => {
      if (traceEntry.scope !== 'subscription:private-messages') {
        return false;
      }

      const recipients = Array.isArray(traceEntry.details.recipients)
        ? traceEntry.details.recipients.filter(
            (value): value is string => typeof value === 'string' && value.trim().length > 0
          )
        : [];
      const chatPubkey =
        typeof traceEntry.details.chatPubkey === 'string'
          ? traceEntry.details.chatPubkey.trim()
          : '';

      return (
        (compactEpochPubkey ? recipients.includes(compactEpochPubkey) : false) ||
        (compactGroupPubkey ? chatPubkey === compactGroupPubkey : false)
      );
    })
    .slice(0, 25)
    .map((traceEntry) => ({
      timestamp: traceEntry.timestamp,
      level: traceEntry.level,
      phase: traceEntry.phase,
      details: traceEntry.details
    }));

  return {
    active: privateMessagesSubscription?.active ?? false,
    signature: privateMessagesSubscription?.signature ?? null,
    epochPubkey: entry.epochPubkey,
    epochNumber: entry.epochNumber,
    relayUrls: privateMessagesSubscription?.relayUrls ?? [],
    relaySnapshots: privateMessagesSubscription?.relaySnapshots ?? [],
    since: privateMessagesSubscription?.since ?? null,
    sinceIso: privateMessagesSubscription?.sinceIso ?? null,
    startedAt: privateMessagesSubscription?.startedAt ?? null,
    lastEventSeenAt: privateMessagesSubscription?.lastEventSeenAt ?? null,
    lastEventId: privateMessagesSubscription?.lastEventId ?? null,
    lastEventCreatedAt: privateMessagesSubscription?.lastEventCreatedAt ?? null,
    lastEventCreatedAtIso: privateMessagesSubscription?.lastEventCreatedAtIso ?? null,
    lastEoseAt: privateMessagesSubscription?.lastEoseAt ?? null,
    statusLog
  };
}

function formatTraceDetailsPreview(value: unknown): string {
  const compactValue = (JSON.stringify(value) ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (compactValue.length <= 128) {
    return compactValue;
  }

  return `${compactValue.slice(0, 125)}...`;
}

function matchesSelectedTraceFilters(
  entry: DeveloperTraceEntry,
  options: { includePhase?: boolean } = {}
): boolean {
  if (traceLevelFilter.value && entry.level !== traceLevelFilter.value) {
    return false;
  }

  if (traceScopeFilter.value && entry.scope !== traceScopeFilter.value) {
    return false;
  }

  if (options.includePhase !== false && tracePhaseFilter.value && entry.phase !== tracePhaseFilter.value) {
    return false;
  }

  return true;
}

function listDistinctTraceFilterValues(
  entries: DeveloperTraceEntry[],
  getValue: (entry: DeveloperTraceEntry) => string
): string[] {
  return Array.from(new Set(entries.map(getValue)))
    .filter((value) => value.trim().length > 0)
    .sort((first, second) => first.localeCompare(second, undefined, { sensitivity: 'base' }));
}

function syncTraceFiltersWithAvailableOptions(): void {
  if (traceLevelFilter.value && !traceLevelOptions.value.includes(traceLevelFilter.value)) {
    traceLevelFilter.value = null;
  }

  if (traceScopeFilter.value && !traceScopeOptions.value.includes(traceScopeFilter.value)) {
    traceScopeFilter.value = null;
  }

  if (tracePhaseFilter.value && !tracePhaseOptions.value.includes(tracePhaseFilter.value)) {
    tracePhaseFilter.value = null;
  }
}
</script>

<style scoped>
.developer-page {
  display: grid;
  gap: 16px;
}

.developer-card {
  background: color-mix(in srgb, var(--nc-sidebar) 92%, transparent);
  border-color: color-mix(in srgb, var(--nc-border) 88%, #8ea4c0 12%);
}

.developer-card--recent-trace :deep(.q-btn) {
  font-weight: 500;
  letter-spacing: normal;
  box-shadow: none;
  transform: none;
}

.developer-card--recent-trace :deep(.q-btn .q-btn__content) {
  gap: 4px;
  font-weight: inherit;
}

.developer-card--recent-trace :deep(.q-btn:not(.q-btn--round):not(.q-btn--fab):not(.q-btn--fab-mini)) {
  border-radius: 8px;
}

.developer-card--recent-trace :deep(.q-btn.q-btn--flat:not(.q-btn--round):not(.q-btn--fab):not(.q-btn--fab-mini)),
.developer-card--recent-trace :deep(.q-btn.q-btn--outline:not(.q-btn--round):not(.q-btn--fab):not(.q-btn--fab-mini)) {
  background: transparent;
  box-shadow: none;
}

.developer-card--recent-trace :deep(.q-btn.q-btn--flat:not(.q-btn--round):not(.q-btn--fab):not(.q-btn--fab-mini)::before),
.developer-card--recent-trace :deep(.q-btn.q-btn--outline:not(.q-btn--round):not(.q-btn--fab):not(.q-btn--fab-mini)::before) {
  border-color: transparent;
}

.developer-card--recent-trace :deep(.q-btn:not(.q-btn--disabled):hover) {
  transform: none;
}

.developer-card--recent-trace :deep(.q-btn.q-btn--flat:not(.q-btn--disabled):hover),
.developer-card--recent-trace :deep(.q-btn.q-btn--outline:not(.q-btn--disabled):hover) {
  background: color-mix(in srgb, var(--nc-panel-thread-bg) 72%, transparent);
}

.developer-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--nc-border) 90%, #8fa5c1 10%);
}

.developer-card__header--clickable {
  cursor: pointer;
}

.developer-card__header-main {
  min-width: 0;
  flex: 1;
}

.developer-card__header-side {
  display: flex;
  align-items: center;
  gap: 10px;
}

.developer-card__header-icon {
  opacity: 0.7;
}

.developer-card__refresh-button {
  position: relative;
}

.developer-card__refresh-badge {
  margin-left: 8px;
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
  color: color-mix(in srgb, var(--nc-text-secondary) 88%, #59708f 12%);
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
  color: color-mix(in srgb, var(--nc-text-secondary) 88%, #59708f 12%);
}

.developer-chip-group__items {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.developer-chip {
  max-width: 100%;
  background: color-mix(in srgb, var(--nc-panel-thread-bg) 88%, transparent);
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
  grid-template-columns: 1fr;
  gap: 14px;
}

.developer-queue {
  display: grid;
  gap: 8px;
}

.developer-expansion {
  border: 1px solid color-mix(in srgb, var(--nc-border) 90%, #8fa5c1 10%);
  border-radius: 14px;
  background: color-mix(in srgb, var(--nc-panel-thread-bg) 86%, transparent);
}

.developer-json {
  margin: 0;
  padding: 12px;
  overflow-x: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.developer-json--table {
  padding: 0;
  max-width: min(480px, 52vw);
}

.developer-trace-table__details-cell {
  width: 100%;
  min-width: 280px;
}

.developer-subscription-table__details-cell {
  min-width: 280px;
}

.developer-trace-details {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
}

.developer-trace-details__toggle {
  min-height: 24px;
  padding: 0 6px;
}

.developer-trace-details__preview {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.developer-trace-table-shell {
  display: grid;
  gap: 14px;
}

.developer-trace-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.developer-trace-filters__field {
  min-width: 160px;
  flex: 1 1 180px;
}

.developer-trace-table__pagination {
  display: flex;
  justify-content: center;
}

.developer-empty-state,
.developer-empty-inline {
  color: var(--nc-text-secondary);
}

@media (max-width: 900px) {
  .developer-facts {
    grid-template-columns: 1fr;
  }

  .developer-json--table {
    max-width: 100%;
  }
}
</style>
