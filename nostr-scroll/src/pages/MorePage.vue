<template>
  <q-page class="timeline-page more-page">
    <StickyTopBar title="More" />

    <div class="more-page__content">
      <div class="more-page__intro text-scroll-muted">
        Quick access to relay and client preferences for the prototype.
      </div>

      <div class="scroll-card more-page__panel">
        <q-expansion-item
          dense
          dense-toggle
          expand-separator
          icon="hub"
          label="My Relays"
          header-class="more-page__section-header"
        >
          <div class="more-page__section-body">
            <div
              v-for="relay in myRelays"
              :key="relay.url"
              class="more-page__row"
            >
              <div class="more-page__row-copy">
                <div class="more-page__row-title">{{ relay.label }}</div>
                <div class="more-page__row-subtitle text-scroll-muted">{{ relay.url }}</div>
              </div>
              <div class="more-page__pill">{{ relay.status }}</div>
            </div>
          </div>
        </q-expansion-item>

        <q-expansion-item
          dense
          dense-toggle
          expand-separator
          icon="sensors"
          label="App Relays"
          header-class="more-page__section-header"
        >
          <div class="more-page__section-body more-page__section-body--relay-editor">
            <div class="more-page__relay-toolbar">
              <q-input
                v-model="appNewRelay"
                outlined
                dense
                rounded
                label="Relay URL"
                placeholder="wss://example-relay.io"
                class="more-page__relay-input"
                :error="Boolean(appRelayValidationError)"
                :error-message="appRelayValidationError"
                @keydown.enter.prevent="addAppRelay"
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
                    :disable="!canAddAppRelay"
                    @click="addAppRelay"
                  />
                </template>
              </q-input>

              <q-btn
                flat
                color="primary"
                icon="restart_alt"
                label="Restore Default Relays"
                :disable="!canRestoreAppRelays"
                @click="restoreDefaultAppRelays"
              />
            </div>

            <div v-if="appRelays.length === 0" class="more-page__relay-empty text-scroll-muted">
              No app relays configured.
            </div>

            <q-list
              v-else
              bordered
              separator
              class="more-page__relay-list"
            >
              <q-expansion-item
                v-for="(relay, index) in appRelays"
                :key="relay.url"
                expand-separator
                switch-toggle-side
                expand-icon="keyboard_arrow_right"
                expanded-icon="keyboard_arrow_down"
                class="more-page__relay-item"
              >
                <template #header>
                  <q-item-section avatar class="more-page__relay-header-cell">
                    <div class="more-page__relay-header-badges">
                      <q-avatar size="22px" class="more-page__relay-icon more-page__relay-icon--fallback">
                        <q-icon name="satellite_alt" size="14px" />
                      </q-avatar>

                      <span
                        class="more-page__relay-status-dot"
                        :class="
                          relay.connected
                            ? 'more-page__relay-status-dot--connected'
                            : 'more-page__relay-status-dot--disconnected'
                        "
                      />
                    </div>
                  </q-item-section>

                  <q-item-section class="more-page__relay-url-section">
                    <q-item-label class="more-page__relay-url-label">
                      {{ relay.url }}
                    </q-item-label>

                    <div class="more-page__relay-io-toggles" @click.stop>
                      <div class="more-page__relay-io-toggle">
                        <q-toggle
                          dense
                          size="xs"
                          class="more-page__relay-io-switch q-mr-sm"
                          color="primary"
                          :model-value="relay.read"
                          @click.stop
                          @update:model-value="updateAppRelayRead(index, $event)"
                        />
                        <span class="more-page__relay-io-toggle-label">Read</span>
                      </div>

                      <q-separator vertical class="more-page__relay-io-toggle-separator" />

                      <div class="more-page__relay-io-toggle">
                        <span class="more-page__relay-io-toggle-label q-ml-sm">Write</span>
                        <q-toggle
                          dense
                          size="xs"
                          class="more-page__relay-io-switch"
                          color="primary"
                          :model-value="relay.write"
                          @click.stop
                          @update:model-value="updateAppRelayWrite(index, $event)"
                        />
                      </div>
                    </div>
                  </q-item-section>

                  <q-item-section side class="more-page__relay-header-actions">
                    <q-btn
                      flat
                      round
                      dense
                      icon="delete"
                      color="negative"
                      aria-label="Delete relay"
                      @click.stop="removeAppRelay(index)"
                    />
                  </q-item-section>
                </template>

                <div class="more-page__relay-body">
                  <div class="more-page__relay-note">
                    {{ relay.isDefault ? 'Default nostr-chat app relay' : 'Custom prototype app relay' }}
                  </div>
                  <div class="text-scroll-muted more-page__relay-note">
                    Read and write are both enabled by default, matching the base app relay setup.
                  </div>
                </div>
              </q-expansion-item>
            </q-list>
          </div>
        </q-expansion-item>

        <q-expansion-item
          dense
          dense-toggle
          expand-separator
          icon="palette"
          label="Appearance"
          header-class="more-page__section-header"
        >
          <div class="more-page__section-body">
            <div
              v-for="item in appearanceOptions"
              :key="item.label"
              class="more-page__row"
            >
              <div class="more-page__row-copy">
                <div class="more-page__row-title">{{ item.label }}</div>
                <div class="more-page__row-subtitle text-scroll-muted">{{ item.description }}</div>
              </div>
              <div class="more-page__value">{{ item.value }}</div>
            </div>
          </div>
        </q-expansion-item>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import StickyTopBar from '../components/layout/StickyTopBar.vue';

