import { defineStore } from 'pinia';
import { ref } from 'vue';
import NDK, {
  NDKEvent,
  NDKKind,
  NDKPrivateKeySigner,
  NDKRelayList,
  NDKSubscriptionCacheUsage,
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
import {
  inputSanitizerService,
  type NpubValidationResult,
  type NsecValidationResult
} from 'src/services/inputSanitizerService';
import type { ContactMetadata, ContactRecord, ContactRelay } from 'src/types/contact';

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

const PRIVATE_KEY_STORAGE_KEY = 'nsec';
const PUBLIC_KEY_STORAGE_KEY = 'npub';

function hasStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export const useNostrStore = defineStore('nostrStore', () => {
  const ndk = new NDK();
  const INITIAL_CONNECT_TIMEOUT_MS = 3000;
  const relayStatusVersion = ref(0);
  let cachedSigner: NDKPrivateKeySigner | null = null;
  let cachedSignerPrivateKeyHex: string | null = null;
  const configuredRelayUrls = new Set<string>();
  let connectPromise: Promise<void> | null = null;
  let hasActivatedPool = false;
  let hasRelayStatusListeners = false;
  let syncLoggedInContactProfilePromise: Promise<void> | null = null;
  let syncRecentChatContactsPromise: Promise<void> | null = null;
  let privateMessagesSubscription: ReturnType<typeof ndk.subscribe> | null = null;
  let privateMessagesSubscriptionSignature = '';
  let privateMessagesIngestQueue = Promise.resolve();

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

  function toIsoTimestampFromUnix(value: number | undefined): string {
    if (!Number.isInteger(value) || Number(value) <= 0) {
      return new Date().toISOString();
    }

    return new Date(Number(value) * 1000).toISOString();
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

  async function resolveUserByIdentifiers(
    identifiers: string[],
    expectedPubkeyHex: string
  ): Promise<NDKUser | undefined> {
    console.log('### Resolving user for identifiers:', identifiers, 'expected pubkey:', expectedPubkeyHex);
    for (const identifier of identifiers) {
      try {
        const user = await ndk.fetchUser(identifier, true);
        console.log('### Resolved user for identifier:', identifier, user);
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

    console.log('### Resolved contact profile for pubkey:', normalizedTargetPubkey, resolvedUser);
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

    console.log('### Syncing contact profile, relays:', targetPubkeyHex, nextRelays);
    if (existingContact) {
      await contactsService.updateContact(existingContact.id, {
        name: nextName,
        meta: nextMeta,
        relays: nextRelays
      });
      return;
    }

    await contactsService.createContact({
      public_key: normalizedTargetPubkey,
      name: nextName,
      given_name: null,
      meta: nextMeta,
      relays: nextRelays
    });
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

  function getOrCreateSigner(privateKeyHex: string): NDKPrivateKeySigner {
    if (!cachedSigner || cachedSignerPrivateKeyHex !== privateKeyHex) {
      cachedSigner = new NDKPrivateKeySigner(privateKeyHex, ndk);
      cachedSignerPrivateKeyHex = privateKeyHex;
    }

    ndk.signer = cachedSigner;
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
    const senderPrivateKeyHex = getPrivateKeyHex();
    if (!senderPrivateKeyHex) {
      throw new Error('Missing private key in localStorage. Login is required.');
    }

    const relayList = inputSanitizerService.normalizeStringArray(relayUrls);
    if (relayList.length === 0) {
      throw new Error('Cannot publish profile without at least one relay.');
    }

    await ensureRelayConnections(relayList);

    const signer = getOrCreateSigner(senderPrivateKeyHex);
    const user = await signer.user();
    user.ndk = ndk;
    user.profile = metadata as NDKUserProfile;
    await user.publish();
  }

  async function publishMyRelayList(
    relayEntries: RelayListMetadataEntry[],
    publishRelayUrls: string[] = []
  ): Promise<void> {
    const senderPrivateKeyHex = getPrivateKeyHex();
    if (!senderPrivateKeyHex) {
      throw new Error('Missing private key in localStorage. Login is required.');
    }

    const normalizedRelayEntries = inputSanitizerService.normalizeRelayListMetadataEntries(relayEntries);
    const relayUrls = inputSanitizerService.normalizeStringArray([
      ...publishRelayUrls,
      ...normalizedRelayEntries.map((relay) => relay.url)
    ]);
    if (relayUrls.length === 0) {
      throw new Error('Cannot publish relay list without at least one publish relay.');
    }

    await ensureRelayConnections(relayUrls);
    getOrCreateSigner(senderPrivateKeyHex);

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

  function stopPrivateMessagesSubscription(): void {
    if (privateMessagesSubscription) {
      privateMessagesSubscription.stop();
      privateMessagesSubscription = null;
    }

    privateMessagesSubscriptionSignature = '';
  }

  function queuePrivateMessageIngestion(
    wrappedEvent: NDKEvent,
    loggedInPubkeyHex: string
  ): void {
    privateMessagesIngestQueue = privateMessagesIngestQueue
      .then(() => processIncomingPrivateMessage(wrappedEvent, loggedInPubkeyHex))
      .catch((error) => {
        console.error('Failed to process incoming private message', error);
      });
  }

  async function processIncomingPrivateMessage(
    wrappedEvent: NDKEvent,
    loggedInPubkeyHex: string
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
    if (!senderPubkeyHex || senderPubkeyHex === loggedInPubkeyHex) {
      return;
    }

    const recipients = rumorEvent
      .getMatchingTags('p')
      .map((tag) => inputSanitizerService.normalizeHexKey(tag[1] ?? ''))
      .filter((value): value is string => Boolean(value));
    if (!recipients.includes(loggedInPubkeyHex)) {
      return;
    }

    const messageText = rumorEvent.content.trim();
    if (!messageText) {
      return;
    }

    await Promise.all([chatDataService.init(), contactsService.init()]);

    const rumorEventId = rumorEvent.id?.trim() || null;
    if (rumorEventId) {
      const existingMessage = await chatDataService.getMessageByEventId(rumorEventId);
      if (existingMessage) {
        return;
      }
    }

    const contact = await contactsService.getContactByPublicKey(senderPubkeyHex);
    const existingChat = await chatDataService.getChatByPublicKey(senderPubkeyHex);
    const createdChat =
      existingChat
        ? null
        : await chatDataService.createChat({
            public_key: senderPubkeyHex,
            name: deriveChatName(contact, senderPubkeyHex),
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
      (await chatDataService.getChatByPublicKey(senderPubkeyHex));
    if (!chat) {
      return;
    }

    const createdAt = toIsoTimestampFromUnix(rumorEvent.created_at);
    const createdMessage = await chatDataService.createMessage({
      chat_id: chat.id,
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

    await chatDataService.updateChatPreview(
      chat.id,
      messageText,
      createdAt,
      Number(chat.unread_count ?? 0) + 1
    );
  }

  async function subscribePrivateMessagesForLoggedInUser(force = false): Promise<void> {
    console.log('### Subscribing to private messages for logged-in user, force:', force);
    const loggedInPubkeyHex = getLoggedInPublicKeyHex();
    const senderPrivateKeyHex = getPrivateKeyHex();

    console.log('### Logged-in pubkey:', loggedInPubkeyHex, senderPrivateKeyHex);

    if (!loggedInPubkeyHex || !senderPrivateKeyHex) {
      stopPrivateMessagesSubscription();
      return;
    }

    await contactsService.init();
    const loggedInContact = await contactsService.getContactByPublicKey(loggedInPubkeyHex);
    console.log("### loggedInContact", loggedInContact)
    const relayUrls = inputSanitizerService.normalizeReadableRelayUrls(loggedInContact?.relays);
    console.log('### Subscribing to private messages using relays:', relayUrls);
    if (relayUrls.length === 0) {
      stopPrivateMessagesSubscription();
      return;
    }
    const signature = `${loggedInPubkeyHex}:${relaySignature(relayUrls)}`;
    if (!force && privateMessagesSubscription && privateMessagesSubscriptionSignature === signature) {
      return;
    }

    await ensureRelayConnections(relayUrls);
    getOrCreateSigner(senderPrivateKeyHex);
    stopPrivateMessagesSubscription();

    const relaySet = NDKRelaySet.fromRelayUrls(relayUrls, ndk);
    console.log('### Subscribing to private messages:',       {
        kinds: [NDKKind.GiftWrap],
        '#p': [loggedInPubkeyHex],
        relaySet
      });
    privateMessagesSubscription = ndk.subscribe(
      {
        kinds: [NDKKind.GiftWrap],
        '#p': [loggedInPubkeyHex]
      },
      {
        relaySet,
        cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
        onEvent: (event) => {
          console.log("### Received private message event:", event);
          const wrappedEvent = event instanceof NDKEvent ? event : new NDKEvent(ndk, event);
          queuePrivateMessageIngestion(wrappedEvent, loggedInPubkeyHex);
        }
      }
    );
    privateMessagesSubscriptionSignature = signature;
  }

  async function fetchMyRelayList(relayUrls: string[]): Promise<string[]> {
    const senderPrivateKeyHex = getPrivateKeyHex();
    if (!senderPrivateKeyHex) {
      return [];
    }

    const relayList = inputSanitizerService.normalizeStringArray(relayUrls);
    if (relayList.length === 0) {
      return [];
    }

    await ensureRelayConnections(relayList);

    const signer = getOrCreateSigner(senderPrivateKeyHex);
    const user = await signer.user();
    user.ndk = ndk;

    const relayListEvent = await ndk.fetchEvent({
      kinds: [NDKKind.RelayList],
      authors: [user.pubkey]
    });
    if (!relayListEvent) {
      return [];
    }

    const parsedRelayList = NDKRelayList.from(relayListEvent);
    const combinedRelays = [
      ...parsedRelayList.readRelayUrls,
      ...parsedRelayList.writeRelayUrls,
      ...parsedRelayList.bothRelayUrls
    ].map((relay) => String(relay));

    return inputSanitizerService.normalizeStringArray(combinedRelays);
  }

  async function syncLoggedInContactProfile(relayUrls: string[]): Promise<void> {
    console.log('### Syncing logged-in contact profile, relays:', relayUrls);
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

      await subscribePrivateMessagesForLoggedInUser(true);
    })().finally(() => {
      syncLoggedInContactProfilePromise = null;
    });

    return syncLoggedInContactProfilePromise;
  }

  async function syncRecentChatContacts(relayUrls: string[], limit = 10): Promise<void> {
    console.log("### Syncing recent chat contacts, relays:", relayUrls, "limit:", limit);
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

      await chatDataService.init();
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
        const matchingChat = recentChats.find(
          (chat) => inputSanitizerService.normalizeHexKey(chat.public_key) === pubkeyHex
        );
        const fallbackName = matchingChat?.name?.trim() ?? '';
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

  function savePrivateKeyHex(hexPrivateKey: string): boolean {
    const normalized = inputSanitizerService.normalizeHexKey(hexPrivateKey);
    if (!normalized || !hasStorage()) {
      return false;
    }

    const signer = new NDKPrivateKeySigner(normalized);
    window.localStorage.setItem(PRIVATE_KEY_STORAGE_KEY, normalized);
    window.localStorage.setItem(PUBLIC_KEY_STORAGE_KEY, signer.pubkey);
    return true;
  }

  function clearPrivateKey(): void {
    if (!hasStorage()) {
      return;
    }

    window.localStorage.removeItem(PRIVATE_KEY_STORAGE_KEY);
    window.localStorage.removeItem(PUBLIC_KEY_STORAGE_KEY);
    cachedSigner = null;
    cachedSignerPrivateKeyHex = null;
    stopPrivateMessagesSubscription();
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
    relays: string[]
  ): Promise<NostrEvent> {
    console.log('### sendDirectMessage( to', recipientPublicKey, 'with message:', textMessage, 'relays:', relays);
    const message = textMessage.trim();
    if (!message) {
      throw new Error('Message cannot be empty.');
    }

    const recipientInput = recipientPublicKey.trim();
    if (!recipientInput) {
      throw new Error('Recipient public key is required.');
    }

    const senderPrivateKeyHex = getPrivateKeyHex();
    if (!senderPrivateKeyHex) {
      throw new Error('Missing private key in localStorage. Login is required.');
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

    const signer = getOrCreateSigner(senderPrivateKeyHex);
    const createdAt = Math.floor(Date.now() / 1000);

    const recipient = new NDKUser({ pubkey: normalizedRecipientPubkey });
    const nip17Event = new NDKEvent(ndk, {
      kind: NDKKind.PrivateDirectMessage,
      created_at: createdAt,
      pubkey: signer.pubkey,
      content: message,
      tags: [['p', normalizedRecipientPubkey]]
    });

    console.log('### Created NIP-17 event:', nip17Event);
    console.log('### Gift-wrapping event for recipient:', recipient);
    console.log('### Signer:', signer);
    const nip59Event = await giftWrap(nip17Event, recipient, signer, {
      rumorKind: NDKKind.PrivateDirectMessage
    });

    const relaySet = NDKRelaySet.fromRelayUrls(relayUrls, ndk);
    console.log('### relayUrls', relaySet);
    console.log('### relaySet', relaySet);
    await nip59Event.publish(relaySet);

    const dmEvent = await nip59Event.toNostrEvent();
    console.log('Sending DM event:', dmEvent);

    return dmEvent;

  }

  return {
    clearPrivateKey,
    ensureRelayConnections,
    fetchRelayNip11Info,
    fetchMyRelayList,
    getNip05Data,
    getLoggedInPublicKeyHex,
    getPrivateKeyHex,
    getRelayConnectionState,
    publishUserMetadata,
    publishMyRelayList,
    relayStatusVersion,
    resolveIdentifier,
    refreshContactByPublicKey,
    sendDirectMessage,
    savePrivateKeyFromNsec,
    savePrivateKeyHex,
    subscribePrivateMessagesForLoggedInUser,
    updateLoggedInUserRelayList,
    syncLoggedInContactProfile,
    syncRecentChatContacts,
    validateNpub,
    validateNsec
  };
});
