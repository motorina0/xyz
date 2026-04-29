import type { DatabaseSync } from 'node:sqlite';
import type {
  ActiveDeliveryDevice,
  DeviceRegistrationInput,
  DeviceUnregisterInput,
} from './types.js';

export interface RelayWatchPlan {
  relayUrl: string;
  recipientPubkeys: string[];
}

function nowIso(): string {
  return new Date().toISOString();
}

export class PushGatewayRepository {
  constructor(private readonly database: DatabaseSync) {}

  registerDevice(input: DeviceRegistrationInput): {
    relayCount: number;
    watchedPubkeyCount: number;
  } {
    const timestamp = nowIso();
    this.database.exec('BEGIN IMMEDIATE;');

    try {
      this.database
        .prepare(`
          INSERT INTO devices (
            owner_pubkey,
            device_id,
            platform,
            fcm_token,
            app_version,
            notifications_enabled,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(owner_pubkey, device_id) DO UPDATE SET
            platform = excluded.platform,
            fcm_token = excluded.fcm_token,
            app_version = excluded.app_version,
            notifications_enabled = excluded.notifications_enabled,
            updated_at = excluded.updated_at
        `)
        .run(
          input.ownerPubkey,
          input.deviceId,
          input.platform,
          input.fcmToken,
          input.appVersion,
          input.notificationsEnabled ? 1 : 0,
          timestamp,
          timestamp
        );

      this.database
        .prepare('DELETE FROM device_relays WHERE owner_pubkey = ? AND device_id = ?')
        .run(input.ownerPubkey, input.deviceId);
      this.database
        .prepare('DELETE FROM watched_pubkeys WHERE owner_pubkey = ? AND device_id = ?')
        .run(input.ownerPubkey, input.deviceId);

      const insertRelay = this.database.prepare(`
        INSERT INTO device_relays (owner_pubkey, device_id, relay_url, read, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const relay of input.relays) {
        insertRelay.run(
          input.ownerPubkey,
          input.deviceId,
          relay.url,
          relay.read ? 1 : 0,
          timestamp
        );
      }

      const insertPubkey = this.database.prepare(`
        INSERT INTO watched_pubkeys (
          owner_pubkey,
          device_id,
          recipient_pubkey,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const pubkey of input.watchedPubkeys) {
        insertPubkey.run(input.ownerPubkey, input.deviceId, pubkey, timestamp, timestamp);
      }

      this.database.exec('COMMIT;');
      return {
        relayCount: input.relays.length,
        watchedPubkeyCount: input.watchedPubkeys.length,
      };
    } catch (error) {
      this.database.exec('ROLLBACK;');
      throw error;
    }
  }

  unregisterDevice(input: DeviceUnregisterInput): void {
    this.database
      .prepare('DELETE FROM devices WHERE owner_pubkey = ? AND device_id = ?')
      .run(input.ownerPubkey, input.deviceId);
  }

  listRelayWatchPlans(): RelayWatchPlan[] {
    const rows = this.database
      .prepare(`
        SELECT DISTINCT dr.relay_url AS relayUrl, wp.recipient_pubkey AS recipientPubkey
        FROM devices d
        JOIN device_relays dr
          ON dr.owner_pubkey = d.owner_pubkey AND dr.device_id = d.device_id
        JOIN watched_pubkeys wp
          ON wp.owner_pubkey = d.owner_pubkey AND wp.device_id = d.device_id
        WHERE d.notifications_enabled = 1 AND dr.read = 1
        ORDER BY dr.relay_url, wp.recipient_pubkey
      `)
      .all() as Array<{ relayUrl: string; recipientPubkey: string }>;

    const plans = new Map<string, Set<string>>();
    for (const row of rows) {
      const pubkeys = plans.get(row.relayUrl) ?? new Set<string>();
      pubkeys.add(row.recipientPubkey);
      plans.set(row.relayUrl, pubkeys);
    }

    return Array.from(plans.entries()).map(([relayUrl, pubkeys]) => ({
      relayUrl,
      recipientPubkeys: Array.from(pubkeys).sort((first, second) => first.localeCompare(second)),
    }));
  }

  markEventSeen(eventId: string, recipientPubkey: string, relayUrl: string): boolean {
    const result = this.database
      .prepare(`
        INSERT OR IGNORE INTO seen_events (event_id, recipient_pubkey, relay_url, first_seen_at)
        VALUES (?, ?, ?, ?)
      `)
      .run(eventId, recipientPubkey, relayUrl, nowIso());

    return result.changes > 0;
  }

  markEventNotified(eventId: string, recipientPubkey: string): void {
    this.database
      .prepare('UPDATE seen_events SET notified_at = ? WHERE event_id = ? AND recipient_pubkey = ?')
      .run(nowIso(), eventId, recipientPubkey);
  }

  listDeliveryDevices(recipientPubkey: string): ActiveDeliveryDevice[] {
    return this.database
      .prepare(`
        SELECT DISTINCT
          d.owner_pubkey AS ownerPubkey,
          d.device_id AS deviceId,
          d.fcm_token AS fcmToken
        FROM devices d
        JOIN watched_pubkeys wp
          ON wp.owner_pubkey = d.owner_pubkey AND wp.device_id = d.device_id
        WHERE d.notifications_enabled = 1 AND wp.recipient_pubkey = ?
        ORDER BY d.owner_pubkey, d.device_id
      `)
      .all(recipientPubkey) as unknown as ActiveDeliveryDevice[];
  }

  disableDevice(ownerPubkey: string, deviceId: string): void {
    this.database
      .prepare(`
        UPDATE devices
        SET notifications_enabled = 0, updated_at = ?
        WHERE owner_pubkey = ? AND device_id = ?
      `)
      .run(nowIso(), ownerPubkey, deviceId);
  }
}
