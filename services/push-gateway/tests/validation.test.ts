import { describe, expect, it } from 'vitest';
import { parseDeviceRegistrationInput } from '../src/validation.js';
import { VALID_PUBKEY_A, VALID_PUBKEY_B } from './helpers.js';

describe('registration validation', () => {
  it('normalizes readable relays and watched pubkeys', () => {
    const input = parseDeviceRegistrationInput({
      ownerPubkey: VALID_PUBKEY_A.toUpperCase(),
      deviceId: ' device-1 ',
      platform: 'android',
      appVersion: '0.1.0',
      fcmToken: ' token ',
      relays: [
        { url: 'wss://relay.example/path#fragment', read: true },
        { url: 'wss://relay.example/path', read: true },
        { url: 'https://not-a-relay.example', read: true },
        { url: 'wss://write-only.example', read: false },
      ],
      watchedPubkeys: [VALID_PUBKEY_B, VALID_PUBKEY_A.toUpperCase(), 'bad'],
      watchedRecipientLabels: [
        { recipientPubkey: VALID_PUBKEY_B.toUpperCase(), label: ' Friends ' },
        { recipientPubkey: 'bad', label: 'Ignored' },
        { recipientPubkey: VALID_PUBKEY_A, label: '' },
      ],
      notificationsEnabled: true,
    });

    expect(input.ownerPubkey).toBe(VALID_PUBKEY_A);
    expect(input.deviceId).toBe('device-1');
    expect(input.fcmToken).toBe('token');
    expect(input.relays).toEqual([{ url: 'wss://relay.example/path', read: true }]);
    expect(input.watchedPubkeys).toEqual([VALID_PUBKEY_A, VALID_PUBKEY_B]);
    expect(input.watchedRecipientLabels).toEqual([
      { recipientPubkey: VALID_PUBKEY_B, label: 'Friends' },
    ]);
  });

  it('requires the owner pubkey in watchedPubkeys', () => {
    expect(() =>
      parseDeviceRegistrationInput({
        ownerPubkey: VALID_PUBKEY_A,
        deviceId: 'device-1',
        platform: 'android',
        appVersion: '0.1.0',
        fcmToken: 'token',
        relays: [{ url: 'wss://relay.example', read: true }],
        watchedPubkeys: [VALID_PUBKEY_B],
        notificationsEnabled: true,
      })
    ).toThrow('watchedPubkeys must include the owner pubkey');
  });
});
