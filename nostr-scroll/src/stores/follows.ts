import { isValidPubkey } from '@nostr-dev-kit/ndk';
import { defineStore } from 'pinia';
import { ref } from 'vue';
import {
  appendFollowedPubkey,
  createEmptyFollowList,
  type FollowListSnapshot,
  fetchFollowList,
  publishFollowList,
} from '../services/nostrFollowService';
import { useAppRelaysStore } from './appRelays';
import { useAuthStore } from './auth';
import { useMyRelaysStore } from './myRelays';
import { useProfilesStore } from './profiles';

interface FollowListState {
  followedPubkeys: string[];
  tags: string[][];
  content: string;
  createdAt: number | null;
  eventId: string | null;
  loading: boolean;
  loaded: boolean;
  error: string;
}

interface EnsureFollowListOptions {
  force?: boolean;
  extraReadRelayUrls?: string[];
}

function defaultFollowListState(): FollowListState {
  return {
    followedPubkeys: [],
    tags: [],
    content: '',
    createdAt: null,
    eventId: null,
    loading: false,
    loaded: false,
    error: '',
  };
}

function normalizePubkey(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedPubkey = value.trim().toLowerCase();
  return isValidPubkey(normalizedPubkey) ? normalizedPubkey : null;
}

export const useFollowsStore = defineStore('follows', () => {
  const authStore = useAuthStore();
  const appRelaysStore = useAppRelaysStore();
  const myRelaysStore = useMyRelaysStore();
  const profilesStore = useProfilesStore();

  const followLists = ref<Record<string, FollowListState>>({});
  const pendingFollowTargets = ref<Record<string, boolean>>({});
  const followFetchPromises = new Map<string, Promise<void>>();

  function ensureRelayStoresInitialized(): void {
    appRelaysStore.init();
    myRelaysStore.init();
  }

  function getFollowListState(pubkey?: string | null): FollowListState {
    const normalizedPubkey = normalizePubkey(pubkey);
    if (!normalizedPubkey) {
      return defaultFollowListState();
    }

    return followLists.value[normalizedPubkey] ?? defaultFollowListState();
  }

  function patchFollowListState(pubkey: string, patch: Partial<FollowListState>): void {
    followLists.value = {
      ...followLists.value,
      [pubkey]: {
        ...getFollowListState(pubkey),
        ...patch,
      },
    };
  }

  function toSnapshot(pubkey: string): FollowListSnapshot {
    const state = getFollowListState(pubkey);

    return {
      ownerPubkey: pubkey,
      followedPubkeys: [...state.followedPubkeys],
      tags: state.tags.map((tag) => [...tag]),
      content: state.content,
      createdAt: state.createdAt,
      eventId: state.eventId,
    };
  }

  function shouldAcceptFetchedSnapshot(
    existingState: FollowListState,
    nextSnapshot: FollowListSnapshot
  ): boolean {
    if (typeof nextSnapshot.createdAt !== 'number') {
      return typeof existingState.createdAt !== 'number';
    }

    if (typeof existingState.createdAt !== 'number') {
      return true;
    }

    return nextSnapshot.createdAt > existingState.createdAt;
  }

  function applyFollowListSnapshot(
    pubkey: string,
    nextSnapshot: FollowListSnapshot | null,
    mode: 'newer' | 'force' = 'newer'
  ): void {
    const existingState = getFollowListState(pubkey);

    if (
      nextSnapshot &&
      (mode === 'force' || shouldAcceptFetchedSnapshot(existingState, nextSnapshot))
    ) {
      patchFollowListState(pubkey, {
        followedPubkeys: [...nextSnapshot.followedPubkeys],
        tags: nextSnapshot.tags.map((tag) => [...tag]),
        content: nextSnapshot.content,
        createdAt: nextSnapshot.createdAt,
        eventId: nextSnapshot.eventId,
        loading: false,
        loaded: true,
        error: '',
      });
      profilesStore.setFollowingCount(pubkey, nextSnapshot.followedPubkeys.length);
      return;
    }

    patchFollowListState(pubkey, {
      loading: false,
      loaded: true,
      error: '',
    });
    profilesStore.setFollowingCount(pubkey, existingState.followedPubkeys.length);
  }

  async function ensureFollowList(
    pubkey?: string | null,
    options: EnsureFollowListOptions = {}
  ): Promise<void> {
    const normalizedPubkey = normalizePubkey(pubkey);
    if (!normalizedPubkey || !authStore.currentPubkey) {
      return;
    }

    const existingState = getFollowListState(normalizedPubkey);
    if (existingState.loaded && !options.force) {
      return;
    }

    const inflightPromise = !options.force ? followFetchPromises.get(normalizedPubkey) : undefined;
    if (inflightPromise) {
      await inflightPromise;
      return;
    }

    ensureRelayStoresInitialized();
    patchFollowListState(normalizedPubkey, {
      loading: true,
      error: '',
    });

    const fetchPromise = (async () => {
      try {
        const fetchedFollowList = await fetchFollowList(
          authStore.session,
          appRelaysStore.relayEntries,
          myRelaysStore.relayEntries,
          normalizedPubkey,
          options.extraReadRelayUrls ?? []
        );
        applyFollowListSnapshot(normalizedPubkey, fetchedFollowList, 'newer');
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to load the follow list from relays.';
        patchFollowListState(normalizedPubkey, {
          loading: false,
          error: errorMessage,
        });
        throw error;
      } finally {
        if (followFetchPromises.get(normalizedPubkey) === fetchPromise) {
          followFetchPromises.delete(normalizedPubkey);
        }
      }
    })();

    followFetchPromises.set(normalizedPubkey, fetchPromise);
    await fetchPromise;
  }

  async function ensureHydrated(): Promise<void> {
    if (!authStore.currentPubkey) {
      return;
    }

    await ensureFollowList(authStore.currentPubkey, {
      force: true,
    });
  }

  function getFollowedPubkeys(pubkey?: string | null): string[] {
    return [...getFollowListState(pubkey).followedPubkeys];
  }

  function getFollowListError(pubkey?: string | null): string {
    return getFollowListState(pubkey).error;
  }

  function isFollowListLoading(pubkey?: string | null): boolean {
    return getFollowListState(pubkey).loading;
  }

  function isCurrentUserFollowing(targetPubkey?: string | null): boolean {
    const normalizedTargetPubkey = normalizePubkey(targetPubkey);
    const currentUserPubkey = normalizePubkey(authStore.currentPubkey);
    if (!normalizedTargetPubkey || !currentUserPubkey) {
      return false;
    }

    return getFollowListState(currentUserPubkey).followedPubkeys.includes(normalizedTargetPubkey);
  }

  function isFollowActionPending(targetPubkey?: string | null): boolean {
    const normalizedTargetPubkey = normalizePubkey(targetPubkey);
    return normalizedTargetPubkey
      ? Boolean(pendingFollowTargets.value[normalizedTargetPubkey])
      : false;
  }

  async function followPubkey(targetPubkey?: string | null): Promise<void> {
    const currentUserPubkey = normalizePubkey(authStore.currentPubkey);
    const normalizedTargetPubkey = normalizePubkey(targetPubkey);
    if (
      !currentUserPubkey ||
      !normalizedTargetPubkey ||
      normalizedTargetPubkey === currentUserPubkey
    ) {
      return;
    }
    if (
      isFollowActionPending(normalizedTargetPubkey) ||
      isCurrentUserFollowing(normalizedTargetPubkey)
    ) {
      return;
    }

    ensureRelayStoresInitialized();
    pendingFollowTargets.value = {
      ...pendingFollowTargets.value,
      [normalizedTargetPubkey]: true,
    };

    try {
      try {
        await ensureFollowList(currentUserPubkey, {
          force: true,
        });
      } catch {
        if (!getFollowListState(currentUserPubkey).loaded) {
          throw new Error('Failed to refresh your follow list before publishing the update.');
        }
      }

      const nextFollowList = appendFollowedPubkey(
        getFollowListState(currentUserPubkey).loaded
          ? toSnapshot(currentUserPubkey)
          : createEmptyFollowList(currentUserPubkey),
        currentUserPubkey,
        normalizedTargetPubkey
      );
      const publishedFollowList = await publishFollowList(
        authStore.session,
        appRelaysStore.relayEntries,
        myRelaysStore.relayEntries,
        nextFollowList
      );
      applyFollowListSnapshot(currentUserPubkey, publishedFollowList, 'force');
    } finally {
      pendingFollowTargets.value = {
        ...pendingFollowTargets.value,
        [normalizedTargetPubkey]: false,
      };
    }
  }

  function reset(): void {
    followLists.value = {};
    pendingFollowTargets.value = {};
    followFetchPromises.clear();
  }

  return {
    ensureFollowList,
    ensureHydrated,
    followLists,
    followPubkey,
    getFollowListError,
    getFollowedPubkeys,
    isCurrentUserFollowing,
    isFollowActionPending,
    isFollowListLoading,
    reset,
  };
});
