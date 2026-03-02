<template>
  <SettingsDetailLayout title="Relays" icon="satellite_alt">
    <div class="relays-content">
      <q-tabs
        v-model="activeTab"
        dense
        no-caps
        align="left"
        active-color="primary"
        indicator-color="primary"
        class="relays-tabs"
      >
        <q-tab name="my" label="My Relays" />
        <q-tab name="app" label="App Relays" />
        <q-tab name="contacts" label="Contacts Relays" />
      </q-tabs>

      <q-tab-panels v-model="activeTab" animated class="relays-panels">
        <q-tab-panel name="my" class="relays-panel">
          <div v-if="isTabLoading('my')" class="relays-tab-state">Loading relays...</div>

          <div v-else-if="tabError('my')" class="relays-tab-state relays-tab-state--error">
            <span>{{ tabError('my') }}</span>
            <q-btn flat dense no-caps color="negative" label="Retry" @click="reloadTab('my')" />
          </div>

          <div v-else-if="relaysForTab('my').length === 0" class="relays-tab-state">
            {{ emptyMessageForTab('my') }}
          </div>

        </q-tab-panel>

        <q-tab-panel name="app" class="relays-panel">
          <div class="relays-toolbar">
            <q-input
              v-model="newRelay"
              class="tg-input relays-toolbar__input"
              outlined
              dense
              rounded
              label="Relay URL"
              placeholder="wss://example-relay.io"
              :error="Boolean(relayValidationError)"
              :error-message="relayValidationError"
              @keydown.enter.prevent="addRelay"
            >
              <template #append>
                <q-btn
                  unelevated
                  round
                  dense
                  color="primary"
                  icon="add"
                  size="sm"
                  aria-label="Add relay"
                  :disable="!canAddRelay"
                  @click="addRelay"
                />
              </template>
            </q-input>

            <q-btn
              flat
              color="primary"
              label="Restore Default Relays"
              icon="restart_alt"
              :disable="!canRestoreDefaults"
              @click="restoreDefaults"
            />
          </div>

          <div v-if="relaysForTab('app').length === 0" class="relays-tab-state q-mt-md">
            {{ emptyMessageForTab('app') }}
          </div>

          <q-list v-else bordered separator class="relays-content__list q-mt-md">
            <q-expansion-item
              v-for="(relay, index) in relaysForTab('app')"
              :key="`app-${relay}-${index}`"
              expand-separator
              switch-toggle-side
              class="relay-expansion-item"
              @show="handleRelayExpand(relay)"
            >
              <template #header>
                <q-item-section avatar class="relay-header-cell">
                  <div class="relay-header-badges">
                    <q-avatar v-if="relayIconUrl(relay)" size="22px" class="relay-icon">
                      <img
                        :src="relayIconUrl(relay) || ''"
                        :alt="`${relay} icon`"
                        @error="handleRelayIconError(relay)"
                      />
                    </q-avatar>
                    <q-avatar v-else size="22px" class="relay-icon relay-icon--fallback">
                      <q-icon name="satellite_alt" size="14px" />
                    </q-avatar>

                    <span
                      class="relay-status-dot"
                      :class="
                        isRelayConnected(relay)
                          ? 'relay-status-dot--connected'
                          : 'relay-status-dot--disconnected'
                      "
                    />
                  </div>
                </q-item-section>

                <q-item-section class="relay-url-section">
                  <q-item-label class="relay-url-label">{{ relay }}</q-item-label>
                  <div class="relay-io-toggles" @click.stop>
                    <div class="relay-io-toggle">
                      <span class="relay-io-toggle__label">Read</span>
                      <q-toggle
                        dense
                        size="xs"
                        class="relay-io-switch"
                        color="primary"
                        :model-value="relayReadEnabled(index)"
                        @click.stop
                        @update:model-value="updateRelayRead(index, $event)"
                      />
                    </div>
                    <div class="relay-io-toggle">
                      <span class="relay-io-toggle__label">Write</span>
                      <q-toggle
                        dense
                        size="xs"
                        class="relay-io-switch"
                        color="primary"
                        :model-value="relayWriteEnabled(index)"
                        @click.stop
                        @update:model-value="updateRelayWrite(index, $event)"
                      />
                    </div>
                  </div>
                </q-item-section>

                <q-item-section side class="relay-header-actions">
                  <q-btn
                    flat
                    round
                    dense
                    icon="delete"
                    color="negative"
                    aria-label="Delete relay"
                    @click.stop="removeRelay(index)"
                  />
                </q-item-section>
              </template>

              <div class="relay-expansion-item__body">
                <div v-if="isRelayInfoLoading(relay)" class="relay-nip11__state">
                  Loading NIP-11 data...
                </div>

                <div
                  v-else-if="relayInfoError(relay)"
                  class="relay-nip11__state relay-nip11__state--error"
                >
                  <span>{{ relayInfoError(relay) }}</span>
                  <q-btn
                    flat
                    dense
                    no-caps
                    color="negative"
                    label="Retry"
                    @click="retryRelayInfo(relay)"
                  />
                </div>

                <div v-else-if="relayInfo(relay)">
                  <RelayInfoFields label="NIP-11" :value="relayInfo(relay)" />
                </div>

                <div v-else class="relay-nip11__state">Expand to load NIP-11 data.</div>
              </div>
            </q-expansion-item>
          </q-list>
        </q-tab-panel>

        <q-tab-panel name="contacts" class="relays-panel">
          <div v-if="isTabLoading('contacts')" class="relays-tab-state">Loading relays...</div>

          <div
            v-else-if="tabError('contacts')"
            class="relays-tab-state relays-tab-state--error"
          >
            <span>{{ tabError('contacts') }}</span>
            <q-btn
              flat
              dense
              no-caps
              color="negative"
              label="Retry"
              @click="reloadTab('contacts')"
            />
          </div>

          <div v-else-if="relaysForTab('contacts').length === 0" class="relays-tab-state">
            {{ emptyMessageForTab('contacts') }}
          </div>

        </q-tab-panel>
      </q-tab-panels>
    </div>
  </SettingsDetailLayout>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { normalizeRelayUrl, type NDKRelayInformation } from '@nostr-dev-kit/ndk';
