import NDK, {
  type NDKCountOptions,
  NDKEvent,
  type NDKFilter,
  NDKNip07Signer,
  NDKPrivateKeySigner,
  NDKRelaySet,
  type NDKSubscriptionOptions,
  type NostrEvent,
} from '@nostr-dev-kit/ndk';
import { DEFAULT_APP_RELAY_URLS } from '../constants/relays';
import type { NostrAuthSession } from '../types/auth';
import type { RelayListEntry } from '../types/relays';
import { normalizeReadableRelayUrls, normalizeWritableRelayUrls } from '../utils/relayList';

const NOSTR_WIRE_LOG_PREFIX = '[nostr-scroll:nostr-wire]';
let reqSubscriptionCounter = 0;
let countRequestCounter = 0;

function uniqueRelayUrls(relayUrls: string[]): string[] {
  return Array.from(new Set(relayUrls));
}

function normalizeReqFilters(filters: NDKFilter | NDKFilter[]): NDKFilter[] {
  return (Array.isArray(filters) ? filters : [filters]).map(
    (filter) => JSON.parse(JSON.stringify(filter)) as NDKFilter
  );
}

function buildReqFrame(subId: string, filters: NDKFilter | NDKFilter[]): unknown[] {
  return ['REQ', subId, ...normalizeReqFilters(filters)];
}

function buildCountFrame(countId: string, filters: NDKFilter | NDKFilter[]): unknown[] {
  return ['COUNT', countId, ...normalizeReqFilters(filters)];
}

function createReqSubId(label: string): string {
  reqSubscriptionCounter += 1;
  const normalizedLabel =
    label
      .trim()
      .replace(/[^a-z0-9-]+/gi, '-')
      .replace(/^-+|-+$/g, '') || 'req';

  return `${normalizedLabel}-${reqSubscriptionCounter.toString(36)}`;
}

function createCountId(label: string): string {
  countRequestCounter += 1;
  const normalizedLabel =
    label
      .trim()
      .replace(/[^a-z0-9-]+/gi, '-')
      .replace(/^-+|-+$/g, '') || 'count';

  return `${normalizedLabel}-${countRequestCounter.toString(36)}`;
}

function logReqFrame(relayUrls: string[], subId: string, filters: NDKFilter | NDKFilter[]): void {
  const normalizedRelayUrls = uniqueRelayUrls(
    relayUrls.map((relayUrl) => relayUrl.trim()).filter((relayUrl) => relayUrl.length > 0)
  );
  if (normalizedRelayUrls.length === 0) {
    return;
  }

  const reqFrame = buildReqFrame(subId, filters);
  console.info(
    NOSTR_WIRE_LOG_PREFIX,
    'REQ',
    normalizedRelayUrls,
    JSON.stringify(reqFrame),
    reqFrame
  );
}

function logCountFrame(
  relayUrls: string[],
  countId: string,
  filters: NDKFilter | NDKFilter[]
): void {
  const normalizedRelayUrls = uniqueRelayUrls(
    relayUrls.map((relayUrl) => relayUrl.trim()).filter((relayUrl) => relayUrl.length > 0)
  );
  if (normalizedRelayUrls.length === 0) {
    return;
  }

  const countFrame = buildCountFrame(countId, filters);
  console.info(
    NOSTR_WIRE_LOG_PREFIX,
    'COUNT',
    normalizedRelayUrls,
    JSON.stringify(countFrame),
    countFrame
  );
}

function toReqFilters(idOrFilter: string | NDKFilter | NDKFilter[]): NDKFilter | NDKFilter[] {
  if (typeof idOrFilter === 'string') {
    return { ids: [idOrFilter] };
  }

  return idOrFilter;
}

function sortEventsNewest(events: NDKEvent[]): NDKEvent[] {
  return [...events].sort((first, second) => (second.created_at ?? 0) - (first.created_at ?? 0));
}

export interface StreamEventsFromRelaysOptions {
  batchSize?: number;
  onBatch: (events: NDKEvent[]) => Promise<void> | void;
  subscriptionOptions?: NDKSubscriptionOptions;
}

export function createLoggedReqSubscriptionOptions(
  label: string,
  relayUrls: string[],
  filters: NDKFilter | NDKFilter[],
  options: NDKSubscriptionOptions = {}
): NDKSubscriptionOptions {
  const subId = options.subId ?? createReqSubId(label);
  logReqFrame(relayUrls, subId, filters);

  return {
    ...options,
    subId,
  };
}

