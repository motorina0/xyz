<template>
  <SettingsDetailLayout title="Relays" icon="satellite_alt">
    <div class="relays-content">
      <q-input
        v-model="newRelay"
        outlined
        dense
        label="Relay URL"
        placeholder="wss://example-relay.io"
        @keydown.enter.prevent="addRelay"
      >
        <template #append>
          <q-btn
            unelevated
            color="primary"
            no-caps
            label="Add"
            class="relays-content__add-btn"
            :disable="newRelay.trim().length === 0"
            @click="addRelay"
          />
        </template>
      </q-input>

      <q-list bordered separator class="relays-content__list q-mt-md">
        <q-item v-for="(relay, index) in relays" :key="`${relay}-${index}`">
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
import { ref } from 'vue';
import SettingsDetailLayout from 'src/components/SettingsDetailLayout.vue';

const relays = ref<string[]>([
  'wss://cache2.primal.net/v1',
  'wss://relay.damus.io',
  'wss://nostr.mom'
]);
const newRelay = ref('');

function addRelay(): void {
  const value = newRelay.value.trim();
  if (!value) {
    return;
  }

  relays.value = [...relays.value, value];
  newRelay.value = '';
}

function removeRelay(index: number): void {
  relays.value = relays.value.filter((_, entryIndex) => entryIndex !== index);
}
</script>

<style scoped>
.relays-content {
  max-width: 720px;
}

.relays-content__add-btn {
  border-radius: 999px;
  min-width: 68px;
}

.relays-content__list {
  border-radius: 12px;
  background: color-mix(in srgb, var(--tg-sidebar) 90%, transparent);
}
</style>
