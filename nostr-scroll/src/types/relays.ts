export interface RelayListEntry {
  url: string;
  read: boolean;
  write: boolean;
}

export interface MyRelayFetchResult {
  mergedRelayEntries: RelayListEntry[];
  privateRelayEntries: RelayListEntry[];
  publicRelayEntries: RelayListEntry[];
}
