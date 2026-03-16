<template>
  <SettingsDetailLayout title="Relays" icon="satellite_alt">
    <div class="relays-content">
      <q-tabs
        v-model="activeTab"
        dense
        align="justify"
        active-color="primary"
        indicator-color="primary"
        class="relays-tabs"
      >
        <q-tab name="my" label="My Relays (NIP-65)" class="relays-tab" />
        <q-tab name="app" label="App Relays" class="relays-tab" />
        <q-tab name="contacts" label="Contacts Relays" class="relays-tab" />
      </q-tabs>

      <q-tab-panels v-model="activeTab" animated class="relays-panels">
        <q-tab-panel name="my" class="relays-panel">
          <RelayEditorPanel
            v-model:new-relay="myNewRelay"
            :relays="nip65RelayStore.relays"
            :relay-validation-error="myRelayValidationError"
            :can-add-relay="canAddMyRelay"
            empty-message="No NIP-65 relays configured."
            :secondary-action-disabled="!canUseDefaultMyRelays"
            secondary-action-label="Use Default Relays"
            secondary-action-icon="restart_alt"
            :relay-read-enabled="myRelayReadEnabled"
            :relay-write-enabled="myRelayWriteEnabled"
            :relay-icon-url="relayIconUrl"
            :is-relay-connected="isRelayConnected"
            :is-relay-info-loading="isRelayInfoLoading"
            :relay-info-error="relayInfoError"
            :relay-info="relayInfo"
            @add-relay="addMyRelay"
            @remove-relay="removeMyRelay"
            @secondary-action="useDefaultMyRelays"
            @relay-expand="handleRelayExpand"
            @retry-relay-info="retryRelayInfo"
            @relay-icon-error="handleRelayIconError"
            @update-relay-read="updateMyRelayRead"
            @update-relay-write="updateMyRelayWrite"
          />
        </q-tab-panel>

        <q-tab-panel name="app" class="relays-panel">
          <RelayEditorPanel
            v-model:new-relay="appNewRelay"
            :relays="relayStore.relays"
            :relay-validation-error="appRelayValidationError"
            :can-add-relay="canAddAppRelay"
            empty-message="No app relays configured."
            :secondary-action-disabled="!canRestoreDefaults"
            secondary-action-label="Restore Default Relays"
            secondary-action-icon="restart_alt"
            :relay-read-enabled="appRelayReadEnabled"
            :relay-write-enabled="appRelayWriteEnabled"
            :relay-icon-url="relayIconUrl"
            :is-relay-connected="isRelayConnected"
            :is-relay-info-loading="isRelayInfoLoading"
            :relay-info-error="relayInfoError"
            :relay-info="relayInfo"
            @add-relay="addAppRelay"
            @remove-relay="removeAppRelay"
            @secondary-action="restoreDefaults"
            @relay-expand="handleRelayExpand"
            @retry-relay-info="retryRelayInfo"
            @relay-icon-error="handleRelayIconError"
            @update-relay-read="updateAppRelayRead"
            @update-relay-write="updateAppRelayWrite"
          />
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

          <div v-else-if="contactsRelays.length === 0" class="relays-tab-state">
            No contact relays found yet.
          </div>

        </q-tab-panel>
      </q-tab-panels>
    </div>
  </SettingsDetailLayout>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { normalizeRelayUrl, type NDKRelayInformation } from '@nostr-dev-kit/ndk';
import RelayEditorPanel from 'src/components/RelayEditorPanel.vue';
import SettingsDetailLayout from 'src/components/SettingsDetailLayout.vue';
import { DEFAULT_RELAYS } from 'src/constants/relays';
import { relaysService } from 'src/services/relaysService';
import { useNip65RelayStore } from 'src/stores/nip65RelayStore';
import { useNostrStore } from 'src/stores/nostrStore';
import { useRelayStore } from 'src/stores/relayStore';
import { reportUiError } from 'src/utils/uiErrorHandler';

type RelayTab = 'my' | 'app' | 'contacts';
interface RelayTogglePayload {
  index: number;
  value: boolean;
}

