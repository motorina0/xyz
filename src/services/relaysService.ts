import { dbService, type AppDatabase } from 'src/services/dbService';

type SqlExecParams = Parameters<AppDatabase['exec']>[1];

const CONTACT_RELAYS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS contact_relays (
    public_key TEXT NOT NULL,
    relay_ws TEXT NOT NULL,
    PRIMARY KEY (public_key, relay_ws)
  );
`;

const CONTACT_RELAYS_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_contact_relays_public_key ON contact_relays(public_key COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS idx_contact_relays_relay_ws ON contact_relays(relay_ws COLLATE NOCASE);
`;

function normalizePublicKey(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeRelayWs(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeRelays(relays: string[]): string[] {
  const uniqueRelays = new Set<string>();

  for (const relay of relays) {
    const normalized = normalizeRelayWs(relay);
    if (!normalized) {
      continue;
    }

    uniqueRelays.add(normalized);
  }

  return Array.from(uniqueRelays);
}

class RelaysService {
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    await this.ensureInitialized();
  }

  async listRelaysByPublicKey(publicKey: string): Promise<string[]> {
    const normalizedPublicKey = normalizePublicKey(publicKey);
    if (!normalizedPublicKey) {
      return [];
    }

    const db = await this.getDatabase();
    const rows = this.queryRows(
      db,
      `
        SELECT relay_ws
        FROM contact_relays
        WHERE LOWER(public_key) = LOWER(?)
        ORDER BY relay_ws COLLATE NOCASE ASC
      `,
      [normalizedPublicKey]
    );

    return rows.map((row) => String(row[0] ?? ''));
  }

  async listAllRelays(): Promise<string[]> {
    const db = await this.getDatabase();
    const rows = this.queryRows(
      db,
      `
        SELECT DISTINCT relay_ws
        FROM contact_relays
        ORDER BY relay_ws COLLATE NOCASE ASC
      `
    );

    return rows.map((row) => String(row[0] ?? ''));
  }

  async createRelay(publicKey: string, relayWs: string): Promise<boolean> {
    const normalizedPublicKey = normalizePublicKey(publicKey);
    const normalizedRelayWs = normalizeRelayWs(relayWs);
    if (!normalizedPublicKey || !normalizedRelayWs) {
      return false;
    }

    const db = await this.getDatabase();
    const statement = db.prepare(
      'INSERT OR IGNORE INTO contact_relays (public_key, relay_ws) VALUES (?, ?)'
    );

    try {
      statement.run([normalizedPublicKey, normalizedRelayWs]);
    } catch (error) {
      console.error('Failed to create contact relay', error);
      return false;
    } finally {
      statement.free();
    }

    const hasChanges = db.getRowsModified() > 0;
    if (hasChanges) {
      await dbService.persist();
    }

    return hasChanges;
  }

  async updateRelay(publicKey: string, previousRelayWs: string, nextRelayWs: string): Promise<boolean> {
    const normalizedPublicKey = normalizePublicKey(publicKey);
    const normalizedPreviousRelayWs = normalizeRelayWs(previousRelayWs);
    const normalizedNextRelayWs = normalizeRelayWs(nextRelayWs);
    if (!normalizedPublicKey || !normalizedPreviousRelayWs || !normalizedNextRelayWs) {
      return false;
    }

    const db = await this.getDatabase();
    const statement = db.prepare(
      `
        UPDATE contact_relays
        SET relay_ws = ?
        WHERE LOWER(public_key) = LOWER(?) AND relay_ws = ?
      `
    );

    try {
      statement.run([normalizedNextRelayWs, normalizedPublicKey, normalizedPreviousRelayWs]);
    } catch (error) {
      console.error('Failed to update contact relay', error);
      return false;
    } finally {
      statement.free();
    }

    const hasChanges = db.getRowsModified() > 0;
    if (hasChanges) {
      await dbService.persist();
    }

    return hasChanges;
  }

  async deleteRelay(publicKey: string, relayWs: string): Promise<boolean> {
    const normalizedPublicKey = normalizePublicKey(publicKey);
    const normalizedRelayWs = normalizeRelayWs(relayWs);
    if (!normalizedPublicKey || !normalizedRelayWs) {
      return false;
    }

    const db = await this.getDatabase();
    const statement = db.prepare(
      'DELETE FROM contact_relays WHERE LOWER(public_key) = LOWER(?) AND relay_ws = ?'
    );

    try {
      statement.run([normalizedPublicKey, normalizedRelayWs]);
    } finally {
      statement.free();
    }

    const hasChanges = db.getRowsModified() > 0;
    if (hasChanges) {
      await dbService.persist();
    }

    return hasChanges;
  }

  async replaceRelaysForPublicKey(publicKey: string, relays: string[]): Promise<string[]> {
    const normalizedPublicKey = normalizePublicKey(publicKey);
    if (!normalizedPublicKey) {
      return [];
    }

    const normalizedRelays = normalizeRelays(relays);
    const db = await this.getDatabase();
    const deleteStatement = db.prepare('DELETE FROM contact_relays WHERE LOWER(public_key) = LOWER(?)');
    const insertStatement = db.prepare(
      'INSERT OR IGNORE INTO contact_relays (public_key, relay_ws) VALUES (?, ?)'
    );

    try {
      db.run('BEGIN TRANSACTION');
      deleteStatement.run([normalizedPublicKey]);

      for (const relayWs of normalizedRelays) {
        insertStatement.run([normalizedPublicKey, relayWs]);
      }

      db.run('COMMIT');
    } catch (error) {
      try {
        db.run('ROLLBACK');
      } catch {
        // No-op: rollback failure should not hide the original issue.
      }

      console.error('Failed to replace contact relays', error);
      return this.listRelaysByPublicKey(normalizedPublicKey);
    } finally {
      deleteStatement.free();
      insertStatement.free();
    }

    await dbService.persist();
    return normalizedRelays;
  }

  async deleteRelaysForPublicKey(publicKey: string): Promise<boolean> {
    const normalizedPublicKey = normalizePublicKey(publicKey);
    if (!normalizedPublicKey) {
      return false;
    }

    const db = await this.getDatabase();
    const statement = db.prepare('DELETE FROM contact_relays WHERE LOWER(public_key) = LOWER(?)');

    try {
      statement.run([normalizedPublicKey]);
    } finally {
      statement.free();
    }

    const hasChanges = db.getRowsModified() > 0;
    if (hasChanges) {
      await dbService.persist();
    }

    return hasChanges;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initializeSchema();
    }

    await this.initPromise;
  }

  private async initializeSchema(): Promise<void> {
    const db = await dbService.getDatabase();
    db.run(CONTACT_RELAYS_TABLE_SQL);
    db.run(CONTACT_RELAYS_INDEXES_SQL);
  }

  private async getDatabase(): Promise<AppDatabase> {
    await this.ensureInitialized();
    return dbService.getDatabase();
  }

  private queryRows(db: AppDatabase, sql: string, params?: SqlExecParams): unknown[][] {
    const statement = db.prepare(sql);

    try {
      if (params !== undefined) {
        statement.bind(params);
      }

      const rows: unknown[][] = [];
      while (statement.step()) {
        rows.push(statement.get());
      }

      return rows;
    } finally {
      statement.free();
    }
  }
}

export const relaysService = new RelaysService();
