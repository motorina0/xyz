import {
  getEventReplyId,
  getRootEventId,
  NDKEvent,
  NDKKind,
  type NDKFilter,
  type NostrEvent,
} from '@nostr-dev-kit/ndk';
import type { NostrAuthSession } from '../types/auth';
import type { NostrNote, ViewerPostState } from '../types/nostr';
import type { RelayListEntry } from '../types/relays';
import {
  buildReadRelayUrls,
  buildWriteRelayUrls,
  createLoggedCountOptions,
  createNdkClient,
  createRelaySet,
  fetchEventFromRelays,
  fetchEventsFromRelays,
  publishEventToRelays,
  publishReplaceableEventToRelays,
  toRawEvent,
  connectNdkClient,
} from './nostrClientService';
import { encodeEventReference, normalizeEventReference, toNostrUri } from './nostrEntityService';

const IMAGE_URL_REGEX = /(https?:\/\/[^\s]+?\.(?:png|jpe?g|gif|webp|avif))(?:[?#[^\s]*)?/gi;

export interface HydratedNoteCollection {
  primaryNotes: NostrNote[];
  relatedNotes: NostrNote[];
  rawEvents: NostrEvent[];
  viewerState: Record<string, ViewerPostState>;
  nextCursor: number | null;
  hasMore: boolean;
  authorPubkeys: string[];
}

export interface ThreadCollection {
  focusedPost: NostrNote | null;
  ancestors: NostrNote[];
  replies: NostrNote[];
  rawEvents: NostrEvent[];
  viewerState: Record<string, ViewerPostState>;
  authorPubkeys: string[];
}

export interface BookmarkCollection {
  notes: NostrNote[];
  rawEvents: NostrEvent[];
  viewerState: Record<string, ViewerPostState>;
  authorPubkeys: string[];
  bookmarkIds: string[];
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function extractImageMedia(content: string) {
  const matches = Array.from(content.matchAll(IMAGE_URL_REGEX));
  return matches.slice(0, 1).map((match, index) => ({
    id: `${match[1]}-${index}`,
    url: match[1],
    alt: 'Attached image',
    aspectRatio: 16 / 9,
  }));
}

function parseQuotedNoteId(event: NDKEvent): string | null {
  const qTag = event.getMatchingTags('q')[0];
  if (qTag?.[1]) {
    const normalizedReference = normalizeEventReference(qTag[1]);
    if (normalizedReference) {
      return normalizedReference.id;
    }
  }

  const contentMatch = event.content.match(/nostr:(note1[0-9a-z]+|nevent1[0-9a-z]+)/i);
  if (!contentMatch?.[1]) {
    return null;
  }

  const normalizedReference = normalizeEventReference(contentMatch[1]);
  return normalizedReference?.id ?? null;
}

function parseRepostTargetId(event: NDKEvent): string | null {
  const eTags = event.getMatchingTags('e');
  const rawTargetId = eTags.at(-1)?.[1];
  if (typeof rawTargetId === 'string' && rawTargetId.length > 0) {
    return rawTargetId;
  }

  try {
    const parsedContent = JSON.parse(event.content) as Partial<NostrEvent>;
    if (typeof parsedContent.id === 'string' && parsedContent.id.length > 0) {
      return parsedContent.id;
    }
  } catch {}

  return null;
}

function mapEventToNote(event: NDKEvent): NostrNote | null {
  if (event.kind !== NDKKind.Text && event.kind !== NDKKind.Repost) {
    return null;
  }

  const rootId = getRootEventId(event) ?? null;
  const replyTo = getEventReplyId(event) ?? null;
  const repostOf = event.kind === NDKKind.Repost ? parseRepostTargetId(event) : null;

  return {
    id: event.id,
    pubkey: event.pubkey,
    kind: event.kind === NDKKind.Repost ? 6 : 1,
    createdAt: new Date((event.created_at ?? 0) * 1000).toISOString(),
    content: event.content,
    media: extractImageMedia(event.content),
    tags: event.tags,
    replyTo,
    rootId,
    repostOf,
    quotedNoteId: parseQuotedNoteId(event),
    entity: encodeEventReference(event.id, [], event.pubkey),
    permalink: toNostrUri(encodeEventReference(event.id, [], event.pubkey)),
    stats: {
      replies: 0,
      reposts: 0,
      likes: 0,
      bookmarks: 0,
    },
  };
}

export function mapRawEventToNote(rawEvent: NostrEvent): NostrNote | null {
  return mapEventToNote(new NDKEvent(undefined, rawEvent));
}

function sortNewest(notes: NostrNote[]): NostrNote[] {
  return [...notes].sort(
    (first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
  );
}

function sortOldest(notes: NostrNote[]): NostrNote[] {
  return [...notes].sort(
    (first, second) => new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime(),
  );
}

function buildNoteMap(notes: NostrNote[]): Map<string, NostrNote> {
  return new Map(notes.map((note) => [note.id, note]));
}

function mergeNotesById(notes: NostrNote[]): NostrNote[] {
  const noteMap = new Map<string, NostrNote>();

  for (const note of notes) {
    noteMap.set(note.id, note);
  }

  return Array.from(noteMap.values());
}

async function fetchEventsInChunks(
  session: NostrAuthSession,
  relayUrls: string[],
  ids: string[],
): Promise<NDKEvent[]> {
  const chunkSize = 40;
  const events: NDKEvent[] = [];

  for (let index = 0; index < ids.length; index += chunkSize) {
    const currentChunk = ids.slice(index, index + chunkSize);
    if (currentChunk.length === 0) {
      continue;
    }

    const chunkEvents = await fetchEventsFromRelays(session, relayUrls, {
      ids: currentChunk,
    });
    events.push(...chunkEvents);
  }

  return events;
}

async function fetchRelatedEvents(
  session: NostrAuthSession,
  relayUrls: string[],
  notes: NostrNote[],
  knownIds: Set<string>,
): Promise<NDKEvent[]> {
  const relatedIds = unique(
    notes.flatMap((note) => [note.replyTo, note.rootId, note.repostOf, note.quotedNoteId]).filter(
      (value): value is string => Boolean(value && !knownIds.has(value)),
    ),
  );

  if (relatedIds.length === 0) {
    return [];
  }

  return fetchEventsInChunks(session, relayUrls, relatedIds);
}

function targetEventIdFromTag(tags: string[][]): string | null {
  const matchingTag = tags
    .filter((tag) => tag[0] === 'e' && typeof tag[1] === 'string')
    .find((tag) => tag[3] === 'reply' || tag[3] === 'mention')
    ?? tags.filter((tag) => tag[0] === 'e' && typeof tag[1] === 'string').at(-1);

  return matchingTag?.[1] ?? null;
}

function resolveCountResult(
  result: {
    count: number;
    relayResults: Map<string, unknown>;
  },
  fallback: number,
): number {
  if (result.relayResults.size === 0) {
    return fallback;
  }

  return Math.max(0, result.count);
}

async function fetchBookmarkIds(
  session: NostrAuthSession,
  appRelayEntries: RelayListEntry[],
  myRelayEntries: RelayListEntry[],
): Promise<string[]> {
  if (!session.currentPubkey) {
    return [];
  }

  const relayUrls = buildReadRelayUrls(appRelayEntries, myRelayEntries);
  const bookmarkEvent = await fetchEventFromRelays(session, relayUrls, {
    authors: [session.currentPubkey],
    kinds: [NDKKind.BookmarkList],
  });
  if (!bookmarkEvent) {
    return [];
  }

  return unique(
    bookmarkEvent.tags
      .filter((tag) => tag[0] === 'e' && typeof tag[1] === 'string')
      .map((tag) => tag[1] as string),
  );
}

async function buildViewerState(
  session: NostrAuthSession,
  appRelayEntries: RelayListEntry[],
  myRelayEntries: RelayListEntry[],
  displayNoteIds: string[],
): Promise<Record<string, ViewerPostState>> {
  const bookmarkIds = await fetchBookmarkIds(session, appRelayEntries, myRelayEntries);
  const bookmarkedIdSet = new Set(bookmarkIds);
  const viewerState: Record<string, ViewerPostState> = {};

  for (const noteId of displayNoteIds) {
    viewerState[noteId] = {
      liked: false,
      reposted: false,
      bookmarked: bookmarkedIdSet.has(noteId),
      likeEventIds: [],
      repostEventIds: [],
    };
  }

  if (!session.currentPubkey || displayNoteIds.length === 0) {
    return viewerState;
  }

  const relayUrls = buildReadRelayUrls(appRelayEntries, myRelayEntries);
  const filterChunks: string[][] = [];
  const chunkSize = 24;
  for (let index = 0; index < displayNoteIds.length; index += chunkSize) {
    filterChunks.push(displayNoteIds.slice(index, index + chunkSize));
  }

  for (const currentChunk of filterChunks) {
    const [reactionEvents, repostEvents] = await Promise.all([
      fetchEventsFromRelays(session, relayUrls, {
        authors: [session.currentPubkey],
        kinds: [NDKKind.Reaction],
        '#e': currentChunk,
      }),
      fetchEventsFromRelays(session, relayUrls, {
        authors: [session.currentPubkey],
        kinds: [NDKKind.Repost],
        '#e': currentChunk,
      }),
    ]);

    for (const reactionEvent of reactionEvents) {
      const targetId = targetEventIdFromTag(reactionEvent.tags);
      if (!targetId || !viewerState[targetId]) {
        continue;
      }

      viewerState[targetId] = {
        ...viewerState[targetId],
        liked: reactionEvent.content === '+' || reactionEvent.content === '',
        likeEventIds: unique([...(viewerState[targetId].likeEventIds ?? []), reactionEvent.id]),
      };
    }

    for (const repostEvent of repostEvents) {
      const targetId = parseRepostTargetId(repostEvent);
      if (!targetId || !viewerState[targetId]) {
        continue;
      }

      viewerState[targetId] = {
        ...viewerState[targetId],
        reposted: true,
        repostEventIds: unique([...(viewerState[targetId].repostEventIds ?? []), repostEvent.id]),
      };
    }
  }

  return viewerState;
}

async function applyInteractionStats(
  session: NostrAuthSession,
  appRelayEntries: RelayListEntry[],
  myRelayEntries: RelayListEntry[],
  notes: NostrNote[],
): Promise<{
  notes: NostrNote[];
  viewerState: Record<string, ViewerPostState>;
}> {
  // Counts are derived from the relays we query for the currently loaded notes.
  // That keeps the UI responsive, but it also means counts are best-effort rather than global.
  const noteMap = buildNoteMap(notes);
  const displayNoteIds = unique(
    notes
      .map((note) => note.repostOf ?? note.id)
      .filter((value): value is string => Boolean(value && noteMap.has(value))),
  );
  const relayUrls = buildReadRelayUrls(appRelayEntries, myRelayEntries);
  const repliesCountById = new Map<string, number>();
  const repostCountById = new Map<string, number>();
  const likeCountById = new Map<string, number>();

  if (displayNoteIds.length === 0) {
    return {
      notes,
      viewerState: {},
    };
  }

  const ndk = createNdkClient(session, relayUrls);
  await connectNdkClient(ndk);
  const relaySet = createRelaySet(ndk, relayUrls);

  if (!relaySet) {
    const viewerState = await buildViewerState(session, appRelayEntries, myRelayEntries, displayNoteIds);
    return {
      notes,
      viewerState,
    };
  }

  for (let index = 0; index < displayNoteIds.length; index += 6) {
    const currentChunk = displayNoteIds.slice(index, index + 6);
    if (currentChunk.length === 0) {
      continue;
    }

    const chunkCounts = await Promise.all(
      currentChunk.map(async (noteId) => {
        const [replyCountResult, repostCountResult, reactionCountResult] = await Promise.all([
          relaySet.count(
            {
              kinds: [NDKKind.Text],
              '#e': [noteId],
            },
            createLoggedCountOptions('count-replies', relayUrls, {
              kinds: [NDKKind.Text],
              '#e': [noteId],
            }),
          ),
          relaySet.count(
            {
              kinds: [NDKKind.Repost],
              '#e': [noteId],
            },
            createLoggedCountOptions('count-reposts', relayUrls, {
              kinds: [NDKKind.Repost],
              '#e': [noteId],
            }),
          ),
          relaySet.count(
            {
              kinds: [NDKKind.Reaction],
              '#e': [noteId],
            },
            createLoggedCountOptions('count-reactions', relayUrls, {
              kinds: [NDKKind.Reaction],
              '#e': [noteId],
            }),
          ),
        ]);

        const existingNote = noteMap.get(noteId);
        return {
          noteId,
          replies: resolveCountResult(replyCountResult, existingNote?.stats.replies ?? 0),
          reposts: resolveCountResult(repostCountResult, existingNote?.stats.reposts ?? 0),
          likes: resolveCountResult(reactionCountResult, existingNote?.stats.likes ?? 0),
        };
      }),
    );

    for (const countSet of chunkCounts) {
      repliesCountById.set(countSet.noteId, countSet.replies);
      repostCountById.set(countSet.noteId, countSet.reposts);
      likeCountById.set(countSet.noteId, countSet.likes);
    }
  }

  const viewerState = await buildViewerState(session, appRelayEntries, myRelayEntries, displayNoteIds);

  return {
    notes: notes.map((note) =>
      displayNoteIds.includes(note.id)
        ? {
            ...note,
            stats: {
              ...note.stats,
              replies: repliesCountById.get(note.id) ?? note.stats.replies,
              reposts: repostCountById.get(note.id) ?? note.stats.reposts,
              likes: likeCountById.get(note.id) ?? note.stats.likes,
            },
          }
        : note,
    ),
    viewerState,
  };
}

async function hydrateEvents(
  session: NostrAuthSession,
  appRelayEntries: RelayListEntry[],
  myRelayEntries: RelayListEntry[],
  primaryEvents: NDKEvent[],
  options: {
    hasMore?: boolean;
    nextCursor?: number | null;
  } = {},
): Promise<HydratedNoteCollection> {
  const primaryNotes = primaryEvents
    .map((event) => mapEventToNote(event))
    .filter((note): note is NostrNote => note !== null);
  const rawEvents = primaryEvents.map((event) => toRawEvent(event));
  const primaryIds = new Set(primaryNotes.map((note) => note.id));
  const relayUrls = buildReadRelayUrls(appRelayEntries, myRelayEntries);
  const relatedEvents = await fetchRelatedEvents(session, relayUrls, primaryNotes, primaryIds);
  const relatedNotes = relatedEvents
    .map((event) => mapEventToNote(event))
    .filter((note): note is NostrNote => note !== null);
  const allNotes = mergeNotesById([...primaryNotes, ...relatedNotes]);
  const notesWithStats = await applyInteractionStats(session, appRelayEntries, myRelayEntries, allNotes);

  return {
    primaryNotes: notesWithStats.notes.filter((note) => primaryIds.has(note.id)),
    relatedNotes: notesWithStats.notes.filter((note) => !primaryIds.has(note.id)),
    rawEvents: [...rawEvents, ...relatedEvents.map((event) => toRawEvent(event))],
    viewerState: notesWithStats.viewerState,
    nextCursor:
      typeof options.nextCursor === 'number'
        ? options.nextCursor
        : primaryEvents.length > 0
          ? Math.max((primaryEvents.at(-1)?.created_at ?? 0) - 1, 0)
          : null,
    hasMore: options.hasMore ?? primaryEvents.length > 0,
    authorPubkeys: unique(notesWithStats.notes.map((note) => note.pubkey)),
  };
}

export async function fetchHomeTimelineBatch(
  session: NostrAuthSession,
  appRelayEntries: RelayListEntry[],
  myRelayEntries: RelayListEntry[],
  until: number | null,
  limit = 15,
  authors?: string[],
): Promise<HydratedNoteCollection> {
  const relayUrls = buildReadRelayUrls(appRelayEntries, myRelayEntries);
  const filters: NDKFilter = {
    kinds: [NDKKind.Text],
    limit: Math.max(limit * 3, 30),
  };

  if (Array.isArray(authors) && authors.length > 0) {
    filters.authors = authors;
  }

  if (typeof until === 'number') {
    filters.until = until;
  }

  const events = await fetchEventsFromRelays(session, relayUrls, filters);
  const primaryEvents = events
    .filter((event) => !getEventReplyId(event))
    .slice(0, limit);

  return hydrateEvents(session, appRelayEntries, myRelayEntries, primaryEvents, {
    hasMore: primaryEvents.length === limit,
  });
}

export async function fetchNotesByIds(
  session: NostrAuthSession,
  appRelayEntries: RelayListEntry[],
  myRelayEntries: RelayListEntry[],
  ids: string[],
): Promise<HydratedNoteCollection> {
  const relayUrls = buildReadRelayUrls(appRelayEntries, myRelayEntries);
  const events = await fetchEventsInChunks(session, relayUrls, unique(ids));
  return hydrateEvents(session, appRelayEntries, myRelayEntries, events, {
    hasMore: false,
    nextCursor: null,
  });
}

export async function fetchProfileTab(
  session: NostrAuthSession,
  appRelayEntries: RelayListEntry[],
  myRelayEntries: RelayListEntry[],
  pubkey: string,
  tab: 'posts' | 'replies' | 'likes' | 'reposts',
  limit = 20,
): Promise<HydratedNoteCollection> {
  const relayUrls = buildReadRelayUrls(appRelayEntries, myRelayEntries);

  if (tab === 'likes') {
    const reactionEvents = await fetchEventsFromRelays(session, relayUrls, {
      authors: [pubkey],
      kinds: [NDKKind.Reaction],
      limit: limit * 3,
    });
    // We currently order liked notes by the target note timestamps after hydration.
    // Preserving exact reaction-time ordering would require a second reaction-index layer.
    const targetIds = unique(
      reactionEvents
        .filter((event) => event.content === '+' || event.content === '')
        .map((event) => targetEventIdFromTag(event.tags))
        .filter((value): value is string => Boolean(value)),
    ).slice(0, limit);
    return fetchNotesByIds(session, appRelayEntries, myRelayEntries, targetIds);
  }

  if (tab === 'reposts') {
    const repostEvents = await fetchEventsFromRelays(session, relayUrls, {
      authors: [pubkey],
      kinds: [NDKKind.Repost],
      limit,
    });
    return hydrateEvents(session, appRelayEntries, myRelayEntries, repostEvents, {
      hasMore: repostEvents.length === limit,
    });
  }

  const textEvents = await fetchEventsFromRelays(session, relayUrls, {
    authors: [pubkey],
    kinds: [NDKKind.Text],
    limit: limit * 3,
  });
  const filteredEvents = textEvents
    .filter((event) => (tab === 'replies' ? Boolean(getEventReplyId(event)) : !getEventReplyId(event)))
    .slice(0, limit);

  return hydrateEvents(session, appRelayEntries, myRelayEntries, filteredEvents, {
    hasMore: filteredEvents.length === limit,
  });
}

export async function fetchThreadCollection(
  session: NostrAuthSession,
  appRelayEntries: RelayListEntry[],
  myRelayEntries: RelayListEntry[],
  postId: string,
): Promise<ThreadCollection> {
  const focusedCollection = await fetchNotesByIds(session, appRelayEntries, myRelayEntries, [postId]);
  const focusedPost = focusedCollection.primaryNotes[0] ?? focusedCollection.relatedNotes[0] ?? null;
  if (!focusedPost) {
    return {
      focusedPost: null,
      ancestors: [],
      replies: [],
      rawEvents: [],
      viewerState: {},
      authorPubkeys: [],
    };
  }

  const relayUrls = buildReadRelayUrls(appRelayEntries, myRelayEntries);
  const ancestorIds = unique([focusedPost.rootId, focusedPost.replyTo].filter((value): value is string => Boolean(value)));
  const ancestorCollection =
    ancestorIds.length > 0
      ? await fetchNotesByIds(session, appRelayEntries, myRelayEntries, ancestorIds)
      : {
          primaryNotes: [],
          relatedNotes: [],
          rawEvents: [],
          viewerState: {},
          nextCursor: null,
          hasMore: false,
          authorPubkeys: [],
        };
  const replyEvents = await fetchEventsFromRelays(session, relayUrls, {
    kinds: [NDKKind.Text],
    '#e': [focusedPost.id],
    limit: 100,
  });
  const replyCollection = await hydrateEvents(
    session,
    appRelayEntries,
    myRelayEntries,
    replyEvents.filter((event) => getEventReplyId(event) === focusedPost.id),
    {
      hasMore: false,
      nextCursor: null,
    },
  );
  const ancestors = sortOldest(
    ancestorCollection.primaryNotes.filter((note) => note.id !== focusedPost.id),
  );

  return {
    focusedPost,
    ancestors,
    replies: sortOldest(replyCollection.primaryNotes),
    rawEvents: mergeNotesById([
      ...focusedCollection.primaryNotes,
      ...focusedCollection.relatedNotes,
      ...ancestorCollection.primaryNotes,
      ...ancestorCollection.relatedNotes,
      ...replyCollection.primaryNotes,
      ...replyCollection.relatedNotes,
    ]).map((note) => {
      const rawEvent =
        [...focusedCollection.rawEvents, ...ancestorCollection.rawEvents, ...replyCollection.rawEvents].find(
          (event) => event.id === note.id,
        );
      return rawEvent;
    }).filter((event): event is NostrEvent => Boolean(event)),
    viewerState: {
      ...ancestorCollection.viewerState,
      ...focusedCollection.viewerState,
      ...replyCollection.viewerState,
    },
    authorPubkeys: unique([
      ...focusedCollection.authorPubkeys,
      ...ancestorCollection.authorPubkeys,
      ...replyCollection.authorPubkeys,
    ]),
  };
}

export async function fetchBookmarksCollection(
  session: NostrAuthSession,
  appRelayEntries: RelayListEntry[],
  myRelayEntries: RelayListEntry[],
): Promise<BookmarkCollection> {
  const bookmarkIds = await fetchBookmarkIds(session, appRelayEntries, myRelayEntries);
  if (bookmarkIds.length === 0) {
    return {
      notes: [],
      rawEvents: [],
      viewerState: {},
      authorPubkeys: [],
      bookmarkIds: [],
    };
  }

  const collection = await fetchNotesByIds(session, appRelayEntries, myRelayEntries, bookmarkIds);
  const noteMap = buildNoteMap([...collection.primaryNotes, ...collection.relatedNotes]);
  const notes = bookmarkIds
    .map((id) => noteMap.get(id))
    .filter((note): note is NostrNote => Boolean(note));

  return {
    notes: sortNewest(notes),
    rawEvents: collection.rawEvents,
    viewerState: collection.viewerState,
    authorPubkeys: collection.authorPubkeys,
    bookmarkIds,
  };
}

export async function publishNote(
  session: NostrAuthSession,
  appRelayEntries: RelayListEntry[],
  myRelayEntries: RelayListEntry[],
  content: string,
): Promise<NostrEvent> {
  const relayUrls = buildWriteRelayUrls(appRelayEntries, myRelayEntries);
  const event = await publishEventToRelays(session, relayUrls, {
    kind: NDKKind.Text,
    content: content.trim(),
    tags: [],
  });

  return toRawEvent(event);
}

export async function publishReply(
  session: NostrAuthSession,
  appRelayEntries: RelayListEntry[],
  myRelayEntries: RelayListEntry[],
  parentRawEvent: NostrEvent,
  content: string,
): Promise<NostrEvent> {
  const relayUrls = buildWriteRelayUrls(appRelayEntries, myRelayEntries);
  const ndk = createNdkClient(session, relayUrls);
  await connectNdkClient(ndk);
  const relaySet = createRelaySet(ndk, relayUrls);
  const parentEvent = new NDKEvent(ndk, parentRawEvent);
  const replyEvent = parentEvent.reply();
  replyEvent.content = content.trim();
  await replyEvent.publish(relaySet, 6_000, relayUrls.length > 0 ? 1 : undefined);
  return toRawEvent(replyEvent);
}

export async function publishReaction(
  session: NostrAuthSession,
  appRelayEntries: RelayListEntry[],
  myRelayEntries: RelayListEntry[],
  targetRawEvent: NostrEvent,
): Promise<NostrEvent> {
  const relayUrls = buildWriteRelayUrls(appRelayEntries, myRelayEntries);
  const ndk = createNdkClient(session, relayUrls);
  await connectNdkClient(ndk);
  const relaySet = createRelaySet(ndk, relayUrls);
  const targetEvent = new NDKEvent(ndk, targetRawEvent);
  const reactionEvent = await targetEvent.react('+', false);
  await reactionEvent.publish(relaySet, 6_000, relayUrls.length > 0 ? 1 : undefined);
  return toRawEvent(reactionEvent);
}

export async function publishRepost(
  session: NostrAuthSession,
  appRelayEntries: RelayListEntry[],
  myRelayEntries: RelayListEntry[],
  targetRawEvent: NostrEvent,
): Promise<NostrEvent> {
  const relayUrls = buildWriteRelayUrls(appRelayEntries, myRelayEntries);
  const ndk = createNdkClient(session, relayUrls);
  await connectNdkClient(ndk);
  const relaySet = createRelaySet(ndk, relayUrls);
  const targetEvent = new NDKEvent(ndk, targetRawEvent);
  const repostEvent = await targetEvent.repost(false);
  await repostEvent.publish(relaySet, 6_000, relayUrls.length > 0 ? 1 : undefined);
  return toRawEvent(repostEvent);
}

export async function publishDeletionForEvents(
  session: NostrAuthSession,
  appRelayEntries: RelayListEntry[],
  myRelayEntries: RelayListEntry[],
  eventIds: string[],
): Promise<void> {
  if (eventIds.length === 0) {
    return;
  }

  const relayUrls = buildWriteRelayUrls(appRelayEntries, myRelayEntries);
  await publishEventToRelays(session, relayUrls, {
    kind: NDKKind.EventDeletion,
    content: '',
    tags: unique(eventIds).map((eventId) => ['e', eventId]),
  });
}

export async function publishBookmarkList(
  session: NostrAuthSession,
  appRelayEntries: RelayListEntry[],
  myRelayEntries: RelayListEntry[],
  bookmarkIds: string[],
): Promise<void> {
  const relayUrls = buildWriteRelayUrls(appRelayEntries, myRelayEntries);
  await publishReplaceableEventToRelays(session, relayUrls, {
    kind: NDKKind.BookmarkList,
    content: '',
    tags: unique(bookmarkIds).map((bookmarkId) => ['e', bookmarkId]),
  });
}
