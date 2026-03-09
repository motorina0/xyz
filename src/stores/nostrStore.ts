import { defineStore } from 'pinia';
import { ref } from 'vue';
import NDK, {
  NDKEvent,
  NDKKind,
  NDKNip07Signer,
  NDKPublishError,
  NDKPrivateKeySigner,
  NDKRelayList,
  NDKSubscriptionCacheUsage,
  type NDKSigner,
  type NDKUserProfile,
  type NDKRelayInformation,
  NDKRelayStatus,
  NDKRelaySet,
  NDKUser,
  giftUnwrap,
  giftWrap,
  getRelayListForUser,
  isValidNip05,
  isValidPubkey,
  nip19,
  normalizeRelayUrl,
  type NostrEvent
} from '@nostr-dev-kit/ndk';
import { chatDataService } from 'src/services/chatDataService';
import { contactsService } from 'src/services/contactsService';
import { imageCacheService } from 'src/services/imageCacheService';
import { nostrEventDataService } from 'src/services/nostrEventDataService';
import {
  inputSanitizerService,
  type NpubValidationResult,
  type NsecValidationResult
} from 'src/services/inputSanitizerService';
import { useChatStore } from 'src/stores/chatStore';
import { useNip65RelayStore } from 'src/stores/nip65RelayStore';
import type { MessageRelayStatus, NostrEventDirection } from 'src/types/chat';
import type { ContactMetadata, ContactRecord, ContactRelay } from 'src/types/contact';
import { clearDarkModePreference } from 'src/utils/themeStorage';

export interface NostrIdentifierResolutionResult {
  isValid: boolean;
  normalizedPubkey: string | null;
  resolvedName: string | null;
  relays: string[];
  identifierType: 'pubkey' | 'nip05' | null;
  error: 'invalid' | 'nip05_unresolved' | null;
}

export type NostrNpubValidationResult = NpubValidationResult;
export type NostrNsecValidationResult = NsecValidationResult;

export interface NostrNip05DataResult {
  isValid: boolean;
  normalizedPubkey: string | null;
  name: string | null;
  relays: string[];
  error: 'invalid' | 'nip05_unresolved' | null;
}

export type RelayConnectionState = 'connected' | 'issue';

export interface PublishUserMetadataInput {
  [key: string]: unknown;
  name?: string;
  about?: string;
  picture?: string;
  display_name?: string;
  website?: string;
  banner?: string;
  bot?: boolean;
  birthday?: {
    year?: number;
    month?: number;
    day?: number;
  };
}

export interface RelayListMetadataEntry {
  url: string;
  read?: boolean;
  write?: boolean;
}

export type AuthMethod = 'nsec' | 'nip07';

interface SendDirectMessageOptions {
  localMessageId?: number;
  createdAt?: string;
}

interface RelayPublishStatusesResult {
  relayStatuses: MessageRelayStatus[];
  error: Error | null;
}

interface SubscribePrivateMessagesOptions {
  restoreThrottleMs?: number;
}

interface QueuePrivateMessageUiRefreshOptions {
  throttleMs?: number;
  reloadChats?: boolean;
  reloadMessages?: boolean;
}

const PRIVATE_KEY_STORAGE_KEY = 'nsec';
const PUBLIC_KEY_STORAGE_KEY = 'npub';
const AUTH_METHOD_STORAGE_KEY = 'auth-method';
const EVENT_SINCE_STORAGE_KEY = 'nostr-event-since';
const RELAY_STORAGE_KEYS = ['relays', 'nip65_relays'] as const;
const PRIVATE_CONTACT_LIST_D_TAG = 'xyz:contacts';
const PRIVATE_CONTACT_LIST_TITLE = 'Contacts';
const PRIVATE_MESSAGES_STARTUP_RESTORE_THROTTLE_MS = 2000;
const DEFAULT_EVENT_SINCE_LOOKBACK_SECONDS = 90 * 24 * 60 * 60;
const EVENT_FILTER_LOOKBACK_SECONDS = 24 * 60 * 60;
let temp_counter = 0;

function hasStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export const useNostrStore = defineStore('nostrStore', () => {
  const ndk = new NDK();
  const chatStore = useChatStore();
  const INITIAL_CONNECT_TIMEOUT_MS = 3000;
  const relayStatusVersion = ref(0);
  const contactListVersion = ref(0);
  const isRestoringStartupState = ref(false);
  const eventSince = ref(0);
  let cachedSigner: NDKSigner | null = null;
  let cachedSignerSessionKey: string | null = null;
  const configuredRelayUrls = new Set<string>();
  let connectPromise: Promise<void> | null = null;
  let hasActivatedPool = false;
  let hasRelayStatusListeners = false;
  let restoreStartupStatePromise: Promise<void> | null = null;
  let restoreMyRelayListPromise: Promise<void> | null = null;
  let syncLoggedInContactProfilePromise: Promise<void> | null = null;
  let restorePrivateContactListPromise: Promise<void> | null = null;
  let syncRecentChatContactsPromise: Promise<void> | null = null;
  let myRelayListSubscription: ReturnType<typeof ndk.subscribe> | null = null;
  let myRelayListSubscriptionSignature = '';
  let myRelayListApplyQueue = Promise.resolve();
  let privateContactListSubscription: ReturnType<typeof ndk.subscribe> | null = null;
  let privateContactListSubscriptionSignature = '';
  let privateContactListApplyQueue = Promise.resolve();
  let lastPrivateContactListCreatedAt = 0;
  let lastPrivateContactListEventId = '';
  let privateMessagesSubscription: ReturnType<typeof ndk.subscribe> | null = null;
  let privateMessagesSubscriptionSignature = '';
  let privateMessagesIngestQueue = Promise.resolve();
  let privateMessagesRestoreThrottleMs = 0;
  let privateMessagesUiRefreshQueue = Promise.resolve();
  let privateMessagesUiRefreshTimeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
  let shouldReloadChatsOnPrivateMessagesUiRefresh = false;
  let shouldReloadMessagesOnPrivateMessagesUiRefresh = false;
  let pendingEventSinceUpdate = 0;

  function normalizeThrottleMs(value: number | undefined): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      return 0;
    }

    return Math.floor(value);
  }

  function getDefaultEventSince(): number {
    return Math.max(0, Math.floor(Date.now() / 1000) - DEFAULT_EVENT_SINCE_LOOKBACK_SECONDS);
  }

  function setStoredEventSince(value: number): number {
    const normalizedValue =
      Number.isInteger(value) && Number(value) > 0 ? Math.floor(Number(value)) : getDefaultEventSince();
    eventSince.value = normalizedValue;

    if (hasStorage()) {
      window.localStorage.setItem(EVENT_SINCE_STORAGE_KEY, String(normalizedValue));
    }

    return normalizedValue;
  }

  function ensureStoredEventSince(): number {
    if (eventSince.value > 0) {
      return eventSince.value;
    }

    if (hasStorage()) {
      const storedValue = Number.parseInt(
        window.localStorage.getItem(EVENT_SINCE_STORAGE_KEY) ?? '',
        10
      );
      if (Number.isInteger(storedValue) && storedValue > 0) {
        eventSince.value = storedValue;
        return storedValue;
      }
    }

    const defaultSince = getDefaultEventSince();
    eventSince.value = defaultSince;
    return defaultSince;
  }

  function getFilterSince(): number {
    return Math.max(0, ensureStoredEventSince() - EVENT_FILTER_LOOKBACK_SECONDS);
  }

  function updateStoredEventSinceFromCreatedAt(value: unknown): void {
    const createdAt = Number(value);
    if (!Number.isInteger(createdAt) || createdAt <= 0) {
      return;
    }

    if (createdAt <= ensureStoredEventSince()) {
      return;
    }

    if (isRestoringStartupState.value) {
      pendingEventSinceUpdate = Math.max(pendingEventSinceUpdate, createdAt);
      return;
    }

    setStoredEventSince(createdAt);
  }

  function flushPendingEventSinceUpdate(): void {
    const nextSince = Math.max(ensureStoredEventSince(), pendingEventSinceUpdate);
    pendingEventSinceUpdate = 0;
    setStoredEventSince(nextSince);
  }

  function resetEventSinceForFreshLogin(): void {
    eventSince.value = getDefaultEventSince();
    pendingEventSinceUpdate = 0;

    if (hasStorage()) {
      window.localStorage.removeItem(EVENT_SINCE_STORAGE_KEY);
    }
  }

  async function flushPrivateMessagesUiRefresh(): Promise<void> {
    const shouldReloadChats = shouldReloadChatsOnPrivateMessagesUiRefresh;
    const shouldReloadMessages = shouldReloadMessagesOnPrivateMessagesUiRefresh;
    shouldReloadChatsOnPrivateMessagesUiRefresh = false;
    shouldReloadMessagesOnPrivateMessagesUiRefresh = false;

    if (!shouldReloadChats && !shouldReloadMessages) {
      return;
    }

    try {
      const tasks: Promise<unknown>[] = [];

      if (shouldReloadChats) {
        tasks.push(chatStore.reload());
      }

      if (shouldReloadMessages) {
        const { useMessageStore } = await import('src/stores/messageStore');
        tasks.push(useMessageStore().reloadLoadedMessages());
      }

      await Promise.all(tasks);
    } catch (error) {
      console.error('Failed to flush private message UI refresh', error);
    }
  }

  function queuePrivateMessagesUiRefresh(options: QueuePrivateMessageUiRefreshOptions = {}): void {
    if (options.reloadChats) {
      shouldReloadChatsOnPrivateMessagesUiRefresh = true;
    }

    if (options.reloadMessages) {
      shouldReloadMessagesOnPrivateMessagesUiRefresh = true;
    }

    const throttleMs = normalizeThrottleMs(options.throttleMs);
    if (throttleMs <= 0) {
      privateMessagesUiRefreshQueue = privateMessagesUiRefreshQueue.then(() =>
        flushPrivateMessagesUiRefresh()
      );
      return;
    }

    if (privateMessagesUiRefreshTimeoutId !== null) {
      return;
    }

    privateMessagesUiRefreshTimeoutId = globalThis.setTimeout(() => {
      privateMessagesUiRefreshTimeoutId = null;
      privateMessagesUiRefreshQueue = privateMessagesUiRefreshQueue.then(() =>
        flushPrivateMessagesUiRefresh()
      );
    }, throttleMs);
  }

  function flushPrivateMessagesUiRefreshNow(): void {
    if (privateMessagesUiRefreshTimeoutId !== null) {
      globalThis.clearTimeout(privateMessagesUiRefreshTimeoutId);
      privateMessagesUiRefreshTimeoutId = null;
    }

    privateMessagesUiRefreshQueue = privateMessagesUiRefreshQueue.then(() =>
      flushPrivateMessagesUiRefresh()
    );
  }

  async function restoreStartupState(seedRelayUrls: string[] = []): Promise<void> {
    if (restoreStartupStatePromise) {
      return restoreStartupStatePromise;
    }

    ensureStoredEventSince();

    const runStartupTask = async (
      errorMessage: string,
      task: () => Promise<void>
    ): Promise<void> => {
      try {
        await task();
      } catch (error) {
        console.error(errorMessage, error);
      }
    };

    isRestoringStartupState.value = true;
    restoreStartupStatePromise = (async () => {
      try {
        await runStartupTask('Failed to sync logged-in contact on startup', () =>
          syncLoggedInContactProfile(seedRelayUrls)
        );
        await runStartupTask('Failed to restore My Relays on startup', () =>
          restoreMyRelayList(seedRelayUrls)
        );
        await runStartupTask('Failed to subscribe to My Relays updates on startup', () =>
          subscribeMyRelayListUpdates(seedRelayUrls)
        );
        await runStartupTask('Failed to restore private contact list on startup', () =>
          restorePrivateContactList(seedRelayUrls)
        );
        await runStartupTask('Failed to subscribe to private contact list updates on startup', () =>
          subscribePrivateContactListUpdates(seedRelayUrls)
        );
        await runStartupTask('Failed to subscribe to private messages on startup', () =>
          subscribePrivateMessagesForLoggedInUser()
        );
        await runStartupTask('Failed to sync recent chat contacts on startup', () =>
          syncRecentChatContacts(seedRelayUrls, 10)
        );
      } finally {
        isRestoringStartupState.value = false;
        flushPendingEventSinceUpdate();
        restoreStartupStatePromise = null;
      }
    })();

    return restoreStartupStatePromise;
  }

  function getStoredAuthMethod(): AuthMethod | null {
    if (!hasStorage()) {
      return null;
    }

    const stored = window.localStorage.getItem(AUTH_METHOD_STORAGE_KEY)?.trim().toLowerCase();
    if (stored === 'nsec' || stored === 'nip07') {
      return stored;
    }

    return getPrivateKeyHex() ? 'nsec' : null;
  }

  function getLoggedInPublicKeyHex(): string | null {
    if (!hasStorage()) {
      return null;
    }

    const stored = window.localStorage.getItem(PUBLIC_KEY_STORAGE_KEY)?.trim();
    if (!stored) {
      return null;
    }

    const fromHex = inputSanitizerService.normalizeHexKey(stored);
    if (fromHex) {
      return fromHex;
    }

    return validateNpub(stored).normalizedPubkey;
  }

  function hasNip07Extension(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof window.nostr?.getPublicKey === 'function' &&
      typeof window.nostr?.signEvent === 'function'
    );
  }

  function encodeNpub(pubkeyHex: string): string | null {
    try {
      return nip19.npubEncode(pubkeyHex);
    } catch {
      return null;
    }
  }

  function encodeNprofile(pubkeyHex: string): string | null {
    try {
      return nip19.nprofileEncode({
        pubkey: pubkeyHex
      });
    } catch {
      return null;
    }
  }

  function relaySignature(relays: string[]): string {
    return [...relays].sort((a, b) => a.localeCompare(b)).join('|');
  }

  function bumpContactListVersion(): void {
    contactListVersion.value += 1;
  }

  function toIsoTimestampFromUnix(value: number | undefined): string {
    if (!Number.isInteger(value) || Number(value) <= 0) {
      return new Date().toISOString();
    }

    return new Date(Number(value) * 1000).toISOString();
  }

  function toUnixTimestamp(value: string | undefined): number {
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) {
        return Math.floor(parsed / 1000);
      }
    }

    return Math.floor(Date.now() / 1000);
  }

  function deriveChatName(contact: ContactRecord | null, publicKey: string): string {
    const displayName = contact?.meta.display_name?.trim() ?? '';
    if (displayName) {
      return displayName;
    }

    const profileName = contact?.meta.name?.trim() ?? '';
    if (profileName) {
      return profileName;
    }

    const contactName = contact?.name?.trim() ?? '';
    if (contactName) {
      return contactName;
    }

    return publicKey.slice(0, 16);
  }

  function createDirectMessageRumorEvent(
    senderPubkey: string,
    recipientPubkey: string,
    message: string,
    createdAt: number
  ): NDKEvent {
    return new NDKEvent(ndk, {
      kind: NDKKind.PrivateDirectMessage,
      created_at: createdAt,
      pubkey: senderPubkey,
      content: message,
      tags: [['p', recipientPubkey]]
    });
  }

  function createStoredDirectMessageRumorEvent(event: NostrEvent): NDKEvent | null {
    const pubkey = inputSanitizerService.normalizeHexKey(event.pubkey);
    if (!pubkey) {
      return null;
    }

    const tags = Array.isArray(event.tags)
      ? event.tags
          .filter((tag): tag is string[] => Array.isArray(tag))
          .map((tag) => tag.map((entry) => String(entry)))
      : [];

    return new NDKEvent(ndk, {
      kind: typeof event.kind === 'number' ? event.kind : NDKKind.PrivateDirectMessage,
      created_at: event.created_at,
      pubkey,
      content: event.content,
      tags,
      ...(event.id?.trim() ? { id: event.id.trim() } : {})
    });
  }

  function readDirectMessageRecipientPubkey(event: NostrEvent): string | null {
    if (!Array.isArray(event.tags)) {
      return null;
    }

    for (const tag of event.tags) {
      if (!Array.isArray(tag) || tag[0] !== 'p') {
        continue;
      }

      const recipientPubkey = inputSanitizerService.normalizeHexKey(tag[1] ?? '');
      if (recipientPubkey) {
        return recipientPubkey;
      }
    }

    return null;
  }

  function normalizeRelayStatusUrl(value: string): string | null {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    try {
      return normalizeRelayUrl(normalized);
    } catch {
      return normalized;
    }
  }

  function normalizeRelayStatusUrls(relayUrls: string[]): string[] {
    const uniqueRelayUrls = new Set<string>();
    for (const relayUrl of relayUrls) {
      const normalizedRelayUrl = normalizeRelayStatusUrl(relayUrl);
      if (normalizedRelayUrl) {
        uniqueRelayUrls.add(normalizedRelayUrl);
      }
    }

    return Array.from(uniqueRelayUrls);
  }

  function normalizeEventId(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim().toLowerCase();
    return trimmed || null;
  }

  async function toStoredNostrEvent(event: NDKEvent): Promise<NostrEvent | null> {
    try {
      const nostrEvent = await event.toNostrEvent();
      const eventId = normalizeEventId(nostrEvent.id ?? event.id);
      if (!eventId) {
        return null;
      }

      return {
        ...nostrEvent,
        id: eventId
      };
    } catch {
      const eventId = normalizeEventId(event.id);
      const pubkey = typeof event.pubkey === 'string' ? event.pubkey.trim() : '';
      if (!eventId || !pubkey) {
        return null;
      }

      const tags = Array.isArray(event.tags)
        ? event.tags
            .filter((tag): tag is string[] => Array.isArray(tag))
            .map((tag) => tag.map((entry) => String(entry)))
        : [];

      return {
        created_at: Number.isInteger(event.created_at)
          ? event.created_at
          : Math.floor(Date.now() / 1000),
        content: typeof event.content === 'string' ? event.content : '',
        tags,
        pubkey,
        id: eventId,
        ...(typeof event.kind === 'number' ? { kind: event.kind } : {})
      };
    }
  }

  async function refreshMessageInLiveState(messageId: number): Promise<void> {
    try {
      const { useMessageStore } = await import('src/stores/messageStore');
      await useMessageStore().refreshPersistedMessage(messageId);
    } catch (error) {
      console.error('Failed to sync persisted message into live state', error);
    }
  }

  async function appendRelayStatusesToMessageEvent(
    messageId: number,
    relayStatuses: MessageRelayStatus[],
    options: {
      event?: NostrEvent;
      direction?: NostrEventDirection;
      eventId?: string;
      uiThrottleMs?: number;
    } = {}
  ): Promise<void> {
    if (!Number.isInteger(messageId) || messageId <= 0 || relayStatuses.length === 0) {
      return;
    }

    const currentMessage = await chatDataService.getMessageById(messageId);
    if (!currentMessage) {
      return;
    }

    const normalizedEventId = normalizeEventId(
      options.eventId ?? options.event?.id ?? currentMessage.event_id
    );
    if (!normalizedEventId) {
      return;
    }

    if (currentMessage.event_id !== normalizedEventId) {
      await chatDataService.updateMessageEventId(currentMessage.id, normalizedEventId);
    }

    await nostrEventDataService.appendRelayStatuses(normalizedEventId, relayStatuses, {
      event: options.event
        ? {
            ...options.event,
            id: normalizedEventId
          }
        : undefined,
      direction: options.direction
    });

    const uiThrottleMs = normalizeThrottleMs(options.uiThrottleMs);
    if (uiThrottleMs > 0) {
      queuePrivateMessagesUiRefresh({
        throttleMs: uiThrottleMs,
        reloadMessages: true
      });
      return;
    }

    await refreshMessageInLiveState(currentMessage.id);
  }

  function buildInboundRelayStatuses(relayUrls: string[]): MessageRelayStatus[] {
    const updatedAt = new Date().toISOString();

    return normalizeRelayStatusUrls(relayUrls).map((relayUrl) => ({
      relay_url: relayUrl,
      direction: 'inbound',
      status: 'received',
      scope: 'subscription',
      updated_at: updatedAt
    }));
  }

  function buildOutboundRelayStatuses(
    relayUrls: string[],
    publishedRelayUrls: Set<string>,
    errorsByRelayUrl: Map<string, string>,
    scope: 'recipient' | 'self'
  ): MessageRelayStatus[] {
    const updatedAt = new Date().toISOString();

    return normalizeRelayStatusUrls(relayUrls).map((relayUrl) => {
      const isPublished = publishedRelayUrls.has(relayUrl);
      const detail = isPublished
        ? undefined
        : errorsByRelayUrl.get(relayUrl) ?? 'Relay did not acknowledge publish.';

      return {
        relay_url: relayUrl,
        direction: 'outbound',
        status: isPublished ? 'published' : 'failed',
        scope,
        updated_at: updatedAt,
        ...(detail ? { detail } : {})
      };
    });
  }

  function buildPendingOutboundRelayStatuses(
    relayUrls: string[],
    scope: 'recipient' | 'self'
  ): MessageRelayStatus[] {
    const updatedAt = new Date().toISOString();

    return normalizeRelayStatusUrls(relayUrls).map((relayUrl) => ({
      relay_url: relayUrl,
      direction: 'outbound',
      status: 'pending',
      scope,
      updated_at: updatedAt
    }));
  }

  function extractRelayUrlsFromEvent(event: NDKEvent): string[] {
    return normalizeRelayStatusUrls([
      event.relay?.url ?? '',
      ...event.onRelays.map((relay) => relay.url)
    ]);
  }

  async function publishEventWithRelayStatuses(
    event: NDKEvent,
    relayUrls: string[],
    scope: 'recipient' | 'self'
  ): Promise<RelayPublishStatusesResult> {
    const normalizedRelayUrls = normalizeRelayStatusUrls(relayUrls);
    if (normalizedRelayUrls.length === 0) {
      return {
        relayStatuses: [],
        error: null
      };
    }

    const relaySet = NDKRelaySet.fromRelayUrls(normalizedRelayUrls, ndk);

    try {
      const publishedToRelays = await event.publish(relaySet);
      const publishedRelayUrls = new Set(
        Array.from(publishedToRelays, (relay) => normalizeRelayStatusUrl(relay.url)).filter(
          (relayUrl): relayUrl is string => Boolean(relayUrl)
        )
      );

      return {
        relayStatuses: buildOutboundRelayStatuses(
          normalizedRelayUrls,
          publishedRelayUrls,
          new Map<string, string>(),
          scope
        ),
        error: null
      };
    } catch (error) {
      const publishedRelayUrls = new Set<string>();
      const errorsByRelayUrl = new Map<string, string>();

      if (error instanceof NDKPublishError) {
        for (const relay of error.publishedToRelays) {
          const normalizedRelayUrl = normalizeRelayStatusUrl(relay.url);
          if (normalizedRelayUrl) {
            publishedRelayUrls.add(normalizedRelayUrl);
          }
        }

        error.errors.forEach((relayError, relay) => {
          const normalizedRelayUrl = normalizeRelayStatusUrl(relay.url);
          if (!normalizedRelayUrl) {
            return;
          }

          errorsByRelayUrl.set(
            normalizedRelayUrl,
            relayError instanceof Error ? relayError.message : String(relayError)
          );
        });
      } else if (error instanceof Error) {
        for (const relayUrl of normalizedRelayUrls) {
          errorsByRelayUrl.set(relayUrl, error.message);
        }
      }

      return {
        relayStatuses: buildOutboundRelayStatuses(
          normalizedRelayUrls,
          publishedRelayUrls,
          errorsByRelayUrl,
          scope
        ),
        error: error instanceof Error ? error : new Error('Failed to publish event.')
      };
    }
  }

  function readProfileField(
    profile: NDKUserProfile | null,
    keys: string[],
    fallback = ''
  ): string | undefined {
    for (const key of keys) {
      const rawValue = profile?.[key];
      if (typeof rawValue !== 'string') {
        continue;
      }

      const normalized = rawValue.trim();
      if (normalized) {
        return normalized;
      }
    }

    const normalizedFallback = fallback.trim();
    return normalizedFallback || undefined;
  }

  function buildUpdatedContactMeta(
    existingMeta: ContactMetadata | undefined,
    profile: NDKUserProfile | null,
    resolvedNpub: string | null,
    resolvedNprofile: string | null
  ): ContactMetadata {
    const meta: ContactMetadata = {
      ...(existingMeta ?? {})
    };

    const nextName = readProfileField(profile, ['name'], meta.name ?? '');
    const nextAbout = readProfileField(profile, ['about', 'bio'], meta.about ?? '');
    const nextPicture = readProfileField(profile, ['picture', 'image'], meta.picture ?? '');
    const nextNip05 = readProfileField(profile, ['nip05'], meta.nip05 ?? '');
    const nextLud06 = readProfileField(profile, ['lud06'], meta.lud06 ?? '');
    const nextLud16 = readProfileField(profile, ['lud16'], meta.lud16 ?? '');
    const nextDisplayName = readProfileField(profile, ['displayName', 'display_name'], meta.display_name ?? '');
    const nextWebsite = readProfileField(profile, ['website'], meta.website ?? '');
    const nextBanner = readProfileField(profile, ['banner'], meta.banner ?? '');

    if (nextName) {
      meta.name = nextName;
    }

    if (nextAbout) {
      meta.about = nextAbout;
    }

    if (nextPicture) {
      meta.picture = nextPicture;
    }

    if (nextNip05) {
      meta.nip05 = nextNip05;
    }

    if (nextLud06) {
      meta.lud06 = nextLud06;
    }

    if (nextLud16) {
      meta.lud16 = nextLud16;
    }

    if (nextDisplayName) {
      meta.display_name = nextDisplayName;
    }

    if (nextWebsite) {
      meta.website = nextWebsite;
    }

    if (nextBanner) {
      meta.banner = nextBanner;
    }

    if (resolvedNpub?.trim()) {
      meta.npub = resolvedNpub.trim();
    }

    if (resolvedNprofile?.trim()) {
      meta.nprofile = resolvedNprofile.trim();
    }

    return meta;
  }

  function buildIdentifierFallbacks(
    pubkeyHex: string,
    existingMeta?: ContactMetadata
  ): string[] {
    const nip05Identifier = existingMeta?.nip05?.trim() ?? '';
    const nprofileIdentifier = existingMeta?.nprofile?.trim() || encodeNprofile(pubkeyHex) || '';
    const npubIdentifier = existingMeta?.npub?.trim() || encodeNpub(pubkeyHex) || '';
    const hexIdentifier = pubkeyHex;

    return [nip05Identifier, npubIdentifier, hexIdentifier, nprofileIdentifier]
      .map((identifier) => identifier.trim())
      .filter(
        (identifier, index, list) => identifier.length > 0 && list.indexOf(identifier) === index
      );
  }

  function relayEntriesFromRelayList(relayList: NDKRelayList | null | undefined): ContactRelay[] {
    if (!relayList) {
      return [];
    }

    return inputSanitizerService.normalizeRelayListMetadataEntries([
      ...Array.from(relayList.readRelayUrls ?? [], (relay) => ({
        url: String(relay),
        read: true,
        write: false
      })),
      ...Array.from(relayList.writeRelayUrls ?? [], (relay) => ({
        url: String(relay),
        read: false,
        write: true
      })),
      ...Array.from(relayList.bothRelayUrls ?? [], (relay) => ({
        url: String(relay),
        read: true,
        write: true
      }))
    ]);
  }

  async function fetchContactRelayEntries(pubkeyHex: string): Promise<ContactRelay[]> {
    try {
      const relayList = await getRelayListForUser(pubkeyHex, ndk);
      return relayEntriesFromRelayList(relayList);
    } catch (error) {
      console.warn('Failed to fetch relay list for contact', pubkeyHex, error);
      return [];
    }
  }

  function normalizeWritableRelayUrls(relays: ContactRelay[] | undefined): string[] {
    if (!Array.isArray(relays)) {
      return [];
    }

    const uniqueRelays = new Set<string>();
    for (const relay of relays) {
      if (!relay || relay.write === false) {
        continue;
      }

      const relayUrl = typeof relay.url === 'string' ? relay.url.trim() : '';
      if (!relayUrl) {
        continue;
      }

      try {
        uniqueRelays.add(normalizeRelayUrl(relayUrl));
      } catch {
        continue;
      }
    }

    return Array.from(uniqueRelays);
  }

  async function resolveLoggedInReadRelayUrls(seedRelayUrls: string[] = []): Promise<string[]> {
    const relayUrls = inputSanitizerService.normalizeStringArray(seedRelayUrls);
    const loggedInPubkeyHex = getLoggedInPublicKeyHex();
    if (!loggedInPubkeyHex) {
      return relayUrls;
    }

    await contactsService.init();
    const loggedInContact = await contactsService.getContactByPublicKey(loggedInPubkeyHex);

    return inputSanitizerService.normalizeStringArray([
      ...relayUrls,
      ...inputSanitizerService.normalizeReadableRelayUrls(loggedInContact?.relays)
    ]);
  }

  async function resolveLoggedInPublishRelayUrls(seedRelayUrls: string[] = []): Promise<string[]> {
    const relayUrls = inputSanitizerService.normalizeStringArray(seedRelayUrls);
    const loggedInPubkeyHex = getLoggedInPublicKeyHex();
    if (!loggedInPubkeyHex) {
      return relayUrls;
    }

    await contactsService.init();
    const loggedInContact = await contactsService.getContactByPublicKey(loggedInPubkeyHex);

    return inputSanitizerService.normalizeStringArray([
      ...relayUrls,
      ...normalizeWritableRelayUrls(loggedInContact?.relays)
    ]);
  }

  async function resolvePrivateContactListReadRelayUrls(seedRelayUrls: string[] = []): Promise<string[]> {
    return resolveLoggedInReadRelayUrls(seedRelayUrls);
  }

  async function resolvePrivateContactListPublishRelayUrls(seedRelayUrls: string[] = []): Promise<string[]> {
    return resolveLoggedInPublishRelayUrls(seedRelayUrls);
  }

  async function getLoggedInSignerUser(): Promise<NDKUser> {
    const signer = await getOrCreateSigner();
    const user = await signer.user();
    user.ndk = ndk;
    return user;
  }

  function buildPrivateContactListTags(pubkeys: string[]): string[][] {
    return pubkeys
      .map((pubkey) => inputSanitizerService.normalizeHexKey(pubkey))
      .filter((pubkey): pubkey is string => Boolean(pubkey))
      .filter((pubkey, index, list) => list.indexOf(pubkey) === index)
      .map((pubkey) => ['p', pubkey]);
  }

  function parsePrivateContactListPubkeys(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const pubkeys = value
      .map((entry) => {
        if (!Array.isArray(entry) || entry[0] !== 'p') {
          return null;
        }

        return inputSanitizerService.normalizeHexKey(String(entry[1] ?? ''));
      })
      .filter((pubkey): pubkey is string => Boolean(pubkey));

    return pubkeys.filter((pubkey, index, list) => list.indexOf(pubkey) === index);
  }

  async function encryptPrivateContactListTags(tags: string[][]): Promise<string> {
    const user = await getLoggedInSignerUser();
    ndk.assertSigner();

    return ndk.signer.encrypt(user, JSON.stringify(tags), 'nip44');
  }

  async function decryptPrivateContactListContent(content: string): Promise<string[]> {
    const normalizedContent = content.trim();
    if (!normalizedContent) {
      return [];
    }

    const user = await getLoggedInSignerUser();
    ndk.assertSigner();

    const decryptedContent = await ndk.signer.decrypt(user, normalizedContent, 'nip44');
    let parsed: unknown;

    try {
      parsed = JSON.parse(decryptedContent);
    } catch {
      return [];
    }

    return parsePrivateContactListPubkeys(parsed);
  }

  function shouldApplyPrivateContactListEvent(event: NDKEvent): boolean {
    const createdAt = Number(event.created_at ?? 0);
    if (createdAt > lastPrivateContactListCreatedAt) {
      return true;
    }

    if (createdAt < lastPrivateContactListCreatedAt) {
      return false;
    }

    const eventId = event.id?.trim() ?? '';
    if (!eventId) {
      return lastPrivateContactListEventId.length === 0;
    }

    return eventId !== lastPrivateContactListEventId;
  }

  function markPrivateContactListEventApplied(event: Pick<NDKEvent, 'created_at' | 'id'>): void {
    lastPrivateContactListCreatedAt = Number(event.created_at ?? 0);
    lastPrivateContactListEventId = event.id?.trim() ?? '';
  }

  async function applyPrivateContactListPubkeys(pubkeys: string[]): Promise<void> {
    const loggedInPubkeyHex = getLoggedInPublicKeyHex();
    await contactsService.init();

    const nextPubkeys = new Set(
      pubkeys.filter((pubkey) => !loggedInPubkeyHex || pubkey !== loggedInPubkeyHex)
    );
    const existingContacts = await contactsService.listContacts();

    for (const contact of existingContacts) {
      const normalizedPubkey = inputSanitizerService.normalizeHexKey(contact.public_key);
      if (!normalizedPubkey || normalizedPubkey === loggedInPubkeyHex) {
        continue;
      }

      if (nextPubkeys.has(normalizedPubkey)) {
        continue;
      }

      await contactsService.deleteContact(contact.id);
    }

    for (const pubkeyHex of nextPubkeys) {
      const existingContact = await contactsService.getContactByPublicKey(pubkeyHex);
      if (!existingContact) {
        await contactsService.createContact({
          public_key: pubkeyHex,
          name: pubkeyHex.slice(0, 16),
          given_name: null,
          meta: {},
          relays: []
        });
      }

      const fallbackName = existingContact?.name?.trim() || pubkeyHex.slice(0, 16);
      try {
        await refreshContactByPublicKey(pubkeyHex, fallbackName);
      } catch (error) {
        console.warn('Failed to refresh private contact list profile', pubkeyHex, error);
      }
    }

    bumpContactListVersion();
  }

  async function applyPrivateContactListEvent(event: NDKEvent): Promise<void> {
    if (!shouldApplyPrivateContactListEvent(event)) {
      return;
    }

    const pubkeys = await decryptPrivateContactListContent(event.content);
    await applyPrivateContactListPubkeys(pubkeys);
    markPrivateContactListEventApplied(event);
  }

  function queuePrivateContactListEventApplication(event: NDKEvent): void {
    privateContactListApplyQueue = privateContactListApplyQueue
      .then(() => applyPrivateContactListEvent(event))
      .catch((error) => {
        console.error('Failed to process private contact list event', error);
      });
  }

  async function resolveUserByIdentifiers(
    identifiers: string[],
    expectedPubkeyHex: string
  ): Promise<NDKUser | undefined> {
    for (const identifier of identifiers) {
      try {
        const user = await ndk.fetchUser(identifier, true);
        if (!user) {
          continue;
        }

        const resolvedPubkey = inputSanitizerService.normalizeHexKey(user.pubkey);
        if (!resolvedPubkey || resolvedPubkey !== expectedPubkeyHex) {
          continue;
        }

        return user;
      } catch {
        continue;
      }
    }

    return undefined;
  }

  async function refreshContactByPublicKey(
    targetPubkeyHex: string,
    fallbackName = ''
  ): Promise<void> {
    const normalizedTargetPubkey = inputSanitizerService.normalizeHexKey(targetPubkeyHex);
    if (!normalizedTargetPubkey) {
      return;
    }

    await contactsService.init();
    const existingContact = await contactsService.getContactByPublicKey(normalizedTargetPubkey);
    const identifiers = buildIdentifierFallbacks(normalizedTargetPubkey, existingContact?.meta);
    const resolvedUser = await resolveUserByIdentifiers(identifiers, normalizedTargetPubkey);
    if (!resolvedUser) {
      return;
    }

    let fetchedProfile: NDKUserProfile | null = null;
    try {
      fetchedProfile = await resolvedUser.fetchProfile();
    } catch (error) {
      console.warn('Failed to fetch profile metadata for contact', normalizedTargetPubkey, error);
    }

    let resolvedNpub = existingContact?.meta.npub?.trim() ?? '';
    if (!resolvedNpub) {
      try {
        resolvedNpub = resolvedUser.npub;
      } catch {
        resolvedNpub = '';
      }
    }

    let resolvedNprofile = existingContact?.meta.nprofile?.trim() ?? '';
    if (!resolvedNprofile) {
      try {
        resolvedNprofile = resolvedUser.nprofile;
      } catch {
        resolvedNprofile = '';
      }
    }

    const nextMeta = buildUpdatedContactMeta(
      existingContact?.meta,
      fetchedProfile,
      resolvedNpub,
      resolvedNprofile
    );

    const fallbackContactName = fallbackName.trim() || normalizedTargetPubkey.slice(0, 16);
    const nextName =
      nextMeta.display_name?.trim() ||
      nextMeta.name?.trim() ||
      existingContact?.name?.trim() ||
      fallbackContactName;

    const explicitRelayEntries = await fetchContactRelayEntries(normalizedTargetPubkey);
    const fallbackRelayEntries = inputSanitizerService.normalizeRelayEntriesFromUrls(
      resolvedUser.relayUrls ?? []
    );
    const nextRelays =
      explicitRelayEntries.length > 0
        ? explicitRelayEntries
        : fallbackRelayEntries.length > 0
          ? fallbackRelayEntries
          : existingContact?.relays ?? [];

    const chatStore = useChatStore();
    if (existingContact) {
      await contactsService.updateContact(existingContact.id, {
        name: nextName,
        meta: nextMeta,
        relays: nextRelays
      });
      await chatStore.syncContactProfile(normalizedTargetPubkey);
      return;
    }

    await contactsService.createContact({
      public_key: normalizedTargetPubkey,
      name: nextName,
      given_name: null,
      meta: nextMeta,
      relays: nextRelays
    });
    await chatStore.syncContactProfile(normalizedTargetPubkey);
  }

  function bumpRelayStatusVersion(): void {
    relayStatusVersion.value += 1;
  }

  function ensureRelayStatusListeners(): void {
    if (hasRelayStatusListeners) {
      return;
    }

    ndk.pool.on('relay:connecting', () => bumpRelayStatusVersion());
    ndk.pool.on('relay:connect', () => bumpRelayStatusVersion());
    ndk.pool.on('relay:ready', () => bumpRelayStatusVersion());
    ndk.pool.on('relay:disconnect', () => bumpRelayStatusVersion());
    ndk.pool.on('flapping', () => bumpRelayStatusVersion());
    hasRelayStatusListeners = true;
  }

  async function getOrCreateSigner(): Promise<NDKSigner> {
    const authMethod = getStoredAuthMethod();
    const loggedInPubkeyHex = getLoggedInPublicKeyHex();
    if (!authMethod || !loggedInPubkeyHex) {
      throw new Error('Missing signer session. Login is required.');
    }

    const sessionKey = `${authMethod}:${loggedInPubkeyHex}`;
    if (!cachedSigner || cachedSignerSessionKey !== sessionKey) {
      if (authMethod === 'nip07') {
        if (!hasNip07Extension()) {
          throw new Error('No NIP-07 extension detected. Install or enable one to continue.');
        }

        cachedSigner = new NDKNip07Signer(undefined, ndk);
      } else {
        const privateKeyHex = getPrivateKeyHex();
        if (!privateKeyHex) {
          throw new Error('Missing private key for local signer. Login is required.');
        }

        cachedSigner = new NDKPrivateKeySigner(privateKeyHex, ndk);
      }

      cachedSignerSessionKey = sessionKey;
    }

    ndk.signer = cachedSigner;
    const user = await cachedSigner.blockUntilReady();
    user.ndk = ndk;
    const signerPubkey = inputSanitizerService.normalizeHexKey(user.pubkey ?? cachedSigner.pubkey);
    if (!signerPubkey) {
      throw new Error('Signer did not provide a valid public key.');
    }

    if (signerPubkey !== loggedInPubkeyHex) {
      throw new Error(
        authMethod === 'nip07'
          ? 'The connected NIP-07 extension account does not match the current login.'
          : 'The stored signer does not match the current login.'
      );
    }

    return cachedSigner;
  }

  async function ensureRelayConnections(relayUrls: string[]): Promise<void> {
    ensureRelayStatusListeners();

    for (const relayUrl of relayUrls) {
      const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
      if (configuredRelayUrls.has(normalizedRelayUrl)) {
        continue;
      }

      ndk.addExplicitRelay(normalizedRelayUrl, undefined, true);
      configuredRelayUrls.add(normalizedRelayUrl);
      bumpRelayStatusVersion();
    }

    if (hasActivatedPool) {
      return;
    }

    if (!connectPromise) {
      connectPromise = ndk
        .connect(INITIAL_CONNECT_TIMEOUT_MS)
        .then(() => {
          hasActivatedPool = true;
        })
        .finally(() => {
          connectPromise = null;
        });
    }

    await connectPromise;
    bumpRelayStatusVersion();
  }

  function getRelayConnectionState(relayUrl: string): RelayConnectionState {
    const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
    const relay = ndk.pool.relays.get(normalizedRelayUrl);
    if (!relay) {
      return 'issue';
    }

    return relay.status >= NDKRelayStatus.CONNECTED ? 'connected' : 'issue';
  }

  async function fetchRelayNip11Info(
    relayUrl: string,
    force = false
  ): Promise<NDKRelayInformation> {
    const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
    const relay = ndk.pool.getRelay(normalizedRelayUrl, false);
    return relay.fetchInfo(force);
  }

  async function publishUserMetadata(
    metadata: PublishUserMetadataInput,
    relayUrls: string[]
  ): Promise<void> {
    const relayList = inputSanitizerService.normalizeStringArray(relayUrls);
    if (relayList.length === 0) {
      throw new Error('Cannot publish profile without at least one relay.');
    }

    await ensureRelayConnections(relayList);

    const signer = await getOrCreateSigner();
    const user = await signer.user();
    user.ndk = ndk;
    user.profile = metadata as NDKUserProfile;
    await user.publish();
  }

  async function publishMyRelayList(
    relayEntries: RelayListMetadataEntry[],
    publishRelayUrls: string[] = []
  ): Promise<void> {
    const normalizedRelayEntries = inputSanitizerService.normalizeRelayListMetadataEntries(relayEntries);
    const relayUrls = await resolveLoggedInPublishRelayUrls([
      ...publishRelayUrls,
      ...normalizedRelayEntries.map((relay) => relay.url)
    ]);
    if (relayUrls.length === 0) {
      throw new Error('Cannot publish relay list without at least one publish relay.');
    }

    await ensureRelayConnections(relayUrls);
    await getOrCreateSigner();

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

    const relaySet = NDKRelaySet.fromRelayUrls(relayUrls, ndk);
    await relayListEvent.publishReplaceable(relaySet);
    updateStoredEventSinceFromCreatedAt(relayListEvent.created_at);
  }

  async function updateLoggedInUserRelayList(
    relayEntries: RelayListMetadataEntry[]
  ): Promise<void> {
    const loggedInPubkeyHex = getLoggedInPublicKeyHex();
    if (!loggedInPubkeyHex) {
      return;
    }

    const normalizedRelayEntries = inputSanitizerService.normalizeRelayListMetadataEntries(relayEntries);
    await contactsService.init();

    const existingContact = await contactsService.getContactByPublicKey(loggedInPubkeyHex);
    if (!existingContact) {
      await contactsService.createContact({
        public_key: loggedInPubkeyHex,
        name: loggedInPubkeyHex.slice(0, 16),
        given_name: null,
        meta: {},
        relays: normalizedRelayEntries
      });
      try {
        await subscribePrivateMessagesForLoggedInUser(true);
      } catch (error) {
        console.warn('Failed to subscribe to private messages', error);
      }
      return;
    }

    await contactsService.updateContact(existingContact.id, {
      relays: normalizedRelayEntries
    });
    await subscribePrivateMessagesForLoggedInUser(true);
  }

  async function fetchMyRelayListEntries(seedRelayUrls: string[] = []): Promise<ContactRelay[] | null> {
    const loggedInPubkeyHex = getLoggedInPublicKeyHex();
    if (!loggedInPubkeyHex || !getStoredAuthMethod()) {
      return null;
    }

    const relayUrls = await resolveLoggedInReadRelayUrls(seedRelayUrls);
    if (relayUrls.length === 0) {
      return null;
    }

    await ensureRelayConnections(relayUrls);

    const signer = await getOrCreateSigner();
    const user = await signer.user();
    user.ndk = ndk;

    const relaySet = NDKRelaySet.fromRelayUrls(relayUrls, ndk);
    const relayListEvent = await ndk.fetchEvent(
      {
        kinds: [NDKKind.RelayList],
        authors: [user.pubkey],
        since: getFilterSince()
      },
      {
        cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY
      },
      relaySet
    );
    if (!relayListEvent) {
      return null;
    }

    updateStoredEventSinceFromCreatedAt(relayListEvent.created_at);

    const parsedRelayList = NDKRelayList.from(
      relayListEvent instanceof NDKEvent ? relayListEvent : new NDKEvent(ndk, relayListEvent)
    );

    return relayEntriesFromRelayList(parsedRelayList);
  }

  async function applyMyRelayListEntries(relayEntries: RelayListMetadataEntry[]): Promise<void> {
    const normalizedRelayEntries = inputSanitizerService.normalizeRelayListMetadataEntries(relayEntries);
    const nip65RelayStore = useNip65RelayStore();
    nip65RelayStore.init();
    nip65RelayStore.replaceRelayEntries(normalizedRelayEntries);
    await updateLoggedInUserRelayList(normalizedRelayEntries);
  }

  async function restoreMyRelayList(seedRelayUrls: string[] = []): Promise<void> {
    if (restoreMyRelayListPromise) {
      return restoreMyRelayListPromise;
    }

    restoreMyRelayListPromise = (async () => {
      const relayEntries = await fetchMyRelayListEntries(seedRelayUrls);
      if (relayEntries === null) {
        return;
      }

      await applyMyRelayListEntries(relayEntries);
    })().finally(() => {
      restoreMyRelayListPromise = null;
    });

    return restoreMyRelayListPromise;
  }

  function stopMyRelayListSubscription(): void {
    if (myRelayListSubscription) {
      myRelayListSubscription.stop();
      myRelayListSubscription = null;
    }

    myRelayListSubscriptionSignature = '';
  }

  async function subscribeMyRelayListUpdates(
    seedRelayUrls: string[] = [],
    force = false
  ): Promise<void> {
    const loggedInPubkeyHex = getLoggedInPublicKeyHex();
    if (!loggedInPubkeyHex) {
      stopMyRelayListSubscription();
      return;
    }

    const relayUrls = await resolveLoggedInReadRelayUrls(seedRelayUrls);
    if (relayUrls.length === 0) {
      stopMyRelayListSubscription();
      return;
    }

    const signature = `${loggedInPubkeyHex}:${relaySignature(relayUrls)}`;
    if (!force && myRelayListSubscription && myRelayListSubscriptionSignature === signature) {
      return;
    }

    await ensureRelayConnections(relayUrls);
    await getLoggedInSignerUser();
    stopMyRelayListSubscription();

    const relaySet = NDKRelaySet.fromRelayUrls(relayUrls, ndk);
    myRelayListSubscription = ndk.subscribe(
      {
        kinds: [NDKKind.RelayList],
        authors: [loggedInPubkeyHex],
        since: getFilterSince()
      },
      {
        relaySet,
        cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
        onEvent: (event) => {
          const wrappedEvent = event instanceof NDKEvent ? event : new NDKEvent(ndk, event);
          updateStoredEventSinceFromCreatedAt(wrappedEvent.created_at);
          myRelayListApplyQueue = myRelayListApplyQueue
            .then(async () => {
              const relayList = NDKRelayList.from(wrappedEvent);
              await applyMyRelayListEntries(relayEntriesFromRelayList(relayList));
            })
            .catch((error) => {
              console.error('Failed to process my relay list event', error);
            });
        }
      }
    );
    myRelayListSubscriptionSignature = signature;
  }

  async function publishPrivateContactList(seedRelayUrls: string[] = []): Promise<void> {
    const loggedInPubkeyHex = getLoggedInPublicKeyHex();
    if (!loggedInPubkeyHex) {
      throw new Error('Missing public key in localStorage. Login is required.');
    }

    const relayUrls = await resolvePrivateContactListPublishRelayUrls(seedRelayUrls);
    if (relayUrls.length === 0) {
      throw new Error('Cannot publish private contact list without at least one relay.');
    }

    await ensureRelayConnections(relayUrls);

    await contactsService.init();
    const contacts = await contactsService.listContacts();
    const pubkeys = contacts
      .map((contact) => inputSanitizerService.normalizeHexKey(contact.public_key))
      .filter(
        (pubkey): pubkey is string => Boolean(pubkey) && pubkey !== loggedInPubkeyHex
      );
    const user = await getLoggedInSignerUser();

    const listEvent = new NDKEvent(ndk, {
      kind: NDKKind.FollowSet,
      created_at: Math.floor(Date.now() / 1000),
      pubkey: user.pubkey,
      content: await encryptPrivateContactListTags(buildPrivateContactListTags(pubkeys)),
      tags: [
        ['d', PRIVATE_CONTACT_LIST_D_TAG],
        ['title', PRIVATE_CONTACT_LIST_TITLE]
      ]
    });

    const relaySet = NDKRelaySet.fromRelayUrls(relayUrls, ndk);
    await listEvent.publishReplaceable(relaySet);
    updateStoredEventSinceFromCreatedAt(listEvent.created_at);
    markPrivateContactListEventApplied(listEvent);
  }

  async function restorePrivateContactList(seedRelayUrls: string[] = []): Promise<void> {
    if (restorePrivateContactListPromise) {
      return restorePrivateContactListPromise;
    }

    restorePrivateContactListPromise = (async () => {
      const loggedInPubkeyHex = getLoggedInPublicKeyHex();
      if (!loggedInPubkeyHex) {
        return;
      }

      const relayUrls = await resolvePrivateContactListReadRelayUrls(seedRelayUrls);
      if (relayUrls.length === 0) {
        return;
      }

      await ensureRelayConnections(relayUrls);
      await getLoggedInSignerUser();

      const relaySet = NDKRelaySet.fromRelayUrls(relayUrls, ndk);
      const listEvent = await ndk.fetchEvent(
        {
          kinds: [NDKKind.FollowSet],
          authors: [loggedInPubkeyHex],
          '#d': [PRIVATE_CONTACT_LIST_D_TAG],
          since: getFilterSince()
        },
        {
          cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY
        },
        relaySet
      );
      if (!listEvent) {
        return;
      }

      updateStoredEventSinceFromCreatedAt(listEvent.created_at);

      await applyPrivateContactListEvent(
        listEvent instanceof NDKEvent ? listEvent : new NDKEvent(ndk, listEvent)
      );
    })().finally(() => {
      restorePrivateContactListPromise = null;
    });

    return restorePrivateContactListPromise;
  }

  function stopPrivateContactListSubscription(): void {
    if (privateContactListSubscription) {
      privateContactListSubscription.stop();
      privateContactListSubscription = null;
    }

    privateContactListSubscriptionSignature = '';
  }

  async function subscribePrivateContactListUpdates(
    seedRelayUrls: string[] = [],
    force = false
  ): Promise<void> {
    const loggedInPubkeyHex = getLoggedInPublicKeyHex();
    if (!loggedInPubkeyHex) {
      stopPrivateContactListSubscription();
      return;
    }

    const relayUrls = await resolvePrivateContactListReadRelayUrls(seedRelayUrls);
    if (relayUrls.length === 0) {
      stopPrivateContactListSubscription();
      return;
    }

    const signature = `${loggedInPubkeyHex}:${relaySignature(relayUrls)}`;
    if (!force && privateContactListSubscription && privateContactListSubscriptionSignature === signature) {
      return;
    }

    await ensureRelayConnections(relayUrls);
    await getLoggedInSignerUser();
    stopPrivateContactListSubscription();

    const relaySet = NDKRelaySet.fromRelayUrls(relayUrls, ndk);
    privateContactListSubscription = ndk.subscribe(
      {
        kinds: [NDKKind.FollowSet],
        authors: [loggedInPubkeyHex],
        '#d': [PRIVATE_CONTACT_LIST_D_TAG],
        since: getFilterSince()
      },
      {
        relaySet,
        cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
        onEvent: (event) => {
          console.log('Received private contact list event', event);
          const wrappedEvent = event instanceof NDKEvent ? event : new NDKEvent(ndk, event);
          updateStoredEventSinceFromCreatedAt(wrappedEvent.created_at);
          queuePrivateContactListEventApplication(wrappedEvent);
        }
      }
    );
    privateContactListSubscriptionSignature = signature;
  }

  function stopPrivateMessagesSubscription(): void {
    if (privateMessagesSubscription) {
      privateMessagesSubscription.stop();
      privateMessagesSubscription = null;
    }

    if (privateMessagesUiRefreshTimeoutId !== null) {
      globalThis.clearTimeout(privateMessagesUiRefreshTimeoutId);
      privateMessagesUiRefreshTimeoutId = null;
    }

    privateMessagesSubscriptionSignature = '';
    privateMessagesRestoreThrottleMs = 0;
    shouldReloadChatsOnPrivateMessagesUiRefresh = false;
    shouldReloadMessagesOnPrivateMessagesUiRefresh = false;
  }

  function queuePrivateMessageIngestion(
    wrappedEvent: NDKEvent,
    loggedInPubkeyHex: string
  ): void {
    const uiThrottleMs = privateMessagesRestoreThrottleMs;

    privateMessagesIngestQueue = privateMessagesIngestQueue
      .then(() =>
        processIncomingPrivateMessage(wrappedEvent, loggedInPubkeyHex, {
          uiThrottleMs
        })
      )
      .catch((error) => {
        console.error('Failed to process incoming private message', error);
      });
  }

  async function processIncomingPrivateMessage(
    wrappedEvent: NDKEvent,
    loggedInPubkeyHex: string,
    options: {
      uiThrottleMs?: number;
    } = {}
  ): Promise<void> {
    if (wrappedEvent.kind !== NDKKind.GiftWrap) {
      return;
    }

    let rumorEvent: NDKEvent;
    try {
      rumorEvent = await giftUnwrap(wrappedEvent);
    } catch (error) {
      console.warn('Failed to unwrap incoming gift wrap event', error);
      return;
    }

    if (rumorEvent.kind !== NDKKind.PrivateDirectMessage) {
      return;
    }

    const senderPubkeyHex = inputSanitizerService.normalizeHexKey(rumorEvent.pubkey ?? '');
    if (!senderPubkeyHex) {
      return;
    }

    const recipients = rumorEvent
      .getMatchingTags('p')
      .map((tag) => inputSanitizerService.normalizeHexKey(tag[1] ?? ''))
      .filter((value): value is string => Boolean(value));
    const isSelfSentMessage = senderPubkeyHex === loggedInPubkeyHex;
    if (!isSelfSentMessage && !recipients.includes(loggedInPubkeyHex)) {
      return;
    }

    const chatPubkey = isSelfSentMessage
      ? recipients.find((pubkey) => pubkey !== loggedInPubkeyHex) ?? null
      : senderPubkeyHex;
    if (!chatPubkey) {
      return;
    }

    const messageText = rumorEvent.content.trim();
    if (!messageText) {
      return;
    }
    const uiThrottleMs = normalizeThrottleMs(options.uiThrottleMs);

    await Promise.all([chatDataService.init(), contactsService.init(), nostrEventDataService.init()]);

    const rumorNostrEvent = await toStoredNostrEvent(rumorEvent);
    const receivedRelayStatuses = buildInboundRelayStatuses(extractRelayUrlsFromEvent(wrappedEvent));
    const rumorEventId = normalizeEventId(rumorNostrEvent?.id ?? rumorEvent.id);
    if (rumorEventId) {
      const existingMessage = await chatDataService.getMessageByEventId(rumorEventId);
      if (existingMessage) {
        await appendRelayStatusesToMessageEvent(
          existingMessage.id,
          receivedRelayStatuses,
          {
            event: rumorNostrEvent ?? undefined,
            direction: isSelfSentMessage ? 'out' : 'in',
            eventId: rumorEventId,
            uiThrottleMs
          }
        );
        return;
      }
    }

    const contact = await contactsService.getContactByPublicKey(chatPubkey);
    const existingChat = await chatDataService.getChatByPublicKey(chatPubkey);
    const createdChat =
      existingChat
        ? null
        : await chatDataService.createChat({
            public_key: chatPubkey,
            name: deriveChatName(contact, chatPubkey),
            last_message: '',
            last_message_at: toIsoTimestampFromUnix(rumorEvent.created_at),
            unread_count: 0,
            meta: {
              ...(contact?.meta.picture ? { picture: contact.meta.picture } : {})
            }
          });
    const chat =
      existingChat ??
      createdChat ??
      (await chatDataService.getChatByPublicKey(chatPubkey));
    if (!chat) {
      return;
    }

    const createdAt = toIsoTimestampFromUnix(rumorEvent.created_at);
    const createdMessage = await chatDataService.createMessage({
      chat_public_key: chat.public_key,
      author_public_key: senderPubkeyHex,
      message: messageText,
      created_at: createdAt,
      event_id: rumorEventId,
      meta: {
        source: 'nostr',
        kind: NDKKind.PrivateDirectMessage,
        wrapper_event_id: wrappedEvent.id ?? ''
      }
    });
    if (!createdMessage) {
      return;
    }

    if (rumorNostrEvent) {
      await nostrEventDataService.upsertEvent({
        event: rumorNostrEvent,
        direction: isSelfSentMessage ? 'out' : 'in',
        relay_statuses: receivedRelayStatuses
      });
    }

    const nextUnreadCount = isSelfSentMessage
      ? Number(chat.unread_count ?? 0)
      : chatStore.visibleChatId === chat.public_key
        ? 0
        : Number(chat.unread_count ?? 0) + 1;

    await chatDataService.updateChatPreview(
      chat.public_key,
      messageText,
      createdAt,
      nextUnreadCount
    );

    if (uiThrottleMs > 0) {
      queuePrivateMessagesUiRefresh({
        throttleMs: uiThrottleMs,
        reloadChats: true,
        reloadMessages: true
      });
      return;
    }

    try {
      chatStore.applyIncomingMessage({
        publicKey: chat.public_key,
        fallbackName: deriveChatName(contact, chatPubkey),
        messageText,
        at: createdAt,
        unreadCount: nextUnreadCount,
        meta: {
          ...(chat.meta ?? {}),
          ...(contact?.meta.picture ? { picture: contact.meta.picture } : {})
        }
      });

      const { useMessageStore } = await import('src/stores/messageStore');
      await useMessageStore().upsertPersistedMessage(createdMessage);
    } catch (error) {
      console.error('Failed to sync incoming private message into live state', error);
    }
  }

  async function subscribePrivateMessagesForLoggedInUser(
    force = false,
    options: SubscribePrivateMessagesOptions = {}
  ): Promise<void> {
    const loggedInPubkeyHex = getLoggedInPublicKeyHex();

    if (!loggedInPubkeyHex || !getStoredAuthMethod()) {
      stopPrivateMessagesSubscription();
      return;
    }

    await contactsService.init();
    const loggedInContact = await contactsService.getContactByPublicKey(loggedInPubkeyHex);
    const relayUrls = inputSanitizerService.normalizeReadableRelayUrls(loggedInContact?.relays);
    if (relayUrls.length === 0) {
      stopPrivateMessagesSubscription();
      return;
    }
    const signature = `${loggedInPubkeyHex}:${relaySignature(relayUrls)}`;
    if (!force && privateMessagesSubscription && privateMessagesSubscriptionSignature === signature) {
      return;
    }

    await ensureRelayConnections(relayUrls);
    await getOrCreateSigner();
    stopPrivateMessagesSubscription();
    privateMessagesRestoreThrottleMs = normalizeThrottleMs(options.restoreThrottleMs);

    const relaySet = NDKRelaySet.fromRelayUrls(relayUrls, ndk);
    privateMessagesSubscription = ndk.subscribe(
      {
        kinds: [NDKKind.GiftWrap],
        '#p': [loggedInPubkeyHex],
        since: getFilterSince()
      },
      {
        relaySet,
        cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
        onEvent: (event) => {
          console.log('Received private message gift wrap event', temp_counter++, getFilterSince(), event);
          const wrappedEvent = event instanceof NDKEvent ? event : new NDKEvent(ndk, event);
          updateStoredEventSinceFromCreatedAt(wrappedEvent.created_at);
          queuePrivateMessageIngestion(wrappedEvent, loggedInPubkeyHex);
        },
        onEose: () => {
          privateMessagesRestoreThrottleMs = 0;
          flushPrivateMessagesUiRefreshNow();
        }
      }
    );
    privateMessagesSubscriptionSignature = signature;
  }

  async function fetchMyRelayList(relayUrls: string[]): Promise<string[]> {
    const relayEntries = await fetchMyRelayListEntries(relayUrls);
    if (relayEntries === null) {
      return [];
    }

    return relayEntries.map((relay) => relay.url);
  }

  async function syncLoggedInContactProfile(relayUrls: string[]): Promise<void> {
    if (syncLoggedInContactProfilePromise) {
      return syncLoggedInContactProfilePromise;
    }

    syncLoggedInContactProfilePromise = (async () => {
      const loggedInPubkeyHex = getLoggedInPublicKeyHex();
      if (!loggedInPubkeyHex) {
        return;
      }

      const activeRelays = inputSanitizerService.normalizeStringArray(relayUrls);
      if (activeRelays.length > 0) {
        try {
          await ensureRelayConnections(activeRelays);
        } catch (error) {
          console.warn('Failed to connect relays before profile sync', error);
        }
      }

      try {
        await refreshContactByPublicKey(loggedInPubkeyHex);
      } catch (error) {
        console.warn('Failed to refresh logged-in contact profile', error);
      }

      await subscribePrivateMessagesForLoggedInUser(true, {
        restoreThrottleMs: PRIVATE_MESSAGES_STARTUP_RESTORE_THROTTLE_MS
      });
    })().finally(() => {
      syncLoggedInContactProfilePromise = null;
    });

    return syncLoggedInContactProfilePromise;
  }

  async function syncRecentChatContacts(relayUrls: string[], limit = 10): Promise<void> {
    if (syncRecentChatContactsPromise) {
      return syncRecentChatContactsPromise;
    }

    syncRecentChatContactsPromise = (async () => {
      const normalizedLimit =
        Number.isInteger(limit) && Number(limit) > 0 ? Math.min(Number(limit), 50) : 10;
      if (normalizedLimit <= 0) {
        return;
      }

      const activeRelays = inputSanitizerService.normalizeStringArray(relayUrls);
      if (activeRelays.length > 0) {
        try {
          await ensureRelayConnections(activeRelays);
        } catch (error) {
          console.warn('Failed to connect relays before syncing recent chat contacts', error);
        }
      }

      await Promise.all([chatDataService.init(), contactsService.init()]);
      const recentChats = await chatDataService.listChats();
      if (recentChats.length === 0) {
        return;
      }

      const loggedInPubkeyHex = getLoggedInPublicKeyHex();
      const recentPublicKeys = new Set<string>();

      for (const chat of recentChats) {
        const normalizedPubkey = inputSanitizerService.normalizeHexKey(chat.public_key);
        if (!normalizedPubkey) {
          continue;
        }

        if (loggedInPubkeyHex && normalizedPubkey === loggedInPubkeyHex) {
          continue;
        }

        recentPublicKeys.add(normalizedPubkey);
        if (recentPublicKeys.size >= normalizedLimit) {
          break;
        }
      }

      if (recentPublicKeys.size === 0) {
        return;
      }

      for (const pubkeyHex of recentPublicKeys) {
        const existingContact = await contactsService.getContactByPublicKey(pubkeyHex);
        if (!existingContact) {
          continue;
        }

        const matchingChat = recentChats.find(
          (chat) => inputSanitizerService.normalizeHexKey(chat.public_key) === pubkeyHex
        );
        const fallbackName = existingContact.name.trim() || matchingChat?.name?.trim() || '';
        await refreshContactByPublicKey(pubkeyHex, fallbackName);
      }
    })().finally(() => {
      syncRecentChatContactsPromise = null;
    });

    return syncRecentChatContactsPromise;
  }

  function getPrivateKeyHex(): string | null {
    if (!hasStorage()) {
      return null;
    }

    const stored = window.localStorage.getItem(PRIVATE_KEY_STORAGE_KEY);
    if (!stored) {
      return null;
    }

    return inputSanitizerService.normalizeHexKey(stored);
  }

  function setStoredAuthSession(authMethod: AuthMethod, pubkeyHex: string, privateKeyHex?: string): void {
    if (!hasStorage()) {
      return;
    }

    window.localStorage.setItem(AUTH_METHOD_STORAGE_KEY, authMethod);
    window.localStorage.setItem(PUBLIC_KEY_STORAGE_KEY, pubkeyHex);

    if (authMethod === 'nsec' && privateKeyHex) {
      window.localStorage.setItem(PRIVATE_KEY_STORAGE_KEY, privateKeyHex);
      return;
    }

    window.localStorage.removeItem(PRIVATE_KEY_STORAGE_KEY);
  }

  function savePrivateKeyHex(hexPrivateKey: string): boolean {
    const normalized = inputSanitizerService.normalizeHexKey(hexPrivateKey);
    if (!normalized || !hasStorage()) {
      return false;
    }

    const signer = new NDKPrivateKeySigner(normalized, ndk);
    clearPrivateKey();
    resetEventSinceForFreshLogin();
    setStoredAuthSession('nsec', signer.pubkey, normalized);
    cachedSigner = signer;
    cachedSignerSessionKey = `nsec:${signer.pubkey}`;
    ndk.signer = signer;
    return true;
  }

  async function loginWithExtension(): Promise<string> {
    if (!hasNip07Extension()) {
      throw new Error('No NIP-07 extension detected. Install or enable one to continue.');
    }

    const signer = new NDKNip07Signer(undefined, ndk);
    const user = await signer.blockUntilReady();
    user.ndk = ndk;
    const pubkeyHex = inputSanitizerService.normalizeHexKey(user.pubkey ?? signer.pubkey);
    if (!pubkeyHex) {
      throw new Error('Failed to read a valid public key from the NIP-07 extension.');
    }

    clearPrivateKey();
    resetEventSinceForFreshLogin();
    setStoredAuthSession('nip07', pubkeyHex);
    cachedSigner = signer;
    cachedSignerSessionKey = `nip07:${pubkeyHex}`;
    ndk.signer = signer;
    return pubkeyHex;
  }

  function clearPrivateKey(): void {
    cachedSigner = null;
    cachedSignerSessionKey = null;
    ndk.signer = undefined;
    lastPrivateContactListCreatedAt = 0;
    lastPrivateContactListEventId = '';
    stopMyRelayListSubscription();
    stopPrivateContactListSubscription();
    stopPrivateMessagesSubscription();

    if (!hasStorage()) {
      return;
    }

    window.localStorage.removeItem(AUTH_METHOD_STORAGE_KEY);
    window.localStorage.removeItem(PRIVATE_KEY_STORAGE_KEY);
    window.localStorage.removeItem(PUBLIC_KEY_STORAGE_KEY);
  }

  async function logout(): Promise<void> {
    clearPrivateKey();
    eventSince.value = 0;
    pendingEventSinceUpdate = 0;
    isRestoringStartupState.value = false;
    restoreStartupStatePromise = null;
    restoreMyRelayListPromise = null;
    syncLoggedInContactProfilePromise = null;
    restorePrivateContactListPromise = null;
    syncRecentChatContactsPromise = null;
    myRelayListApplyQueue = Promise.resolve();
    privateContactListApplyQueue = Promise.resolve();
    privateMessagesIngestQueue = Promise.resolve();
    privateMessagesUiRefreshQueue = Promise.resolve();
    configuredRelayUrls.clear();
    contactListVersion.value = 0;
    relayStatusVersion.value += 1;

    if (hasStorage()) {
      window.localStorage.removeItem(EVENT_SINCE_STORAGE_KEY);
      for (const storageKey of RELAY_STORAGE_KEYS) {
        window.localStorage.removeItem(storageKey);
      }
    }

    clearDarkModePreference();

    await Promise.all([
      chatDataService.clearAllData(),
      contactsService.clearAllData(),
      nostrEventDataService.clearAllData(),
      imageCacheService.clearAllData()
    ]);
  }

  function validateNsec(input: string): NostrNsecValidationResult {
    return inputSanitizerService.validateNsec(input);
  }

  function savePrivateKeyFromNsec(input: string): NostrNsecValidationResult {
    const validation = validateNsec(input);
    if (!validation.isValid || !validation.hexPrivateKey) {
      return validation;
    }

    savePrivateKeyHex(validation.hexPrivateKey);
    return validation;
  }

  function validateNpub(input: string): NostrNpubValidationResult {
    return inputSanitizerService.validateNpub(input);
  }

  async function getNip05Data(identifier: string): Promise<NostrNip05DataResult> {
    const value = identifier.trim();
    if (!value || !isValidNip05(value)) {
      return {
        isValid: false,
        normalizedPubkey: null,
        name: null,
        relays: [],
        error: 'invalid'
      };
    }

    try {
      const user = await NDKUser.fromNip05(value, ndk, true);
      const normalizedPubkey = user?.pubkey?.toLowerCase() ?? null;

      if (!normalizedPubkey || !isValidPubkey(normalizedPubkey)) {
        return {
          isValid: false,
          normalizedPubkey: null,
          name: null,
          relays: [],
          error: 'nip05_unresolved'
        };
      }

      const relays = inputSanitizerService.normalizeStringArray(user?.relayUrls ?? []);

      return {
        isValid: true,
        normalizedPubkey,
        name: user?.profile?.name?.trim() || inputSanitizerService.extractNip05Name(value),
        relays,
        error: null
      };
    } catch {
      return {
        isValid: false,
        normalizedPubkey: null,
        name: null,
        relays: [],
        error: 'nip05_unresolved'
      };
    }
  }

  async function resolveIdentifier(input: string): Promise<NostrIdentifierResolutionResult> {
    const value = input.trim();
    if (!value) {
      return {
        isValid: false,
        normalizedPubkey: null,
        resolvedName: null,
        relays: [],
        identifierType: null,
        error: 'invalid'
      };
    }

    if (value.includes('@')) {
      const nip05Data = await getNip05Data(value);
      return {
        isValid: nip05Data.isValid,
        normalizedPubkey: nip05Data.normalizedPubkey,
        resolvedName: nip05Data.name,
        relays: nip05Data.relays,
        identifierType: 'nip05',
        error: nip05Data.error
      };
    }

    if (isValidPubkey(value)) {
      return {
        isValid: true,
        normalizedPubkey: value.toLowerCase(),
        resolvedName: null,
        relays: [],
        identifierType: 'pubkey',
        error: null
      };
    }

    const npubValidation = validateNpub(value);
    return {
      isValid: npubValidation.isValid,
      normalizedPubkey: npubValidation.normalizedPubkey,
      resolvedName: null,
      relays: [],
      identifierType: 'pubkey',
      error: npubValidation.isValid ? null : 'invalid'
    };
  }

  async function sendDirectMessage(
    recipientPublicKey: string,
    textMessage: string,
    relays: string[],
    options: SendDirectMessageOptions = {}
  ): Promise<NostrEvent> {
    const message = textMessage.trim();
    if (!message) {
      throw new Error('Message cannot be empty.');
    }

    const recipientInput = recipientPublicKey.trim();
    if (!recipientInput) {
      throw new Error('Recipient public key is required.');
    }

    let normalizedRecipientPubkey: string | null = null;
    if (isValidPubkey(recipientInput)) {
      normalizedRecipientPubkey = recipientInput.toLowerCase();
    } else {
      normalizedRecipientPubkey = validateNpub(recipientInput).normalizedPubkey;
    }

    if (!normalizedRecipientPubkey) {
      throw new Error('Recipient public key must be a valid hex pubkey or npub.');
    }

    const relayUrls = inputSanitizerService.normalizeStringArray(relays);
    if (relayUrls.length === 0) {
      throw new Error('Cannot send DM without contact relays.');
    }
    await ensureRelayConnections(relayUrls);

    const signer = await getOrCreateSigner();
    const createdAt = toUnixTimestamp(options.createdAt);

    const recipient = new NDKUser({ pubkey: normalizedRecipientPubkey });
    const recipientRumorEvent = createDirectMessageRumorEvent(
      signer.pubkey,
      normalizedRecipientPubkey,
      message,
      createdAt
    );
    const recipientRumorNostrEvent = await toStoredNostrEvent(recipientRumorEvent);
    const rumorEventId = normalizeEventId(recipientRumorNostrEvent?.id ?? recipientRumorEvent.id);
    const selfRelayUrls = await resolveLoggedInPublishRelayUrls();
    if (options.localMessageId && rumorEventId) {
      try {
        await appendRelayStatusesToMessageEvent(
          options.localMessageId,
          [
            ...buildPendingOutboundRelayStatuses(relayUrls, 'recipient'),
            ...buildPendingOutboundRelayStatuses(selfRelayUrls, 'self')
          ],
          {
            event: recipientRumorNostrEvent ?? undefined,
            direction: 'out',
            eventId: rumorEventId
          }
        );
      } catch (error) {
        console.warn('Failed to persist direct message event details before publish', error);
      }
    }

    const nip59Event = await giftWrap(recipientRumorEvent, recipient, signer, {
      rumorKind: NDKKind.PrivateDirectMessage
    });

    const recipientPublishResult = await publishEventWithRelayStatuses(
      nip59Event,
      relayUrls,
      'recipient'
    );
    if (options.localMessageId) {
      await appendRelayStatusesToMessageEvent(options.localMessageId, recipientPublishResult.relayStatuses, {
        event: recipientRumorNostrEvent ?? undefined,
        direction: 'out',
        eventId: rumorEventId ?? undefined
      });
    }
    if (recipientPublishResult.error) {
      throw recipientPublishResult.error;
    }

    if (selfRelayUrls.length > 0) {
      await ensureRelayConnections(selfRelayUrls);
      const senderRecipient = new NDKUser({ pubkey: signer.pubkey });
      const selfRumorEvent = createDirectMessageRumorEvent(
        signer.pubkey,
        normalizedRecipientPubkey,
        message,
        createdAt
      );
      const selfGiftWrapEvent = await giftWrap(selfRumorEvent, senderRecipient, signer, {
        rumorKind: NDKKind.PrivateDirectMessage
      });
      const selfPublishResult = await publishEventWithRelayStatuses(
        selfGiftWrapEvent,
        selfRelayUrls,
        'self'
      );
      if (options.localMessageId) {
        await appendRelayStatusesToMessageEvent(options.localMessageId, selfPublishResult.relayStatuses, {
          event: recipientRumorNostrEvent ?? undefined,
          direction: 'out',
          eventId: rumorEventId ?? undefined
        });
      }
      if (selfPublishResult.error) {
        console.warn('Failed to publish direct message self-copy', selfPublishResult.error);
      }
    }

    const dmEvent = await nip59Event.toNostrEvent();
    console.log('Sending DM event:', dmEvent);

    return dmEvent;

  }

  async function retryDirectMessageRelay(
    messageId: number,
    relayUrl: string,
    scope: 'recipient' | 'self'
  ): Promise<void> {
    const normalizedMessageId = Number(messageId);
    const normalizedRelayUrl = normalizeRelayStatusUrl(relayUrl);
    if (
      !Number.isInteger(normalizedMessageId) ||
      normalizedMessageId <= 0 ||
      !normalizedRelayUrl ||
      (scope !== 'recipient' && scope !== 'self')
    ) {
      throw new Error('Invalid relay retry input.');
    }

    await Promise.all([chatDataService.init(), nostrEventDataService.init()]);

    const message = await chatDataService.getMessageById(normalizedMessageId);
    if (!message?.event_id) {
      throw new Error('Message is missing a persisted event id.');
    }

    const storedEvent = await nostrEventDataService.getEventById(message.event_id);
    if (!storedEvent || storedEvent.direction !== 'out') {
      throw new Error('No outbound nostr event found for this message.');
    }

    const rumorEvent = createStoredDirectMessageRumorEvent(storedEvent.event);
    if (!rumorEvent) {
      throw new Error('Failed to rebuild the direct message event for retry.');
    }

    const signer = await getOrCreateSigner();
    const recipientPubkey = readDirectMessageRecipientPubkey(storedEvent.event);
    if (!recipientPubkey) {
      throw new Error('Stored direct message event is missing a recipient.');
    }

    await appendRelayStatusesToMessageEvent(
      normalizedMessageId,
      buildPendingOutboundRelayStatuses([normalizedRelayUrl], scope),
      {
        event: storedEvent.event,
        direction: 'out',
        eventId: message.event_id
      }
    );

    await ensureRelayConnections([normalizedRelayUrl]);
    const recipient =
      scope === 'self'
        ? new NDKUser({ pubkey: signer.pubkey })
        : new NDKUser({ pubkey: recipientPubkey });
    const giftWrapEvent = await giftWrap(rumorEvent, recipient, signer, {
      rumorKind: NDKKind.PrivateDirectMessage
    });
    const publishResult = await publishEventWithRelayStatuses(
      giftWrapEvent,
      [normalizedRelayUrl],
      scope
    );

    await appendRelayStatusesToMessageEvent(
      normalizedMessageId,
      publishResult.relayStatuses,
      {
        event: storedEvent.event,
        direction: 'out',
        eventId: message.event_id
      }
    );

    if (publishResult.error) {
      throw publishResult.error;
    }
  }

  return {
    clearPrivateKey,
    contactListVersion,
    encodeNpub,
    ensureRelayConnections,
    fetchRelayNip11Info,
    fetchMyRelayList,
    getNip05Data,
    hasNip07Extension,
    getLoggedInPublicKeyHex,
    getPrivateKeyHex,
    getRelayConnectionState,
    isRestoringStartupState,
    loginWithExtension,
    logout,
    publishPrivateContactList,
    publishUserMetadata,
    publishMyRelayList,
    relayStatusVersion,
    resolveIdentifier,
    refreshContactByPublicKey,
    restoreMyRelayList,
    restorePrivateContactList,
    restoreStartupState,
    retryDirectMessageRelay,
    sendDirectMessage,
    savePrivateKeyFromNsec,
    savePrivateKeyHex,
    subscribeMyRelayListUpdates,
    subscribePrivateContactListUpdates,
    subscribePrivateMessagesForLoggedInUser,
    updateLoggedInUserRelayList,
    syncLoggedInContactProfile,
    syncRecentChatContacts,
    validateNpub,
    validateNsec
  };
});
