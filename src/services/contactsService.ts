import initSqlJs from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { mockChats } from 'src/data/mockData';
import type { ContactRecord, CreateContactInput, UpdateContactInput } from 'src/types/contact';

type SqlJsStatic = Awaited<ReturnType<typeof initSqlJs>>;
type SqlJsDatabase = InstanceType<SqlJsStatic['Database']>;
type SqlExecParams = Parameters<SqlJsDatabase['exec']>[1];

const CONTACTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_key TEXT NOT NULL,
    name TEXT NOT NULL,
    meta TEXT NOT NULL
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

    const likeQuery = `%${query}%`;
    const db = await this.getDatabase();
    const result = db.exec(
      `
        ${CONTACT_SELECT_SQL}
        WHERE LOWER(public_key) LIKE ? OR LOWER(name) LIKE ?
        ORDER BY name COLLATE NOCASE ASC
      `,
      [likeQuery, likeQuery]
    );

    return mapContacts(result);
  }

  async getContactById(id: number): Promise<ContactRecord | null> {
    const db = await this.getDatabase();
    const result = db.exec(`${CONTACT_SELECT_SQL} WHERE id = ? LIMIT 1`, [id]);
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
    db.run('INSERT INTO contacts (public_key, name, meta) VALUES (?, ?, ?)', [publicKey, name, meta]);

    const insertedResult = db.exec(`${CONTACT_SELECT_SQL} WHERE id = last_insert_rowid() LIMIT 1`);
    console.log('## Inserted contact result', insertedResult);
    const inserted = insertedResult[0]?.values?.[0];
    return inserted ? rowToContact(inserted) : null;
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

    const setClause = updates.map((update) => `${update.field} = ?`).join(', ');
    const params: Array<number | string> = updates.map((update) => update.value);
    params.push(id);

    const db = await this.getDatabase();
    db.run(`UPDATE contacts SET ${setClause} WHERE id = ?`, params);

    return this.getContactById(id);
  }

  async deleteContact(id: number): Promise<boolean> {
    const db = await this.getDatabase();
    db.run('DELETE FROM contacts WHERE id = ?', [id]);
    return db.getRowsModified() > 0;
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

    const statement = db.prepare('INSERT INTO contacts (public_key, name, meta) VALUES (?, ?, ?)');

    for (const chat of mockChats) {
      statement.run([
        `pk_${chat.id}`,
        chat.name,
        JSON.stringify({
          chatId: chat.id,
          avatar: chat.avatar
        })
      ]);
    }

    statement.free();
  }
}

export const contactsService = new ContactsService();
