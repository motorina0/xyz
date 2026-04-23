import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { HomeTimelineTab, ProfileTab } from '../types/nostr';
import {
  readStorageItem,
  removeStorageItem,
  STORAGE_KEYS,
  writeStorageItem,
} from '../utils/storage';

type StoredUiState = {
  homeTimelineTab: HomeTimelineTab;
  profileTabs: Record<string, ProfileTab>;
};

const defaultState: StoredUiState = {
  homeTimelineTab: 'following',
  profileTabs: {},
};

export const useUiStore = defineStore('ui', () => {
  const storedState = readStorageItem<StoredUiState>(STORAGE_KEYS.ui, defaultState);
  const homeTimelineTab = ref<HomeTimelineTab>(storedState.homeTimelineTab);
  const profileTabs = ref<Record<string, ProfileTab>>(storedState.profileTabs);
  const isComposeDialogOpen = ref(false);

  function persist(): void {
    writeStorageItem(STORAGE_KEYS.ui, {
      homeTimelineTab: homeTimelineTab.value,
      profileTabs: profileTabs.value,
    });
  }

  function setHomeTimelineTab(tab: HomeTimelineTab): void {
    homeTimelineTab.value = tab;
    persist();
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

  function reset(): void {
    homeTimelineTab.value = 'following';
    profileTabs.value = {};
    isComposeDialogOpen.value = false;
    removeStorageItem(STORAGE_KEYS.ui);
  }

  return {
    homeTimelineTab,
    profileTabs,
    isComposeDialogOpen,
    setHomeTimelineTab,
    getProfileTab,
    setProfileTab,
    openComposeDialog,
    closeComposeDialog,
    reset,
  };
});
