import { computed, ref } from 'vue';
import type { RelayListEntry } from '../types/relays';
import { normalizeRelayListEntries } from '../utils/relayList';
import { readStorageItem, removeStorageItem, writeStorageItem } from '../utils/storage';

interface RelayListStoreFactoryOptions {
  defaultRelayUrls?: string[];
  storageKey: string;
}

export function createRelayListStoreSetup({
  defaultRelayUrls = [],
  storageKey,
}: RelayListStoreFactoryOptions) {
  function defaultRelayEntries(): RelayListEntry[] {
    return normalizeRelayListEntries(defaultRelayUrls);
  }

  return function relayListStoreSetup() {
    const relayEntries = ref<RelayListEntry[]>([]);
    const isInitialized = ref(false);
    const relays = computed(() => relayEntries.value.map((entry) => entry.url));

    function persistRelayEntries(): void {
      writeStorageItem(storageKey, relayEntries.value);
    }

    function ensureInitialized(): void {
      if (!isInitialized.value) {
        init();
      }
    }

    function init(): void {
      if (isInitialized.value) {
        return;
      }

      relayEntries.value = normalizeRelayListEntries(
        readStorageItem<unknown[]>(storageKey, defaultRelayEntries()),
      );
      persistRelayEntries();
      isInitialized.value = true;
    }

    function addRelay(relayUrl: string): void {
      ensureInitialized();
      relayEntries.value = normalizeRelayListEntries([
        ...relayEntries.value,
        {
          url: relayUrl,
          read: true,
          write: true,
        },
      ]);
      persistRelayEntries();
    }

    function clear(): void {
      relayEntries.value = [];
      isInitialized.value = true;
      removeStorageItem(storageKey);
    }

    function removeRelay(index: number): void {
      ensureInitialized();
      relayEntries.value = relayEntries.value.filter((_, relayIndex) => relayIndex !== index);
      persistRelayEntries();
    }

    function replaceRelayEntries(entries: unknown[]): void {
      ensureInitialized();
      relayEntries.value = normalizeRelayListEntries(entries);
      persistRelayEntries();
    }

    function restoreDefaults(): void {
      ensureInitialized();
      relayEntries.value = defaultRelayEntries();
      persistRelayEntries();
    }

    function getRelayFlags(index: number): Pick<RelayListEntry, 'read' | 'write'> {
      ensureInitialized();
      const relayEntry = relayEntries.value[index];

      return {
        read: relayEntry?.read ?? true,
        write: relayEntry?.write ?? true,
      };
    }

    function setRelayFlags(
      index: number,
      flags: Partial<Pick<RelayListEntry, 'read' | 'write'>>,
    ): void {
      ensureInitialized();
      const relayEntry = relayEntries.value[index];
      if (!relayEntry) {
        return;
      }

      relayEntries.value = relayEntries.value.map((entry, relayIndex) =>
        relayIndex === index
          ? {
              ...entry,
              read: typeof flags.read === 'boolean' ? flags.read : entry.read,
              write: typeof flags.write === 'boolean' ? flags.write : entry.write,
            }
          : entry,
      );
      persistRelayEntries();
    }

    return {
      addRelay,
      clear,
      getRelayFlags,
      init,
      relayEntries,
      relays,
      removeRelay,
      replaceRelayEntries,
      restoreDefaults,
      setRelayFlags,
    };
  };
}
