import { defineStore } from 'pinia';
import { DEFAULT_APP_RELAY_URLS } from '../constants/relays';
import { createRelayListStoreSetup } from './relayListStoreFactory';

export const useAppRelaysStore = defineStore(
  'appRelays',
  createRelayListStoreSetup({
    defaultRelayUrls: DEFAULT_APP_RELAY_URLS,
    storageKey: 'nostr-scroll:app-relays',
  })
);
