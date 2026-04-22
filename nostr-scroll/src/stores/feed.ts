import type { NostrEvent } from '@nostr-dev-kit/ndk';
import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { useAppRelaysStore } from './appRelays';
import { useAuthStore } from './auth';
import { useMyRelaysStore } from './myRelays';
import { useProfilesStore } from './profiles';
import { fetchFollowingPubkeys } from '../services/nostrProfileService';
import {
  fetchBookmarksCollection,
  mapRawEventToNote,
  fetchNotesByIds,
  fetchProfileTab,
  fetchThreadCollection,
  publishBookmarkList,
  publishDeletionForEvents,
  publishNote,
  publishReaction,
  publishReply,
  publishRepost,
  streamHomeTimelineBatch,
} from '../services/nostrNoteService';
import type { HydratedNoteChunk } from '../services/nostrNoteService';
import type { HomeTimelineTab, NostrNote, ProfileTab, ViewerPostState } from '../types/nostr';

interface ThreadState {
  focusedId: string | null;
  ancestors: string[];
  replies: string[];
  loading: boolean;
  loaded: boolean;
  error: string;
}

interface HomeTimelineState {
  ids: string[];
  loading: boolean;
  loaded: boolean;
  error: string;
  loadingMore: boolean;
  nextCursor: number | null;
  hasMore: boolean;
  followPubkeys: string[];
  followListEmpty: boolean;
}

function defaultViewerState(): ViewerPostState {
  return {
    liked: false,
    reposted: false,
    bookmarked: false,
    likeEventIds: [],
    repostEventIds: [],
  };
}

function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids.filter(Boolean)));
}

function defaultHomeTimelineState(): HomeTimelineState {
  return {
    ids: [],
    loading: false,
    loaded: false,
    error: '',
    loadingMore: false,
    nextCursor: null,
    hasMore: true,
    followPubkeys: [],
    followListEmpty: false,
  };
}

