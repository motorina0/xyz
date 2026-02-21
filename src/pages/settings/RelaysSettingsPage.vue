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

      <q-list bordered separator class="relays-content__list q-mt-md">
        <q-item v-for="(relay, index) in relayStore.relays" :key="`${relay}-${index}`">
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
import { computed, ref } from 'vue';
import SettingsDetailLayout from 'src/components/SettingsDetailLayout.vue';
import { useRelayStore } from 'src/stores/relayStore';

const relayStore = useRelayStore();
const newRelay = ref('');
const relayValidationError = computed(() => validateRelayUrl(newRelay.value.trim()));
const canAddRelay = computed(() => {
  const value = newRelay.value.trim();
  return value.length > 0 && relayValidationError.value.length === 0;
});

relayStore.init();

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
</script>

<style scoped>
.relays-content {
  max-width: 720px;
}

.relays-content__list {
  border-radius: 12px;
  background: color-mix(in srgb, var(--tg-sidebar) 90%, transparent);
}
</style>
