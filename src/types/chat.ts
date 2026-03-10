import type { NostrEvent } from '@nostr-dev-kit/ndk';

export interface ChatMetadata {
  avatar?: string;
  [key: string]: unknown;
}

export interface Chat {
  id: string;
  publicKey: string;
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
