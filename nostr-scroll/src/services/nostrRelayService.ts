import NDK, {
  NDKEvent,
  NDKKind,
  NDKNip07Signer,
  NDKPrivateKeySigner,
  NDKRelayList,
  NDKRelaySet,
  NDKSubscriptionCacheUsage,
} from '@nostr-dev-kit/ndk';
import { DEFAULT_APP_RELAY_URLS } from '../constants/relays';
import type { NostrAuthSession } from '../types/auth';
import type { MyRelayFetchResult, RelayListEntry } from '../types/relays';
import {
  normalizeReadableRelayUrls,
  normalizeRelayListEntries,
  normalizeWritableRelayUrls,
} from '../utils/relayList';

type NostrWindow = Window & {
  nostr?: {
    getRelays?: () => Promise<Record<string, { read?: boolean; write?: boolean }>>;
  };
};

function createNdkClient(session: NostrAuthSession, relayUrls: string[]): NDK {
  const ndk = new NDK({
    explicitRelayUrls: relayUrls,
  });

  if (session.method === 'nsec' && session.privateKeyHex) {
    ndk.signer = new NDKPrivateKeySigner(session.privateKeyHex);
  } else if (session.method === 'nip07') {
    ndk.signer = new NDKNip07Signer(undefined, ndk);
  }

  return ndk;
}

async function connectNdk(ndk: NDK): Promise<void> {
  await ndk.connect(2_500);
}

function relayEntriesFromRelayList(relayList: NDKRelayList | null | undefined): RelayListEntry[] {
  if (!relayList) {
    return [];
  }

  return normalizeRelayListEntries([
    ...relayList.bothRelayUrls.map((url) => ({
      url,
      read: true,
      write: true,
    })),
    ...relayList.readRelayUrls.map((url) => ({
      url,
      read: true,
      write: false,
    })),
    ...relayList.writeRelayUrls.map((url) => ({
      url,
      read: false,
      write: true,
    })),
  ]);
}

export async function fetchPrivateRelayEntries(
  session: NostrAuthSession,
): Promise<RelayListEntry[]> {
  if (session.method !== 'nip07' || typeof window === 'undefined') {
    return [];
  }

  try {
    const relayMap = await (window as NostrWindow).nostr?.getRelays?.();
    if (!relayMap || typeof relayMap !== 'object') {
      return [];
    }

    return normalizeRelayListEntries(
      Object.entries(relayMap).map(([url, permissions]) => ({
        url,
        read: permissions?.read !== false,
        write: permissions?.write !== false,
      })),
    );
  } catch {
    return [];
  }
}

export async function fetchMyRelayEntries(
  session: NostrAuthSession,
  seedRelayEntries: RelayListEntry[] = [],
): Promise<MyRelayFetchResult> {
  if (!session.currentPubkey) {
    return {
      mergedRelayEntries: [],
      privateRelayEntries: [],
      publicRelayEntries: [],
    };
  }

  const privateRelayEntries = await fetchPrivateRelayEntries(session);
  const seedRelayUrls = Array.from(
    new Set([
      ...DEFAULT_APP_RELAY_URLS,
      ...normalizeReadableRelayUrls(seedRelayEntries),
      ...normalizeReadableRelayUrls(privateRelayEntries),
    ]),
  );

  if (seedRelayUrls.length === 0) {
    return {
      mergedRelayEntries: privateRelayEntries,
      privateRelayEntries,
      publicRelayEntries: [],
    };
  }

  const ndk = createNdkClient(session, seedRelayUrls);
  await connectNdk(ndk);
  const relaySet = NDKRelaySet.fromRelayUrls(seedRelayUrls, ndk);
  const relayListEvent = await ndk.fetchEvent(
    {
      authors: [session.currentPubkey],
      kinds: [NDKKind.RelayList],
    },
    {
      cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
    },
    relaySet,
  );

  const publicRelayEntries = relayListEvent
    ? relayEntriesFromRelayList(
        NDKRelayList.from(
          relayListEvent instanceof NDKEvent ? relayListEvent : new NDKEvent(ndk, relayListEvent),
        ),
      )
    : [];

  return {
    mergedRelayEntries: normalizeRelayListEntries([
      ...publicRelayEntries,
      ...privateRelayEntries,
    ]),
    privateRelayEntries,
    publicRelayEntries,
  };
}

export async function publishMyRelayEntries(
  session: NostrAuthSession,
  relayEntries: RelayListEntry[],
  seedRelayEntries: RelayListEntry[] = [],
): Promise<void> {
  if (!session.currentPubkey) {
    throw new Error('Login is required before publishing relays.');
  }

  const normalizedRelayEntries = normalizeRelayListEntries(relayEntries);
  const seedRelayUrls = Array.from(
    new Set([
      ...DEFAULT_APP_RELAY_URLS,
      ...normalizeWritableRelayUrls(seedRelayEntries),
      ...normalizeWritableRelayUrls(normalizedRelayEntries),
    ]),
  );
  if (seedRelayUrls.length === 0) {
    throw new Error('Cannot publish relay list without at least one writable relay.');
  }

  const ndk = createNdkClient(session, seedRelayUrls);
  await connectNdk(ndk);

  if (!ndk.signer) {
    throw new Error('A signer is required to publish relay updates.');
  }

  const relayListEvent = new NDKRelayList(ndk);
  relayListEvent.content = '';
  relayListEvent.tags = [];
  relayListEvent.bothRelayUrls = normalizedRelayEntries
    .filter((relay) => relay.read && relay.write)
    .map((relay) => relay.url);
  relayListEvent.readRelayUrls = normalizedRelayEntries
    .filter((relay) => relay.read && !relay.write)
    .map((relay) => relay.url);
  relayListEvent.writeRelayUrls = normalizedRelayEntries
    .filter((relay) => !relay.read && relay.write)
    .map((relay) => relay.url);

  const relaySet = NDKRelaySet.fromRelayUrls(seedRelayUrls, ndk);
  await relayListEvent.publishReplaceable(relaySet);
}
