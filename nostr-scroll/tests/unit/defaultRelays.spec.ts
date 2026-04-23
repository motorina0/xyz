import { describe, expect, it } from 'vitest';
import {
  FALLBACK_DEFAULT_APP_RELAY_URLS,
  parseDefaultAppRelayUrls,
} from '../../src/constants/relays';

describe('default relay parsing', () => {
  it('parses and normalizes configured relay URLs', () => {
    expect(
      parseDefaultAppRelayUrls('ws://127.0.0.1:7000,wss://relay.example,invalid-relay')
    ).toEqual(['ws://127.0.0.1:7000/', 'wss://relay.example/']);
  });

  it('falls back when no valid relays are configured', () => {
    expect(parseDefaultAppRelayUrls('invalid')).toEqual(FALLBACK_DEFAULT_APP_RELAY_URLS);
    expect(parseDefaultAppRelayUrls(undefined)).toEqual(FALLBACK_DEFAULT_APP_RELAY_URLS);
  });
});
