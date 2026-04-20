import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { useMockDelay } from '../composables/useMockDelay';
import { CURRENT_USER_PUBKEY } from '../data/mockProfiles';
import { loadMockFeedState } from '../services/mockFeedService';
import type { FeedPersistenceState, NostrNote, ViewerPostState } from '../types/nostr';
import { createMockId } from '../utils/ids';
import { STORAGE_KEYS, readStorageItem, removeStorageItem, writeStorageItem } from '../utils/storage';
import { useAuthStore } from './auth';

function defaultViewerState(): ViewerPostState {
  return {
    liked: false,
    reposted: false,
    bookmarked: false,
  };
}

function sortByNewest(notes: NostrNote[]): NostrNote[] {
  return [...notes].sort(
    (first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
  );
}

function sortByOldest(notes: NostrNote[]): NostrNote[] {
  return [...notes].sort(
    (first, second) => new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime(),
  );
}

function dedupeNotesById(notes: NostrNote[]): NostrNote[] {
  const seen = new Set<string>();

  return notes.filter((note) => {
    if (seen.has(note.id)) {
      return false;
    }

    seen.add(note.id);
    return true;
  });
}

export const useFeedStore = defineStore('feed', () => {
  const authStore = useAuthStore();
  const notes = ref<NostrNote[]>([]);
  const viewerState = ref<Record<string, ViewerPostState>>({});
  const homeVisibleCount = ref(15);
  const hydrated = ref(false);
  const hydrating = ref(false);
  const loadingMore = ref(false);
  const hydratedForPubkey = ref<string | null>(null);

  function persistState(): void {
    const state: FeedPersistenceState = {
      notes: notes.value,
      viewerState: viewerState.value,
      homeVisibleCount: homeVisibleCount.value,
    };

    writeStorageItem(STORAGE_KEYS.feed, state);
  }

  function applyState(state: FeedPersistenceState): void {
    notes.value = state.notes;
    viewerState.value = state.viewerState;
    homeVisibleCount.value = state.homeVisibleCount;
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
      const storedState = readStorageItem<FeedPersistenceState | null>(STORAGE_KEYS.feed, null);
      const hasTargetOwnedNotes =
        storedState?.notes.some((note) => note.pubkey === targetPubkey) ?? false;
      const nextState =
        storedState && hasTargetOwnedNotes ? storedState : await loadMockFeedState(targetPubkey);
      applyState(nextState);
      hydrated.value = true;
      hydratedForPubkey.value = targetPubkey;
      persistState();
    } finally {
      hydrating.value = false;
    }
  }

  function reset(): void {
    notes.value = [];
    viewerState.value = {};
    homeVisibleCount.value = 15;
    hydrated.value = false;
    hydrating.value = false;
    loadingMore.value = false;
    hydratedForPubkey.value = null;
    removeStorageItem(STORAGE_KEYS.feed);
  }

  const notesById = computed(() =>
    notes.value.reduce<Record<string, NostrNote>>((accumulator, note) => {
      accumulator[note.id] = note;
      return accumulator;
    }, {}),
  );

  function getRawPostById(id: string): NostrNote | null {
    return notesById.value[id] ?? null;
  }

  function resolveDisplayPost(note: NostrNote): NostrNote {
    if (note.kind === 6 && note.repostOf) {
      return getRawPostById(note.repostOf) ?? note;
    }

    return note;
  }

  function getPostById(id: string): NostrNote | null {
    const note = getRawPostById(id);
    if (!note) {
      return null;
    }

    return resolveDisplayPost(note);
  }

  function getViewerPostState(postId: string): ViewerPostState {
    return viewerState.value[postId] ?? defaultViewerState();
  }

  const homeTimelineSource = computed(() =>
    sortByNewest(notes.value.filter((note) => note.kind === 6 || !note.replyTo)),
  );
  const homeTimeline = computed(() => homeTimelineSource.value.slice(0, homeVisibleCount.value));
  const hasMoreHome = computed(() => homeTimelineSource.value.length > homeVisibleCount.value);

  const bookmarksTimeline = computed(() =>
    sortByNewest(
      dedupeNotesById(
        notes.value
          .filter((note) => {
            const displayPost = resolveDisplayPost(note);
            return Boolean(viewerState.value[displayPost.id]?.bookmarked);
          })
          .map((note) => resolveDisplayPost(note)),
      ),
    ),
  );

  function getProfilePosts(pubkey: string): NostrNote[] {
    return sortByNewest(
      notes.value.filter((note) => note.pubkey === pubkey && note.kind === 1 && !note.replyTo),
    );
  }

  function getProfileReplies(pubkey: string): NostrNote[] {
    return sortByNewest(
      notes.value.filter((note) => note.pubkey === pubkey && note.kind === 1 && Boolean(note.replyTo)),
    );
  }

  function getProfileLikes(pubkey: string): NostrNote[] {
    const currentPubkey = authStore.currentPubkey;
    if (pubkey === currentPubkey) {
      return sortByNewest(
        dedupeNotesById(
          notes.value
            .filter((note) => {
              const displayPost = resolveDisplayPost(note);
              return Boolean(viewerState.value[displayPost.id]?.liked);
            })
            .map((note) => resolveDisplayPost(note)),
        ),
      );
    }

    return sortByNewest(
      notes.value.filter((note) =>
        note.tags.some(([key, value]) => key === 'liked-by' && value === pubkey),
      ),
    );
  }

  function getProfileReposts(pubkey: string): NostrNote[] {
    const currentPubkey = authStore.currentPubkey;
    if (pubkey === currentPubkey) {
      return sortByNewest(
        dedupeNotesById(
          notes.value
            .filter((note) => Boolean(viewerState.value[note.id]?.reposted))
            .map((note) => resolveDisplayPost(note)),
        ),
      );
    }

    return sortByNewest(
      notes.value
        .filter((note) => note.kind === 6 && note.pubkey === pubkey && Boolean(note.repostOf))
        .map((note) => resolveDisplayPost(note)),
    );
  }

  function getThreadAncestors(id: string): NostrNote[] {
    const ancestors: NostrNote[] = [];
    let cursor = getRawPostById(id);

    while (cursor?.replyTo) {
      const parent = getRawPostById(cursor.replyTo);
      if (!parent) {
        break;
      }

      ancestors.unshift(parent);
      cursor = parent;
    }

    return ancestors;
  }

  function getRepliesForPost(id: string): NostrNote[] {
    return sortByOldest(notes.value.filter((note) => note.replyTo === id));
  }

  async function loadMoreHome(): Promise<void> {
    if (loadingMore.value || !hasMoreHome.value) {
      return;
    }

    loadingMore.value = true;
    try {
      await useMockDelay(400, 760);
      homeVisibleCount.value = Math.min(homeVisibleCount.value + 8, homeTimelineSource.value.length);
      persistState();
    } finally {
      loadingMore.value = false;
    }
  }

  function updateNote(postId: string, updater: (current: NostrNote) => NostrNote): void {
    notes.value = notes.value.map((note) => {
      const resolvedId = resolveDisplayPost(note).id;
      if (note.id !== postId && resolvedId !== postId) {
        return note;
      }

      const target = resolvedId === postId ? resolveDisplayPost(note) : note;
      if (target.id !== note.id) {
        return note;
      }

      return updater(note);
    });
  }

  function setViewerState(postId: string, nextState: ViewerPostState): void {
    viewerState.value = {
      ...viewerState.value,
      [postId]: nextState,
    };
  }

  function toggleLike(postId: string): void {
    const currentState = getViewerPostState(postId);
    const liked = !currentState.liked;

    updateNote(postId, (note) => ({
      ...note,
      stats: {
        ...note.stats,
        likes: Math.max(0, note.stats.likes + (liked ? 1 : -1)),
      },
    }));

    setViewerState(postId, {
      ...currentState,
      liked,
    });
    persistState();
  }

  function toggleRepost(postId: string): void {
    const currentState = getViewerPostState(postId);
    const reposted = !currentState.reposted;

    updateNote(postId, (note) => ({
      ...note,
      stats: {
        ...note.stats,
        reposts: Math.max(0, note.stats.reposts + (reposted ? 1 : -1)),
      },
    }));

    setViewerState(postId, {
      ...currentState,
      reposted,
    });
    persistState();
  }

  function toggleBookmark(postId: string): void {
    const currentState = getViewerPostState(postId);
    const bookmarked = !currentState.bookmarked;

    updateNote(postId, (note) => ({
      ...note,
      stats: {
        ...note.stats,
        bookmarks: Math.max(0, note.stats.bookmarks + (bookmarked ? 1 : -1)),
      },
    }));

    setViewerState(postId, {
      ...currentState,
      bookmarked,
    });
    persistState();
  }

  function createPost(content: string): void {
    if (!authStore.currentPubkey) {
      return;
    }

    const post: NostrNote = {
      id: createMockId('note'),
      pubkey: authStore.currentPubkey,
      kind: 1,
      createdAt: new Date().toISOString(),
      content: content.trim(),
      tags: [],
      replyTo: null,
      rootId: null,
      stats: {
        replies: 0,
        reposts: 0,
        likes: 0,
        bookmarks: 0,
        views: 0,
      },
    };

    notes.value = [post, ...notes.value];
    persistState();
  }

  function replyToPost(parentId: string, content: string): void {
    if (!authStore.currentPubkey) {
      return;
    }

    const parent = getRawPostById(parentId);
    if (!parent) {
      return;
    }

    const reply: NostrNote = {
      id: createMockId('reply'),
      pubkey: authStore.currentPubkey,
      kind: 1,
      createdAt: new Date().toISOString(),
      content: content.trim(),
      tags: [],
      replyTo: parentId,
      rootId: parent.rootId ?? parent.id,
      stats: {
        replies: 0,
        reposts: 0,
        likes: 0,
        bookmarks: 0,
        views: 0,
      },
    };

    notes.value = [reply, ...notes.value];
    updateNote(parentId, (note) => ({
      ...note,
      stats: {
        ...note.stats,
        replies: note.stats.replies + 1,
      },
    }));
    persistState();
  }

  function getPostCountForProfile(pubkey: string): number {
    return getProfilePosts(pubkey).length + getProfileReplies(pubkey).length;
  }

  return {
    notes,
    viewerState,
    hydrated,
    hydrating,
    homeTimeline,
    bookmarksTimeline,
    homeVisibleCount,
    loadingMore,
    hasMoreHome,
    ensureHydrated,
    getPostById,
    getRawPostById,
    getViewerPostState,
    getProfilePosts,
    getProfileReplies,
    getProfileLikes,
    getProfileReposts,
    getPostCountForProfile,
    getRepliesForPost,
    getThreadAncestors,
    resolveDisplayPost,
    createPost,
    replyToPost,
    toggleLike,
    toggleRepost,
    toggleBookmark,
    loadMoreHome,
    reset,
  };
});
