export interface ContactBirthday {
  year?: number;
  month?: number;
  day?: number;
}

export interface ContactMetadata {
  name?: string;
  about?: string;
  picture?: string;
  nip05?: string;
  npub?: string;
  nprofile?: string;
  lud06?: string;
  lud16?: string;
  display_name?: string;
  website?: string;
  banner?: string;
  bot?: boolean;
  birthday?: ContactBirthday;
  // App-local linkage used to map contacts to existing chat threads.
  chatId?: string;
  avatar?: string;
  last_seen_incoming_activity_at?: string;
  last_seen_incoming_activity_event_id?: string;
}

export interface ContactRelay {
  url: string;
  read: boolean;
  write: boolean;
}

export interface ContactRecord {
  id: number;
  public_key: string;
  name: string;
  given_name: string | null;
  meta: ContactMetadata;
  relays?: ContactRelay[];
  sendMessagesToAppRelays: boolean;
}

export interface CreateContactInput {
  public_key: string;
  name: string;
  given_name?: string | null;
  meta?: ContactMetadata;
  relays?: ContactRelay[];
  sendMessagesToAppRelays?: boolean;
}

export interface UpdateContactInput {
  public_key?: string;
  name?: string;
  given_name?: string | null;
  meta?: ContactMetadata;
  relays?: ContactRelay[];
  sendMessagesToAppRelays?: boolean;
}