import RelayInfoFields from 'src/components/RelayInfoFields.vue';
import SettingsDetailLayout from 'src/components/SettingsDetailLayout.vue';
import { DEFAULT_RELAYS } from 'src/constants/relays';
import { relaysService } from 'src/services/relaysService';
import { useNostrStore } from 'src/stores/nostrStore';
import { useRelayStore } from 'src/stores/relayStore';

type RelayTab = 'my' | 'app' | 'contacts';

const relayStore = useRelayStore();
const nostrStore = useNostrStore();
const activeTab = ref<RelayTab>('app');
const newRelay = ref('');
const relayInfoByUrl = ref<Record<string, NDKRelayInformation | null>>({});
const relayInfoErrorByUrl = ref<Record<string, string>>({});
const relayInfoLoadingByUrl = ref<Record<string, boolean>>({});
const relayIconErrorByUrl = ref<Record<string, boolean>>({});
const myRelays = ref<string[]>([]);
const contactsRelays = ref<string[]>([]);
const isLoadingMyRelays = ref(false);
const isLoadingContactsRelays = ref(false);
const myRelaysError = ref('');
const contactsRelaysError = ref('');
const hasLoadedMyRelays = ref(false);
const hasLoadedContactsRelays = ref(false);
const relayValidationError = computed(() => validateRelayUrl(newRelay.value.trim()));
const canAddRelay = computed(() => {
  const value = newRelay.value.trim();
  return value.length > 0 && relayValidationError.value.length === 0;
});
const canRestoreDefaults = computed(() => {
  if (relayStore.relays.length !== DEFAULT_RELAYS.length) {
    return true;
  }

  if (relayStore.relays.some((relay, index) => relay !== DEFAULT_RELAYS[index])) {
    return true;
  }

  return relayStore.relayEntries.some((entry) => entry.read !== true || entry.write !== true);
});
const allKnownRelays = computed(() =>
  uniqueRelays([...relayStore.relays, ...myRelays.value, ...contactsRelays.value])
);

relayStore.init();

watch(
  () => [...relayStore.relays],
  (relays) => {
    void prepareRelayDecorations(relays);
  },
  { immediate: true }
);

watch(
  allKnownRelays,
  (relays) => {
    pruneRelayInfoCache(relays);
  },
  { immediate: true }
);

watch(
  activeTab,
  (tab) => {
    if (tab === 'my') {
      void loadMyRelays();
      return;
    }

    if (tab === 'contacts') {
      void loadContactsRelays();
    }
  },
  { immediate: true }
);

function uniqueRelays(relays: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const relay of relays) {
    const key = relayKey(relay);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(relay);
  }

  return result;
}

async function prepareRelayDecorations(relays: string[]): Promise<void> {
  if (relays.length === 0) {
    return;
  }

  await nostrStore.ensureRelayConnections(relays).catch((error) => {
    console.warn('Failed to connect relays for status checks', error);
  });

  for (const relay of relays) {
    void loadRelayInfo(relay);
  }
}

