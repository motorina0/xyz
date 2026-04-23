import type { NostrProfile } from '../types/nostr';

const PROFILE_CACHE_DB_NAME = 'nostr-scroll-profile-cache';
const PROFILE_CACHE_DB_VERSION = 1;
const PROFILE_CACHE_STORE_NAME = 'profiles';

interface CachedProfileRecord extends NostrProfile {
  cachedAt: number;
}

function canUseIndexedDb(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function normalizeCachedProfileRecord(value: unknown): NostrProfile | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Partial<CachedProfileRecord>;
  if (typeof record.pubkey !== 'string' || record.pubkey.trim().length === 0) {
    return null;
  }

  if (
    typeof record.npub !== 'string' ||
    typeof record.name !== 'string' ||
    typeof record.displayName !== 'string' ||
    typeof record.about !== 'string' ||
    typeof record.picture !== 'string' ||
    typeof record.banner !== 'string'
  ) {
    return null;
  }

  return {
    pubkey: record.pubkey,
    npub: record.npub,
    nprofile: typeof record.nprofile === 'string' ? record.nprofile : undefined,
    name: record.name,
    displayName: record.displayName,
    verified: typeof record.verified === 'boolean' ? record.verified : undefined,
    about: record.about,
    picture: record.picture,
    banner: record.banner,
    nip05: typeof record.nip05 === 'string' ? record.nip05 : undefined,
    website: typeof record.website === 'string' ? record.website : undefined,
    lud16: typeof record.lud16 === 'string' ? record.lud16 : undefined,
    followersCount: typeof record.followersCount === 'number' ? record.followersCount : undefined,
    followingCount: typeof record.followingCount === 'number' ? record.followingCount : undefined,
    joinedAt: typeof record.joinedAt === 'string' ? record.joinedAt : undefined,
    location: typeof record.location === 'string' ? record.location : undefined,
  };
}

class ProfileCacheService {
  private dbPromise: Promise<IDBDatabase | null> | null = null;

  async listProfiles(): Promise<NostrProfile[]> {
    const db = await this.getDatabase();
    if (!db) {
      return [];
    }

    return new Promise((resolve) => {
      const transaction = db.transaction(PROFILE_CACHE_STORE_NAME, 'readonly');
      const request = transaction.objectStore(PROFILE_CACHE_STORE_NAME).getAll();

      request.onsuccess = () => {
        const results = Array.isArray(request.result) ? request.result : [];
        resolve(
          results
            .map((record) => normalizeCachedProfileRecord(record))
            .filter((record): record is NostrProfile => record !== null)
        );
      };

      request.onerror = () => {
        console.error('Failed to read cached profiles from IndexedDB.', request.error);
        resolve([]);
      };

      transaction.onabort = () => {
        console.error(
          'IndexedDB transaction aborted while reading cached profiles.',
          transaction.error
        );
        resolve([]);
      };
    });
  }

  async getProfiles(pubkeys: string[]): Promise<NostrProfile[]> {
    const normalizedPubkeys = Array.from(new Set(pubkeys.filter(Boolean)));
    if (normalizedPubkeys.length === 0) {
      return [];
    }

    const db = await this.getDatabase();
    if (!db) {
      return [];
    }

    return Promise.all(
      normalizedPubkeys.map(
        (pubkey) =>
          new Promise<NostrProfile | null>((resolve) => {
            const transaction = db.transaction(PROFILE_CACHE_STORE_NAME, 'readonly');
            const request = transaction.objectStore(PROFILE_CACHE_STORE_NAME).get(pubkey);

            request.onsuccess = () => {
              resolve(normalizeCachedProfileRecord(request.result));
            };

            request.onerror = () => {
              console.error('Failed to read cached profile from IndexedDB.', request.error);
              resolve(null);
            };

            transaction.onabort = () => {
              console.error(
                'IndexedDB transaction aborted while reading a cached profile.',
                transaction.error
              );
              resolve(null);
            };
          })
      )
    ).then((profiles) => profiles.filter((profile): profile is NostrProfile => profile !== null));
  }

  async saveProfiles(profiles: NostrProfile[]): Promise<void> {
    const normalizedProfiles = Array.from(
      new Map(
        profiles
          .filter((profile) => Boolean(profile?.pubkey))
          .map((profile) => [profile.pubkey, profile] as const)
      ).values()
    );

    if (normalizedProfiles.length === 0) {
      return;
    }

    const db = await this.getDatabase();
    if (!db) {
      return;
    }

    await new Promise<void>((resolve) => {
      const transaction = db.transaction(PROFILE_CACHE_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(PROFILE_CACHE_STORE_NAME);

      for (const profile of normalizedProfiles) {
        store.put({
          ...profile,
          cachedAt: Date.now(),
        } satisfies CachedProfileRecord);
      }

      transaction.oncomplete = () => {
        resolve();
      };

      transaction.onerror = () => {
        console.error('Failed to write cached profiles to IndexedDB.', transaction.error);
        resolve();
      };

      transaction.onabort = () => {
        console.error(
          'IndexedDB transaction aborted while writing cached profiles.',
          transaction.error
        );
        resolve();
      };
    });
  }

  private async getDatabase(): Promise<IDBDatabase | null> {
    if (!this.dbPromise) {
      this.dbPromise = this.openDatabase();
    }

    return this.dbPromise;
  }

  private async openDatabase(): Promise<IDBDatabase | null> {
    if (!canUseIndexedDb()) {
      return null;
    }

    return new Promise((resolve) => {
      const request = window.indexedDB.open(PROFILE_CACHE_DB_NAME, PROFILE_CACHE_DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PROFILE_CACHE_STORE_NAME)) {
          db.createObjectStore(PROFILE_CACHE_STORE_NAME, { keyPath: 'pubkey' });
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
        };
        resolve(db);
      };

      request.onerror = () => {
        console.error('Failed to open IndexedDB profile cache.', request.error);
        resolve(null);
      };

      request.onblocked = () => {
        console.error('IndexedDB profile cache open request is blocked.');
        resolve(null);
      };
    });
  }
}

export const profileCacheService = new ProfileCacheService();
