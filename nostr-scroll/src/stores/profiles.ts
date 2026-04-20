import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { CURRENT_USER_PUBKEY } from '../data/mockProfiles';
import { loadMockProfiles } from '../services/mockProfileService';
import type { NostrProfile } from '../types/nostr';
import { STORAGE_KEYS, readStorageItem, removeStorageItem, writeStorageItem } from '../utils/storage';
import { useAuthStore } from './auth';

export const useProfilesStore = defineStore('profiles', () => {
  const authStore = useAuthStore();
  const profiles = ref<NostrProfile[]>([]);
  const hydrating = ref(false);
  const hydrated = ref(false);
  const hydratedForPubkey = ref<string | null>(null);

  const profilesMap = computed(() =>
    profiles.value.reduce<Record<string, NostrProfile>>((accumulator, profile) => {
      accumulator[profile.pubkey] = profile;
      return accumulator;
    }, {}),
  );

  function persistProfiles(): void {
    writeStorageItem(STORAGE_KEYS.profiles, profiles.value);
  }

  async function ensureHydrated(): Promise<void> {
    const targetPubkey = authStore.currentPubkey ?? CURRENT_USER_PUBKEY;
    if (hydrated.value || hydrating.value) {
      if (hydrated.value && hydratedForPubkey.value === targetPubkey) {
        return;
      }

      if (hydrating.value) {
        return;
      }
    }

    hydrating.value = true;
    try {
      const storedProfiles = readStorageItem<NostrProfile[] | null>(STORAGE_KEYS.profiles, null);
      const hasTargetProfile = storedProfiles?.some((profile) => profile.pubkey === targetPubkey) ?? false;

      profiles.value = hasTargetProfile ? storedProfiles ?? [] : await loadMockProfiles(targetPubkey);
      hydrated.value = true;
      hydratedForPubkey.value = targetPubkey;
      persistProfiles();
    } finally {
      hydrating.value = false;
    }
  }

  function getProfileByPubkey(pubkey?: string | null): NostrProfile | null {
    if (!pubkey) {
      return null;
    }

    return profilesMap.value[pubkey] ?? null;
  }

  function updateProfile(pubkey: string, updates: Partial<NostrProfile>): void {
    profiles.value = profiles.value.map((profile) =>
      profile.pubkey === pubkey ? { ...profile, ...updates } : profile,
    );
    persistProfiles();
  }

  function reset(): void {
    profiles.value = [];
    hydrated.value = false;
    hydrating.value = false;
    hydratedForPubkey.value = null;
    removeStorageItem(STORAGE_KEYS.profiles);
  }

  const currentUserProfile = computed(() =>
    getProfileByPubkey(authStore.currentPubkey ?? CURRENT_USER_PUBKEY),
  );

  return {
    profiles,
    profilesMap,
    hydrated,
    currentUserProfile,
    ensureHydrated,
    getProfileByPubkey,
    updateProfile,
    reset,
  };
});