async function loadMyRelays(force = false): Promise<void> {
  if (isLoadingMyRelays.value || (!force && hasLoadedMyRelays.value)) {
    return;
  }

  isLoadingMyRelays.value = true;
  myRelaysError.value = '';

  try {
    const relays = await nostrStore.fetchMyRelayList(relayStore.relays);
    myRelays.value = relays;
    hasLoadedMyRelays.value = true;
    await prepareRelayDecorations(relays);
  } catch (error) {
    myRelays.value = [];
    myRelaysError.value =
      error instanceof Error ? error.message : 'Failed to load your relay list.';
  } finally {
    isLoadingMyRelays.value = false;
  }
}

async function loadContactsRelays(force = false): Promise<void> {
  if (isLoadingContactsRelays.value || (!force && hasLoadedContactsRelays.value)) {
    return;
  }

  isLoadingContactsRelays.value = true;
  contactsRelaysError.value = '';

  try {
    await relaysService.init();
    const relays = await relaysService.listAllRelays();
    contactsRelays.value = relays;
    hasLoadedContactsRelays.value = true;
    await prepareRelayDecorations(relays);
  } catch (error) {
    contactsRelays.value = [];
    contactsRelaysError.value =
      error instanceof Error ? error.message : 'Failed to load contacts relays.';
  } finally {
    isLoadingContactsRelays.value = false;
  }
}

function relaysForTab(tab: RelayTab): string[] {
  if (tab === 'my') {
    return myRelays.value;
  }

  if (tab === 'contacts') {
    return contactsRelays.value;
  }

  return relayStore.relays;
}

function isTabLoading(tab: RelayTab): boolean {
  if (tab === 'my') {
    return isLoadingMyRelays.value;
  }

  if (tab === 'contacts') {
    return isLoadingContactsRelays.value;
  }

  return false;
}

function tabError(tab: RelayTab): string {
  if (tab === 'my') {
    return myRelaysError.value;
  }

  if (tab === 'contacts') {
    return contactsRelaysError.value;
  }

  return '';
}

function emptyMessageForTab(tab: RelayTab): string {
  if (tab === 'my') {
    return 'No relays found in your kind 10002 relay list.';
  }

  if (tab === 'contacts') {
    return 'No contact relays found yet.';
  }

  return 'No app relays configured.';
}

function reloadTab(tab: RelayTab): void {
  if (tab === 'my') {
    hasLoadedMyRelays.value = false;
    void loadMyRelays(true);
    return;
  }

  if (tab === 'contacts') {
    hasLoadedContactsRelays.value = false;
    void loadContactsRelays(true);
  }
}

function isRelayConnected(relay: string): boolean {
  void nostrStore.relayStatusVersion;
  return nostrStore.getRelayConnectionState(relay) === 'connected';
}

function relayKey(relay: string): string {
  try {
    return normalizeRelayUrl(relay);
  } catch {
    return relay.trim().toLowerCase();
  }
}

function pruneRelayInfoCache(relays: string[]): void {
  const activeRelayKeys = new Set(relays.map((relay) => relayKey(relay)));

  for (const key of Object.keys(relayInfoByUrl.value)) {
    if (!activeRelayKeys.has(key)) {
      delete relayInfoByUrl.value[key];
    }
  }

  for (const key of Object.keys(relayInfoErrorByUrl.value)) {
    if (!activeRelayKeys.has(key)) {
      delete relayInfoErrorByUrl.value[key];
    }
  }

  for (const key of Object.keys(relayInfoLoadingByUrl.value)) {
    if (!activeRelayKeys.has(key)) {
      delete relayInfoLoadingByUrl.value[key];
    }
  }

  for (const key of Object.keys(relayIconErrorByUrl.value)) {
    if (!activeRelayKeys.has(key)) {
      delete relayIconErrorByUrl.value[key];
    }
  }
}

async function loadRelayInfo(relay: string, force = false): Promise<void> {
  const key = relayKey(relay);

  if (!force && relayInfoByUrl.value[key]) {
    return;
  }

  if (relayInfoLoadingByUrl.value[key]) {
    return;
  }

  relayInfoLoadingByUrl.value[key] = true;
  relayInfoErrorByUrl.value[key] = '';

  try {
    const relayInfo = await nostrStore.fetchRelayNip11Info(relay, force);
    relayInfoByUrl.value[key] = relayInfo;
    relayIconErrorByUrl.value[key] = false;
  } catch (error) {
    relayInfoByUrl.value[key] = null;
    relayInfoErrorByUrl.value[key] =
      error instanceof Error ? error.message : 'Failed to load relay NIP-11 data.';
  } finally {
    relayInfoLoadingByUrl.value[key] = false;
  }
}

function handleRelayExpand(relay: string): void {
  void loadRelayInfo(relay);
}