export function createLoggedCountOptions(
  label: string,
  relayUrls: string[],
  filters: NDKFilter | NDKFilter[],
  options: NDKCountOptions = {}
): NDKCountOptions {
  const id = options.id ?? createCountId(label);
  logCountFrame(relayUrls, id, filters);

  return {
    ...options,
    id,
  };
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
  if (direction !== 'recv') {
    return;
  }

  const frame = parseWireFrame(message);
  if (!frame) {
    return;
  }

  const [command] = frame;
  if (command === 'EVENT') {
    console.info(NOSTR_WIRE_LOG_PREFIX, 'EVENT', relayUrl, message, frame);
    return;
  }

  if (command === 'COUNT') {
    console.info(NOSTR_WIRE_LOG_PREFIX, 'COUNT', relayUrl, message, frame);
  }
}

export function buildReadRelayUrls(
  appRelayEntries: RelayListEntry[] = [],
  myRelayEntries: RelayListEntry[] = [],
  relayHints: string[] = []
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
  relayHints: string[] = []
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
  filters: NDKFilter | NDKFilter[]
): Promise<NDKEvent[]> {
  const ndk = createNdkClient(session, relayUrls);
  await connectNdkClient(ndk);
  const relaySet = createRelaySet(ndk, relayUrls);
  const events = await ndk.fetchEvents(
    filters,
    createLoggedReqSubscriptionOptions('fetch-events', relayUrls, filters),
    relaySet
  );

  return sortEventsNewest(Array.from(events));
}

export async function streamEventsFromRelays(
  session: NostrAuthSession,
  relayUrls: string[],
  filters: NDKFilter | NDKFilter[],
  label: string,
  options: StreamEventsFromRelaysOptions
): Promise<void> {
  const ndk = createNdkClient(session, relayUrls);
  await connectNdkClient(ndk);
  const relaySet = createRelaySet(ndk, relayUrls);
  const batchSize = Math.max(1, Math.trunc(options.batchSize ?? 5));

  await new Promise<void>((resolve, reject) => {
    const bufferedEvents: NDKEvent[] = [];
    let subscription: ReturnType<NDK['subscribe']> | null = null;
    let processingQueue = Promise.resolve();
    let didFinish = false;

    const finish = (error?: unknown): void => {
      if (didFinish) {
        return;
      }

      didFinish = true;
      if (subscription) {
        subscription.stop();
        subscription = null;
      }

      if (error) {
        reject(error);
        return;
      }

      resolve();
    };

    const queueBatchProcessing = (flush = false): void => {
      processingQueue = processingQueue
        .then(async () => {
          while (
            (flush ? bufferedEvents.length > 0 : bufferedEvents.length >= batchSize) &&
            !didFinish
          ) {
            const currentBatchSize = flush ? Math.min(batchSize, bufferedEvents.length) : batchSize;
            const nextBatch = bufferedEvents.splice(0, currentBatchSize);
            await options.onBatch(sortEventsNewest(nextBatch));
          }
        })
        .catch((error) => {
          finish(error);
        });
    };

    subscription = ndk.subscribe(
      filters,
      createLoggedReqSubscriptionOptions(label, relayUrls, filters, {
        ...(options.subscriptionOptions ?? {}),
        closeOnEose: true,
        relaySet,
        onEvent: (event) => {
          if (didFinish) {
            return;
          }

          const wrappedEvent = event instanceof NDKEvent ? event : new NDKEvent(ndk, event);
          bufferedEvents.push(wrappedEvent);
          queueBatchProcessing(false);
        },
        onEose: () => {
          queueBatchProcessing(true);
          void processingQueue
            .then(() => {
              finish();
            })
            .catch((error) => {
              finish(error);
            });
        },
      })
    );
  });
}

export async function fetchEventFromRelays(
  session: NostrAuthSession,
  relayUrls: string[],
  idOrFilter: string | NDKFilter | NDKFilter[],
  options?: NDKSubscriptionOptions
): Promise<NDKEvent | null> {
  const ndk = createNdkClient(session, relayUrls);
  await connectNdkClient(ndk);
  const relaySet = createRelaySet(ndk, relayUrls);
  return ndk.fetchEvent(
    idOrFilter,
    createLoggedReqSubscriptionOptions('fetch-event', relayUrls, toReqFilters(idOrFilter), options),
    relaySet
  );
}

export async function publishEventToRelays(
  session: NostrAuthSession,
  relayUrls: string[],
  rawEvent: Partial<NostrEvent> & Pick<NostrEvent, 'kind' | 'content' | 'tags'>
): Promise<NDKEvent> {
  const ndk = createNdkClient(session, relayUrls);
  await connectNdkClient(ndk);
  const relaySet = createRelaySet(ndk, relayUrls);
  const event = new NDKEvent(ndk);
  event.kind = rawEvent.kind;
  event.content = rawEvent.content;
  event.tags = rawEvent.tags;
  await event.publish(relaySet, 6_000, relayUrls.length > 0 ? 1 : undefined);
  return event;
}

export async function publishReplaceableEventToRelays(
  session: NostrAuthSession,
  relayUrls: string[],
  rawEvent: Partial<NostrEvent> & Pick<NostrEvent, 'kind' | 'content' | 'tags'>
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
