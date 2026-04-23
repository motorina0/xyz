import { nip19 } from '@nostr-dev-kit/ndk';

const HEX_64_REGEX = /^[0-9a-f]{64}$/i;

function stripNostrPrefix(value: string): string {
  return value.startsWith('nostr:') ? value.slice('nostr:'.length) : value;
}

export function shortenPubkey(pubkey: string, start = 8, end = 4): string {
  if (pubkey.length <= start + end) {
    return pubkey;
  }

  return `${pubkey.slice(0, start)}...${pubkey.slice(-end)}`;
}

export function slugifyHandle(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 20);

  return slug || 'nostr';
}

export function normalizeProfileReference(input: string | null | undefined): {
  pubkey: string;
  relayHints: string[];
} | null {
  const trimmedValue = stripNostrPrefix((input ?? '').trim());
  if (!trimmedValue) {
    return null;
  }

  if (HEX_64_REGEX.test(trimmedValue)) {
    return {
      pubkey: trimmedValue.toLowerCase(),
      relayHints: [],
    };
  }

  try {
    const decoded = nip19.decode(trimmedValue);
    if (
      decoded.type === 'npub' &&
      typeof decoded.data === 'string' &&
      HEX_64_REGEX.test(decoded.data)
    ) {
      return {
        pubkey: decoded.data.toLowerCase(),
        relayHints: [],
      };
    }

    if (decoded.type === 'nprofile' && decoded.data && typeof decoded.data === 'object') {
      const profilePointer = decoded.data as { pubkey?: string; relays?: string[] };
      if (typeof profilePointer.pubkey === 'string' && HEX_64_REGEX.test(profilePointer.pubkey)) {
        return {
          pubkey: profilePointer.pubkey.toLowerCase(),
          relayHints: Array.isArray(profilePointer.relays) ? profilePointer.relays : [],
        };
      }
    }
  } catch {}

  return null;
}

export function normalizeEventReference(input: string | null | undefined): {
  id: string;
  relayHints: string[];
  author?: string;
} | null {
  const trimmedValue = stripNostrPrefix((input ?? '').trim());
  if (!trimmedValue) {
    return null;
  }

  if (HEX_64_REGEX.test(trimmedValue)) {
    return {
      id: trimmedValue.toLowerCase(),
      relayHints: [],
    };
  }

  try {
    const decoded = nip19.decode(trimmedValue);
    if (
      decoded.type === 'note' &&
      typeof decoded.data === 'string' &&
      HEX_64_REGEX.test(decoded.data)
    ) {
      return {
        id: decoded.data.toLowerCase(),
        relayHints: [],
      };
    }

    if (decoded.type === 'nevent' && decoded.data && typeof decoded.data === 'object') {
      const eventPointer = decoded.data as { id?: string; relays?: string[]; author?: string };
      if (typeof eventPointer.id === 'string' && HEX_64_REGEX.test(eventPointer.id)) {
        return {
          id: eventPointer.id.toLowerCase(),
          relayHints: Array.isArray(eventPointer.relays) ? eventPointer.relays : [],
          author:
            typeof eventPointer.author === 'string' && HEX_64_REGEX.test(eventPointer.author)
              ? eventPointer.author.toLowerCase()
              : undefined,
        };
      }
    }
  } catch {}

  return null;
}

export function encodeProfileReference(pubkey: string, relayHints: string[] = []): string {
  return nip19.nprofileEncode({
    pubkey,
    relays: relayHints.slice(0, 4),
  });
}

export function encodeEventReference(
  id: string,
  relayHints: string[] = [],
  author?: string
): string {
  return nip19.neventEncode({
    id,
    relays: relayHints.slice(0, 4),
    author,
  });
}

export function toNostrUri(value: string): string {
  return `nostr:${value}`;
}
