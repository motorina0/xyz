export interface ChatRow {
  id: number;
  public_key: string;
  name: string;
  last_message: string;
  last_message_at: string | null;
  unread_count: number;
  meta: Record<string, unknown>;
}

export interface MessageRow {
  id: number;
  chat_id: number;
  author_public_key: string;
  message: string;
  created_at: string;
  event_id: string | null;
  meta: Record<string, unknown>;
}

export interface CreateChatInput {
  public_key: string;
  name: string;
  last_message?: string;
  last_message_at?: string | null;
  unread_count?: number;
  meta?: Record<string, unknown>;
}

export interface CreateMessageInput {
  chat_id: number;
  author_public_key: string;
  message: string;
  created_at?: string;
  event_id?: string | null;
  meta?: Record<string, unknown>;
}

interface ChatRecord {
  id: number;
  public_key: string;
  public_key_normalized: string;
  name: string;
  last_message: string;
  last_message_at: string | null;
  unread_count: number;
  meta: Record<string, unknown>;
}

interface MessageRecord {
  id: number;
  chat_id: number;
  author_public_key: string;
  message: string;
  created_at: string;
  event_id: string | null;
  event_id_normalized?: string;
  meta: Record<string, unknown>;
}

const CHAT_DATA_DB_NAME = 'chat-data-indexeddb-v1';
const CHAT_DATA_DB_VERSION = 2;

const CHATS_STORE = 'chats';
const MESSAGES_STORE = 'messages';

const CHATS_PUBLIC_KEY_INDEX = 'public_key_normalized';
const CHATS_LAST_MESSAGE_AT_INDEX = 'last_message_at';

const MESSAGES_CHAT_ID_INDEX = 'chat_id';
const MESSAGES_CREATED_AT_INDEX = 'created_at';
const MESSAGES_EVENT_ID_INDEX = 'event_id_normalized';

function canUseIndexedDb(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeMeta(value: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!isPlainRecord(value)) {
    return {};
  }

  return { ...value };
}

function toIsoTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeUnreadCount(value: unknown): number {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.max(0, Math.floor(numeric));
}

function normalizeEventId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function toComparableTimestamp(value: string | null): number {
  if (!value) {
    return 0;
  }

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sortChatsByLatest(first: ChatRecord, second: ChatRecord): number {
  const byTime = toComparableTimestamp(second.last_message_at) - toComparableTimestamp(first.last_message_at);
  if (byTime !== 0) {
    return byTime;
  }

  return second.id - first.id;
}

function sortMessagesByCreated(first: MessageRecord, second: MessageRecord): number {
  const byTime = toComparableTimestamp(first.created_at) - toComparableTimestamp(second.created_at);
  if (byTime !== 0) {
    return byTime;
  }

  return first.id - second.id;
}

function toChatRow(record: ChatRecord): ChatRow {
  return {
    id: record.id,
    public_key: record.public_key,
    name: record.name,
    last_message: record.last_message,
    last_message_at: record.last_message_at,
    unread_count: record.unread_count,
    meta: normalizeMeta(record.meta)
  };
}

function toMessageRow(record: MessageRecord): MessageRow {
  return {
    id: record.id,
    chat_id: record.chat_id,
    author_public_key: record.author_public_key,
    message: record.message,
    created_at: record.created_at,
    event_id: normalizeEventId(record.event_id),
    meta: normalizeMeta(record.meta)
  };
}

function isConstraintError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === 'ConstraintError';
  }

  if (!error || typeof error !== 'object') {
    return false;
  }

  const name = 'name' in error ? String(error.name) : '';
  return name === 'ConstraintError';
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB request failed.'));
    };
  });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => {
      resolve();
    };
    transaction.onerror = () => {
      reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
    };
    transaction.onabort = () => {
      reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
    };
  });
}