function relayInfo(relay: string): NDKRelayInformation | null {
  return relayInfoByUrl.value[relayKey(relay)] ?? null;
}

function relayInfoError(relay: string): string {
  return relayInfoErrorByUrl.value[relayKey(relay)] ?? '';
}

function isRelayInfoLoading(relay: string): boolean {
  return relayInfoLoadingByUrl.value[relayKey(relay)] === true;
}

function retryRelayInfo(relay: string): void {
  void loadRelayInfo(relay, true);
}

function relayIconUrl(relay: string): string | null {
  const key = relayKey(relay);
  if (relayIconErrorByUrl.value[key]) {
    return null;
  }

  const icon = relayInfo(relay)?.icon;
  if (typeof icon !== 'string') {
    return null;
  }

  const trimmed = icon.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function handleRelayIconError(relay: string): void {
  relayIconErrorByUrl.value[relayKey(relay)] = true;
}

function addRelay(): void {
  const value = newRelay.value.trim();
  if (!value || relayValidationError.value) {
    return;
  }

  relayStore.addRelay(value);
  newRelay.value = '';
}

function validateRelayUrl(value: string): string {
  if (!value) {
    return '';
  }

  try {
    const url = new URL(value);
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
      return 'Relay must use ws:// or wss://';
    }

    if (!url.hostname) {
      return 'Relay URL must include a hostname';
    }

    return '';
  } catch {
    return 'Relay must be a valid ws:// or wss:// URL';
  }
}

function removeRelay(index: number): void {
  if (activeTab.value !== 'app') {
    return;
  }

  relayStore.removeRelay(index);
}

function relayReadEnabled(index: number): boolean {
  return relayStore.getRelayFlags(index).read;
}

function relayWriteEnabled(index: number): boolean {
  return relayStore.getRelayFlags(index).write;
}

function updateRelayRead(index: number, value: boolean): void {
  relayStore.setRelayFlags(index, { read: Boolean(value) });
}

function updateRelayWrite(index: number, value: boolean): void {
  relayStore.setRelayFlags(index, { write: Boolean(value) });
}

function restoreDefaults(): void {
  relayStore.restoreDefaults();
}
</script>

<style scoped>
.relays-content {
  width: 100%;
}

.relays-tabs {
  border-bottom: 1px solid var(--tg-border);
}

.relays-panels {
  background: transparent;
}

.relays-panel {
  padding: 0;
}

.relays-toolbar {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 12px;
}

.relays-toolbar__input {
  flex: 1;
}

.relays-tab-state {
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: #64748b;
  font-size: 14px;
}

.relays-tab-state--error {
  color: #ef4444;
}

.relays-content__list {
  border-radius: 12px;
  background: color-mix(in srgb, var(--tg-sidebar) 90%, transparent);
}

.relay-expansion-item__body {
  padding: 0 14px 14px;
}

.relay-status-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  display: inline-block;
}

.relay-header-cell {
  min-width: 56px;
}

.relay-header-badges {
  display: flex;
  align-items: center;
  gap: 8px;
}

.relay-url-section {
  min-width: 0;
}

.relay-url-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.relay-header-actions {
  display: flex;
  align-items: center;
  margin-left: 8px;
}

.relay-io-toggles {
  display: flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  padding: 1px 6px;
  border: 1px solid var(--tg-border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--tg-sidebar) 84%, transparent);
  margin-top: 4px;
}

.relay-io-toggle {
  display: flex;
  align-items: center;
  gap: 3px;
}

.relay-io-toggle__label {
  font-size: 10px;
  line-height: 1;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.relay-io-switch {
  min-height: 16px;
  padding: 0;
}

.relay-icon {
  border: 1px solid var(--tg-border);
  background: color-mix(in srgb, var(--tg-sidebar) 84%, transparent);
}

.relay-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.relay-icon--fallback {
  color: #64748b;
}

body.body--dark .relay-icon--fallback {
  color: #9ca3af;
}

.relay-status-dot--connected {
  background: #22c55e;
  box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.18);
}

.relay-status-dot--disconnected {
  background: #ef4444;
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.16);
}

.relay-nip11__state {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 36px;
  color: #64748b;
  font-size: 13px;
}

.relay-nip11__state--error {
  color: #ef4444;
}

@media (max-width: 640px) {
  .relays-toolbar {
    flex-direction: column;
  }

  .relays-toolbar__input {
    width: 100%;
  }

  .relay-header-actions {
    margin-left: 6px;
  }

  .relay-io-toggles {
    gap: 5px;
    padding: 1px 5px;
    margin-top: 4px;
  }

  .relay-io-toggle {
    gap: 2px;
  }

  .relay-io-toggle__label {
    font-size: 9px;
  }
}
</style>
