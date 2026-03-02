import { defineStore } from 'pinia';
import { ref } from 'vue';
import NDK, {
  NDKEvent,
  NDKKind,
  NDKPrivateKeySigner,
  NDKRelayList,
  type NDKUserProfile,
  type NDKRelayInformation,
  NDKRelayStatus,
  NDKRelaySet,
  NDKUser,
  giftWrap,
  isValidNip05,
  isValidPubkey,
  nip19,
  normalizeRelayUrl,
  type NostrEvent
} from '@nostr-dev-kit/ndk';
import { contactsService } from 'src/services/contactsService';
import type { ContactMetadata, ContactRelay } from 'src/types/contact';

export interface NostrIdentifierResolutionResult {
  isValid: boolean;
  normalizedPubkey: string | null;
  resolvedName: string | null;
  relays: string[];
  identifierType: 'pubkey' | 'nip05' | null;
  error: 'invalid' | 'nip05_unresolved' | null;
}

export interface NostrNpubValidationResult {
  isValid: boolean;
  normalizedPubkey: string | null;
}

export interface NostrNsecValidationResult {
  isValid: boolean;
  hexPrivateKey: string | null;
}

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

const PRIVATE_KEY_STORAGE_KEY = 'nsec';
const PUBLIC_KEY_STORAGE_KEY = 'npub';

function hasStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function normalizeHexKey(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(normalized) ? normalized : null;
}

function extractNip05Name(identifier: string): string | null {
  const [namePart] = identifier.split('@');
  const normalized = namePart?.trim();
  return normalized || null;
}

