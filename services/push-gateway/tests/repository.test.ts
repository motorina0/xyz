import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeDatabaseSchema } from '../src/database.js';
import { PushGatewayRepository } from '../src/repository.js';
import { VALID_PUBKEY_A, VALID_PUBKEY_B } from './helpers.js';

const REGISTRATION_SINCE = Math.floor(Date.parse('2026-04-29T10:00:00.000Z') / 1000);

function createRepository(): PushGatewayRepository {
  const database = new DatabaseSync(':memory:');
  initializeDatabaseSchema(database);
  return new PushGatewayRepository(database);
}

describe('PushGatewayRepository', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-29T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('replaces relays and watched pubkeys atomically on registration refresh', () => {
    const repository = createRepository();
    repository.registerDevice({
      ownerPubkey: VALID_PUBKEY_A,
      deviceId: 'device-1',
      platform: 'android',
      appVersion: '0.1.0',
      fcmToken: 'token-1',
      relays: [{ url: 'wss://relay.one/', read: true }],
      watchedPubkeys: [VALID_PUBKEY_A, VALID_PUBKEY_B],
      watchedRecipientLabels: [{ recipientPubkey: VALID_PUBKEY_B, label: 'Friends' }],
      notificationsEnabled: true,
    });

    expect(repository.listDeliveryDevices(VALID_PUBKEY_B)).toEqual([
      {
        ownerPubkey: VALID_PUBKEY_A,
        deviceId: 'device-1',
        fcmToken: 'token-1',
        since: REGISTRATION_SINCE,
        notificationLabel: 'Friends',
      },
    ]);
    expect(repository.incrementNotificationCount(VALID_PUBKEY_A, 'device-1', 'tag-1')).toBe(1);
    expect(repository.incrementNotificationCount(VALID_PUBKEY_A, 'device-1', 'tag-1')).toBe(2);

    repository.registerDevice({
      ownerPubkey: VALID_PUBKEY_A,
      deviceId: 'device-1',
      platform: 'android',
      appVersion: '0.1.1',
      fcmToken: 'token-2',
      relays: [{ url: 'wss://relay.two/', read: true }],
      watchedPubkeys: [VALID_PUBKEY_A],
      watchedRecipientLabels: [],
      notificationsEnabled: true,
    });

    expect(repository.listRelayWatchPlans()).toEqual([
      {
        relayUrl: 'wss://relay.two/',
        recipientPubkeys: [VALID_PUBKEY_A],
        since: REGISTRATION_SINCE,
      },
    ]);
    expect(repository.listDeliveryDevices(VALID_PUBKEY_B)).toEqual([]);
    expect(repository.incrementNotificationCount(VALID_PUBKEY_A, 'device-1', 'tag-1')).toBe(1);
  });

  it('deduplicates event sightings by event and recipient pubkey', () => {
    const repository = createRepository();
    expect(repository.markEventSeen('c'.repeat(64), VALID_PUBKEY_A, 'wss://relay.one/')).toBe(true);
    expect(repository.markEventSeen('c'.repeat(64), VALID_PUBKEY_A, 'wss://relay.two/')).toBe(
      false
    );
    expect(repository.markEventSeen('c'.repeat(64), VALID_PUBKEY_B, 'wss://relay.two/')).toBe(true);
  });
});
