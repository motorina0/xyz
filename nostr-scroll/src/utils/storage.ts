const STORAGE_PREFIX = 'nostr-scroll:';

export const STORAGE_KEYS = {
  auth: `${STORAGE_PREFIX}auth-session`,
  appRelays: `${STORAGE_PREFIX}app-relays`,
  feed: `${STORAGE_PREFIX}feed-state`,
  myRelays: `${STORAGE_PREFIX}my-relays`,
  profiles: `${STORAGE_PREFIX}profiles-state`,
  ui: `${STORAGE_PREFIX}ui-state`,
} as const;

function getStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage;
}

export function readStorageItem<T>(key: string, fallback: T): T {
  const storage = getStorage();
  if (!storage) {
    return fallback;
  }

  const value = storage.getItem(key);
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function writeStorageItem<T>(key: string, value: T): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.setItem(key, JSON.stringify(value));
}

export function removeStorageItem(key: string): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.removeItem(key);
}
