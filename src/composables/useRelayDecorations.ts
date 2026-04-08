import { ref } from 'vue';
import type { NDKRelayInformation } from '@nostr-dev-kit/ndk';
import { buildRelayLookupKey } from 'src/utils/relayUrls';

export interface RelayDecorationsStore {
  relayStatusVersion: unknown;
  ensureRelayConnections(relays: string[]): Promise<void>;
  getRelayConnectionState(relay: string): 'connected' | 'issue';
  fetchRelayNip11Info(relay: string, force?: boolean): Promise<NDKRelayInformation | null>;
}

export function useRelayDecorations(nostrStore: RelayDecorationsStore) {
  const relayInfoByUrl = ref<Record<string, NDKRelayInformation | null>>({});
  const relayInfoErrorByUrl = ref<Record<string, string>>({});
  const relayInfoLoadingByUrl = ref<Record<string, boolean>>({});
  const relayIconErrorByUrl = ref<Record<string, boolean>>({});

  function pruneRelayInfoCache(relays: string[]): void {
    const activeRelayKeys = new Set(relays.map((relay) => buildRelayLookupKey(relay)));

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

  function isRelayConnected(relay: string): boolean {
    void nostrStore.relayStatusVersion;
    return nostrStore.getRelayConnectionState(relay) === 'connected';
  }

  async function loadRelayInfo(relay: string, force = false): Promise<void> {
    const key = buildRelayLookupKey(relay);

    if (!force && relayInfoByUrl.value[key]) {
      return;
    }

    if (relayInfoLoadingByUrl.value[key]) {
      return;
    }

    relayInfoLoadingByUrl.value[key] = true;
    relayInfoErrorByUrl.value[key] = '';

    try {
      relayInfoByUrl.value[key] = await nostrStore.fetchRelayNip11Info(relay, force);
      relayIconErrorByUrl.value[key] = false;
    } catch (error) {
      relayInfoByUrl.value[key] = null;
      relayInfoErrorByUrl.value[key] =
        error instanceof Error ? error.message : 'Failed to load relay NIP-11 data.';
    } finally {
      relayInfoLoadingByUrl.value[key] = false;
    }
  }

  function relayInfo(relay: string): NDKRelayInformation | null {
    return relayInfoByUrl.value[buildRelayLookupKey(relay)] ?? null;
  }

  function relayInfoError(relay: string): string {
    return relayInfoErrorByUrl.value[buildRelayLookupKey(relay)] ?? '';
  }

  function isRelayInfoLoading(relay: string): boolean {
    return relayInfoLoadingByUrl.value[buildRelayLookupKey(relay)] === true;
  }

  function relayIconUrl(relay: string): string | null {
    const key = buildRelayLookupKey(relay);
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

  function setRelayIconError(relay: string): void {
    relayIconErrorByUrl.value[buildRelayLookupKey(relay)] = true;
  }

  return {
    isRelayConnected,
    isRelayInfoLoading,
    loadRelayInfo,
    prepareRelayDecorations,
    pruneRelayInfoCache,
    relayIconUrl,
    relayInfo,
    relayInfoError,
    setRelayIconError
  };
}
