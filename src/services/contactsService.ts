import initSqlJs from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { mockChats } from 'src/data/mockData';
import type {
  ContactBirthday,
  ContactMetadata,
  ContactRecord,
  CreateContactInput,
  UpdateContactInput
} from 'src/types/contact';

type SqlJsStatic = Awaited<ReturnType<typeof initSqlJs>>;
type SqlJsDatabase = InstanceType<SqlJsStatic['Database']>;
type SqlExecParams = Parameters<SqlJsDatabase['exec']>[1];
const CONTACTS_DB_STORAGE_KEY = 'contacts-sqlite-db-v1';

const CONTACTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_key TEXT NOT NULL,
    name TEXT NOT NULL,
    given_name TEXT NULL,
    meta TEXT NOT NULL
  );
`;

const CONTACTS_INDEXES_SQL = `
  CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_public_key_unique ON contacts(public_key COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name COLLATE NOCASE);
`;

const CONTACT_SELECT_SQL = `
  SELECT id, public_key, name, given_name, meta
  FROM contacts
`;

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const output = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    output[index] = binary.charCodeAt(index);
  }

  return output;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized || undefined;
}

function normalizeBirthday(value: unknown): ContactBirthday | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const birthday: ContactBirthday = {};
  const year = value.year;
  const month = value.month;
  const day = value.day;

  if (typeof year === 'number' && Number.isInteger(year)) {
    birthday.year = year;
  }

  if (typeof month === 'number' && Number.isInteger(month)) {
    birthday.month = month;
  }

  if (typeof day === 'number' && Number.isInteger(day)) {
    birthday.day = day;
  }

  return Object.keys(birthday).length > 0 ? birthday : undefined;
}

function normalizeContactMeta(value: unknown): ContactMetadata {
  if (!isPlainObject(value)) {
    return {};
  }

  const meta: ContactMetadata = {};
  const displayName = readOptionalString(value.display_name);
  const website = readOptionalString(value.website);
  const banner = readOptionalString(value.banner);
  const chatId = readOptionalString(value.chatId);
  const avatar = readOptionalString(value.avatar);
  const birthday = normalizeBirthday(value.birthday);

  if (displayName) {
    meta.display_name = displayName;
  }

  if (website) {
    meta.website = website;
  }

  if (banner) {
    meta.banner = banner;
  }

  if (typeof value.bot === 'boolean') {
    meta.bot = value.bot;
  }

  if (birthday) {
    meta.birthday = birthday;
  }

  if (chatId) {
    meta.chatId = chatId;
  }

  if (avatar) {
    meta.avatar = avatar;
  }

  return meta;
}

function parseStoredMeta(value: unknown): ContactMetadata {
  if (typeof value !== 'string') {
    return normalizeContactMeta(value);
  }

  if (!value.trim()) {
    return {};
  }

  try {
    return normalizeContactMeta(JSON.parse(value));
  } catch {
    return {};
  }
}

function serializeContactMeta(meta: ContactMetadata | undefined): string {
  return JSON.stringify(normalizeContactMeta(meta ?? {}));
}

function rowToContact(row: unknown[]): ContactRecord {
  return {
    id: Number(row[0]),
    public_key: String(row[1] ?? ''),
    name: String(row[2] ?? ''),
    given_name: row[3] == null ? null : String(row[3]),
    meta: parseStoredMeta(row[4])
  };
}

function mapContacts(results: ReturnType<SqlJsDatabase['exec']>): ContactRecord[] {
  const rows = results[0]?.values ?? [];
  return rows.map((row) => rowToContact(row));
}

class ContactsService {
  private sqlPromise: Promise<SqlJsStatic> | null = null;
  private dbPromise: Promise<SqlJsDatabase> | null = null;

  async init(): Promise<void> {
    await this.getDatabase();
  }

  async listContacts(): Promise<ContactRecord[]> {
    const db = await this.getDatabase();
    const result = db.exec(`${CONTACT_SELECT_SQL} ORDER BY name COLLATE NOCASE ASC`);
    return mapContacts(result);
  }

  async searchContacts(searchText: string): Promise<ContactRecord[]> {
    const query = searchText.trim().toLowerCase();

    if (!query) {
      return this.listContacts();
    }

    const likeQuery = `%${query}%`;
    const db = await this.getDatabase();
    const result = db.exec(
      `
        ${CONTACT_SELECT_SQL}
        WHERE
          LOWER(public_key) LIKE ?
          OR LOWER(name) LIKE ?
          OR LOWER(COALESCE(given_name, '')) LIKE ?
        ORDER BY name COLLATE NOCASE ASC
      `,
      [likeQuery, likeQuery, likeQuery]
    );

    return mapContacts(result);
  }

  async getContactById(id: number): Promise<ContactRecord | null> {
    const db = await this.getDatabase();
    const result = db.exec(`${CONTACT_SELECT_SQL} WHERE id = ? LIMIT 1`, [id]);
    const contact = result[0]?.values?.[0];
    return contact ? rowToContact(contact) : null;
  }

  async publicKeyExists(publicKey: string): Promise<boolean> {
    const normalized = publicKey.trim();
    if (!normalized) {
      return false;
    }

    const db = await this.getDatabase();
    const result = db.exec(
      'SELECT 1 FROM contacts WHERE LOWER(public_key) = LOWER(?) LIMIT 1',
      [normalized]
    );

    return (result[0]?.values?.length ?? 0) > 0;
  }

  async createContact(input: CreateContactInput): Promise<ContactRecord | null> {
    const publicKey = input.public_key.trim();
    const name = input.name.trim() || publicKey;
    const givenName = input.given_name?.trim() || null;
    const meta = normalizeContactMeta(input.meta);

    if (!publicKey) {
      return null;
    }

    const db = await this.getDatabase();
    const insertStatement = db.prepare(
      'INSERT INTO contacts (public_key, name, given_name, meta) VALUES (?, ?, ?, ?)'
    );
    try {
      insertStatement.run([publicKey, name, givenName, serializeContactMeta(meta)]);
    } catch (error) {
      console.error('Failed to insert contact', error);
      return null;
    } finally {
      insertStatement.free();
    }

    const insertedResult = db.exec(`${CONTACT_SELECT_SQL} WHERE id = last_insert_rowid() LIMIT 1`);
    const inserted = insertedResult[0]?.values?.[0];
    if (inserted) {
      this.persistDatabase(db);
    }

    return inserted ? rowToContact(inserted) : null;
  }

  async updateContact(id: number, input: UpdateContactInput): Promise<ContactRecord | null> {
    const db = await this.getDatabase();
    const updates: Array<{
      field: 'public_key' | 'name' | 'given_name' | 'meta';
      value: string | null;
    }> = [];

    if (input.public_key !== undefined) {
      const publicKey = input.public_key.trim();
      if (!publicKey) {
        return null;
      }

      updates.push({ field: 'public_key', value: publicKey });
    }

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) {
        return null;
      }

      updates.push({ field: 'name', value: name });
    }

    if (input.given_name !== undefined) {
      const givenName = input.given_name?.trim() || null;
      updates.push({ field: 'given_name', value: givenName });
    }

    if (input.meta !== undefined) {
      updates.push({ field: 'meta', value: serializeContactMeta(input.meta) });
    }

    if (updates.length === 0) {
      return this.getContactById(id);
    }

    const setClause = updates.map((update) => `${update.field} = ?`).join(', ');
    const params: Array<number | string | null> = updates.map((update) => update.value);
    params.push(id);

    const updateStatement = db.prepare(`UPDATE contacts SET ${setClause} WHERE id = ?`);
    try {
      updateStatement.run(params);
    } catch (error) {
      console.error('Failed to update contact', error);
      return null;
    } finally {
      updateStatement.free();
    }

    if (db.getRowsModified() > 0) {
      this.persistDatabase(db);
    }

    return this.getContactById(id);
  }

  async deleteContact(id: number): Promise<boolean> {
    const db = await this.getDatabase();
    const deleteStatement = db.prepare('DELETE FROM contacts WHERE id = ?');
    try {
      deleteStatement.run([id]);
    } finally {
      deleteStatement.free();
    }

    const hasChanges = db.getRowsModified() > 0;
    if (hasChanges) {
      this.persistDatabase(db);
    }

    return hasChanges;
  }

  async debugExec(
    sql: string,
    params?: SqlExecParams
  ): Promise<ReturnType<SqlJsDatabase['exec']>> {
    if (!import.meta.env.DEV) {
      throw new Error('debugExec is available only in development mode.');
    }

    const db = await this.getDatabase();
    return db.exec(sql, params);
  }

  private async getDatabase(): Promise<SqlJsDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = this.createDatabase();
    }

    return this.dbPromise;
  }

  private async getSqlJs(): Promise<SqlJsStatic> {
    if (!this.sqlPromise) {
      this.sqlPromise = initSqlJs({
        locateFile: () => sqlWasmUrl
      });
    }

    return this.sqlPromise;
  }

  private async createDatabase(): Promise<SqlJsDatabase> {
    const SQL = await this.getSqlJs();
    const persistedBytes = this.loadPersistedDatabase();
    let db: SqlJsDatabase;

    if (persistedBytes) {
      try {
        db = new SQL.Database(persistedBytes);
      } catch (error) {
        console.error('Failed to restore persisted contacts database. Recreating a fresh database.', error);
        this.clearPersistedDatabase();
        db = new SQL.Database();
      }
    } else {
      db = new SQL.Database();
    }

    db.run(CONTACTS_TABLE_SQL);
    const didMigrateSchema = this.ensureSchema(db);
    const didNormalizeMeta = this.normalizeStoredMeta(db);
    db.run(CONTACTS_INDEXES_SQL);
    this.seedContacts(db);

    if (didMigrateSchema || didNormalizeMeta) {
      this.persistDatabase(db);
    }

    return db;
  }

  private seedContacts(db: SqlJsDatabase): void {
    const existingRows = db.exec('SELECT COUNT(*) FROM contacts');
    const count = Number(existingRows[0]?.values?.[0]?.[0] ?? 0);
    if (count > 0) {
      return;
    }

    const statement = db.prepare(
      'INSERT INTO contacts (public_key, name, given_name, meta) VALUES (?, ?, ?, ?)'
    );

    for (const chat of mockChats) {
      statement.run([
        `pk_${chat.id}`,
        chat.name,
        null,
        serializeContactMeta({
          display_name: chat.name,
          chatId: chat.id,
          avatar: chat.avatar
        })
      ]);
    }

    statement.free();
    this.persistDatabase(db);
  }

  private ensureSchema(db: SqlJsDatabase): boolean {
    const tableInfo = db.exec('PRAGMA table_info(contacts)');
    const rows = tableInfo[0]?.values ?? [];
    const hasGivenName = rows.some((row) => String(row[1] ?? '') === 'given_name');

    if (!hasGivenName) {
      db.run('ALTER TABLE contacts ADD COLUMN given_name TEXT NULL');
      return true;
    }

    return false;
  }

  private normalizeStoredMeta(db: SqlJsDatabase): boolean {
    const rows = db.exec('SELECT id, meta FROM contacts')[0]?.values ?? [];
    if (rows.length === 0) {
      return false;
    }

    let didChange = false;
    const updateStatement = db.prepare('UPDATE contacts SET meta = ? WHERE id = ?');

    try {
      for (const row of rows) {
        const id = Number(row[0] ?? 0);
        if (!id) {
          continue;
        }

        const rawMeta = typeof row[1] === 'string' ? row[1] : '';
        const normalizedMeta = serializeContactMeta(parseStoredMeta(row[1]));

        if (rawMeta !== normalizedMeta) {
          updateStatement.run([normalizedMeta, id]);
          didChange = true;
        }
      }
    } finally {
      updateStatement.free();
    }

    return didChange;
  }

  private loadPersistedDatabase(): Uint8Array | null {
    if (!canUseStorage()) {
      return null;
    }

    const encoded = window.localStorage.getItem(CONTACTS_DB_STORAGE_KEY);
    if (!encoded) {
      return null;
    }

    try {
      return base64ToBytes(encoded);
    } catch (error) {
      console.error('Failed to decode persisted contacts database bytes.', error);
      this.clearPersistedDatabase();
      return null;
    }
  }

  private persistDatabase(db: SqlJsDatabase): void {
    if (!canUseStorage()) {
      return;
    }

    try {
      const bytes = db.export();
      const encoded = bytesToBase64(bytes);
      window.localStorage.setItem(CONTACTS_DB_STORAGE_KEY, encoded);
    } catch (error) {
      console.error('Failed to persist contacts database.', error);
    }
  }

  private clearPersistedDatabase(): void {
    if (!canUseStorage()) {
      return;
    }

    window.localStorage.removeItem(CONTACTS_DB_STORAGE_KEY);
  }
}

export const contactsService = new ContactsService();
