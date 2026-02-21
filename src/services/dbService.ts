import initSqlJs from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

type SqlJsStatic = Awaited<ReturnType<typeof initSqlJs>>;
type SqlJsDatabase = InstanceType<SqlJsStatic['Database']>;

const APP_DB_STORAGE_KEY = 'chat-data-sqlite-db-v1';

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

class DbService {
  private sqlPromise: Promise<SqlJsStatic> | null = null;
  private dbPromise: Promise<SqlJsDatabase> | null = null;

  async init(): Promise<void> {
    await this.getDatabase();
  }

  async getDatabase(): Promise<SqlJsDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = this.createDatabase();
    }

    return this.dbPromise;
  }

  async persist(): Promise<void> {
    const db = await this.getDatabase();

    if (!canUseStorage()) {
      return;
    }

    try {
      const bytes = db.export();
      const encoded = bytesToBase64(bytes);
      window.localStorage.setItem(APP_DB_STORAGE_KEY, encoded);
    } catch (error) {
      console.error('Failed to persist app database.', error);
    }
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

    if (persistedBytes) {
      try {
        return new SQL.Database(persistedBytes);
      } catch (error) {
        console.error('Failed to restore persisted app database. Recreating a fresh database.', error);
        this.clearPersistedDatabase();
      }
    }

    return new SQL.Database();
  }

  private loadPersistedDatabase(): Uint8Array | null {
    if (!canUseStorage()) {
      return null;
    }

    const encoded = window.localStorage.getItem(APP_DB_STORAGE_KEY);
    if (!encoded) {
      return null;
    }

    try {
      return base64ToBytes(encoded);
    } catch (error) {
      console.error('Failed to decode persisted app database bytes.', error);
      this.clearPersistedDatabase();
      return null;
    }
  }

  private clearPersistedDatabase(): void {
    if (!canUseStorage()) {
      return;
    }

    window.localStorage.removeItem(APP_DB_STORAGE_KEY);
  }
}

export type AppDatabase = SqlJsDatabase;

export const dbService = new DbService();