class ChatDataService {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    await this.ensureInitialized();
  }

  async persist(): Promise<void> {
    // IndexedDB commits data automatically per transaction.
  }

  async listChats(): Promise<ChatRow[]> {
    const db = await this.getDatabase();
    const transaction = db.transaction(CHATS_STORE, 'readonly');
    const store = transaction.objectStore(CHATS_STORE);
    const records = await requestToPromise<ChatRecord[]>(
      store.getAll() as IDBRequest<ChatRecord[]>
    );
    await waitForTransaction(transaction);

    return records.sort(sortChatsByLatest).map((record) => toChatRow(record));
  }

  async getChatById(id: number): Promise<ChatRow | null> {
    if (!Number.isInteger(id) || id <= 0) {
      return null;
    }

    const db = await this.getDatabase();
    const transaction = db.transaction(CHATS_STORE, 'readonly');
    const store = transaction.objectStore(CHATS_STORE);
    const record = await requestToPromise<ChatRecord | undefined>(
      store.get(id) as IDBRequest<ChatRecord | undefined>
    );
    await waitForTransaction(transaction);

    return record ? toChatRow(record) : null;
  }

  async getChatByPublicKey(publicKey: string): Promise<ChatRow | null> {
    const normalizedPublicKey = publicKey.trim().toLowerCase();
    if (!normalizedPublicKey) {
      return null;
    }

    const db = await this.getDatabase();
    const transaction = db.transaction(CHATS_STORE, 'readonly');
    const store = transaction.objectStore(CHATS_STORE);
    const index = store.index(CHATS_PUBLIC_KEY_INDEX);
    const record = await requestToPromise<ChatRecord | undefined>(
      index.get(normalizedPublicKey) as IDBRequest<ChatRecord | undefined>
    );
    await waitForTransaction(transaction);

    return record ? toChatRow(record) : null;
  }

  async createChat(input: CreateChatInput): Promise<ChatRow | null> {
    const publicKey = input.public_key.trim();
    const name = input.name.trim();
    if (!publicKey || !name) {
      return null;
    }

    const normalizedPublicKey = publicKey.toLowerCase();
    const lastMessage = input.last_message?.trim() ?? '';
    const record: Omit<ChatRecord, 'id'> = {
      public_key: publicKey,
      public_key_normalized: normalizedPublicKey,
      name,
      last_message: lastMessage,
      last_message_at: toIsoTimestamp(input.last_message_at),
      unread_count: normalizeUnreadCount(input.unread_count),
      meta: normalizeMeta(input.meta)
    };

    const existing = await this.getChatByPublicKey(publicKey);
    if (existing) {
      return existing;
    }

    const db = await this.getDatabase();
    const transaction = db.transaction(CHATS_STORE, 'readwrite');
    const store = transaction.objectStore(CHATS_STORE);

    try {
      const insertedId = await requestToPromise<IDBValidKey>(
        store.add(record) as IDBRequest<IDBValidKey>
      );
      await waitForTransaction(transaction);

      return toChatRow({
        ...record,
        id: Number(insertedId)
      });
    } catch (error) {
      if (isConstraintError(error)) {
        return this.getChatByPublicKey(publicKey);
      }

      console.error('Failed to create chat row in IndexedDB.', error);
      return null;
    }
  }

  async updateChatPreview(
    chatId: number,
    lastMessage: string,
    lastMessageAt: string,
    unreadCount: number
  ): Promise<void> {
    if (!Number.isInteger(chatId) || chatId <= 0) {
      return;
    }

    const db = await this.getDatabase();
    const transaction = db.transaction(CHATS_STORE, 'readwrite');
    const store = transaction.objectStore(CHATS_STORE);
    const existingRecord = await requestToPromise<ChatRecord | undefined>(
      store.get(chatId) as IDBRequest<ChatRecord | undefined>
    );

    if (!existingRecord) {
      await waitForTransaction(transaction);
      return;
    }

    const updatedRecord: ChatRecord = {
      ...existingRecord,
      last_message: lastMessage,
      last_message_at: toIsoTimestamp(lastMessageAt),
      unread_count: normalizeUnreadCount(unreadCount)
    };

    store.put(updatedRecord);
    await waitForTransaction(transaction);
  }

  async markChatAsRead(chatId: number): Promise<void> {
    if (!Number.isInteger(chatId) || chatId <= 0) {
      return;
    }

    const db = await this.getDatabase();
    const transaction = db.transaction(CHATS_STORE, 'readwrite');
    const store = transaction.objectStore(CHATS_STORE);
    const existingRecord = await requestToPromise<ChatRecord | undefined>(
      store.get(chatId) as IDBRequest<ChatRecord | undefined>
    );

    if (!existingRecord || existingRecord.unread_count === 0) {
      await waitForTransaction(transaction);
      return;
    }

    store.put({
      ...existingRecord,
      unread_count: 0
    });
    await waitForTransaction(transaction);
  }

  async listMessages(chatId: number): Promise<MessageRow[]> {
    if (!Number.isInteger(chatId) || chatId <= 0) {
      return [];
    }

    const db = await this.getDatabase();
    const transaction = db.transaction(MESSAGES_STORE, 'readonly');
    const store = transaction.objectStore(MESSAGES_STORE);
    const index = store.index(MESSAGES_CHAT_ID_INDEX);
    const records = await requestToPromise<MessageRecord[]>(
      index.getAll(IDBKeyRange.only(chatId)) as IDBRequest<MessageRecord[]>
    );
    await waitForTransaction(transaction);

    return records.sort(sortMessagesByCreated).map((record) => toMessageRow(record));
  }

  async createMessage(input: CreateMessageInput): Promise<MessageRow | null> {
    const chatId = Number(input.chat_id);
    const authorPublicKey = String(input.author_public_key ?? '').trim();
    const message = String(input.message ?? '').trim();
    const createdAt = String(input.created_at ?? '').trim() || new Date().toISOString();
    const eventId = normalizeEventId(input.event_id);

    if (!Number.isInteger(chatId) || chatId <= 0 || !authorPublicKey || !message || !createdAt) {
      return null;
    }

    if (eventId) {
      const existingMessage = await this.getMessageByEventId(eventId);
      if (existingMessage) {
        return existingMessage;
      }
    }

    const record: Omit<MessageRecord, 'id'> = {
      chat_id: chatId,
      author_public_key: authorPublicKey,
      message,
      created_at: createdAt,
      event_id: eventId,
      ...(eventId ? { event_id_normalized: eventId.toLowerCase() } : {}),
      meta: normalizeMeta(input.meta)
    };

    const db = await this.getDatabase();
    const transaction = db.transaction(MESSAGES_STORE, 'readwrite');
    const store = transaction.objectStore(MESSAGES_STORE);

    try {
      const insertedId = await requestToPromise<IDBValidKey>(
        store.add(record) as IDBRequest<IDBValidKey>
      );
      await waitForTransaction(transaction);

      return toMessageRow({
        ...record,
        id: Number(insertedId)
      });
    } catch (error) {
      if (eventId && isConstraintError(error)) {
        return this.getMessageByEventId(eventId);
      }

      console.error('Failed to create message row in IndexedDB.', error);
      return null;
    }
  }

  async getMessageByEventId(eventId: string): Promise<MessageRow | null> {
    const normalizedEventId = eventId.trim().toLowerCase();
    if (!normalizedEventId) {
      return null;
    }

    const db = await this.getDatabase();
    const transaction = db.transaction(MESSAGES_STORE, 'readonly');
    const store = transaction.objectStore(MESSAGES_STORE);
    const index = store.index(MESSAGES_EVENT_ID_INDEX);
    const record = await requestToPromise<MessageRecord | undefined>(
      index.get(normalizedEventId) as IDBRequest<MessageRecord | undefined>
    );
    await waitForTransaction(transaction);

    return record ? toMessageRow(record) : null;
  }

  async getDatabase(): Promise<IDBDatabase> {
    await this.ensureInitialized();

    if (!this.dbPromise) {
      throw new Error('IndexedDB is not initialized.');
    }

    return this.dbPromise;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initializeDatabase();
    }

    await this.initPromise;
  }

  private async initializeDatabase(): Promise<void> {
    const db = await this.openDatabase();
    this.dbPromise = Promise.resolve(db);
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (!canUseIndexedDb()) {
      return Promise.reject(new Error('IndexedDB is not available in this environment.'));
    }

    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = window.indexedDB.open(CHAT_DATA_DB_NAME, CHAT_DATA_DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        const transaction = request.transaction;
        if (!transaction) {
          return;
        }

        const chatsStore = db.objectStoreNames.contains(CHATS_STORE)
          ? transaction.objectStore(CHATS_STORE)
          : db.createObjectStore(CHATS_STORE, { keyPath: 'id', autoIncrement: true });
        if (!chatsStore.indexNames.contains(CHATS_PUBLIC_KEY_INDEX)) {
          chatsStore.createIndex(CHATS_PUBLIC_KEY_INDEX, CHATS_PUBLIC_KEY_INDEX, { unique: true });
        }
        if (!chatsStore.indexNames.contains(CHATS_LAST_MESSAGE_AT_INDEX)) {
          chatsStore.createIndex(CHATS_LAST_MESSAGE_AT_INDEX, CHATS_LAST_MESSAGE_AT_INDEX, {
            unique: false
          });
        }

        const messagesStore = db.objectStoreNames.contains(MESSAGES_STORE)
          ? transaction.objectStore(MESSAGES_STORE)
          : db.createObjectStore(MESSAGES_STORE, { keyPath: 'id', autoIncrement: true });
        if (!messagesStore.indexNames.contains(MESSAGES_CHAT_ID_INDEX)) {
          messagesStore.createIndex(MESSAGES_CHAT_ID_INDEX, MESSAGES_CHAT_ID_INDEX, { unique: false });
        }
        if (!messagesStore.indexNames.contains(MESSAGES_CREATED_AT_INDEX)) {
          messagesStore.createIndex(MESSAGES_CREATED_AT_INDEX, MESSAGES_CREATED_AT_INDEX, {
            unique: false
          });
        }
        if (!messagesStore.indexNames.contains(MESSAGES_EVENT_ID_INDEX)) {
          messagesStore.createIndex(MESSAGES_EVENT_ID_INDEX, MESSAGES_EVENT_ID_INDEX, {
            unique: true
          });
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
        };
        resolve(db);
      };

      request.onerror = () => {
        reject(request.error ?? new Error('Failed to open chat IndexedDB database.'));
      };

      request.onblocked = () => {
        console.error('IndexedDB chat database open request is blocked by another tab.');
      };
    });
  }

}

export const chatDataService = new ChatDataService();