export const useFeedStore = defineStore('feed', () => {
  const authStore = useAuthStore();
  const appRelaysStore = useAppRelaysStore();
  const myRelaysStore = useMyRelaysStore();
  const profilesStore = useProfilesStore();

  const notesById = ref<Record<string, NostrNote>>({});
  const viewerState = ref<Record<string, ViewerPostState>>({});
  const homeTimelineState = ref<Record<HomeTimelineTab, HomeTimelineState>>({
    all: defaultHomeTimelineState(),
    following: defaultHomeTimelineState(),
  });
  const bookmarksTimelineIds = ref<string[]>([]);
  const bookmarksLoading = ref(false);
  const bookmarksLoaded = ref(false);
  const bookmarksError = ref('');
  const profileTabIds = ref<Record<string, Record<ProfileTab, string[]>>>({});
  const profileTabLoading = ref<Record<string, Partial<Record<ProfileTab, boolean>>>>({});
  const profileTabErrors = ref<Record<string, Partial<Record<ProfileTab, string>>>>({});
  const threadStateByPostId = ref<Record<string, ThreadState>>({});
  const publishingPost = ref(false);
  const actionPendingByPostId = ref<Record<string, boolean>>({});

  const rawEventsById = new Map<string, NostrEvent>();

  const notes = computed(() => Object.values(notesById.value));
  const allTimeline = computed(() =>
    homeTimelineState.value.all.ids
      .map((id) => notesById.value[id])
      .filter((note): note is NostrNote => Boolean(note)),
  );
  const followingTimeline = computed(() =>
    homeTimelineState.value.following.ids
      .map((id) => notesById.value[id])
      .filter((note): note is NostrNote => Boolean(note)),
  );
  const bookmarksTimeline = computed(() =>
    bookmarksTimelineIds.value
      .map((id) => notesById.value[id])
      .filter((note): note is NostrNote => Boolean(note)),
  );

  function ensureRelayStoresInitialized(): void {
    appRelaysStore.init();
    myRelaysStore.init();
  }

  function getHomeState(tab: HomeTimelineTab): HomeTimelineState {
    return homeTimelineState.value[tab];
  }

  function setHomeState(tab: HomeTimelineTab, patch: Partial<HomeTimelineState>): void {
    homeTimelineState.value = {
      ...homeTimelineState.value,
      [tab]: {
        ...homeTimelineState.value[tab],
        ...patch,
      },
    };
  }

  function getHomeTimeline(tab: HomeTimelineTab): NostrNote[] {
    return homeTimelineState.value[tab].ids
      .map((id) => notesById.value[id])
      .filter((note): note is NostrNote => Boolean(note));
  }

  function upsertNotes(nextNotes: NostrNote[]): void {
    if (nextNotes.length === 0) {
      return;
    }

    notesById.value = nextNotes.reduce<Record<string, NostrNote>>((accumulator, note) => {
      accumulator[note.id] = {
        ...(notesById.value[note.id] ?? {}),
        ...note,
      };
      return accumulator;
    }, { ...notesById.value });
  }

  function removeNote(noteId: string): void {
    if (!notesById.value[noteId]) {
      return;
    }

    const { [noteId]: _, ...remainingNotes } = notesById.value;
    notesById.value = remainingNotes;
    delete viewerState.value[noteId];
    rawEventsById.delete(noteId);
  }

  function upsertRawEvents(events: NostrEvent[]): void {
    for (const event of events) {
      rawEventsById.set(event.id, event);
    }
  }

  function applyHydratedNoteChunk(nextChunk: HydratedNoteChunk): void {
    upsertNotes([...nextChunk.primaryNotes, ...nextChunk.relatedNotes]);
    upsertRawEvents(nextChunk.rawEvents);
    mergeViewerState(nextChunk.viewerState);
    void hydrateProfilesForNotes(
      [...nextChunk.primaryNotes, ...nextChunk.relatedNotes],
      nextChunk.authorPubkeys,
    ).catch((error) => {
      console.warn('Failed to hydrate profiles for streamed timeline notes', error);
    });
  }

  function appendHomeTimelineIds(tab: HomeTimelineTab, noteIds: string[]): void {
    if (noteIds.length === 0) {
      return;
    }

    setHomeState(tab, {
      ids: uniqueIds([...homeTimelineState.value[tab].ids, ...noteIds]),
    });
  }

  async function hydrateProfilesForNotes(nextNotes: NostrNote[], extraPubkeys: string[] = []): Promise<void> {
    const pubkeys = uniqueIds([
      ...extraPubkeys,
      ...nextNotes.map((note) => note.pubkey),
    ]);
    await profilesStore.ensureProfiles(pubkeys);
  }

  function mergeViewerState(nextViewerState: Record<string, ViewerPostState>): void {
    if (Object.keys(nextViewerState).length === 0) {
      return;
    }

    viewerState.value = {
      ...viewerState.value,
      ...Object.fromEntries(
        Object.entries(nextViewerState).map(([noteId, state]) => [
          noteId,
          {
            ...defaultViewerState(),
            ...(viewerState.value[noteId] ?? {}),
            ...state,
            likeEventIds: uniqueIds(state.likeEventIds ?? viewerState.value[noteId]?.likeEventIds ?? []),
            repostEventIds: uniqueIds(
              state.repostEventIds ?? viewerState.value[noteId]?.repostEventIds ?? [],
            ),
          },
        ]),
      ),
    };
  }

  function getRawPostById(id: string): NostrNote | null {
    return notesById.value[id] ?? null;
  }

  function resolveDisplayPost(note: NostrNote): NostrNote {
    if (note.kind === 6 && note.repostOf && notesById.value[note.repostOf]) {
      return notesById.value[note.repostOf];
    }

    return note;
  }

  function getPostById(id: string): NostrNote | null {
    const note = getRawPostById(id);
    return note ? resolveDisplayPost(note) : null;
  }

  function getViewerPostState(postId: string): ViewerPostState {
    return viewerState.value[postId] ?? defaultViewerState();
  }

  function getProfileTabPosts(pubkey: string, tab: ProfileTab): NostrNote[] {
    return (profileTabIds.value[pubkey]?.[tab] ?? [])
      .map((id) => notesById.value[id])
      .filter((note): note is NostrNote => Boolean(note));
  }

  function getProfilePosts(pubkey: string): NostrNote[] {
    return getProfileTabPosts(pubkey, 'posts');
  }

  function getProfileReplies(pubkey: string): NostrNote[] {
    return getProfileTabPosts(pubkey, 'replies');
  }

  function getProfileLikes(pubkey: string): NostrNote[] {
    return getProfileTabPosts(pubkey, 'likes');
  }

  function getProfileReposts(pubkey: string): NostrNote[] {
    return getProfileTabPosts(pubkey, 'reposts');
  }

  function getThreadAncestors(postId: string): NostrNote[] {
    return (threadStateByPostId.value[postId]?.ancestors ?? [])
      .map((id) => notesById.value[id])
      .filter((note): note is NostrNote => Boolean(note));
  }

  function getRepliesForPost(postId: string): NostrNote[] {
    return (threadStateByPostId.value[postId]?.replies ?? [])
      .map((id) => notesById.value[id])
      .filter((note): note is NostrNote => Boolean(note));
  }

  function replaceIdInLists(previousId: string, nextId: string): void {
    homeTimelineState.value = {
      all: {
        ...homeTimelineState.value.all,
        ids: homeTimelineState.value.all.ids.map((id) => (id === previousId ? nextId : id)),
      },
      following: {
        ...homeTimelineState.value.following,
        ids: homeTimelineState.value.following.ids.map((id) => (id === previousId ? nextId : id)),
      },
    };
    bookmarksTimelineIds.value = bookmarksTimelineIds.value.map((id) => (id === previousId ? nextId : id));
    profileTabIds.value = Object.fromEntries(
      Object.entries(profileTabIds.value).map(([pubkey, tabs]) => [
        pubkey,
        {
          posts: (tabs.posts ?? []).map((id) => (id === previousId ? nextId : id)),
          replies: (tabs.replies ?? []).map((id) => (id === previousId ? nextId : id)),
          likes: (tabs.likes ?? []).map((id) => (id === previousId ? nextId : id)),
          reposts: (tabs.reposts ?? []).map((id) => (id === previousId ? nextId : id)),
        },
      ]),
    );
    threadStateByPostId.value = Object.fromEntries(
      Object.entries(threadStateByPostId.value).map(([postId, state]) => [
        postId,
        {
          ...state,
          focusedId: state.focusedId === previousId ? nextId : state.focusedId,
          ancestors: state.ancestors.map((id) => (id === previousId ? nextId : id)),
          replies: state.replies.map((id) => (id === previousId ? nextId : id)),
        },
      ]),
    );
  }

  async function refreshNotesByIds(noteIds: string[]): Promise<void> {
    const targetIds = uniqueIds(noteIds);
    if (targetIds.length === 0 || !authStore.currentPubkey) {
      return;
    }

    ensureRelayStoresInitialized();

    const refreshedCollection = await fetchNotesByIds(
      authStore.session,
      appRelaysStore.relayEntries,
      myRelaysStore.relayEntries,
      targetIds,
    );
    upsertNotes([...refreshedCollection.primaryNotes, ...refreshedCollection.relatedNotes]);
    upsertRawEvents(refreshedCollection.rawEvents);
    mergeViewerState(refreshedCollection.viewerState);
    await hydrateProfilesForNotes(
      [...refreshedCollection.primaryNotes, ...refreshedCollection.relatedNotes],
      refreshedCollection.authorPubkeys,
    );
  }

  function shouldIncludeAuthorInFollowingTimeline(pubkey: string): boolean {
    return homeTimelineState.value.following.followPubkeys.includes(pubkey);
  }

  async function ensureHomeTimelineLoaded(tab: HomeTimelineTab, force = false): Promise<void> {
    const homeState = getHomeState(tab);
    if (homeState.loaded && !force) {
      return;
    }
    if (homeState.loading) {
      return;
    }

    if (!authStore.currentPubkey) {
      return;
    }

    ensureRelayStoresInitialized();
    setHomeState(tab, {
      ids: [],
      loading: true,
      loaded: false,
      error: '',
      nextCursor: null,
      hasMore: false,
    });

    try {
      let authors: string[] | undefined;

      if (tab === 'following') {
        const followPubkeys = await fetchFollowingPubkeys(
          authStore.session,
          appRelaysStore.relayEntries,
          myRelaysStore.relayEntries,
          authStore.currentPubkey,
        );

        if (followPubkeys.length === 0) {
          setHomeState('following', {
            ids: [],
            loading: false,
            loaded: true,
            error: '',
            loadingMore: false,
            nextCursor: null,
            hasMore: false,
            followPubkeys: [],
            followListEmpty: true,
          });
          return;
        }

        authors = followPubkeys;
        setHomeState('following', {
          ids: [],
          followPubkeys,
          followListEmpty: false,
        });
      }

      const homeStream = await streamHomeTimelineBatch(
        authStore.session,
        appRelaysStore.relayEntries,
        myRelaysStore.relayEntries,
        null,
        15,
        authors,
        (nextChunk) => {
          applyHydratedNoteChunk(nextChunk);
          appendHomeTimelineIds(
            tab,
            nextChunk.primaryNotes.map((note) => note.id),
          );
        },
      );
      setHomeState(tab, {
        nextCursor: homeStream.nextCursor,
        hasMore: homeStream.hasMore,
        loaded: true,
        loading: false,
      });
    } catch (error) {
      setHomeState(tab, {
        loading: false,
        error:
          error instanceof Error
            ? error.message
            : `Failed to load the ${tab} home timeline from relays.`,
      });
    }
  }

  async function loadMoreHome(tab: HomeTimelineTab): Promise<void> {
    const homeState = getHomeState(tab);
    if (homeState.loading || homeState.loadingMore || !homeState.hasMore || !authStore.currentPubkey) {
      return;
    }
    if (tab === 'following' && homeState.followListEmpty) {
      return;
    }

    ensureRelayStoresInitialized();
    setHomeState(tab, {
      loadingMore: true,
    });

    try {
      const homeStream = await streamHomeTimelineBatch(
        authStore.session,
        appRelaysStore.relayEntries,
        myRelaysStore.relayEntries,
        homeState.nextCursor,
        15,
        tab === 'following' ? homeState.followPubkeys : undefined,
        (nextChunk) => {
          applyHydratedNoteChunk(nextChunk);
          appendHomeTimelineIds(
            tab,
            nextChunk.primaryNotes.map((note) => note.id),
          );
        },
      );
      setHomeState(tab, {
        nextCursor: homeStream.nextCursor,
        hasMore: homeStream.hasMore,
        loadingMore: false,
      });
    } catch (error) {
      setHomeState(tab, {
        loadingMore: false,
        error:
          error instanceof Error ? error.message : `Failed to load more ${tab} posts from relays.`,
      });
    }
  }

  async function loadBookmarks(force = false): Promise<void> {
    if (bookmarksLoaded.value && !force) {
      return;
    }
    if (bookmarksLoading.value) {
      return;
    }

    if (!authStore.currentPubkey) {
      return;
    }

    ensureRelayStoresInitialized();
    bookmarksLoading.value = true;
    bookmarksError.value = '';

    try {
      const bookmarkCollection = await fetchBookmarksCollection(
        authStore.session,
        appRelaysStore.relayEntries,
        myRelaysStore.relayEntries,
      );
      upsertNotes(bookmarkCollection.notes);
      upsertRawEvents(bookmarkCollection.rawEvents);
      mergeViewerState(bookmarkCollection.viewerState);
      await hydrateProfilesForNotes(bookmarkCollection.notes, bookmarkCollection.authorPubkeys);
      bookmarksTimelineIds.value = bookmarkCollection.notes.map((note) => note.id);
      bookmarksLoaded.value = true;
    } catch (error) {
      bookmarksError.value =
        error instanceof Error ? error.message : 'Failed to load bookmarks from relays.';
    } finally {
      bookmarksLoading.value = false;
    }
  }

  async function ensureProfileTabLoaded(pubkey: string, tab: ProfileTab, force = false): Promise<void> {
    if (!authStore.currentPubkey) {
      return;
    }

    if (!force && profileTabIds.value[pubkey]?.[tab]) {
      return;
    }
    if (profileTabLoading.value[pubkey]?.[tab]) {
      return;
    }

    ensureRelayStoresInitialized();
    profileTabLoading.value = {
      ...profileTabLoading.value,
      [pubkey]: {
        ...(profileTabLoading.value[pubkey] ?? {}),
        [tab]: true,
      },
    };
    profileTabErrors.value = {
      ...profileTabErrors.value,
      [pubkey]: {
        ...(profileTabErrors.value[pubkey] ?? {}),
        [tab]: '',
      },
    };

    try {
      const collection = await fetchProfileTab(
        authStore.session,
        appRelaysStore.relayEntries,
        myRelaysStore.relayEntries,
        pubkey,
        tab,
      );
      upsertNotes([...collection.primaryNotes, ...collection.relatedNotes]);
      upsertRawEvents(collection.rawEvents);
      mergeViewerState(collection.viewerState);
      await hydrateProfilesForNotes(
        [...collection.primaryNotes, ...collection.relatedNotes],
        collection.authorPubkeys,
      );
      profileTabIds.value = {
        ...profileTabIds.value,
        [pubkey]: {
          posts: profileTabIds.value[pubkey]?.posts ?? [],
          replies: profileTabIds.value[pubkey]?.replies ?? [],
          likes: profileTabIds.value[pubkey]?.likes ?? [],
          reposts: profileTabIds.value[pubkey]?.reposts ?? [],
          [tab]: collection.primaryNotes.map((note) => note.id),
        },
      };
    } catch (error) {
      profileTabErrors.value = {
        ...profileTabErrors.value,
        [pubkey]: {
          ...(profileTabErrors.value[pubkey] ?? {}),
          [tab]:
            error instanceof Error ? error.message : 'Failed to load profile posts from relays.',
        },
      };
    } finally {
      profileTabLoading.value = {
        ...profileTabLoading.value,
        [pubkey]: {
          ...(profileTabLoading.value[pubkey] ?? {}),
          [tab]: false,
        },
      };
    }
  }

  async function ensureThreadLoaded(postId: string, force = false): Promise<void> {
    if (!authStore.currentPubkey) {
      return;
    }

    if (!force && threadStateByPostId.value[postId]?.loaded) {
      return;
    }
    if (threadStateByPostId.value[postId]?.loading) {
      return;
    }

    ensureRelayStoresInitialized();
    threadStateByPostId.value = {
      ...threadStateByPostId.value,
      [postId]: {
        focusedId: threadStateByPostId.value[postId]?.focusedId ?? null,
        ancestors: threadStateByPostId.value[postId]?.ancestors ?? [],
        replies: threadStateByPostId.value[postId]?.replies ?? [],
        loading: true,
        loaded: false,
        error: '',
      },
    };

    try {
      const threadCollection = await fetchThreadCollection(
        authStore.session,
        appRelaysStore.relayEntries,
        myRelaysStore.relayEntries,
        postId,
      );
      upsertNotes([
        ...(threadCollection.focusedPost ? [threadCollection.focusedPost] : []),
        ...threadCollection.ancestors,
        ...threadCollection.replies,
      ]);
      upsertRawEvents(threadCollection.rawEvents);
      mergeViewerState(threadCollection.viewerState);
      await hydrateProfilesForNotes(
        [
          ...(threadCollection.focusedPost ? [threadCollection.focusedPost] : []),
          ...threadCollection.ancestors,
          ...threadCollection.replies,
        ],
        threadCollection.authorPubkeys,
      );
      threadStateByPostId.value = {
        ...threadStateByPostId.value,
        [postId]: {
          focusedId: threadCollection.focusedPost?.id ?? null,
          ancestors: threadCollection.ancestors.map((note) => note.id),
          replies: threadCollection.replies.map((note) => note.id),
          loading: false,
          loaded: true,
          error: '',
        },
      };
    } catch (error) {
      threadStateByPostId.value = {
        ...threadStateByPostId.value,
        [postId]: {
          focusedId: null,
          ancestors: [],
          replies: [],
          loading: false,
          loaded: false,
          error:
            error instanceof Error ? error.message : 'Failed to load the thread from relays.',
        },
      };
    }
  }

  function setActionPending(postId: string, pending: boolean): void {
    actionPendingByPostId.value = {
      ...actionPendingByPostId.value,
      [postId]: pending,
    };
  }

  function updateNoteStats(postId: string, updater: (note: NostrNote) => NostrNote): void {
    const existingNote = notesById.value[postId];
    if (!existingNote) {
      return;
    }

    notesById.value = {
      ...notesById.value,
      [postId]: updater(existingNote),
    };
  }

  async function createPost(content: string): Promise<void> {
    if (!authStore.currentPubkey) {
      return;
    }

    publishingPost.value = true;
    const optimisticId = `optimistic-note-${Date.now()}`;
    const optimisticNote: NostrNote = {
      id: optimisticId,
      pubkey: authStore.currentPubkey,
      kind: 1,
      createdAt: new Date().toISOString(),
      content: content.trim(),
      media: [],
      tags: [],
      replyTo: null,
      rootId: null,
      repostOf: null,
      quotedNoteId: null,
      entity: optimisticId,
      permalink: optimisticId,
      stats: {
        replies: 0,
        reposts: 0,
        likes: 0,
        bookmarks: 0,
      },
    };

    upsertNotes([optimisticNote]);
    setHomeState('all', {
      ids: uniqueIds([optimisticId, ...homeTimelineState.value.all.ids]),
    });
    if (shouldIncludeAuthorInFollowingTimeline(authStore.currentPubkey)) {
      setHomeState('following', {
        ids: uniqueIds([optimisticId, ...homeTimelineState.value.following.ids]),
      });
    }

    try {
      const rawEvent = await publishNote(
        authStore.session,
        appRelaysStore.relayEntries,
        myRelaysStore.relayEntries,
        content,
      );
      const publishedNote = mapRawEventToNote(rawEvent);
      if (publishedNote) {
        upsertNotes([publishedNote]);
      }
      const publishedCollection = await fetchNotesByIds(
        authStore.session,
        appRelaysStore.relayEntries,
        myRelaysStore.relayEntries,
        [rawEvent.id],
      );
      upsertNotes([
        ...(publishedNote ? [publishedNote] : []),
        ...publishedCollection.primaryNotes,
        ...publishedCollection.relatedNotes,
      ]);
      upsertRawEvents([rawEvent, ...publishedCollection.rawEvents]);
      mergeViewerState(publishedCollection.viewerState);
      await hydrateProfilesForNotes(
        [...publishedCollection.primaryNotes, ...publishedCollection.relatedNotes],
        publishedCollection.authorPubkeys,
      );
      replaceIdInLists(optimisticId, rawEvent.id);
      removeNote(optimisticId);
      setHomeState('all', {
        ids: uniqueIds([rawEvent.id, ...homeTimelineState.value.all.ids]),
      });
      if (shouldIncludeAuthorInFollowingTimeline(authStore.currentPubkey)) {
        setHomeState('following', {
          ids: uniqueIds([rawEvent.id, ...homeTimelineState.value.following.ids]),
        });
      }
    } catch (error) {
      removeNote(optimisticId);
      setHomeState('all', {
        ids: homeTimelineState.value.all.ids.filter((id) => id !== optimisticId),
      });
      setHomeState('following', {
        ids: homeTimelineState.value.following.ids.filter((id) => id !== optimisticId),
      });
      throw error;
    } finally {
      publishingPost.value = false;
    }
  }

  async function replyToPost(parentId: string, content: string): Promise<void> {
    if (!authStore.currentPubkey) {
      return;
    }

    const parentRawEvent = rawEventsById.get(parentId);
    const parentNote = notesById.value[parentId];
    if (!parentRawEvent || !parentNote) {
      return;
    }

    const optimisticId = `optimistic-reply-${Date.now()}`;
    const optimisticReply: NostrNote = {
      id: optimisticId,
      pubkey: authStore.currentPubkey,
      kind: 1,
      createdAt: new Date().toISOString(),
      content: content.trim(),
      media: [],
      tags: [],
      replyTo: parentId,
      rootId: parentNote.rootId ?? parentNote.id,
      repostOf: null,
      quotedNoteId: null,
      entity: optimisticId,
      permalink: optimisticId,
      stats: {
        replies: 0,
        reposts: 0,
        likes: 0,
        bookmarks: 0,
      },
    };

    upsertNotes([optimisticReply]);
    updateNoteStats(parentId, (note) => ({
      ...note,
      stats: {
        ...note.stats,
        replies: note.stats.replies + 1,
      },
    }));
    if (threadStateByPostId.value[parentId]) {
      threadStateByPostId.value = {
        ...threadStateByPostId.value,
        [parentId]: {
          ...threadStateByPostId.value[parentId],
          replies: uniqueIds([...threadStateByPostId.value[parentId].replies, optimisticId]),
        },
      };
    }

    try {
      const rawEvent = await publishReply(
        authStore.session,
        appRelaysStore.relayEntries,
        myRelaysStore.relayEntries,
        parentRawEvent,
        content,
      );
      const publishedReply = mapRawEventToNote(rawEvent);
      if (publishedReply) {
        upsertNotes([publishedReply]);
      }
      const publishedCollection = await fetchNotesByIds(
        authStore.session,
        appRelaysStore.relayEntries,
        myRelaysStore.relayEntries,
        [rawEvent.id, parentId],
      );
      upsertNotes([
        ...(publishedReply ? [publishedReply] : []),
        ...publishedCollection.primaryNotes,
        ...publishedCollection.relatedNotes,
      ]);
      upsertRawEvents([rawEvent, ...publishedCollection.rawEvents]);
      mergeViewerState(publishedCollection.viewerState);
      await hydrateProfilesForNotes(
        [...publishedCollection.primaryNotes, ...publishedCollection.relatedNotes],
        publishedCollection.authorPubkeys,
      );
      replaceIdInLists(optimisticId, rawEvent.id);
      removeNote(optimisticId);
      if (threadStateByPostId.value[parentId]) {
        threadStateByPostId.value = {
          ...threadStateByPostId.value,
          [parentId]: {
            ...threadStateByPostId.value[parentId],
            replies: uniqueIds([
              ...threadStateByPostId.value[parentId].replies.filter((id) => id !== optimisticId),
              rawEvent.id,
            ]),
          },
        };
      }
      await refreshNotesByIds([parentId]);
    } catch (error) {
      removeNote(optimisticId);
      if (threadStateByPostId.value[parentId]) {
        threadStateByPostId.value = {
          ...threadStateByPostId.value,
          [parentId]: {
            ...threadStateByPostId.value[parentId],
            replies: threadStateByPostId.value[parentId].replies.filter((id) => id !== optimisticId),
          },
        };
      }
      await refreshNotesByIds([parentId]);
      throw error;
    }
  }

  async function toggleLike(postId: string): Promise<void> {
    if (!authStore.currentPubkey) {
      return;
    }

    const targetRawEvent = rawEventsById.get(postId);
    if (!targetRawEvent) {
      return;
    }

    const currentState = getViewerPostState(postId);
    const nextLikedState = !currentState.liked;
    setActionPending(postId, true);
    mergeViewerState({
      [postId]: {
        ...currentState,
        liked: nextLikedState,
      },
    });
    updateNoteStats(postId, (note) => ({
      ...note,
      stats: {
        ...note.stats,
        likes: Math.max(0, note.stats.likes + (nextLikedState ? 1 : -1)),
      },
    }));

    try {
      if (currentState.liked) {
        if ((currentState.likeEventIds ?? []).length === 0) {
          await refreshNotesByIds([postId]);
          return;
        }

        await publishDeletionForEvents(
          authStore.session,
          appRelaysStore.relayEntries,
          myRelaysStore.relayEntries,
          currentState.likeEventIds ?? [],
        );
      } else {
        const reactionEvent = await publishReaction(
          authStore.session,
          appRelaysStore.relayEntries,
          myRelaysStore.relayEntries,
          targetRawEvent,
        );
        upsertRawEvents([reactionEvent]);
      }

      await refreshNotesByIds([postId]);
    } catch (error) {
      mergeViewerState({
        [postId]: currentState,
      });
      await refreshNotesByIds([postId]);
      throw error;
    } finally {
      setActionPending(postId, false);
    }
  }

  async function toggleRepost(postId: string): Promise<void> {
    if (!authStore.currentPubkey) {
      return;
    }

    const targetRawEvent = rawEventsById.get(postId);
    if (!targetRawEvent) {
      return;
    }

    const currentState = getViewerPostState(postId);
    const nextRepostedState = !currentState.reposted;
    setActionPending(postId, true);
    mergeViewerState({
      [postId]: {
        ...currentState,
        reposted: nextRepostedState,
      },
    });
    updateNoteStats(postId, (note) => ({
      ...note,
      stats: {
        ...note.stats,
        reposts: Math.max(0, note.stats.reposts + (nextRepostedState ? 1 : -1)),
      },
    }));

    try {
      if (currentState.reposted) {
        if ((currentState.repostEventIds ?? []).length === 0) {
          await refreshNotesByIds([postId]);
          return;
        }

        await publishDeletionForEvents(
          authStore.session,
          appRelaysStore.relayEntries,
          myRelaysStore.relayEntries,
          currentState.repostEventIds ?? [],
        );
      } else {
        const repostEvent = await publishRepost(
          authStore.session,
          appRelaysStore.relayEntries,
          myRelaysStore.relayEntries,
          targetRawEvent,
        );
        upsertRawEvents([repostEvent]);
      }

      await refreshNotesByIds([postId]);
      await ensureProfileTabLoaded(authStore.currentPubkey, 'reposts', true);
    } catch (error) {
      mergeViewerState({
        [postId]: currentState,
      });
      await refreshNotesByIds([postId]);
      throw error;
    } finally {
      setActionPending(postId, false);
    }
  }

  async function toggleBookmark(postId: string): Promise<void> {
    if (!authStore.currentPubkey) {
      return;
    }

    const currentState = getViewerPostState(postId);
    const nextBookmarkedState = !currentState.bookmarked;
    const nextBookmarkIds = nextBookmarkedState
      ? uniqueIds([postId, ...bookmarksTimelineIds.value])
      : bookmarksTimelineIds.value.filter((id) => id !== postId);

    setActionPending(postId, true);
    mergeViewerState({
      [postId]: {
        ...currentState,
        bookmarked: nextBookmarkedState,
      },
    });
    bookmarksTimelineIds.value = nextBookmarkIds;

    try {
      await publishBookmarkList(
        authStore.session,
        appRelaysStore.relayEntries,
        myRelaysStore.relayEntries,
        nextBookmarkIds,
      );
      await loadBookmarks(true);
    } catch (error) {
      mergeViewerState({
        [postId]: currentState,
      });
      bookmarksTimelineIds.value = currentState.bookmarked
        ? uniqueIds([postId, ...bookmarksTimelineIds.value])
        : bookmarksTimelineIds.value.filter((id) => id !== postId);
      throw error;
    } finally {
      setActionPending(postId, false);
    }
  }

  function isProfileTabLoading(pubkey: string, tab: ProfileTab): boolean {
    return Boolean(profileTabLoading.value[pubkey]?.[tab]);
  }

  function getProfileTabError(pubkey: string, tab: ProfileTab): string {
    return profileTabErrors.value[pubkey]?.[tab] ?? '';
  }

  function getThreadError(postId: string): string {
    return threadStateByPostId.value[postId]?.error ?? '';
  }

  function isThreadLoading(postId: string): boolean {
    return Boolean(threadStateByPostId.value[postId]?.loading);
  }

  function isActionPending(postId: string): boolean {
    return Boolean(actionPendingByPostId.value[postId]);
  }

  function getPostCountForProfile(pubkey: string): number {
    return getProfilePosts(pubkey).length + getProfileReplies(pubkey).length;
  }

  function isHomeTimelineLoading(tab: HomeTimelineTab): boolean {
    return homeTimelineState.value[tab].loading;
  }

  function getHomeTimelineError(tab: HomeTimelineTab): string {
    return homeTimelineState.value[tab].error;
  }

  function isHomeTimelineLoadingMore(tab: HomeTimelineTab): boolean {
    return homeTimelineState.value[tab].loadingMore;
  }

  function canLoadMoreHome(tab: HomeTimelineTab): boolean {
    return homeTimelineState.value[tab].hasMore;
  }

  function isFollowingListEmpty(): boolean {
    return homeTimelineState.value.following.followListEmpty;
  }

  function reset(): void {
    notesById.value = {};
    viewerState.value = {};
    homeTimelineState.value = {
      all: defaultHomeTimelineState(),
      following: defaultHomeTimelineState(),
    };
    bookmarksTimelineIds.value = [];
    bookmarksLoading.value = false;
    bookmarksLoaded.value = false;
    bookmarksError.value = '';
    profileTabIds.value = {};
    profileTabLoading.value = {};
    profileTabErrors.value = {};
    threadStateByPostId.value = {};
    publishingPost.value = false;
    actionPendingByPostId.value = {};
    rawEventsById.clear();
  }

  return {
    notes,
    viewerState,
    allTimeline,
    followingTimeline,
    bookmarksTimeline,
    bookmarksLoading,
    bookmarksError,
    publishingPost,
    ensureHomeTimelineLoaded,
    loadMoreHome,
    loadBookmarks,
    ensureProfileTabLoaded,
    ensureThreadLoaded,
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
    getHomeTimeline,
    getHomeTimelineError,
    getProfileTabError,
    isProfileTabLoading,
    isHomeTimelineLoading,
    isHomeTimelineLoadingMore,
    canLoadMoreHome,
    isFollowingListEmpty,
    getThreadError,
    isThreadLoading,
    isActionPending,
    reset,
  };
});
