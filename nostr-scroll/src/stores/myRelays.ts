import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { fetchMyRelayEntries, publishMyRelayEntries } from '../services/nostrRelayService';
import type { RelayListEntry } from '../types/relays';
import { normalizeRelayListEntries } from '../utils/relayList';
import {
  readStorageItem,
  removeStorageItem,
  STORAGE_KEYS,
  writeStorageItem,
} from '../utils/storage';
import { useAppRelaysStore } from './appRelays';
import { useAuthStore } from './auth';

export const useMyRelaysStore = defineStore('myRelays', () => {
  const authStore = useAuthStore();
  const appRelaysStore = useAppRelaysStore();

  const relayEntries = ref<RelayListEntry[]>([]);
  const isInitialized = ref(false);
  const isHydrating = ref(false);
  const isPublishing = ref(false);
  const hydrationError = ref('');
  const syncError = ref('');
  const hydratedForPubkey = ref<string | null>(null);
  const privateRelayCount = ref(0);
  const publicRelayCount = ref(0);
  const relays = computed(() => relayEntries.value.map((entry) => entry.url));

  let publishQueue = Promise.resolve();
  let pendingPublishCount = 0;

  function persistRelayEntries(): void {
    writeStorageItem(STORAGE_KEYS.myRelays, relayEntries.value);
  }

  function init(): void {
    if (isInitialized.value) {
      return;
    }

    relayEntries.value = normalizeRelayListEntries(
      readStorageItem<unknown[]>(STORAGE_KEYS.myRelays, [])
    );
    persistRelayEntries();
    isInitialized.value = true;
  }

  function ensureInitialized(): void {
    if (!isInitialized.value) {
      init();
    }
  }

  function replaceRelayEntries(entries: unknown[]): void {
    ensureInitialized();
    relayEntries.value = normalizeRelayListEntries(entries);
    persistRelayEntries();
  }

  async function hydrateFromNostr(force = false): Promise<void> {
    ensureInitialized();
    const targetPubkey = authStore.currentPubkey;
    if (!targetPubkey) {
      return;
    }

    if (!force && hydratedForPubkey.value === targetPubkey) {
      return;
    }

    appRelaysStore.init();
    isHydrating.value = true;
    hydrationError.value = '';

    try {
      const fetchResult = await fetchMyRelayEntries(authStore.session, appRelaysStore.relayEntries);
      privateRelayCount.value = fetchResult.privateRelayEntries.length;
      publicRelayCount.value = fetchResult.publicRelayEntries.length;

      if (fetchResult.mergedRelayEntries.length > 0 || relayEntries.value.length === 0) {
        replaceRelayEntries(fetchResult.mergedRelayEntries);
      }

      hydratedForPubkey.value = targetPubkey;
    } catch (error) {
      hydrationError.value =
        error instanceof Error ? error.message : 'Failed to load My Relays from Nostr.';
    } finally {
      isHydrating.value = false;
    }
  }

  async function publishCurrentRelayEntries(): Promise<void> {
    ensureInitialized();
    appRelaysStore.init();
    if (!authStore.currentPubkey) {
      return;
    }

    pendingPublishCount += 1;
    isPublishing.value = true;
    syncError.value = '';
    const relayEntriesSnapshot = relayEntries.value.map((entry) => ({ ...entry }));
    const publishPromise = publishQueue
      .catch(() => {})
      .then(async () => {
        await publishMyRelayEntries(
          authStore.session,
          relayEntriesSnapshot,
          appRelaysStore.relayEntries
        );
      });
    publishQueue = publishPromise;

    try {
      await publishPromise;
      hydratedForPubkey.value = authStore.currentPubkey;
    } catch (error) {
      syncError.value = error instanceof Error ? error.message : 'Failed to publish My Relays.';
      throw error;
    } finally {
      pendingPublishCount -= 1;
      if (pendingPublishCount === 0) {
        isPublishing.value = false;
      }
    }
  }

  async function addRelay(relayUrl: string): Promise<void> {
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
    await publishCurrentRelayEntries();
  }

  async function removeRelay(index: number): Promise<void> {
    ensureInitialized();
    relayEntries.value = relayEntries.value.filter((_, relayIndex) => relayIndex !== index);
    persistRelayEntries();
    await publishCurrentRelayEntries();
  }

  function getRelayFlags(index: number): Pick<RelayListEntry, 'read' | 'write'> {
    ensureInitialized();
    const relayEntry = relayEntries.value[index];

    return {
      read: relayEntry?.read ?? true,
      write: relayEntry?.write ?? true,
    };
  }

  async function setRelayFlags(
    index: number,
    flags: Partial<Pick<RelayListEntry, 'read' | 'write'>>
  ): Promise<void> {
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
        : entry
    );
    persistRelayEntries();
    await publishCurrentRelayEntries();
  }

  function reset(): void {
    relayEntries.value = [];
    isInitialized.value = false;
    isHydrating.value = false;
    isPublishing.value = false;
    hydrationError.value = '';
    syncError.value = '';
    hydratedForPubkey.value = null;
    privateRelayCount.value = 0;
    publicRelayCount.value = 0;
    removeStorageItem(STORAGE_KEYS.myRelays);
  }

  return {
    addRelay,
    getRelayFlags,
    hydrateFromNostr,
    hydrationError,
    init,
    isHydrating,
    isPublishing,
    privateRelayCount,
    publicRelayCount,
    relayEntries,
    relays,
    removeRelay,
    replaceRelayEntries,
    reset,
    setRelayFlags,
    syncError,
  };
});