function normalizeRelays(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const uniqueRelays = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string') {
      continue;
    }

    const relay = entry.trim();
    if (!relay) {
      continue;
    }

    uniqueRelays.add(relay);
  }

  return Array.from(uniqueRelays);
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

  function getLoggedInPublicKeyHex(): string | null {
    if (!hasStorage()) {
      return null;
    }

    const stored = window.localStorage.getItem(PUBLIC_KEY_STORAGE_KEY)?.trim();
    if (!stored) {
      return null;
    }

    const fromHex = normalizeHexKey(stored);
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

  function normalizeRelayEntries(relayUrls: string[]): ContactRelay[] {
    const uniqueRelays = new Set<string>();
    for (const relayUrl of relayUrls) {
      const normalizedRelay = relayUrl.trim();
      if (!normalizedRelay) {
        continue;
      }

      uniqueRelays.add(normalizedRelay);
    }

    return Array.from(uniqueRelays).map((url) => ({
      url,
      read: true,
      write: true
    }));
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

    const relayList = normalizeRelays(relayUrls);
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

  async function fetchMyRelayList(relayUrls: string[]): Promise<string[]> {
    const senderPrivateKeyHex = getPrivateKeyHex();
    if (!senderPrivateKeyHex) {
      return [];
    }

    const relayList = normalizeRelays(relayUrls);
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

    return normalizeRelays(combinedRelays);
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

      await contactsService.init();

      const existingContact = await contactsService.getContactByPublicKey(loggedInPubkeyHex);
      const nip05Identifier = existingContact?.meta.nip05?.trim() ?? '';
      const nprofileIdentifier =
        existingContact?.meta.nprofile?.trim() || encodeNprofile(loggedInPubkeyHex) || '';
      const npubIdentifier = existingContact?.meta.npub?.trim() || encodeNpub(loggedInPubkeyHex) || '';
      const hexIdentifier = loggedInPubkeyHex;

      const activeRelays = normalizeRelays(relayUrls);
      if (activeRelays.length > 0) {
        try {
          await ensureRelayConnections(activeRelays);
        } catch (error) {
          console.warn('Failed to connect relays before profile sync', error);
        }
      }

      const identifiers = [nip05Identifier, nprofileIdentifier, npubIdentifier, hexIdentifier]
        .map((identifier) => identifier.trim())
        .filter((identifier, index, list) => identifier.length > 0 && list.indexOf(identifier) === index);

      let resolvedUser: NDKUser | undefined;
      for (const identifier of identifiers) {
        try {
          const user = await ndk.fetchUser(identifier, true);
          if (!user) {
            continue;
          }

          const resolvedPubkey = normalizeHexKey(user.pubkey);
          if (!resolvedPubkey || resolvedPubkey !== loggedInPubkeyHex) {
            continue;
          }

          resolvedUser = user;
          break;
        } catch {
          continue;
        }
      }

      if (!resolvedUser) {
        return;
      }

      let fetchedProfile: NDKUserProfile | null = null;
      try {
        fetchedProfile = await resolvedUser.fetchProfile();
      } catch (error) {
        console.warn('Failed to fetch logged-in profile metadata', error);
      }

      let resolvedNpub = npubIdentifier;
      if (!resolvedNpub) {
        try {
          resolvedNpub = resolvedUser.npub;
        } catch {
          resolvedNpub = '';
        }
      }

      let resolvedNprofile = nprofileIdentifier;
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

      const fallbackName = loggedInPubkeyHex.slice(0, 16);
      const nextName =
        nextMeta.display_name?.trim() ||
        nextMeta.name?.trim() ||
        existingContact?.name?.trim() ||
        fallbackName;

      const fetchedRelays = normalizeRelayEntries(resolvedUser.relayUrls ?? []);
      const nextRelays = fetchedRelays.length > 0 ? fetchedRelays : existingContact?.relays ?? [];

      if (existingContact) {
        await contactsService.updateContact(existingContact.id, {
          name: nextName,
          meta: nextMeta,
          relays: nextRelays
        });
        return;
      }

      await contactsService.createContact({
        public_key: loggedInPubkeyHex,
        name: nextName,
        given_name: null,
        meta: nextMeta,
        relays: nextRelays
      });
    })().finally(() => {
      syncLoggedInContactProfilePromise = null;
    });

    return syncLoggedInContactProfilePromise;
  }

  function getPrivateKeyHex(): string | null {
    if (!hasStorage()) {
      return null;
    }

    const stored = window.localStorage.getItem(PRIVATE_KEY_STORAGE_KEY);
    if (!stored) {
      return null;
    }

    return normalizeHexKey(stored);
  }

  function savePrivateKeyHex(hexPrivateKey: string): boolean {
    const normalized = normalizeHexKey(hexPrivateKey);
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
  }

  function validateNsec(input: string): NostrNsecValidationResult {
    const value = input.trim();
    if (!value) {
      return { isValid: false, hexPrivateKey: null };
    }

    try {
      const decoded = nip19.decode(value);
      if (decoded.type !== 'nsec') {
        return { isValid: false, hexPrivateKey: null };
      }

      const data = decoded.data as unknown;
      if (data instanceof Uint8Array) {
        if (data.length !== 32) {
          return { isValid: false, hexPrivateKey: null };
        }

        return { isValid: true, hexPrivateKey: bytesToHex(data) };
      }

      if (typeof data === 'string') {
        const normalized = normalizeHexKey(data);
        return { isValid: Boolean(normalized), hexPrivateKey: normalized };
      }

      return { isValid: false, hexPrivateKey: null };
    } catch {
      return { isValid: false, hexPrivateKey: null };
    }
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
    const value = input.trim();
    if (!value) {
      return { isValid: false, normalizedPubkey: null };
    }

    try {
      const decoded = nip19.decode(value);
      if (decoded.type !== 'npub' || typeof decoded.data !== 'string') {
        return { isValid: false, normalizedPubkey: null };
      }

      if (!isValidPubkey(decoded.data)) {
        return { isValid: false, normalizedPubkey: null };
      }

      return { isValid: true, normalizedPubkey: decoded.data.toLowerCase() };
    } catch {
      return { isValid: false, normalizedPubkey: null };
    }
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

      const relays = normalizeRelays(user?.relayUrls ?? []);

      return {
        isValid: true,
        normalizedPubkey,
        name: user?.profile?.name?.trim() || extractNip05Name(value),
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

    const relayUrls = normalizeRelays(relays);
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
    relayStatusVersion,
    resolveIdentifier,
    sendDirectMessage,
    savePrivateKeyFromNsec,
    savePrivateKeyHex,
    syncLoggedInContactProfile,
    validateNpub,
    validateNsec
  };
});
