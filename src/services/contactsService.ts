import initSqlJs from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { mockChats } from 'src/data/mockData';
import type { ContactRecord, CreateContactInput, UpdateContactInput } from 'src/types/contact';

type SqlJsStatic = Awaited<ReturnType<typeof initSqlJs>>;
type SqlJsDatabase = InstanceType<SqlJsStatic['Database']>;

const CONTACTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_key TEXT NOT NULL,
    name TEXT NOT NULL,
    meta TEXT NOT NULL DEFAULT ''
  );
`;

const CONTACTS_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_contacts_public_key ON contacts(public_key COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name COLLATE NOCASE);
`;

const CONTACT_SELECT_SQL = `
  SELECT id, public_key, name, meta
  FROM contacts
`;

function rowToContact(row: unknown[]): ContactRecord {
  return {
    id: Number(row[0]),
    public_key: String(row[1] ?? ''),
    name: String(row[2] ?? ''),
    meta: String(row[3] ?? '')
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

    const db = await this.getDatabase();
    const result = db.exec(
      `
        ${CONTACT_SELECT_SQL}
        WHERE LOWER(public_key) LIKE :query OR LOWER(name) LIKE :query
        ORDER BY name COLLATE NOCASE ASC
      `,
      { ':query': `%${query}%` }
    );

    return mapContacts(result);
  }

  async getContactById(id: number): Promise<ContactRecord | null> {
    const db = await this.getDatabase();
    const result = db.exec(`${CONTACT_SELECT_SQL} WHERE id = :id LIMIT 1`, { ':id': id });
    const contact = result[0]?.values?.[0];
    return contact ? rowToContact(contact) : null;
  }

  async createContact(input: CreateContactInput): Promise<ContactRecord | null> {
    const publicKey = input.public_key.trim();
    const name = input.name.trim();
    const meta = input.meta?.trim() ?? '';

    if (!publicKey || !name) {
      return null;
    }

    const db = await this.getDatabase();
    db.run(
      `
        INSERT INTO contacts (public_key, name, meta)
        VALUES (:public_key, :name, :meta)
      `,
      { ':public_key': publicKey, ':name': name, ':meta': meta }
    );

    const inserted = db.exec('SELECT last_insert_rowid()');
    const insertedId = Number(inserted[0]?.values?.[0]?.[0] ?? 0);
    if (!insertedId) {
      return null;
    }

    return this.getContactById(insertedId);
  }

  async updateContact(id: number, input: UpdateContactInput): Promise<ContactRecord | null> {
    const updates: Array<{ field: 'public_key' | 'name' | 'meta'; value: string }> = [];

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

    if (input.meta !== undefined) {
      updates.push({ field: 'meta', value: input.meta.trim() });
    }

    if (updates.length === 0) {
      return this.getContactById(id);
    }

    const setClause = updates.map((update, index) => `${update.field} = :value_${index}`).join(', ');
    const params: Record<string, number | string> = { ':id': id };

    updates.forEach((update, index) => {
      params[`:value_${index}`] = update.value;
    });

    const db = await this.getDatabase();
    db.run(`UPDATE contacts SET ${setClause} WHERE id = :id`, params);

    return this.getContactById(id);
  }

  async deleteContact(id: number): Promise<boolean> {
    const db = await this.getDatabase();
    db.run('DELETE FROM contacts WHERE id = :id', { ':id': id });
    return db.getRowsModified() > 0;
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
    const db = new SQL.Database();

    db.run(CONTACTS_TABLE_SQL);
    db.run(CONTACTS_INDEXES_SQL);
    this.seedContacts(db);

    return db;
  }

  private seedContacts(db: SqlJsDatabase): void {
    const existingRows = db.exec('SELECT COUNT(*) FROM contacts');
    const count = Number(existingRows[0]?.values?.[0]?.[0] ?? 0);
    if (count > 0) {
      return;
    }

    const statement = db.prepare(
      `
        INSERT INTO contacts (public_key, name, meta)
        VALUES (:public_key, :name, :meta)
      `
    );

    for (const chat of mockChats) {
      statement.run({
        ':public_key': `pk_${chat.id}`,
        ':name': chat.name,
        ':meta': JSON.stringify({
          chatId: chat.id,
          avatar: chat.avatar
        })
      });
    }

    statement.free();
  }
}

export const contactsService = new ContactsService();
