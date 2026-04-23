import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  buildFallbackProfile,
  fetchProfiles,
  saveCurrentUserProfile,
} from '../services/nostrProfileService';
import { profileCacheService } from '../services/profileCacheService';
import type { NostrProfile } from '../types/nostr';
import { useAppRelaysStore } from './appRelays';
import { useAuthStore } from './auth';
import { useMyRelaysStore } from './myRelays';

export const useProfilesStore = defineStore('profiles', () => {
  const authStore = useAuthStore();
  const appRelaysStore = useAppRelaysStore();
  const myRelaysStore = useMyRelaysStore();
  const profileFetchPromises = new Map<string, Promise<void>>();
  let hasHydratedCache = false;
  let cacheHydrationPromise: Promise<void> | null = null;

  const profiles = ref<Record<string, NostrProfile>>({});
  const loadingPubkeys = ref<Record<string, boolean>>({});
  const loadedPubkeys = ref<Record<string, boolean>>({});
  const errorsByPubkey = ref<Record<string, string>>({});
  const savingCurrentUserProfile = ref(false);

  const profilesMap = computed(() => profiles.value);
  const currentUserProfile = computed(() =>
    authStore.currentPubkey ? getProfileByPubkey(authStore.currentPubkey) : null
  );

  function upsertProfiles(nextProfiles: NostrProfile[]): void {
    if (nextProfiles.length === 0) {
      return;
    }

    profiles.value = nextProfiles.reduce<Record<string, NostrProfile>>(
      (accumulator, profile) => {
        const existingProfile = profiles.value[profile.pubkey] ?? null;
        accumulator[profile.pubkey] = {
          ...(existingProfile ?? {}),
          ...profile,
          followingCount:
            typeof profile.followingCount === 'number'
              ? profile.followingCount
              : existingProfile?.followingCount,
          followersCount:
            typeof profile.followersCount === 'number'
              ? profile.followersCount
              : existingProfile?.followersCount,
        };
        return accumulator;
      },
      { ...profiles.value }
    );
  }

  function ensureRelayStoresInitialized(): void {
    appRelaysStore.init();
    myRelaysStore.init();
  }

  async function hydrateCachedProfiles(): Promise<void> {
    if (hasHydratedCache) {
      return;
    }

    if (cacheHydrationPromise) {
      return cacheHydrationPromise;
    }

    cacheHydrationPromise = (async () => {
      const cachedProfiles = await profileCacheService.listProfiles();
      upsertProfiles(cachedProfiles);
      hasHydratedCache = true;
    })().finally(() => {
      cacheHydrationPromise = null;
    });

    return cacheHydrationPromise;
  }

  function getProfileByPubkey(pubkey?: string | null): NostrProfile | null {
    if (!pubkey) {
      return null;
    }

    return profiles.value[pubkey] ?? buildFallbackProfile(pubkey);
  }

  async function ensureProfiles(
    pubkeys: string[],
    force = false,
    extraReadRelayUrls: string[] = []
  ): Promise<void> {
    const uniquePubkeys = Array.from(new Set(pubkeys.filter(Boolean)));
    if (uniquePubkeys.length === 0) {
      return;
    }

    await hydrateCachedProfiles();

    if (!authStore.session.currentPubkey) {
      const missingPubkeys = uniquePubkeys.filter((pubkey) => !profiles.value[pubkey]);
      if (missingPubkeys.length > 0) {
        upsertProfiles(missingPubkeys.map((pubkey) => buildFallbackProfile(pubkey)));
      }
      return;
    }

    ensureRelayStoresInitialized();

    const waits: Promise<void>[] = [];
    const pendingPubkeys = uniquePubkeys.filter((pubkey) => {
      if (!force && loadedPubkeys.value[pubkey]) {
        return false;
      }

      const inflightPromise = !force ? profileFetchPromises.get(pubkey) : undefined;
      if (inflightPromise) {
        waits.push(inflightPromise);
        return false;
      }

      return true;
    });

    if (pendingPubkeys.length === 0) {
      if (waits.length > 0) {
        await Promise.all(waits);
      }
      return;
    }

    for (const pubkey of pendingPubkeys) {
      loadingPubkeys.value = {
        ...loadingPubkeys.value,
        [pubkey]: true,
      };
      errorsByPubkey.value = {
        ...errorsByPubkey.value,
        [pubkey]: '',
      };
    }

    const fetchPromise = (async () => {
      try {
        const fetchedProfiles = await fetchProfiles(
          authStore.session,
          appRelaysStore.relayEntries,
          myRelaysStore.relayEntries,
          pendingPubkeys,
          extraReadRelayUrls
        );
        upsertProfiles(fetchedProfiles);
        await profileCacheService.saveProfiles(
          fetchedProfiles.map((profile) => profiles.value[profile.pubkey] ?? profile)
        );
        loadedPubkeys.value = pendingPubkeys.reduce<Record<string, boolean>>(
          (accumulator, pubkey) => {
            accumulator[pubkey] = true;
            return accumulator;
          },
          { ...loadedPubkeys.value }
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to load profile metadata from relays.';
        errorsByPubkey.value = pendingPubkeys.reduce<Record<string, string>>(
          (accumulator, pubkey) => {
            accumulator[pubkey] = errorMessage;
            return accumulator;
          },
          { ...errorsByPubkey.value }
        );
        const missingPubkeys = pendingPubkeys.filter((pubkey) => !profiles.value[pubkey]);
        if (missingPubkeys.length > 0) {
          upsertProfiles(missingPubkeys.map((pubkey) => buildFallbackProfile(pubkey)));
        }
      } finally {
        loadingPubkeys.value = pendingPubkeys.reduce<Record<string, boolean>>(
          (accumulator, pubkey) => {
            accumulator[pubkey] = false;
            return accumulator;
          },
          { ...loadingPubkeys.value }
        );

        for (const pubkey of pendingPubkeys) {
          if (profileFetchPromises.get(pubkey) === fetchPromise) {
            profileFetchPromises.delete(pubkey);
          }
        }
      }
    })();

    for (const pubkey of pendingPubkeys) {
      profileFetchPromises.set(pubkey, fetchPromise);
    }

    waits.push(fetchPromise);
    await Promise.all(waits);
  }

  async function ensureProfile(
    pubkey?: string | null,
    force = false,
    _includeFollowingCount = false,
    extraReadRelayUrls: string[] = []
  ): Promise<void> {
    if (!pubkey) {
      return;
    }

    await ensureProfiles([pubkey], force, extraReadRelayUrls);
  }

  function setFollowingCount(pubkey?: string | null, followingCount?: number): void {
    if (!pubkey || typeof followingCount !== 'number' || Number.isNaN(followingCount)) {
      return;
    }

    const updatedProfile = {
      ...(getProfileByPubkey(pubkey) ?? buildFallbackProfile(pubkey)),
      followingCount: Math.max(0, Math.trunc(followingCount)),
    };
    upsertProfiles([updatedProfile]);
    void profileCacheService.saveProfiles([updatedProfile]);
  }

  async function ensureHydrated(): Promise<void> {
    await hydrateCachedProfiles();

    if (!authStore.currentPubkey) {
      return;
    }

    await ensureProfile(authStore.currentPubkey);
  }

  async function saveProfile(updates: {
    displayName: string;
    about: string;
    location?: string;
    website?: string;
    picture?: string;
    banner?: string;
  }): Promise<void> {
    if (!authStore.currentPubkey) {
      return;
    }

    ensureRelayStoresInitialized();
    savingCurrentUserProfile.value = true;

    try {
      await saveCurrentUserProfile(
        authStore.session,
        appRelaysStore.relayEntries,
        myRelaysStore.relayEntries,
        updates
      );
      await ensureProfile(authStore.currentPubkey, true);
    } finally {
      savingCurrentUserProfile.value = false;
    }
  }

  function isProfileLoading(pubkey?: string | null): boolean {
    return pubkey ? Boolean(loadingPubkeys.value[pubkey]) : false;
  }

  function getProfileError(pubkey?: string | null): string {
    return pubkey ? (errorsByPubkey.value[pubkey] ?? '') : '';
  }

  function reset(): void {
    profiles.value = {};
    loadingPubkeys.value = {};
    loadedPubkeys.value = {};
    errorsByPubkey.value = {};
    savingCurrentUserProfile.value = false;
    hasHydratedCache = false;
    cacheHydrationPromise = null;
  }

  return {
    profiles,
    profilesMap,
    currentUserProfile,
    savingCurrentUserProfile,
    hydrateCachedProfiles,
    ensureHydrated,
    ensureProfile,
    ensureProfiles,
    getProfileByPubkey,
    getProfileError,
    isProfileLoading,
    reset,
    saveProfile,
    setFollowingCount,
  };
});
