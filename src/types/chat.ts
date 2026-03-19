import type { NostrEvent } from '@nostr-dev-kit/ndk';

export type ChatInboxState = 'accepted' | 'blocked';
export type ChatType = 'user' | 'group';

export interface ChatMetadata {
  avatar?: string;
  picture?: string;
  given_name?: string;
  contact_name?: string;
  request_type?: string;
  request_message?: string;
  muted?: boolean;
  unseen_reaction_count?: number;
  last_seen_received_activity_at?: string;
  inbox_state?: ChatInboxState;
  accepted_at?: string;
  blocked_at?: string;
  last_incoming_message_at?: string;
  last_outgoing_message_at?: string;
  [key: string]: unknown;
}

export interface Chat {
  id: string;
  publicKey: string;
  type: ChatType;
  name: string;
  avatar: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  meta: ChatMetadata;
}

export interface MessageReplyPreview {
  messageId: string;
  text: string;
  sender: 'me' | 'them';
  authorName: string;
  authorPublicKey: string;
  sentAt: string;
  eventId: string | null;
}

export interface MessageReaction {
  emoji: string;
  name: string;
  reactorPublicKey: string;
  eventId?: string | null;
  createdAt?: string | null;
  viewedByAuthorAt?: string | null;
}

export interface DeletedMessageMetadata {
  deletedAt: string;
  deletedByPublicKey: string;
  deleteEventId?: string | null;
  deletedEventKind: number;
}

export interface MessageMetadata {
  reply?: MessageReplyPreview;
  reactions?: MessageReaction[];
  deleted?: DeletedMessageMetadata;
  [key: string]: unknown;
}

export type MessageRelayStatusDirection = 'outbound' | 'inbound';
export type MessageRelayStatusState = 'pending' | 'published' | 'failed' | 'received';
export type MessageRelayStatusScope = 'recipient' | 'self' | 'subscription';
export type NostrEventDirection = 'in' | 'out';

export interface MessageRelayStatus {
  relay_url: string;
  direction: MessageRelayStatusDirection;
  status: MessageRelayStatusState;
  scope: MessageRelayStatusScope;
  updated_at: string;
  detail?: string;
}

export interface NostrEventEntry {
  event: NostrEvent;
  relay_statuses: MessageRelayStatus[];
  direction: NostrEventDirection;
}

export interface Message {
  id: string;
  chatId: string;
  text: string;
  sender: 'me' | 'them';
  sentAt: string;
  authorPublicKey: string;
  eventId: string | null;
  nostrEvent: NostrEventEntry | null;
  meta: MessageMetadata;
}