interface PrototypeRelayEntry {
  url: string;
  read: boolean;
  write: boolean;
  connected: boolean;
  isDefault: boolean;
}

const DEFAULT_APP_RELAY_URLS = [
  'wss://relay.damus.io',
  'wss://nostr.mom',
  'wss://nostr.bitcoiner.social',
  'wss://nos.lol',
  'wss://relay.snort.social',
];

const myRelays = [
  {
    label: 'Primary Write Relay',
    url: 'wss://relay.damus.io',
    status: 'Connected',
  },
  {
    label: 'Profile Backup Relay',
    url: 'wss://nos.lol',
    status: 'Healthy',
  },
  {
    label: 'Timeline Relay',
    url: 'wss://relay.primal.net',
    status: 'Synced',
  },
];

const appearanceOptions = [
  {
    label: 'Theme',
    description: 'The current client theme for the prototype shell.',
    value: 'Midnight',
  },
  {
    label: 'Density',
    description: 'Keeps the timeline spacing compact, similar to the current feed layout.',
    value: 'Compact',
  },
  {
    label: 'Media Motion',
    description: 'Controls animated transitions and preview movement inside the app.',
    value: 'Balanced',
  },
];

const appNewRelay = ref('');
const appRelays = ref<PrototypeRelayEntry[]>(createDefaultAppRelays());
const appRelayValidationError = computed(() => validateRelayUrl(appNewRelay.value.trim()));
const canAddAppRelay = computed(() => {
  const value = appNewRelay.value.trim();
  return value.length > 0 && appRelayValidationError.value.length === 0;
});
const canRestoreAppRelays = computed(() => {
  const current = appRelays.value;
  if (current.length !== DEFAULT_APP_RELAY_URLS.length) {
    return true;
  }

  return current.some((relay, index) => {
    const defaultUrl = DEFAULT_APP_RELAY_URLS[index];
    return relay.url !== defaultUrl || relay.read !== true || relay.write !== true;
  });
});

function createDefaultAppRelays(): PrototypeRelayEntry[] {
  return DEFAULT_APP_RELAY_URLS.map((url) => ({
    url,
    read: true,
    write: true,
    connected: true,
    isDefault: true,
  }));
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

function addAppRelay(): void {
  if (!canAddAppRelay.value) {
    return;
  }

  const value = appNewRelay.value.trim();
  if (appRelays.value.some((relay) => relay.url === value)) {
    appNewRelay.value = '';
    return;
  }

  appRelays.value = [
    ...appRelays.value,
    {
      url: value,
      read: true,
      write: true,
      connected: false,
      isDefault: false,
    },
  ];
  appNewRelay.value = '';
}

function removeAppRelay(index: number): void {
  appRelays.value = appRelays.value.filter((_, relayIndex) => relayIndex !== index);
}

function updateAppRelayRead(index: number, value: boolean): void {
  appRelays.value = appRelays.value.map((relay, relayIndex) =>
    relayIndex === index ? { ...relay, read: Boolean(value) } : relay,
  );
}

function updateAppRelayWrite(index: number, value: boolean): void {
  appRelays.value = appRelays.value.map((relay, relayIndex) =>
    relayIndex === index ? { ...relay, write: Boolean(value) } : relay,
  );
}

function restoreDefaultAppRelays(): void {
  appRelays.value = createDefaultAppRelays();
}
</script>

<style scoped>
.more-page__content {
  display: grid;
  gap: 18px;
  padding: 16px 0 40px;
}

.more-page__intro {
  padding: 0 16px;
  font-size: 0.95rem;
  line-height: 1.5;
}

.more-page__panel {
  margin: 0 12px;
  overflow: hidden;
}

.more-page__section-body {
  padding: 0 0 8px;
}

.more-page__section-body--relay-editor {
  padding-bottom: 14px;
}

.more-page__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.03);
}

