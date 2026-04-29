import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { initializeDatabaseSchema } from '../src/database.js';
import { processRelayEvent } from '../src/notificationProcessor.js';
import { PushGatewayRepository } from '../src/repository.js';
import type { PushProvider } from '../src/types.js';
import { VALID_EVENT_ID, VALID_PUBKEY_A, VALID_PUBKEY_B } from './helpers.js';

function createRepository(
  watchedRecipientLabels = [{ recipientPubkey: VALID_PUBKEY_B, label: 'Friends' }]
): PushGatewayRepository {
  const database = new DatabaseSync(':memory:');
  initializeDatabaseSchema(database);
  const repository = new PushGatewayRepository(database);
  repository.registerDevice({
    ownerPubkey: VALID_PUBKEY_A,
    deviceId: 'device-1',
    platform: 'android',
    appVersion: '0.1.0',
    fcmToken: 'token-1',
    relays: [{ url: 'wss://relay.example/', read: true }],
    watchedPubkeys: [VALID_PUBKEY_A, VALID_PUBKEY_B],
    watchedRecipientLabels,
    notificationsEnabled: true,
  });
  return repository;
}

describe('processRelayEvent', () => {
  it('sends one labeled notification for duplicate NIP-17 wrapper sightings', async () => {
    const repository = createRepository();
    const pushProvider: PushProvider = {
      sendNewMessageNotification: vi.fn(async () => ({ ok: true as const })),
    };
    const event = {
      id: VALID_EVENT_ID,
      kind: 1059,
      tags: [['p', VALID_PUBKEY_B]],
    };

    await processRelayEvent({
      event,
      relayUrl: 'wss://relay.example/',
      repository,
      pushProvider,
    });
    await processRelayEvent({
      event,
      relayUrl: 'wss://relay.two/',
      repository,
      pushProvider,
    });

    expect(pushProvider.sendNewMessageNotification).toHaveBeenCalledTimes(1);
    expect(pushProvider.sendNewMessageNotification).toHaveBeenCalledWith({
      token: 'token-1',
      recipientPubkey: VALID_PUBKEY_B,
      eventId: VALID_EVENT_ID,
      notificationTitle: 'Friends',
      notificationBody: 'New message',
      notificationTag: expect.stringMatching(/^nostr-chat:[0-9a-f]{32}$/),
      notificationCount: 1,
    });
  });

  it('keeps direct-message notifications separate from unlabeled watched pubkeys', async () => {
    const repository = createRepository([]);
    const sendNewMessageNotification = vi.fn<PushProvider['sendNewMessageNotification']>(
      async () => ({ ok: true as const })
    );
    const pushProvider: PushProvider = {
      sendNewMessageNotification,
    };

    await processRelayEvent({
      event: {
        id: 'd'.repeat(64),
        kind: 1059,
        tags: [['p', VALID_PUBKEY_A]],
      },
      relayUrl: 'wss://relay.example/',
      repository,
      pushProvider,
    });
    await processRelayEvent({
      event: {
        id: 'e'.repeat(64),
        kind: 1059,
        tags: [['p', VALID_PUBKEY_B]],
      },
      relayUrl: 'wss://relay.example/',
      repository,
      pushProvider,
    });

    expect(sendNewMessageNotification).toHaveBeenCalledTimes(2);
    const directMessageNotification = sendNewMessageNotification.mock.calls[0]?.[0];
    const unlabeledWatchedPubkeyNotification = sendNewMessageNotification.mock.calls[1]?.[0];
    expect(directMessageNotification?.notificationTitle).toBe('Nostr Chat');
    expect(unlabeledWatchedPubkeyNotification?.notificationTitle).toBe('Nostr Chat');
    expect(directMessageNotification?.notificationTag).not.toBe(
      unlabeledWatchedPubkeyNotification?.notificationTag
    );
    expect(directMessageNotification?.notificationCount).toBe(1);
    expect(unlabeledWatchedPubkeyNotification?.notificationCount).toBe(1);
  });
});
