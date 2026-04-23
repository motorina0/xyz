import { describe, expect, it } from 'vitest';
import {
  encodeEventReference,
  encodeProfileReference,
  normalizeEventReference,
  normalizeProfileReference,
  shortenPubkey,
  slugifyHandle,
  toNostrUri,
} from '../../src/services/nostrEntityService';

const PUBKEY = 'f'.repeat(64);
const EVENT_ID = 'e'.repeat(64);
const AUTHOR = 'a'.repeat(64);

describe('nostrEntityService', () => {
  it('normalizes hex and nostr-prefixed profile references', () => {
    expect(normalizeProfileReference(`nostr:${PUBKEY}`)).toEqual({
      pubkey: PUBKEY,
      relayHints: [],
    });
  });

  it('round-trips encoded profile references and caps relay hints at four', () => {
    const encoded = encodeProfileReference(PUBKEY, [
      'wss://relay-1.example',
      'wss://relay-2.example',
      'wss://relay-3.example',
      'wss://relay-4.example',
      'wss://relay-5.example',
    ]);

    expect(normalizeProfileReference(encoded)).toEqual({
      pubkey: PUBKEY,
      relayHints: [
        'wss://relay-1.example',
        'wss://relay-2.example',
        'wss://relay-3.example',
        'wss://relay-4.example',
      ],
    });
  });

  it('round-trips encoded event references with relay hints and author', () => {
    const encoded = encodeEventReference(
      EVENT_ID,
      ['wss://relay-1.example', 'wss://relay-2.example'],
      AUTHOR
    );

    expect(normalizeEventReference(encoded)).toEqual({
      id: EVENT_ID,
      relayHints: ['wss://relay-1.example', 'wss://relay-2.example'],
      author: AUTHOR,
    });
  });

  it('formats pubkeys and handles for UI display', () => {
    expect(shortenPubkey(PUBKEY, 6, 6)).toBe('ffffff...ffffff');
    expect(slugifyHandle(' Vlad Stan! ')).toBe('vladstan');
    expect(toNostrUri('npub1test')).toBe('nostr:npub1test');
  });
});
