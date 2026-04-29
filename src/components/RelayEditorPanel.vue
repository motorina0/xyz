<template>
  <div class="relay-editor-panel">
    <div v-if="showToolbar" class="relays-toolbar">
      <q-input
        :model-value="newRelay"
        class="nc-input relays-toolbar__input"
        outlined
        dense
        rounded
        label="Relay URL"
        placeholder="wss://example-relay.io"
        data-testid="relay-editor-new-relay-input"
        :error="Boolean(relayValidationError)"
        :error-message="relayValidationError"
        @update:model-value="emitNewRelayUpdate"
        @keydown.enter.prevent="emitAddRelay"
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
            data-testid="relay-editor-add-relay-button"
            :disable="!canAddRelay"
            @click="emitAddRelay"
          />
        </template>
      </q-input>

      <q-btn
        v-if="showSecondaryAction"
        flat
        color="primary"
        :label="secondaryActionLabel"
        :icon="secondaryActionIcon"
        :disable="secondaryActionDisabled"
        @click="emitSecondaryAction"
      />
    </div>

    <div
      v-if="relays.length === 0"
      class="relays-tab-state"
      :class="{ 'q-mt-md': showToolbar }"
    >
      {{ emptyMessage }}
    </div>

    <q-list
      v-else
      bordered
      separator
      class="relays-content__list"
      :class="{ 'q-mt-md': showToolbar }"
    >
      <q-expansion-item
        v-for="(relay, index) in relays"
        :key="`${relay}-${index}`"
        expand-separator
        switch-toggle-side
        expand-icon="keyboard_arrow_right"
        expanded-icon="keyboard_arrow_down"
        class="relay-expansion-item"
        @show="emitRelayExpand(relay)"
      >
        <template #header>
          <q-item-section avatar class="relay-header-cell">
            <div class="relay-header-badges">
              <q-avatar v-if="relayIconUrl(relay)" size="22px" class="relay-icon">
                <img
                  :src="relayIconUrl(relay) || ''"
                  :alt="`${relay} icon`"
                  @error="emitRelayIconError(relay)"
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
            <div v-if="showRelayIoToggles" class="relay-io-toggles" @click.stop>
              <div class="relay-io-toggle">
                <q-toggle
                  dense
                  size="xs"
                  class="relay-io-switch q-mr-sm"
                  color="primary"
                  :disable="relayTogglesDisabled"
                  :model-value="relayReadEnabled(index)"
                  @click.stop
                  @update:model-value="(value) => emitRelayReadUpdate(index, value)"
                />
                <span class="relay-io-toggle__label">Read</span>
              </div>
              <q-separator vertical class="relay-io-toggle-separator" />
              <div class="relay-io-toggle">
                <span class="relay-io-toggle__label q-ml-sm">Write</span>
                <q-toggle
                  dense
                  size="xs"
                  class="relay-io-switch"
                  color="primary"
                  :disable="relayTogglesDisabled"
                  :model-value="relayWriteEnabled(index)"
                  @click.stop
                  @update:model-value="(value) => emitRelayWriteUpdate(index, value)"
                />
              </div>
            </div>
          </q-item-section>

          <q-item-section v-if="showRemoveRelayAction" side class="relay-header-actions">
            <q-btn
              flat
              round
              dense
              icon="delete"
              color="negative"
              aria-label="Delete relay"
              data-testid="relay-editor-delete-relay-button"
              @click.stop="emitRemoveRelay(index)"
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
              @click="emitRetryRelayInfo(relay)"
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
</template>

<script setup lang="ts">
import type { NDKRelayInformation } from '@nostr-dev-kit/ndk';
import RelayInfoFields from 'src/components/RelayInfoFields.vue';

interface RelayTogglePayload {
  index: number;
  value: boolean;
}

interface Props {
  relays: string[];
  newRelay: string;
  relayValidationError: string;
  canAddRelay: boolean;
  emptyMessage: string;
  showToolbar?: boolean;
  showSecondaryAction?: boolean;
  secondaryActionLabel?: string;
  secondaryActionIcon?: string;
  secondaryActionDisabled?: boolean;
  showRelayIoToggles?: boolean;
  relayTogglesDisabled?: boolean;
  showRemoveRelayAction?: boolean;
  relayReadEnabled: (index: number) => boolean;
  relayWriteEnabled: (index: number) => boolean;
  relayIconUrl: (relay: string) => string | null;
  isRelayConnected: (relay: string) => boolean;
  isRelayInfoLoading: (relay: string) => boolean;
  relayInfoError: (relay: string) => string;
  relayInfo: (relay: string) => NDKRelayInformation | null;
}

withDefaults(defineProps<Props>(), {
  showToolbar: true,
  showSecondaryAction: true,
  secondaryActionLabel: '',
  secondaryActionIcon: 'restart_alt',
  secondaryActionDisabled: false,
  showRelayIoToggles: true,
  relayTogglesDisabled: false,
  showRemoveRelayAction: true
});

const emit = defineEmits<{
  (event: 'update:newRelay', value: string): void;
  (event: 'add-relay'): void;
  (event: 'remove-relay', index: number): void;
  (event: 'secondary-action'): void;
  (event: 'relay-expand', relay: string): void;
  (event: 'retry-relay-info', relay: string): void;
  (event: 'relay-icon-error', relay: string): void;
  (event: 'update-relay-read', payload: RelayTogglePayload): void;
  (event: 'update-relay-write', payload: RelayTogglePayload): void;
}>();

function emitNewRelayUpdate(value: string | number | null): void {
  emit('update:newRelay', typeof value === 'string' ? value : '');
}

function emitAddRelay(): void {
  emit('add-relay');
}

function emitRemoveRelay(index: number): void {
  emit('remove-relay', index);
}

function emitSecondaryAction(): void {
  emit('secondary-action');
}

function emitRelayExpand(relay: string): void {
  emit('relay-expand', relay);
}

function emitRetryRelayInfo(relay: string): void {
  emit('retry-relay-info', relay);
}

function emitRelayIconError(relay: string): void {
  emit('relay-icon-error', relay);
}

function emitRelayReadUpdate(index: number, value: boolean): void {
  emit('update-relay-read', { index, value: Boolean(value) });
}

function emitRelayWriteUpdate(index: number, value: boolean): void {
  emit('update-relay-write', { index, value: Boolean(value) });
}
</script>

<style scoped>
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

.relays-content__list {
  border-radius: 12px;
  background: color-mix(in srgb, var(--nc-sidebar) 90%, transparent);
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
  position: relative;
  margin-left: 8px;
  padding-left: 8px;
}

.relay-header-actions::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  width: 1px;
  height: 22px;
  transform: translateY(-50%);
  background: var(--nc-border);
}

.relay-io-toggles {
  display: flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  padding: 1px 6px;
  border: 1px solid var(--nc-border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--nc-sidebar) 84%, transparent);
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
  border: 1px solid var(--nc-border);
  background: color-mix(in srgb, var(--nc-sidebar) 84%, transparent);
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
    padding-left: 6px;
  }

  .relay-header-actions::before {
    height: 18px;
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
