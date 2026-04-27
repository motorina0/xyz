import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { migrateDatabase } from '../src/database.js';
import { PushGatewayRepository } from '../src/repository.js';
import { VALID_PUBKEY_A, VALID_PUBKEY_B } from './helpers.js';

function createRepository(): PushGatewayRepository {
  const database = new DatabaseSync(':memory:');
  migrateDatabase(database);
  return new PushGatewayRepository(database);
}

describe('PushGatewayRepository', () => {
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
      notificationsEnabled: true,
    });

    repository.registerDevice({
      ownerPubkey: VALID_PUBKEY_A,
      deviceId: 'device-1',
      platform: 'android',
      appVersion: '0.1.1',
      fcmToken: 'token-2',
      relays: [{ url: 'wss://relay.two/', read: true }],
      watchedPubkeys: [VALID_PUBKEY_A],
      notificationsEnabled: true,
    });

    expect(repository.listRelayWatchPlans()).toEqual([
      {
        relayUrl: 'wss://relay.two/',
        recipientPubkeys: [VALID_PUBKEY_A],
      },
    ]);
    expect(repository.listDeliveryDevices(VALID_PUBKEY_B)).toEqual([]);
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
