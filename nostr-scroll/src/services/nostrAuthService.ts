import { NDKPrivateKeySigner, nip19 } from '@nostr-dev-kit/ndk';
import type { NostrAuthSession, PrivateKeyValidationResult } from '../types/auth';

type NostrWindow = Window & {
  nostr?: {
    getPublicKey?: () => Promise<string>;
    signEvent?: (event: unknown) => Promise<unknown>;
  };
};

export const defaultAuthSession: NostrAuthSession = {
  isAuthenticated: false,
  method: null,
  currentPubkey: null,
  privateKeyHex: null,
};

function normalizeHexKey(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(normalized) ? normalized : null;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

export function normalizeStoredSession(value: unknown): NostrAuthSession {
  if (!value || typeof value !== 'object') {
    return { ...defaultAuthSession };
  }

  const rawSession = value as Partial<NostrAuthSession>;
  const currentPubkey =
    typeof rawSession.currentPubkey === 'string' ? normalizeHexKey(rawSession.currentPubkey) : null;
  const method = rawSession.method === 'nip07' || rawSession.method === 'nsec' ? rawSession.method : null;
  const privateKeyHex =
    typeof rawSession.privateKeyHex === 'string' ? normalizeHexKey(rawSession.privateKeyHex) : null;

  if (!rawSession.isAuthenticated || !currentPubkey || !method) {
    return { ...defaultAuthSession };
  }

  if (method === 'nsec' && !privateKeyHex) {
    return { ...defaultAuthSession };
  }

  return {
    isAuthenticated: true,
    method,
    currentPubkey,
    privateKeyHex: method === 'nsec' ? privateKeyHex : null,
  };
}

export function hasNip07Extension(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const nostr = (window as NostrWindow).nostr;
  return typeof nostr?.getPublicKey === 'function' && typeof nostr?.signEvent === 'function';
}

export async function loginWithExtension(): Promise<NostrAuthSession> {
  if (!hasNip07Extension()) {
    throw new Error('No NIP-07 extension detected. Install or enable one to continue.');
  }

  const rawPubkey = await (window as NostrWindow).nostr?.getPublicKey?.();
  const currentPubkey = typeof rawPubkey === 'string' ? normalizeHexKey(rawPubkey) : null;
  if (!currentPubkey) {
    throw new Error('Failed to read a valid public key from the NIP-07 extension.');
  }

  return {
    isAuthenticated: true,
    method: 'nip07',
    currentPubkey,
    privateKeyHex: null,
  };
}

export function validatePrivateKey(input: string): PrivateKeyValidationResult {
  const normalizedHexKey = normalizeHexKey(input);
  if (normalizedHexKey) {
    return {
      isValid: true,
      hexPrivateKey: normalizedHexKey,
      format: 'hex',
    };
  }

  const value = input.trim();
  if (!value) {
    return {
      isValid: false,
      hexPrivateKey: null,
      format: null,
    };
  }

  try {
    const decoded = nip19.decode(value);
    if (decoded.type !== 'nsec') {
      return {
        isValid: false,
        hexPrivateKey: null,
        format: null,
      };
    }

    const data = decoded.data as unknown;
    if (data instanceof Uint8Array) {
      if (data.length !== 32) {
        return {
          isValid: false,
          hexPrivateKey: null,
          format: null,
        };
      }

      return {
        isValid: true,
        hexPrivateKey: bytesToHex(data),
        format: 'nsec',
      };
    }

    if (typeof data === 'string') {
      const decodedHexKey = normalizeHexKey(data);
      return {
        isValid: Boolean(decodedHexKey),
        hexPrivateKey: decodedHexKey,
        format: decodedHexKey ? 'nsec' : null,
      };
    }
  } catch {}

  return {
    isValid: false,
    hexPrivateKey: null,
    format: null,
  };
}

export function loginWithPrivateKey(input: string): NostrAuthSession {
  const validation = validatePrivateKey(input);
  if (!validation.isValid || !validation.hexPrivateKey) {
    throw new Error('Enter a valid nsec or 64-character hex private key.');
  }

  const signer = new NDKPrivateKeySigner(validation.hexPrivateKey);

  return {
    isAuthenticated: true,
    method: 'nsec',
    currentPubkey: signer.pubkey,
    privateKeyHex: validation.hexPrivateKey,
  };
}
