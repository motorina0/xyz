import { normalizeRelayUrl } from '@nostr-dev-kit/ndk';
import type { RelayListEntry } from '../types/relays';

function normalizeRelayEntryValue(entry: unknown): RelayListEntry | null {
  if (typeof entry === 'string') {
    const trimmedValue = entry.trim();
    if (!trimmedValue) {
      return null;
    }

    try {
      const normalizedUrl = normalizeRelayUrl(trimmedValue);
      const parsedUrl = new URL(normalizedUrl);
      if (parsedUrl.protocol !== 'ws:' && parsedUrl.protocol !== 'wss:') {
        return null;
      }

      if (!parsedUrl.hostname) {
        return null;
      }

      return {
        url: normalizedUrl,
        read: true,
        write: true,
      };
    } catch {
      return null;
    }
  }

  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const rawEntry = entry as Partial<RelayListEntry>;
  const rawUrl = typeof rawEntry.url === 'string' ? rawEntry.url.trim() : '';
  if (!rawUrl) {
    return null;
  }

  try {
    const normalizedUrl = normalizeRelayUrl(rawUrl);
    const parsedUrl = new URL(normalizedUrl);
    if (parsedUrl.protocol !== 'ws:' && parsedUrl.protocol !== 'wss:') {
      return null;
    }

    if (!parsedUrl.hostname) {
      return null;
    }

    const read = rawEntry.read !== false;
    const write = rawEntry.write !== false;
    if (!read && !write) {
      return null;
    }

    return {
      url: normalizedUrl,
      read,
      write,
    };
  } catch {
    return null;
  }
}

export function normalizeRelayListEntries(entries: unknown[]): RelayListEntry[] {
  const uniqueEntries = new Map<string, RelayListEntry>();

  for (const entry of entries) {
    const normalizedEntry = normalizeRelayEntryValue(entry);
    if (!normalizedEntry) {
      continue;
    }

    const existingEntry = uniqueEntries.get(normalizedEntry.url);
    if (existingEntry) {
      existingEntry.read = existingEntry.read || normalizedEntry.read;
      existingEntry.write = existingEntry.write || normalizedEntry.write;
      continue;
    }

    uniqueEntries.set(normalizedEntry.url, normalizedEntry);
  }

  return Array.from(uniqueEntries.values());
}

export function normalizeReadableRelayUrls(entries: RelayListEntry[] | undefined): string[] {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .filter((entry) => entry.read !== false)
    .map((entry) => entry.url)
    .filter((url, index, list) => list.indexOf(url) === index);
}

export function normalizeWritableRelayUrls(entries: RelayListEntry[] | undefined): string[] {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .filter((entry) => entry.write !== false)
    .map((entry) => entry.url)
    .filter((url, index, list) => list.indexOf(url) === index);
}

export function validateRelayUrl(value: string): string {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return '';
  }

  try {
    const normalizedUrl = normalizeRelayUrl(trimmedValue);
    const parsedUrl = new URL(normalizedUrl);
    if (parsedUrl.protocol !== 'ws:' && parsedUrl.protocol !== 'wss:') {
      return 'Relay must use ws:// or wss://';
    }

    if (!parsedUrl.hostname) {
      return 'Relay URL must include a hostname';
    }

    return '';
  } catch {
    return 'Relay must be a valid ws:// or wss:// URL';
  }
}