.more-page__row:first-child {
  border-top: none;
}

.more-page__row-copy {
  min-width: 0;
  flex: 1;
}

.more-page__row-title {
  font-size: 0.98rem;
  font-weight: 700;
}

.more-page__row-subtitle {
  margin-top: 4px;
  font-size: 0.88rem;
  line-height: 1.45;
  word-break: break-word;
}

.more-page__relay-toolbar {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px 0;
}

.more-page__relay-input {
  flex: 1;
}

.more-page__relay-empty {
  min-height: 48px;
  display: flex;
  align-items: center;
  padding: 10px 14px 0;
  font-size: 0.92rem;
}

.more-page__relay-list {
  margin: 14px 14px 0;
  border-radius: 16px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.02);
  border-color: var(--scroll-border);
}

.more-page__relay-body {
  padding: 0 14px 14px;
}

.more-page__relay-note {
  min-height: 22px;
  font-size: 0.86rem;
  line-height: 1.5;
}

.more-page__relay-header-cell {
  min-width: 56px;
}

.more-page__relay-header-badges {
  display: flex;
  align-items: center;
  gap: 8px;
}

.more-page__relay-url-section {
  min-width: 0;
}

.more-page__relay-url-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 600;
}

.more-page__relay-header-actions {
  display: flex;
  align-items: center;
  position: relative;
  margin-left: 8px;
  padding-left: 8px;
}

.more-page__relay-header-actions::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  width: 1px;
  height: 22px;
  transform: translateY(-50%);
  background: var(--scroll-border);
}

.more-page__relay-io-toggles {
  display: flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  padding: 1px 6px;
  border: 1px solid var(--scroll-border);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.03);
  margin-top: 4px;
}

.more-page__relay-io-toggle {
  display: flex;
  align-items: center;
  gap: 3px;
}

.more-page__relay-io-toggle-label {
  font-size: 10px;
  line-height: 1;
  color: var(--scroll-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.more-page__relay-io-switch {
  min-height: 16px;
  padding: 0;
}

.more-page__relay-icon {
  border: 1px solid var(--scroll-border);
  background: rgba(255, 255, 255, 0.04);
}

.more-page__relay-icon--fallback {
  color: var(--scroll-text-muted);
}

.more-page__relay-status-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  display: inline-block;
}

.more-page__relay-status-dot--connected {
  background: #22c55e;
  box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.18);
}

.more-page__relay-status-dot--disconnected {
  background: #ef4444;
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.16);
}

.more-page__pill,
.more-page__value {
  flex-shrink: 0;
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 0.8rem;
  font-weight: 700;
}

.more-page__pill {
  background: rgba(29, 155, 240, 0.18);
  color: #8ecdf8;
}

.more-page__value {
  background: rgba(255, 255, 255, 0.05);
  color: var(--scroll-text);
}

:deep(.more-page__section-header) {
  min-height: 60px;
  padding: 0 14px;
  color: var(--scroll-text);
}

:deep(.more-page__section-header .q-item__label) {
  font-size: 1rem;
  font-weight: 700;
}

:deep(.more-page__section-header .q-icon) {
  color: var(--scroll-text-muted);
}

@media (max-width: 640px) {
  .more-page__relay-toolbar {
    flex-direction: column;
  }

  .more-page__relay-input {
    width: 100%;
  }

  .more-page__relay-header-actions {
    margin-left: 6px;
    padding-left: 6px;
  }

  .more-page__relay-header-actions::before {
    height: 18px;
  }

  .more-page__relay-io-toggles {
    gap: 5px;
    padding: 1px 5px;
  }

  .more-page__relay-io-toggle {
    gap: 2px;
  }

  .more-page__relay-io-toggle-label {
    font-size: 9px;
  }
}

@media (max-width: 599px) {
  .more-page__content {
    padding-bottom: 86px;
  }

  .more-page__panel {
    margin: 0;
    border-left: none;
    border-right: none;
    border-radius: 0;
  }

  .more-page__relay-list {
    margin-left: 0;
    margin-right: 0;
    border-left: none;
    border-right: none;
    border-radius: 0;
  }
}
</style>
