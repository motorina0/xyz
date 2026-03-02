<template>
  <SettingsDetailLayout title="Relays" icon="satellite_alt">
    <div class="relays-content">
      <q-input
        v-model="newRelay"
        class="tg-input"
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

      <div class="relays-content__actions q-mt-sm">
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
        <q-item v-for="(relay, index) in relayStore.relays" :key="`${relay}-${index}`">
          <q-item-section avatar class="relay-status-cell">
            <span
              class="relay-status-dot"
              :class="
                isRelayConnected(relay)
                  ? 'relay-status-dot--connected'
                  : 'relay-status-dot--disconnected'
              "
            />
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
              @click="removeRelay(index)"
            />
          </q-item-section>
        </q-item>
      </q-list>
    </div>
  </SettingsDetailLayout>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import SettingsDetailLayout from 'src/components/SettingsDetailLayout.vue';
import { DEFAULT_RELAYS } from 'src/constants/relays';
import { useNostrStore } from 'src/stores/nostrStore';
import { useRelayStore } from 'src/stores/relayStore';

const relayStore = useRelayStore();
const nostrStore = useNostrStore();
const newRelay = ref('');
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
    void nostrStore.ensureRelayConnections(relays).catch((error) => {
      console.warn('Failed to connect relays for status checks', error);
    });
  },
  { immediate: true }
);

function isRelayConnected(relay: string): boolean {
  void nostrStore.relayStatusVersion;
  return nostrStore.getRelayConnectionState(relay) === 'connected';
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
  max-width: 720px;
}

.relays-content__actions {
  display: flex;
  justify-content: flex-end;
}

.relays-content__list {
  border-radius: 12px;
  background: color-mix(in srgb, var(--tg-sidebar) 90%, transparent);
}

.relay-status-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  display: inline-block;
}

.relay-status-cell {
  min-width: 24px;
}

.relay-status-dot--connected {
  background: #22c55e;
  box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.18);
}

.relay-status-dot--disconnected {
  background: #ef4444;
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.16);
}
</style>
