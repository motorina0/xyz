import { isValidPubkey, NDKKind } from '@nostr-dev-kit/ndk';
import type { NostrAuthSession } from '../types/auth';
import type { RelayListEntry } from '../types/relays';
import {
  buildReadRelayUrls,
  buildWriteRelayUrls,
  fetchEventsFromRelays,
  publishReplaceableEventToRelays,
} from './nostrClientService';

export interface FollowListSnapshot {
  ownerPubkey: string;
  followedPubkeys: string[];
  tags: string[][];
  content: string;
  createdAt: number | null;
  eventId: string | null;
}

function uniquePubkeys(pubkeys: string[]): string[] {
  return Array.from(new Set(pubkeys));
}

function normalizeFollowedPubkey(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedPubkey = value.trim().toLowerCase();
  return isValidPubkey(normalizedPubkey) ? normalizedPubkey : null;
}

function buildFollowedPubkeys(tags: string[][]): string[] {
  return uniquePubkeys(
    tags
      .filter((tag) => tag[0] === 'p')
      .map((tag) => normalizeFollowedPubkey(tag[1]))
      .filter((pubkey): pubkey is string => Boolean(pubkey))
  );
}

function mapContactsEventToFollowList(
  ownerPubkey: string,
  event: {
    id: string;
    created_at?: number;
    tags: string[][];
    content?: string;
  }
): FollowListSnapshot {
  return {
    ownerPubkey,
    followedPubkeys: buildFollowedPubkeys(event.tags),
    tags: event.tags.map((tag) => [...tag]),
    content: typeof event.content === 'string' ? event.content : '',
    createdAt: typeof event.created_at === 'number' ? event.created_at : null,
    eventId: event.id,
  };
}

function buildFollowListTags(existingTags: string[][], followedPubkeys: string[]): string[][] {
  const normalizedFollowedPubkeys = uniquePubkeys(
    followedPubkeys
      .map((pubkey) => normalizeFollowedPubkey(pubkey))
      .filter((pubkey): pubkey is string => Boolean(pubkey))
  );
  const preservedContactTags = new Map<string, string[]>();
  const nonContactTags: string[][] = [];

  for (const tag of existingTags) {
    if (tag[0] !== 'p') {
      nonContactTags.push([...tag]);
      continue;
    }

    const normalizedPubkey = normalizeFollowedPubkey(tag[1]);
    if (!normalizedPubkey || preservedContactTags.has(normalizedPubkey)) {
      continue;
    }

    preservedContactTags.set(normalizedPubkey, ['p', normalizedPubkey, ...tag.slice(2)]);
  }

  return [
    ...nonContactTags,
    ...normalizedFollowedPubkeys.map((pubkey) => preservedContactTags.get(pubkey) ?? ['p', pubkey]),
  ];
}

export function createEmptyFollowList(ownerPubkey: string): FollowListSnapshot {
  return {
    ownerPubkey,
    followedPubkeys: [],
    tags: [],
    content: '',
    createdAt: null,
    eventId: null,
  };
}

export function appendFollowedPubkey(
  followList: FollowListSnapshot | null,
  ownerPubkey: string,
  targetPubkey: string
): FollowListSnapshot {
  const normalizedTargetPubkey = normalizeFollowedPubkey(targetPubkey);
  if (!normalizedTargetPubkey) {
    throw new Error('Cannot follow an invalid pubkey.');
  }

  const currentFollowList = followList ?? createEmptyFollowList(ownerPubkey);
  const followedPubkeys = uniquePubkeys([
    ...currentFollowList.followedPubkeys,
    normalizedTargetPubkey,
  ]);

  return {
    ...currentFollowList,
    ownerPubkey,
    followedPubkeys,
    tags: buildFollowListTags(currentFollowList.tags, followedPubkeys),
  };
}

export async function fetchFollowList(
  session: NostrAuthSession,
  appRelayEntries: RelayListEntry[],
  myRelayEntries: RelayListEntry[],
  ownerPubkey: string,
  extraReadRelayUrls: string[] = []
): Promise<FollowListSnapshot | null> {
  const normalizedOwnerPubkey = normalizeFollowedPubkey(ownerPubkey);
  if (!normalizedOwnerPubkey) {
    return null;
  }

  const relayUrls = buildReadRelayUrls(appRelayEntries, myRelayEntries, extraReadRelayUrls);
  const contactsEvents = await fetchEventsFromRelays(session, relayUrls, {
    authors: [normalizedOwnerPubkey],
    kinds: [NDKKind.Contacts],
    limit: 12,
  });
  const latestContactsEvent = contactsEvents.find(
    (event) => normalizeFollowedPubkey(event.pubkey) === normalizedOwnerPubkey
  );

  return latestContactsEvent
    ? mapContactsEventToFollowList(normalizedOwnerPubkey, latestContactsEvent)
    : null;
}

export async function publishFollowList(
  session: NostrAuthSession,
  appRelayEntries: RelayListEntry[],
  myRelayEntries: RelayListEntry[],
  followList: FollowListSnapshot
): Promise<FollowListSnapshot> {
  const relayUrls = buildWriteRelayUrls(appRelayEntries, myRelayEntries);
  const publishedEvent = await publishReplaceableEventToRelays(session, relayUrls, {
    kind: NDKKind.Contacts,
    content: followList.content,
    tags: followList.tags,
  });

  return mapContactsEventToFollowList(followList.ownerPubkey, publishedEvent.rawEvent());
}
