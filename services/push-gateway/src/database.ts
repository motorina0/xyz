import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function openDatabase(databasePath: string): DatabaseSync {
  if (databasePath !== ':memory:') {
    mkdirSync(dirname(databasePath), { recursive: true });
  }

  const database = new DatabaseSync(databasePath);
  database.exec('PRAGMA foreign_keys = ON;');
  database.exec('PRAGMA journal_mode = WAL;');
  database.exec('PRAGMA busy_timeout = 5000;');
  migrateDatabase(database);
  return database;
}

export function migrateDatabase(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_pubkey TEXT NOT NULL,
      device_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      fcm_token TEXT NOT NULL,
      app_version TEXT NOT NULL,
      notifications_enabled INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(owner_pubkey, device_id)
    );

    CREATE TABLE IF NOT EXISTS device_relays (
      owner_pubkey TEXT NOT NULL,
      device_id TEXT NOT NULL,
      relay_url TEXT NOT NULL,
      read INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(owner_pubkey, device_id, relay_url),
      FOREIGN KEY(owner_pubkey, device_id)
        REFERENCES devices(owner_pubkey, device_id)
        ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS watched_pubkeys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_pubkey TEXT NOT NULL,
      device_id TEXT NOT NULL,
      recipient_pubkey TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(owner_pubkey, device_id, recipient_pubkey),
      FOREIGN KEY(owner_pubkey, device_id)
        REFERENCES devices(owner_pubkey, device_id)
        ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS seen_events (
      event_id TEXT NOT NULL,
      recipient_pubkey TEXT NOT NULL,
      relay_url TEXT NOT NULL,
      first_seen_at TEXT NOT NULL,
      notified_at TEXT,
      UNIQUE(event_id, recipient_pubkey)
    );

    CREATE INDEX IF NOT EXISTS idx_device_relays_relay_url
      ON device_relays(relay_url);
    CREATE INDEX IF NOT EXISTS idx_watched_pubkeys_recipient_pubkey
      ON watched_pubkeys(recipient_pubkey);
  `);
}
