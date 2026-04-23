import { describe, expect, it } from 'vitest';
import {
  normalizeReadableRelayUrls,
  normalizeRelayListEntries,
  normalizeWritableRelayUrls,
  validateRelayUrl,
} from '../../src/utils/relayList';

describe('relayList utilities', () => {
  it('normalizes and merges duplicate relay entries', () => {
    const relayEntries = normalizeRelayListEntries([
      'wss://relay.example',
      { url: 'wss://relay.example/', read: false, write: true },
      { url: 'wss://relay-two.example', read: true, write: false },
      { url: 'https://not-a-relay.example', read: true, write: true },
    ]);

    expect(relayEntries).toEqual([
      {
        url: 'wss://relay.example/',
        read: true,
        write: true,
      },
      {
        url: 'wss://relay-two.example/',
        read: true,
        write: false,
      },
    ]);
  });

  it('derives readable and writable relay URLs', () => {
    const relayEntries = [
      { url: 'wss://relay.example/', read: true, write: false },
      { url: 'wss://relay-two.example/', read: false, write: true },
      { url: 'wss://relay-three.example/', read: true, write: true },
    ];

    expect(normalizeReadableRelayUrls(relayEntries)).toEqual([
      'wss://relay.example/',
      'wss://relay-three.example/',
    ]);
    expect(normalizeWritableRelayUrls(relayEntries)).toEqual([
      'wss://relay-two.example/',
      'wss://relay-three.example/',
    ]);
  });

  it('validates relay URLs', () => {
    expect(validateRelayUrl('https://relay.example')).toBe('Relay must use ws:// or wss://');
    expect(validateRelayUrl('ws://relay.example')).toBe('');
  });
});
