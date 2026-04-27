import { logError, logInfo, logWarn } from './logger.js';
import type { PushGatewayRepository } from './repository.js';
import type { PushProvider, PushSendResult, RelayEvent } from './types.js';
import { normalizePubkey } from './validation.js';

function isPushSendFailure(
  result: PushSendResult
): result is Extract<PushSendResult, { ok: false }> {
  return result.ok === false;
}

function normalizeEventId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(normalized) ? normalized : null;
}

function readRecipientPubkeys(event: RelayEvent): string[] {
  if (!Array.isArray(event.tags)) {
    return [];
  }

  const pubkeys = new Set<string>();
  for (const tag of event.tags) {
    if (!Array.isArray(tag) || tag[0] !== 'p') {
      continue;
    }

    const pubkey = normalizePubkey(tag[1]);
    if (pubkey) {
      pubkeys.add(pubkey);
    }
  }

  return Array.from(pubkeys);
}

export async function processRelayEvent(options: {
  event: RelayEvent;
  relayUrl: string;
  repository: PushGatewayRepository;
  pushProvider: PushProvider;
}): Promise<void> {
  if (options.event.kind !== 1059) {
    return;
  }

  const eventId = normalizeEventId(options.event.id);
  if (!eventId) {
    return;
  }

  for (const recipientPubkey of readRecipientPubkeys(options.event)) {
    if (!options.repository.markEventSeen(eventId, recipientPubkey, options.relayUrl)) {
      continue;
    }

    const devices = options.repository.listDeliveryDevices(recipientPubkey);
    if (devices.length === 0) {
      continue;
    }

    logInfo('Sending push notifications for NIP-17 wrapper.', {
      eventId,
      recipientPubkey,
      deviceCount: devices.length,
    });

    for (const device of devices) {
      const result = await options.pushProvider.sendNewMessageNotification({
        token: device.fcmToken,
        recipientPubkey,
        eventId,
      });

      if (isPushSendFailure(result)) {
        if (result.invalidToken) {
          options.repository.disableDevice(device.ownerPubkey, device.deviceId);
          logWarn('Disabled device with invalid FCM token.', {
            ownerPubkey: device.ownerPubkey,
            deviceId: device.deviceId,
          });
          continue;
        }

        logError('Failed to send FCM notification.', {
          ownerPubkey: device.ownerPubkey,
          deviceId: device.deviceId,
          error: result.error,
        });
      }
    }

    options.repository.markEventNotified(eventId, recipientPubkey);
  }
}
