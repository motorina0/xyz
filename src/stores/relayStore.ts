import { defineStore } from 'pinia';
import { ref } from 'vue';
import { DEFAULT_RELAYS } from 'src/constants/relays';

const RELAYS_STORAGE_KEY = 'telegram-ui-relays';

function hasStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readStoredRelays(): string[] | null {
  if (!hasStorage()) {
    return null;
  }

  try {
    const value = window.localStorage.getItem(RELAYS_STORAGE_KEY);
    if (!value) {
      return null;
    }

    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return null;
    }

    const relays = parsed
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => entry.length > 0);

    return relays.length > 0 ? relays : null;
  } catch (error) {
    console.warn('Failed to read relay list from localStorage', error);
    return null;
  }
}

function writeStoredRelays(relays: string[]): void {
  if (!hasStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(RELAYS_STORAGE_KEY, JSON.stringify(relays));
  } catch (error) {
    console.warn('Failed to persist relay list to localStorage', error);
  }
}

export const useRelayStore = defineStore('relayStore', () => {
  const relays = ref<string[]>([]);
  const isInitialized = ref(false);

  function init(): void {
    if (isInitialized.value) {
      return;
    }

    const storedRelays = readStoredRelays();
    relays.value = storedRelays ? [...storedRelays] : [...DEFAULT_RELAYS];
    isInitialized.value = true;
  }

  function addRelay(relay: string): void {
    const value = relay.trim();
    if (!value) {
      return;
    }

    if (!isInitialized.value) {
      init();
    }

    relays.value = [...relays.value, value];
    writeStoredRelays(relays.value);
  }

  function removeRelay(index: number): void {
    if (!isInitialized.value) {
      init();
    }

    relays.value = relays.value.filter((_, relayIndex) => relayIndex !== index);
    writeStoredRelays(relays.value);
  }

  return {
    relays,
    init,
    addRelay,
    removeRelay
  };
});

