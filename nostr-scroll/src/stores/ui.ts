import { ref } from 'vue';
import { defineStore } from 'pinia';
import type { ProfileTab } from '../types/nostr';
import { STORAGE_KEYS, readStorageItem, writeStorageItem } from '../utils/storage';

type StoredUiState = {
  profileTabs: Record<string, ProfileTab>;
};

const defaultState: StoredUiState = {
  profileTabs: {},
};

export const useUiStore = defineStore('ui', () => {
  const profileTabs = ref<Record<string, ProfileTab>>(
    readStorageItem<StoredUiState>(STORAGE_KEYS.ui, defaultState).profileTabs,
  );
  const isComposeDialogOpen = ref(false);

  function persist(): void {
    writeStorageItem(STORAGE_KEYS.ui, {
      profileTabs: profileTabs.value,
    });
  }

  function getProfileTab(pubkey: string): ProfileTab {
    return profileTabs.value[pubkey] ?? 'posts';
  }

  function setProfileTab(pubkey: string, tab: ProfileTab): void {
    profileTabs.value = {
      ...profileTabs.value,
      [pubkey]: tab,
    };
    persist();
  }

  function openComposeDialog(): void {
    isComposeDialogOpen.value = true;
  }

  function closeComposeDialog(): void {
    isComposeDialogOpen.value = false;
  }

  return {
    profileTabs,
    isComposeDialogOpen,
    getProfileTab,
    setProfileTab,
    openComposeDialog,
    closeComposeDialog,
  };
});
