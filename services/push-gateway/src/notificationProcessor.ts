import { createHash } from 'node:crypto';
import { logDebug, logError, logInfo, logWarn } from './logger.js';
import type { PushGatewayRepository } from './repository.js';
import type { ActiveDeliveryDevice, PushProvider, PushSendResult, RelayEvent } from './types.js';
import { normalizePubkey } from './validation.js';

const DEFAULT_NOTIFICATION_TITLE = 'Nostr Chat';

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

function resolveNotificationGrouping(
  device: ActiveDeliveryDevice,
  recipientPubkey: string
): {
  title: string;
  tagKey: string;
} {
  const label = device.notificationLabel?.trim();
  if (label) {
    return {
      title: label,
      tagKey: `label:${label}`,
    };
  }

  if (recipientPubkey !== device.ownerPubkey) {
    return {
      title: DEFAULT_NOTIFICATION_TITLE,
      tagKey: `recipient:${recipientPubkey}`,
    };
  }

  return {
    title: DEFAULT_NOTIFICATION_TITLE,
    tagKey: 'direct-messages',
  };
}

function buildNotificationTag(ownerPubkey: string, tagKey: string): string {
  const hash = createHash('sha256')
    .update(ownerPubkey)
    .update('\0')
    .update(tagKey)
    .digest('hex')
    .slice(0, 32);
  return `nostr-chat:${hash}`;
}

function buildNotificationBody(notificationCount: number): string {
  return notificationCount > 1 ? `${notificationCount} new messages` : 'New message';
}

export async function processRelayEvent(options: {
  event: RelayEvent;
  relayUrl: string;
  repository: PushGatewayRepository;
  pushProvider: PushProvider;
}): Promise<void> {
  if (options.event.kind !== 1059) {
    logDebug('Ignored relay event with unsupported kind.', {
      relayUrl: options.relayUrl,
      eventId: options.event.id,
      kind: options.event.kind,
    });
    return;
  }

  const eventId = normalizeEventId(options.event.id);
  if (!eventId) {
    logDebug('Ignored relay event with invalid id.', {
      relayUrl: options.relayUrl,
      eventId: options.event.id,
      kind: options.event.kind,
    });
    return;
  }

  const recipientPubkeys = readRecipientPubkeys(options.event);
  logDebug('Processing NIP-17 wrapper relay event.', {
    relayUrl: options.relayUrl,
    eventId,
    recipientPubkeyCount: recipientPubkeys.length,
    recipientPubkeys,
  });

  for (const recipientPubkey of recipientPubkeys) {
    if (!options.repository.markEventSeen(eventId, recipientPubkey, options.relayUrl)) {
      logDebug('Skipped duplicate relay event sighting.', {
        relayUrl: options.relayUrl,
        eventId,
        recipientPubkey,
      });
      continue;
    }

    const devices = options.repository.listDeliveryDevices(recipientPubkey);
    if (devices.length === 0) {
      logDebug('No active devices for relay event recipient.', {
        relayUrl: options.relayUrl,
        eventId,
        recipientPubkey,
      });
      continue;
    }

    logInfo('Sending push notifications for NIP-17 wrapper.', {
      eventId,
      recipientPubkey,
      deviceCount: devices.length,
    });

    for (const device of devices) {
      const notificationGrouping = resolveNotificationGrouping(device, recipientPubkey);
      const notificationTag = buildNotificationTag(device.ownerPubkey, notificationGrouping.tagKey);
      const notificationCount = options.repository.incrementNotificationCount(
        device.ownerPubkey,
        device.deviceId,
        notificationTag
      );
      logDebug('Sending FCM notification to registered device.', {
        relayUrl: options.relayUrl,
        eventId,
        recipientPubkey,
        ownerPubkey: device.ownerPubkey,
        deviceId: device.deviceId,
        notificationTitle: notificationGrouping.title,
        notificationTag,
        notificationCount,
      });
      const result = await options.pushProvider.sendNewMessageNotification({
        token: device.fcmToken,
        recipientPubkey,
        eventId,
        notificationTitle: notificationGrouping.title,
        notificationBody: buildNotificationBody(notificationCount),
        notificationTag,
        notificationCount,
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

        logDebug('FCM notification send failed.', {
          relayUrl: options.relayUrl,
          eventId,
          recipientPubkey,
          ownerPubkey: device.ownerPubkey,
          deviceId: device.deviceId,
          notificationTag,
          notificationCount,
          invalidToken: result.invalidToken,
        });
        logError('Failed to send FCM notification.', {
          ownerPubkey: device.ownerPubkey,
          deviceId: device.deviceId,
          error: result.error,
        });
        continue;
      }

      logDebug('FCM notification sent successfully.', {
        relayUrl: options.relayUrl,
        eventId,
        recipientPubkey,
        ownerPubkey: device.ownerPubkey,
        deviceId: device.deviceId,
        notificationTag,
        notificationCount,
      });
    }

    options.repository.markEventNotified(eventId, recipientPubkey);
    logDebug('Marked relay event recipient as notified.', {
      relayUrl: options.relayUrl,
      eventId,
      recipientPubkey,
      deviceCount: devices.length,
    });
  }
}
