import { defineStore } from 'pinia';
import NDK, {
  NDKEvent,
  NDKKind,
  NDKPrivateKeySigner,
  NDKRelaySet,
  NDKUser,
  giftWrap,
  isValidNip05,
  isValidPubkey,
  nip19,
  type NostrEvent
} from '@nostr-dev-kit/ndk';

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
      const ndk = new NDK();
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

    const ndk = new NDK();
    const signer = new NDKPrivateKeySigner(senderPrivateKeyHex, ndk);
    ndk.signer = signer;
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
    await nip59Event.publish(relaySet);

    const dmEvent = await nip59Event.toNostrEvent();
    console.log('Sending DM event:', dmEvent);

    return dmEvent;

  }

  return {
    clearPrivateKey,
    getNip05Data,
    getPrivateKeyHex,
    resolveIdentifier,
    sendDirectMessage,
    savePrivateKeyFromNsec,
    savePrivateKeyHex,
    validateNpub,
    validateNsec
  };
});
