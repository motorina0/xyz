import { chatDataService } from 'src/services/chatDataService';
import { contactsService } from 'src/services/contactsService';
import { developerTraceDataService } from 'src/services/developerTraceDataService';
import { imageCacheService } from 'src/services/imageCacheService';
import { nostrEventDataService } from 'src/services/nostrEventDataService';
import { deleteAllIndexedDbDatabases } from 'src/utils/indexedDbStorage';

const PENDING_LOGOUT_CLEANUP_SESSION_KEY = 'nostr-chat-pending-logout-cleanup';

export const KNOWN_APP_INDEXED_DB_NAMES = [
  'chat-data-indexeddb-v2',
  'contacts-indexeddb-v1',
  'developer-trace-indexeddb-v1',
  'nostr-events-indexeddb-v1',
  'nostr-chat-image-cache',
] as const;

function hasLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function hasSessionStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

function clearBrowserStorage(options: { preservePendingLogoutCleanup?: boolean } = {}): void {
  if (hasLocalStorage()) {
    window.localStorage.clear();
  }

  if (!hasSessionStorage()) {
    return;
  }

  const shouldRestorePendingFlag =
    options.preservePendingLogoutCleanup === true &&
    window.sessionStorage.getItem(PENDING_LOGOUT_CLEANUP_SESSION_KEY) === '1';

  window.sessionStorage.clear();

  if (shouldRestorePendingFlag) {
    window.sessionStorage.setItem(PENDING_LOGOUT_CLEANUP_SESSION_KEY, '1');
  }
}

async function clearIndexedDbDatabases(): Promise<void> {
  const clearResults = await Promise.allSettled([
    chatDataService.clearAllData(),
    contactsService.clearAllData(),
    developerTraceDataService.clearAllData(),
    nostrEventDataService.clearAllData(),
    imageCacheService.clearAllData(),
  ]);

  await deleteAllIndexedDbDatabases([...KNOWN_APP_INDEXED_DB_NAMES]);

  const rejectedResults = clearResults.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected'
  );
  if (rejectedResults.length > 0) {
    console.warn(
      'Some logout cleanup steps failed before the full IndexedDB reset completed.',
      rejectedResults.map((result) => result.reason)
    );
  }
}

export async function clearPersistedAppState(
  options: { preservePendingLogoutCleanup?: boolean } = {}
): Promise<void> {
  clearBrowserStorage(options);
  await clearIndexedDbDatabases();
}

export function schedulePendingLogoutCleanup(): void {
  if (!hasSessionStorage()) {
    return;
  }

  window.sessionStorage.setItem(PENDING_LOGOUT_CLEANUP_SESSION_KEY, '1');
}

export function hasPendingLogoutCleanup(): boolean {
  return (
    hasSessionStorage() && window.sessionStorage.getItem(PENDING_LOGOUT_CLEANUP_SESSION_KEY) === '1'
  );
}

export async function finalizePendingLogoutCleanup(): Promise<void> {
  if (!hasPendingLogoutCleanup()) {
    return;
  }

  try {
    await clearPersistedAppState({
      preservePendingLogoutCleanup: true,
    });
  } finally {
    if (hasSessionStorage()) {
      window.sessionStorage.removeItem(PENDING_LOGOUT_CLEANUP_SESSION_KEY);
    }
  }
}
