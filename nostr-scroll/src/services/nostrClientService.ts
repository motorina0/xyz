import NDK, {
  NDKEvent,
  NDKNip07Signer,
  NDKPrivateKeySigner,
  NDKRelaySet,
  type NDKFilter,
  type NostrEvent,
} from '@nostr-dev-kit/ndk';
import { DEFAULT_APP_RELAY_URLS } from '../constants/relays';
import type { NostrAuthSession } from '../types/auth';
import type { RelayListEntry } from '../types/relays';
import { normalizeReadableRelayUrls, normalizeWritableRelayUrls } from '../utils/relayList';

const NOSTR_WIRE_LOG_PREFIX = '[nostr-scroll:nostr-wire]';

function uniqueRelayUrls(relayUrls: string[]): string[] {
  return Array.from(new Set(relayUrls));
}

function parseWireFrame(message: string): unknown[] | null {
  try {
    const parsed = JSON.parse(message);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function logRelayTraffic(message: string, relayUrl: string, direction?: 'send' | 'recv'): void {
  const frame = parseWireFrame(message);
  if (!frame) {
    return;
  }

  const [command] = frame;
  if (direction === 'send' && command === 'REQ') {
    console.info(NOSTR_WIRE_LOG_PREFIX, 'REQ', relayUrl, message, frame);
    return;
  }

  if (direction === 'recv' && command === 'EVENT') {
    console.info(NOSTR_WIRE_LOG_PREFIX, 'EVENT', relayUrl, message, frame);
  }
}

export function buildReadRelayUrls(
  appRelayEntries: RelayListEntry[] = [],
  myRelayEntries: RelayListEntry[] = [],
  relayHints: string[] = [],
): string[] {
  return uniqueRelayUrls([
    ...relayHints,
    ...normalizeReadableRelayUrls(myRelayEntries),
    ...normalizeReadableRelayUrls(appRelayEntries),
    ...DEFAULT_APP_RELAY_URLS,
  ]);
}

export function buildWriteRelayUrls(
  appRelayEntries: RelayListEntry[] = [],
  myRelayEntries: RelayListEntry[] = [],
  relayHints: string[] = [],
): string[] {
  return uniqueRelayUrls([
    ...relayHints,
    ...normalizeWritableRelayUrls(myRelayEntries),
    ...normalizeWritableRelayUrls(appRelayEntries),
    ...DEFAULT_APP_RELAY_URLS,
  ]);
}

export function createNdkClient(session: NostrAuthSession, relayUrls: string[]): NDK {
  const ndk = new NDK({
    autoConnectUserRelays: false,
    enableOutboxModel: false,
    explicitRelayUrls: relayUrls,
    netDebug: (message, relay, direction) => {
      if (typeof message === 'string') {
        logRelayTraffic(message, relay.url, direction);
      }
    },
  });

  if (session.method === 'nsec' && session.privateKeyHex) {
    ndk.signer = new NDKPrivateKeySigner(session.privateKeyHex);
  } else if (session.method === 'nip07') {
    ndk.signer = new NDKNip07Signer(undefined, ndk);
  }

  return ndk;
}

export async function connectNdkClient(ndk: NDK): Promise<void> {
  await ndk.connect(4_000);
}

export function createRelaySet(ndk: NDK, relayUrls: string[]): NDKRelaySet | undefined {
  if (relayUrls.length === 0) {
    return undefined;
  }

  return NDKRelaySet.fromRelayUrls(relayUrls, ndk);
}

export async function fetchEventsFromRelays(
  session: NostrAuthSession,
  relayUrls: string[],
  filters: NDKFilter | NDKFilter[],
): Promise<NDKEvent[]> {
  const ndk = createNdkClient(session, relayUrls);
  await connectNdkClient(ndk);
  const relaySet = createRelaySet(ndk, relayUrls);
  const events = await ndk.fetchEvents(filters, undefined, relaySet);

  return Array.from(events).sort(
    (first, second) => (second.created_at ?? 0) - (first.created_at ?? 0),
  );
}

export async function fetchEventFromRelays(
  session: NostrAuthSession,
  relayUrls: string[],
  idOrFilter: string | NDKFilter | NDKFilter[],
): Promise<NDKEvent | null> {
  const ndk = createNdkClient(session, relayUrls);
  await connectNdkClient(ndk);
  const relaySet = createRelaySet(ndk, relayUrls);
  return ndk.fetchEvent(idOrFilter, undefined, relaySet);
}

export async function publishEventToRelays(
  session: NostrAuthSession,
  relayUrls: string[],
  rawEvent: Partial<NostrEvent> & Pick<NostrEvent, 'kind' | 'content' | 'tags'>,
): Promise<NDKEvent> {
  const ndk = createNdkClient(session, relayUrls);
  await connectNdkClient(ndk);
  const relaySet = createRelaySet(ndk, relayUrls);
  const event = new NDKEvent(ndk);
  event.kind = rawEvent.kind;
  event.content = rawEvent.content;
  event.tags = rawEvent.tags;
  await event.publish(
    relaySet,
    6_000,
    relayUrls.length > 0 ? 1 : undefined,
  );
  return event;
}

export async function publishReplaceableEventToRelays(
  session: NostrAuthSession,
  relayUrls: string[],
  rawEvent: Partial<NostrEvent> & Pick<NostrEvent, 'kind' | 'content' | 'tags'>,
): Promise<NDKEvent> {
  const ndk = createNdkClient(session, relayUrls);
  await connectNdkClient(ndk);
  const relaySet = createRelaySet(ndk, relayUrls);
  const event = new NDKEvent(ndk);
  event.kind = rawEvent.kind;
  event.content = rawEvent.content;
  event.tags = rawEvent.tags;
  await event.publishReplaceable(relaySet, 6_000, relayUrls.length > 0 ? 1 : undefined);
  return event;
}

export function toRawEvent(event: NDKEvent): NostrEvent {
  return event.rawEvent() as NostrEvent;
}