const relayStore = useRelayStore();
const nip65RelayStore = useNip65RelayStore();
const nostrStore = useNostrStore();
const activeTab = ref<RelayTab>('my');
const appNewRelay = ref('');
const myNewRelay = ref('');
const relayInfoByUrl = ref<Record<string, NDKRelayInformation | null>>({});
const relayInfoErrorByUrl = ref<Record<string, string>>({});
const relayInfoLoadingByUrl = ref<Record<string, boolean>>({});
const relayIconErrorByUrl = ref<Record<string, boolean>>({});
const contactsRelays = ref<string[]>([]);
const isLoadingContactsRelays = ref(false);
const contactsRelaysError = ref('');
const hasLoadedContactsRelays = ref(false);
let myRelaysSyncPromise: Promise<void> | null = null;
let hasPendingMyRelaysSync = false;
const appRelayValidationError = computed(() => validateRelayUrl(appNewRelay.value.trim()));
const myRelayValidationError = computed(() => validateRelayUrl(myNewRelay.value.trim()));
const canAddAppRelay = computed(() => {
  const value = appNewRelay.value.trim();
  return value.length > 0 && appRelayValidationError.value.length === 0;
});
const canAddMyRelay = computed(() => {
  const value = myNewRelay.value.trim();
  return value.length > 0 && myRelayValidationError.value.length === 0;
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
const canUseDefaultMyRelays = computed(() => {
  if (nip65RelayStore.relays.length !== DEFAULT_RELAYS.length) {
    return true;
  }

  if (nip65RelayStore.relays.some((relay, index) => relay !== DEFAULT_RELAYS[index])) {
    return true;
  }

  return nip65RelayStore.relayEntries.some((entry) => entry.read !== true || entry.write !== true);
});
const allKnownRelays = computed(() =>
  uniqueRelays([...relayStore.relays, ...nip65RelayStore.relays, ...contactsRelays.value])
);

relayStore.init();
nip65RelayStore.init();

watch(
  allKnownRelays,
  (relays) => {
    pruneRelayInfoCache(relays);
    void prepareRelayDecorations(relays);
  },
  { immediate: true }
);

watch(
  activeTab,
  (tab) => {
    if (tab === 'contacts') {
      void loadContactsRelays();
    }
  },
  { immediate: true }
);

watch(
  () => nostrStore.contactListVersion,
  () => {
    const shouldReloadContactsRelays =
      activeTab.value === 'contacts' || hasLoadedContactsRelays.value;
    if (!shouldReloadContactsRelays) {
      return;
    }

    hasLoadedContactsRelays.value = false;
    void loadContactsRelays(true);
  }
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
  } catch (error) {
    contactsRelays.value = [];
    contactsRelaysError.value =
      error instanceof Error ? error.message : 'Failed to load contacts relays.';
  } finally {
    isLoadingContactsRelays.value = false;
  }
}

function isTabLoading(tab: RelayTab): boolean {
  if (tab === 'contacts') {
    return isLoadingContactsRelays.value;
  }

  return false;
}

function tabError(tab: RelayTab): string {
  if (tab === 'contacts') {
    return contactsRelaysError.value;
  }

  return '';
}

function reloadTab(tab: RelayTab): void {
  try {
    if (tab === 'contacts') {
      hasLoadedContactsRelays.value = false;
      void loadContactsRelays(true);
    }
  } catch (error) {
    reportUiError('Failed to reload relay tab', error);
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
  try {
    void loadRelayInfo(relay);
  } catch (error) {
    reportUiError('Failed to expand relay details', error);
  }
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
  try {
    void loadRelayInfo(relay, true);
  } catch (error) {
    reportUiError('Failed to retry relay info load', error);
  }
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
  try {
    relayIconErrorByUrl.value[relayKey(relay)] = true;
  } catch (error) {
    reportUiError('Failed to handle relay icon error', error);
  }
}

function addAppRelay(): void {
  try {
    const value = appNewRelay.value.trim();
    if (!value || appRelayValidationError.value) {
      return;
    }

    relayStore.addRelay(value);
    appNewRelay.value = '';
  } catch (error) {
    reportUiError('Failed to add app relay', error);
  }
}

function addMyRelay(): void {
  try {
    const value = myNewRelay.value.trim();
    if (!value || myRelayValidationError.value) {
      return;
    }

    nip65RelayStore.addRelay(value);
    myNewRelay.value = '';
    queueMyRelaysSync();
  } catch (error) {
    reportUiError('Failed to add personal relay', error);
  }
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

function removeAppRelay(index: number): void {
  try {
    relayStore.removeRelay(index);
  } catch (error) {
    reportUiError('Failed to remove app relay', error);
  }
}

function removeMyRelay(index: number): void {
  try {
    nip65RelayStore.removeRelay(index);
    queueMyRelaysSync();
  } catch (error) {
    reportUiError('Failed to remove personal relay', error);
  }
}

function appRelayReadEnabled(index: number): boolean {
  return relayStore.getRelayFlags(index).read;
}

function appRelayWriteEnabled(index: number): boolean {
  return relayStore.getRelayFlags(index).write;
}

function updateAppRelayRead({ index, value }: RelayTogglePayload): void {
  try {
    relayStore.setRelayFlags(index, { read: value });
  } catch (error) {
    reportUiError('Failed to update app relay read flag', error);
  }
}

function updateAppRelayWrite({ index, value }: RelayTogglePayload): void {
  try {
    relayStore.setRelayFlags(index, { write: value });
  } catch (error) {
    reportUiError('Failed to update app relay write flag', error);
  }
}

function myRelayReadEnabled(index: number): boolean {
  return nip65RelayStore.getRelayFlags(index).read;
}

function myRelayWriteEnabled(index: number): boolean {
  return nip65RelayStore.getRelayFlags(index).write;
}

function updateMyRelayRead({ index, value }: RelayTogglePayload): void {
  try {
    nip65RelayStore.setRelayFlags(index, { read: value });
    queueMyRelaysSync();
  } catch (error) {
    reportUiError('Failed to update personal relay read flag', error);
  }
}

function updateMyRelayWrite({ index, value }: RelayTogglePayload): void {
  try {
    nip65RelayStore.setRelayFlags(index, { write: value });
    queueMyRelaysSync();
  } catch (error) {
    reportUiError('Failed to update personal relay write flag', error);
  }
}

function restoreDefaults(): void {
  try {
    relayStore.restoreDefaults();
  } catch (error) {
    reportUiError('Failed to restore default app relays', error);
  }
}

function useDefaultMyRelays(): void {
  try {
    nip65RelayStore.restoreDefaults();
    for (const relay of DEFAULT_RELAYS) {
      nip65RelayStore.addRelay(relay);
    }

    queueMyRelaysSync();
  } catch (error) {
    reportUiError('Failed to reset personal relays', error);
  }
}

function queueMyRelaysSync(): void {
  hasPendingMyRelaysSync = true;

  if (myRelaysSyncPromise) {
    return;
  }

  myRelaysSyncPromise = (async () => {
    while (hasPendingMyRelaysSync) {
      hasPendingMyRelaysSync = false;
      const relayEntriesSnapshot = nip65RelayStore.relayEntries.map((entry) => ({ ...entry }));

      try {
        await nostrStore.publishMyRelayList(relayEntriesSnapshot, relayStore.relays);
        await nostrStore.updateLoggedInUserRelayList(relayEntriesSnapshot);
      } catch (error) {
        reportUiError('Failed to sync My Relays updates', error);
      }
    }
  })().finally(() => {
    myRelaysSyncPromise = null;
  });
}
</script>

<style scoped>
.relays-content {
  width: 100%;
}

.relays-tabs {
  width: 100%;
  border-bottom: 1px solid var(--tg-border);
}

.relays-tabs :deep(.q-tabs__content) {
  width: 100%;
}

.relays-tabs :deep(.q-tab) {
  flex: 1 1 0;
  max-width: none;
  min-width: 0;
}

.relays-tab {
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.relays-panels {
  background: transparent;
}

.relays-panel {
  padding: 0;
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
</style>
