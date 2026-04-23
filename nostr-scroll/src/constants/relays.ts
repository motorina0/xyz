import { normalizeRelayListEntries } from '../utils/relayList';

export const FALLBACK_DEFAULT_APP_RELAY_URLS = [
  'wss://relay.damus.io',
  'wss://nostr.mom',
  'wss://nostr.bitcoiner.social',
  'wss://nos.lol',
  'wss://relay.snort.social',
];

export function parseDefaultAppRelayUrls(value: string | undefined): string[] {
  const parsedRelayUrls = normalizeRelayListEntries(
    (value ?? '')
      .split(',')
      .map((relayUrl) => relayUrl.trim())
      .filter(Boolean)
  ).map((entry) => entry.url);

  return parsedRelayUrls.length > 0 ? parsedRelayUrls : FALLBACK_DEFAULT_APP_RELAY_URLS;
}

export const DEFAULT_APP_RELAY_URLS = parseDefaultAppRelayUrls(
  import.meta.env.VITE_DEFAULT_APP_RELAYS
);
