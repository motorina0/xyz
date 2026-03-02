<template>
  <SettingsDetailLayout title="Relays" icon="satellite_alt">
    <div class="relays-content">
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

      <q-list bordered separator class="relays-content__list q-mt-md">
        <q-expansion-item
          v-for="(relay, index) in relayStore.relays"
          :key="`${relay}-${index}`"
          expand-separator
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

            <q-item-section>
              <q-item-label>{{ relay }}</q-item-label>
            </q-item-section>

            <q-item-section side>
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

            <div v-else-if="relayInfoError(relay)" class="relay-nip11__state relay-nip11__state--error">
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
    </div>
  </SettingsDetailLayout>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { normalizeRelayUrl, type NDKRelayInformation } from '@nostr-dev-kit/ndk';
import RelayInfoFields from 'src/components/RelayInfoFields.vue';
import SettingsDetailLayout from 'src/components/SettingsDetailLayout.vue';
import { DEFAULT_RELAYS } from 'src/constants/relays';
import { useNostrStore } from 'src/stores/nostrStore';
import { useRelayStore } from 'src/stores/relayStore';

const relayStore = useRelayStore();
const nostrStore = useNostrStore();
const newRelay = ref('');
const relayInfoByUrl = ref<Record<string, NDKRelayInformation | null>>({});
const relayInfoErrorByUrl = ref<Record<string, string>>({});
const relayInfoLoadingByUrl = ref<Record<string, boolean>>({});
const relayIconErrorByUrl = ref<Record<string, boolean>>({});
const relayValidationError = computed(() => validateRelayUrl(newRelay.value.trim()));
const canAddRelay = computed(() => {
  const value = newRelay.value.trim();
  return value.length > 0 && relayValidationError.value.length === 0;
});
const canRestoreDefaults = computed(() => {
  if (relayStore.relays.length !== DEFAULT_RELAYS.length) {
    return true;
  }

  return relayStore.relays.some((relay, index) => relay !== DEFAULT_RELAYS[index]);
});

relayStore.init();
watch(
  () => [...relayStore.relays],
  (relays) => {
    pruneRelayInfoCache(relays);

    void nostrStore.ensureRelayConnections(relays).catch((error) => {
      console.warn('Failed to connect relays for status checks', error);
    });

    for (const relay of relays) {
      void loadRelayInfo(relay);
    }
  },
  { immediate: true }
);

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
  relayStore.removeRelay(index);
}

function restoreDefaults(): void {
  relayStore.restoreDefaults();
}
</script>

<style scoped>
.relays-content {
  width: 100%;
}

.relays-toolbar {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.relays-toolbar__input {
  flex: 1;
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

</style>
