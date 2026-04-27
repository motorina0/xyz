import { type NDKEvent, NDKKind } from '@nostr-dev-kit/ndk';
import { createPrivateMessagesIngestRuntime } from 'src/stores/nostr/privateMessagesIngestRuntime';
import type { MessageRelayStatus } from 'src/types/chat';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ndkMocks = vi.hoisted(() => ({
  giftUnwrap: vi.fn(),
}));

const serviceMocks = vi.hoisted(() => ({
  chatDataService: {
    createChat: vi.fn(),
    createMessage: vi.fn(),
    getChatByPublicKey: vi.fn(),
    getMessageById: vi.fn(),
    getMessageByEventId: vi.fn(),
    init: vi.fn(),
    updateChatPreview: vi.fn(),
    updateChatUnreadCount: vi.fn(),
  },
  contactsService: {
    getContactByPublicKey: vi.fn(),
    init: vi.fn(),
  },
  nostrEventDataService: {
    init: vi.fn(),
    upsertEvent: vi.fn(),
  },
}));

vi.mock('@nostr-dev-kit/ndk', async () => {
  const actual = await vi.importActual<typeof import('@nostr-dev-kit/ndk')>('@nostr-dev-kit/ndk');

  return {
    ...actual,
    giftUnwrap: ndkMocks.giftUnwrap,
  };
});

vi.mock('src/services/chatDataService', () => ({
  chatDataService: serviceMocks.chatDataService,
}));

vi.mock('src/services/contactsService', () => ({
  contactsService: serviceMocks.contactsService,
}));

vi.mock('src/services/nostrEventDataService', () => ({
  nostrEventDataService: serviceMocks.nostrEventDataService,
}));

function makeRelayStatus(overrides: Partial<MessageRelayStatus> = {}): MessageRelayStatus {
  return {
    relay_url: 'wss://relay.example',
    direction: 'inbound',
    scope: 'subscription',
    status: 'received',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeWrappedEvent(overrides: Partial<NDKEvent> = {}): NDKEvent {
  return {
    id: 'wrapped-event',
    kind: NDKKind.GiftWrap,
    created_at: 1700000000,
    pubkey: 'relay-author',
    content: '',
    tags: [],
    getMatchingTags: vi.fn(() => []),
    ...overrides,
  } as unknown as NDKEvent;
}

function makeRumorEvent(options: {
  senderPubkey?: string;
  recipientPubkey: string;
  eventId?: string;
  kind?: number;
  content?: string;
  createdAt?: number;
}): NDKEvent {
  return {
    id: options.eventId ?? 'rumor-event',
    kind: options.kind ?? NDKKind.PrivateDirectMessage,
    created_at: options.createdAt ?? 1700000000,
    pubkey: options.senderPubkey ?? 'a'.repeat(64),
    content: options.content ?? 'Hello there',
    tags: [['p', options.recipientPubkey]],
    getMatchingTags: vi.fn((tagName: string) =>
      tagName === 'p' ? [['p', options.recipientPubkey]] : []
    ),
  } as unknown as NDKEvent;
}

function createDeps() {
  const chatStore = {
    visibleChatId: null as string | null,
    acceptChat: vi.fn().mockResolvedValue(undefined),
    applyIncomingMessage: vi.fn(),
    recordIncomingActivity: vi.fn().mockResolvedValue(undefined),
    setUnreadCount: vi.fn().mockResolvedValue(undefined),
  };

  return {
    appendRelayStatusesToMessageEvent: vi.fn().mockResolvedValue(undefined),
    applyPendingIncomingDeletionsForMessage: vi.fn(async (messageRow) => messageRow),
    applyPendingIncomingReactionsForMessage: vi.fn(async (messageRow) => messageRow),
    buildInboundRelayStatuses: vi.fn(() => [makeRelayStatus()]),
    buildInboundTraceDetails: vi.fn(() => ({})),
    buildLoggedNostrEvent: vi.fn(() => ({ logged: true })),
    buildReplyPreviewFromTargetEvent: vi.fn().mockResolvedValue(null),
    buildSubscriptionEventDetails: vi.fn(() => ({})),
    chatStore,
    deriveChatName: vi.fn((contact, publicKey) => contact?.name ?? `Chat ${publicKey.slice(0, 8)}`),
    derivePublicKeyFromPrivateKey: vi.fn(() => 'epoch-public-key'),
    extractRelayUrlsFromEvent: vi.fn(() => ['wss://relay.example']),
    findConflictingKnownGroupEpochNumber: vi.fn(() => null),
    findGroupChatEpochContextByRecipientPubkey: vi.fn().mockResolvedValue(null),
    findHigherKnownGroupEpochConflict: vi.fn(() => null),
    formatSubscriptionLogValue: vi.fn((value) => value ?? null),
    getPrivateMessagesRestoreThrottleMs: vi.fn(() => 25),
    isContactListedInPrivateContactList: vi.fn(
      (contact) => contact?.meta?.private_contact_list_member === true
    ),
    lastSeenReceivedActivityAtMetaKey: 'last_seen_received_activity_at',
    logConflictingIncomingEpochNumber: vi.fn(),
    logDeveloperTrace: vi.fn(),
    logInboundEvent: vi.fn(),
    logInvalidIncomingEpochNumber: vi.fn(),
    logSubscription: vi.fn(),
    normalizeEventId: vi.fn((value: unknown) =>
      typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null
    ),
    normalizeThrottleMs: vi.fn((value: number | undefined) => value ?? 0),
    normalizeTimestamp: vi.fn((value: unknown) =>
      typeof value === 'string' && value.trim() ? value.trim() : null
    ),
    persistIncomingGroupEpochTicket: vi.fn().mockResolvedValue(undefined),
    processIncomingDeletionRumorEvent: vi.fn().mockResolvedValue(undefined),
    processIncomingReactionRumorEvent: vi.fn().mockResolvedValue(undefined),
    queueBackgroundGroupContactRefresh: vi.fn(),
    queuePrivateMessagesUiRefresh: vi.fn(),
    readReplyTargetEventId: vi.fn(() => null),
    refreshReplyPreviewsForTargetMessage: vi.fn().mockResolvedValue(0),
    resolveCurrentGroupChatEpochEntry: vi.fn(() => null),
    resolveGroupDisplayName: vi.fn(
      (groupPublicKey: string) => `Group ${groupPublicKey.slice(0, 8)}`
    ),
    resolveIncomingChatInboxStateValue: vi.fn(
      ({ isAcceptedContact }): 'accepted' | 'blocked' | 'request' =>
        isAcceptedContact ? 'accepted' : 'request'
    ),
    resolveIncomingPrivateMessageRecipientContext: vi.fn().mockResolvedValue({
      recipientPubkey: 'b'.repeat(64),
      unwrapSigner: {} as never,
      groupChatPublicKey: null,
    }),
    shouldNotifyForAcceptedChatOnly: vi.fn().mockResolvedValue(false),
    showIncomingMessageBrowserNotification: vi.fn(),
    toComparableTimestamp: vi.fn((value: string | null | undefined) =>
      value ? Date.parse(value) || 0 : 0
    ),
    toIsoTimestampFromUnix: vi.fn((value: number | undefined) =>
      typeof value === 'number' ? new Date(value * 1000).toISOString() : ''
    ),
    toStoredNostrEvent: vi.fn(async (event: NDKEvent) => ({
      id: event.id,
      kind: event.kind,
      created_at: event.created_at,
      pubkey: event.pubkey,
      content: event.content,
      tags: event.tags,
      sig: '',
    })),
    unwrapGiftWrapSealEvent: vi.fn().mockResolvedValue(null),
    upsertIncomingGroupInviteRequestChat: vi.fn().mockResolvedValue(undefined),
    verifyIncomingGroupEpochTicket: vi.fn().mockResolvedValue({
      epochNumber: null,
      epochPrivateKey: null,
      isValid: false,
      signedEvent: null,
    }),
  };
}

describe('privateMessagesIngestRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMocks.chatDataService.init.mockResolvedValue(undefined);
    serviceMocks.chatDataService.getChatByPublicKey.mockResolvedValue(null);
    serviceMocks.chatDataService.getMessageById.mockResolvedValue(null);
    serviceMocks.chatDataService.getMessageByEventId.mockResolvedValue(null);
    serviceMocks.chatDataService.updateChatPreview.mockResolvedValue(undefined);
    serviceMocks.chatDataService.updateChatUnreadCount.mockResolvedValue(undefined);
    serviceMocks.contactsService.init.mockResolvedValue(undefined);
    serviceMocks.contactsService.getContactByPublicKey.mockResolvedValue(null);
    serviceMocks.nostrEventDataService.init.mockResolvedValue(undefined);
    serviceMocks.nostrEventDataService.upsertEvent.mockResolvedValue(undefined);
    ndkMocks.giftUnwrap.mockReset();
  });

  it('creates request chats for first-contact direct messages and queues UI refreshes', async () => {
    const deps = createDeps();
    const runtime = createPrivateMessagesIngestRuntime(deps);
    const createdAt = '2023-11-14T22:13:20.000Z';
    const rumorEvent = makeRumorEvent({
      recipientPubkey: 'b'.repeat(64),
      senderPubkey: 'a'.repeat(64),
      content: '  Hello there  ',
    });

    ndkMocks.giftUnwrap.mockResolvedValue(rumorEvent);
    serviceMocks.chatDataService.createChat.mockResolvedValue({
      id: 'a'.repeat(64),
      public_key: 'a'.repeat(64),
      type: 'user',
      name: 'Chat aaaaaaaa',
      last_message: '',
      last_message_at: createdAt,
      unread_count: 0,
      meta: {},
    });
    serviceMocks.chatDataService.createMessage.mockResolvedValue({
      id: 41,
      chat_public_key: 'a'.repeat(64),
      author_public_key: 'a'.repeat(64),
      created_at: createdAt,
      event_id: 'rumor-event',
      meta: {},
    });

    runtime.queuePrivateMessageIngestion(makeWrappedEvent(), 'b'.repeat(64), {
      uiThrottleMs: 25,
    });
    await runtime.getPrivateMessagesIngestQueue();

    expect(serviceMocks.chatDataService.createChat).toHaveBeenCalledWith(
      expect.objectContaining({
        public_key: 'a'.repeat(64),
        name: 'Chat aaaaaaaa',
        meta: {},
      })
    );
    expect(serviceMocks.chatDataService.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chat_public_key: 'a'.repeat(64),
        message: 'Hello there',
        event_id: 'rumor-event',
      })
    );
    expect(deps.chatStore.recordIncomingActivity).toHaveBeenCalledWith('a'.repeat(64), createdAt);
    expect(serviceMocks.chatDataService.updateChatPreview).toHaveBeenCalledWith(
      'a'.repeat(64),
      'Hello there',
      createdAt,
      1
    );
    expect(deps.queuePrivateMessagesUiRefresh).toHaveBeenCalledWith({
      throttleMs: 25,
      reloadChats: true,
      reloadMessages: true,
    });
  });

  it('updates the preview when an incoming message shares the current preview second', async () => {
    const deps = createDeps();
    const runtime = createPrivateMessagesIngestRuntime(deps);
    const chatPublicKey = 'a'.repeat(64);
    const createdAt = '2023-11-14T22:13:20.000Z';
    const existingPreviewAt = '2023-11-14T22:13:20.842Z';
    const rumorEvent = makeRumorEvent({
      recipientPubkey: 'b'.repeat(64),
      senderPubkey: chatPublicKey,
      content: '  Same-second inbound  ',
    });

    deps.resolveIncomingChatInboxStateValue.mockReturnValue('accepted');
    ndkMocks.giftUnwrap.mockResolvedValue(rumorEvent);
    serviceMocks.chatDataService.getChatByPublicKey.mockResolvedValue({
      id: chatPublicKey,
      public_key: chatPublicKey,
      type: 'user',
      name: 'Alice',
      last_message: 'Local reply',
      last_message_at: existingPreviewAt,
      unread_count: 0,
      meta: {
        inbox_state: 'accepted',
        accepted_at: '2023-11-14T22:13:19.000Z',
      },
    });
    serviceMocks.chatDataService.createMessage.mockResolvedValue({
      id: 43,
      chat_public_key: chatPublicKey,
      author_public_key: chatPublicKey,
      created_at: createdAt,
      event_id: 'rumor-event',
      meta: {},
    });

    runtime.queuePrivateMessageIngestion(makeWrappedEvent(), 'b'.repeat(64), {
      uiThrottleMs: 25,
    });
    await runtime.getPrivateMessagesIngestQueue();

    expect(serviceMocks.chatDataService.updateChatPreview).toHaveBeenCalledWith(
      chatPublicKey,
      'Same-second inbound',
      existingPreviewAt,
      1
    );
    expect(serviceMocks.chatDataService.updateChatUnreadCount).not.toHaveBeenCalled();
    expect(deps.queuePrivateMessagesUiRefresh).toHaveBeenCalledWith({
      throttleMs: 25,
      reloadChats: true,
      reloadMessages: true,
    });
  });

  it('promotes existing chats to accepted when messages arrive from accepted contacts', async () => {
    const deps = createDeps();
    const runtime = createPrivateMessagesIngestRuntime(deps);
    const createdAt = '2023-11-14T22:13:20.000Z';
    const rumorEvent = makeRumorEvent({
      recipientPubkey: 'b'.repeat(64),
      senderPubkey: 'a'.repeat(64),
    });
    const existingChat = {
      id: 'a'.repeat(64),
      public_key: 'a'.repeat(64),
      type: 'user',
      name: 'Alice',
      last_message: '',
      last_message_at: '',
      unread_count: 0,
      meta: {},
    };

    ndkMocks.giftUnwrap.mockResolvedValue(rumorEvent);
    serviceMocks.contactsService.getContactByPublicKey.mockResolvedValue({
      id: 1,
      public_key: 'a'.repeat(64),
      type: 'user',
      name: 'Alice',
      given_name: null,
      meta: {
        private_contact_list_member: true,
      },
      relays: [],
      sendMessagesToAppRelays: false,
    });
    serviceMocks.chatDataService.getChatByPublicKey
      .mockResolvedValueOnce(existingChat)
      .mockResolvedValueOnce({
        ...existingChat,
        meta: {
          inbox_state: 'accepted',
          accepted_at: createdAt,
        },
      });
    serviceMocks.chatDataService.createMessage.mockResolvedValue({
      id: 42,
      chat_public_key: 'a'.repeat(64),
      author_public_key: 'a'.repeat(64),
      created_at: createdAt,
      event_id: 'rumor-event',
      meta: {},
    });

    runtime.queuePrivateMessageIngestion(makeWrappedEvent(), 'b'.repeat(64), {
      uiThrottleMs: 25,
    });
    await runtime.getPrivateMessagesIngestQueue();

    expect(deps.chatStore.acceptChat).toHaveBeenCalledWith('a'.repeat(64), {
      acceptedAt: createdAt,
    });
    expect(serviceMocks.chatDataService.createChat).not.toHaveBeenCalled();
  });

  it('treats duplicate inbound events as relay-status updates instead of creating new messages', async () => {
    const deps = createDeps();
    const runtime = createPrivateMessagesIngestRuntime(deps);
    const rumorEvent = makeRumorEvent({
      recipientPubkey: 'b'.repeat(64),
      senderPubkey: 'a'.repeat(64),
      eventId: 'duplicate-event',
    });
    const existingMessage = {
      id: 99,
      chat_public_key: 'a'.repeat(64),
      author_public_key: 'a'.repeat(64),
      created_at: '2023-11-14T22:13:20.000Z',
      event_id: 'duplicate-event',
      meta: {},
    };

    ndkMocks.giftUnwrap.mockResolvedValue(rumorEvent);
    serviceMocks.chatDataService.getMessageById.mockResolvedValue(existingMessage);
    serviceMocks.chatDataService.getMessageByEventId.mockResolvedValue(existingMessage);

    runtime.queuePrivateMessageIngestion(makeWrappedEvent(), 'b'.repeat(64), {
      uiThrottleMs: 25,
    });
    await runtime.getPrivateMessagesIngestQueue();

    expect(deps.appendRelayStatusesToMessageEvent).toHaveBeenCalledWith(
      99,
      [makeRelayStatus()],
      expect.objectContaining({
        direction: 'in',
        eventId: 'duplicate-event',
        uiThrottleMs: 25,
      })
    );
    expect(deps.applyPendingIncomingReactionsForMessage).toHaveBeenCalledWith(existingMessage, {
      uiThrottleMs: 25,
    });
    expect(deps.applyPendingIncomingDeletionsForMessage).toHaveBeenCalled();
    expect(serviceMocks.chatDataService.createMessage).not.toHaveBeenCalled();
  });

  it('routes inbound reaction rumors through the reaction processor', async () => {
    const deps = createDeps();
    const runtime = createPrivateMessagesIngestRuntime(deps);
    const rumorEvent = makeRumorEvent({
      recipientPubkey: 'b'.repeat(64),
      senderPubkey: 'a'.repeat(64),
      eventId: 'reaction-event',
      kind: NDKKind.Reaction,
    });

    ndkMocks.giftUnwrap.mockResolvedValue(rumorEvent);

    runtime.queuePrivateMessageIngestion(makeWrappedEvent(), 'b'.repeat(64), {
      uiThrottleMs: 25,
    });
    await runtime.getPrivateMessagesIngestQueue();

    expect(deps.processIncomingReactionRumorEvent).toHaveBeenCalledWith(
      rumorEvent,
      'a'.repeat(64),
      'a'.repeat(64),
      expect.objectContaining({
        uiThrottleMs: 25,
        direction: 'in',
        relayStatuses: [makeRelayStatus()],
        rumorNostrEvent: expect.objectContaining({
          id: 'reaction-event',
          kind: NDKKind.Reaction,
        }),
      })
    );
    expect(serviceMocks.chatDataService.createChat).not.toHaveBeenCalled();
    expect(serviceMocks.chatDataService.createMessage).not.toHaveBeenCalled();
  });

  it('routes inbound deletion rumors through the deletion processor', async () => {
    const deps = createDeps();
    const runtime = createPrivateMessagesIngestRuntime(deps);
    const rumorEvent = makeRumorEvent({
      recipientPubkey: 'b'.repeat(64),
      senderPubkey: 'a'.repeat(64),
      eventId: 'deletion-event',
      kind: NDKKind.EventDeletion,
    });

    ndkMocks.giftUnwrap.mockResolvedValue(rumorEvent);

    runtime.queuePrivateMessageIngestion(makeWrappedEvent(), 'b'.repeat(64), {
      uiThrottleMs: 25,
    });
    await runtime.getPrivateMessagesIngestQueue();

    expect(deps.processIncomingDeletionRumorEvent).toHaveBeenCalledWith(
      rumorEvent,
      'a'.repeat(64),
      'a'.repeat(64),
      expect.objectContaining({
        uiThrottleMs: 25,
        seedRelayUrls: ['wss://relay.example'],
      })
    );
    expect(serviceMocks.chatDataService.createMessage).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'conflicting epoch public keys',
      configure(deps: ReturnType<typeof createDeps>) {
        deps.findConflictingKnownGroupEpochNumber.mockReturnValue({
          epoch_number: 2,
          epoch_public_key: 'c'.repeat(64),
          epoch_private_key_encrypted: 'enc-conflict',
        });
      },
      expectedReason: 'conflicting-epoch-public-key',
    },
  ])('drops invalid group epoch tickets for $name', async ({ configure, expectedReason }) => {
    const deps = createDeps();
    const runtime = createPrivateMessagesIngestRuntime(deps);
    const rumorEvent = makeRumorEvent({
      recipientPubkey: 'b'.repeat(64),
      senderPubkey: 'a'.repeat(64),
      eventId: 'epoch-ticket',
      kind: 1014,
    });

    configure(deps);
    ndkMocks.giftUnwrap.mockResolvedValue(rumorEvent);
    deps.verifyIncomingGroupEpochTicket.mockResolvedValue({
      epochNumber: 2,
      epochPrivateKey: 'epoch-private-key',
      isValid: true,
      signedEvent: {
        id: 'signed-epoch-ticket',
      },
    });
    serviceMocks.chatDataService.getChatByPublicKey.mockResolvedValue({
      id: 'a'.repeat(64),
      public_key: 'a'.repeat(64),
      type: 'group',
      name: 'Launch Group',
      last_message: '',
      last_message_at: '',
      unread_count: 0,
      meta: {},
    });

    runtime.queuePrivateMessageIngestion(makeWrappedEvent(), 'b'.repeat(64), {
      uiThrottleMs: 25,
    });
    await runtime.getPrivateMessagesIngestQueue();

    expect(deps.persistIncomingGroupEpochTicket).not.toHaveBeenCalled();
    expect(deps.upsertIncomingGroupInviteRequestChat).not.toHaveBeenCalled();
    expect(serviceMocks.chatDataService.createMessage).not.toHaveBeenCalled();
    expect(deps.logInboundEvent).toHaveBeenCalledWith(
      'drop',
      expect.objectContaining({
        reason: expectedReason,
      })
    );
  });

  it('persists historical group epoch tickets even when a newer epoch is already known', async () => {
    const deps = createDeps();
    const runtime = createPrivateMessagesIngestRuntime(deps);
    const createdAt = '2023-11-14T22:13:20.000Z';
    const rumorEvent = makeRumorEvent({
      recipientPubkey: 'b'.repeat(64),
      senderPubkey: 'a'.repeat(64),
      eventId: 'epoch-ticket-history',
      kind: 1014,
      createdAt: 1700000000,
    });

    deps.findHigherKnownGroupEpochConflict.mockReturnValue({
      higherEpochEntry: {
        epoch_number: 3,
        epoch_public_key: 'd'.repeat(64),
        invitation_created_at: '2023-11-15T00:00:00.000Z',
      },
      olderHigherEpochEntry: null,
    });
    deps.resolveIncomingChatInboxStateValue.mockReturnValue('accepted');
    ndkMocks.giftUnwrap.mockResolvedValue(rumorEvent);
    deps.verifyIncomingGroupEpochTicket.mockResolvedValue({
      epochNumber: 2,
      epochPrivateKey: 'epoch-private-key',
      isValid: true,
      signedEvent: {
        id: 'signed-epoch-ticket',
      },
    });
    serviceMocks.chatDataService.getChatByPublicKey.mockResolvedValue({
      id: 'a'.repeat(64),
      public_key: 'a'.repeat(64),
      type: 'group',
      name: 'Launch Group',
      last_message: '',
      last_message_at: '',
      unread_count: 0,
      meta: {
        inbox_state: 'accepted',
        accepted_at: createdAt,
      },
    });
    serviceMocks.chatDataService.createMessage.mockResolvedValue({
      id: 91,
      chat_public_key: 'a'.repeat(64),
      author_public_key: 'a'.repeat(64),
      created_at: createdAt,
      event_id: 'signed-epoch-ticket',
      meta: {},
    });

    runtime.queuePrivateMessageIngestion(makeWrappedEvent(), 'b'.repeat(64), {
      uiThrottleMs: 25,
    });
    await runtime.getPrivateMessagesIngestQueue();

    expect(deps.persistIncomingGroupEpochTicket).toHaveBeenCalledWith(
      'a'.repeat(64),
      2,
      'epoch-private-key',
      expect.objectContaining({
        accepted: true,
        invitationCreatedAt: createdAt,
      })
    );
    expect(serviceMocks.chatDataService.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chat_public_key: 'a'.repeat(64),
        message: 'Epoch 2',
        event_id: 'signed-epoch-ticket',
      })
    );
    expect(deps.logInboundEvent).not.toHaveBeenCalledWith(
      'drop',
      expect.objectContaining({
        reason: 'invalid-epoch-number',
      })
    );
  });

  it('persists blocked incoming messages with zero unread count and no browser notification', async () => {
    const deps = createDeps();
    const runtime = createPrivateMessagesIngestRuntime(deps);
    const createdAt = '2023-11-14T22:13:20.000Z';
    const rumorEvent = makeRumorEvent({
      recipientPubkey: 'b'.repeat(64),
      senderPubkey: 'a'.repeat(64),
      content: '  Blocked hello  ',
    });

    deps.resolveIncomingChatInboxStateValue.mockReturnValue('blocked');
    deps.shouldNotifyForAcceptedChatOnly.mockResolvedValue(true);
    ndkMocks.giftUnwrap.mockResolvedValue(rumorEvent);
    serviceMocks.chatDataService.getChatByPublicKey.mockResolvedValue({
      id: 'a'.repeat(64),
      public_key: 'a'.repeat(64),
      type: 'user',
      name: 'Blocked Chat',
      last_message: 'Older preview',
      last_message_at: '2023-11-14T22:00:00.000Z',
      unread_count: 5,
      meta: {
        inbox_state: 'blocked',
      },
    });
    serviceMocks.chatDataService.createMessage.mockResolvedValue({
      id: 55,
      chat_public_key: 'a'.repeat(64),
      author_public_key: 'a'.repeat(64),
      created_at: createdAt,
      event_id: 'rumor-event',
      meta: {},
    });

    runtime.queuePrivateMessageIngestion(makeWrappedEvent(), 'b'.repeat(64), {
      uiThrottleMs: 25,
    });
    await runtime.getPrivateMessagesIngestQueue();

    expect(serviceMocks.chatDataService.updateChatPreview).toHaveBeenCalledWith(
      'a'.repeat(64),
      'Blocked hello',
      createdAt,
      0
    );
    expect(deps.showIncomingMessageBrowserNotification).not.toHaveBeenCalled();
    expect(deps.queuePrivateMessagesUiRefresh).toHaveBeenCalledWith({
      throttleMs: 25,
      reloadChats: true,
      reloadMessages: true,
    });
  });

  it('treats self-sent gift-wrapped messages as outbound activity for the other participant', async () => {
    const deps = createDeps();
    const runtime = createPrivateMessagesIngestRuntime(deps);
    const createdAt = '2023-11-14T22:13:20.000Z';
    const loggedInPubkey = 'a'.repeat(64);
    const otherParticipantPubkey = 'c'.repeat(64);
    const rumorEvent = makeRumorEvent({
      recipientPubkey: loggedInPubkey,
      senderPubkey: loggedInPubkey,
      eventId: 'self-message',
      content: '  Saved note  ',
    });

    rumorEvent.tags = [
      ['p', loggedInPubkey],
      ['p', otherParticipantPubkey],
    ];
    (rumorEvent.getMatchingTags as ReturnType<typeof vi.fn>).mockImplementation(
      (tagName: string) => (tagName === 'p' ? rumorEvent.tags : [])
    );

    ndkMocks.giftUnwrap.mockResolvedValue(rumorEvent);
    serviceMocks.chatDataService.createChat.mockResolvedValue({
      id: otherParticipantPubkey,
      public_key: otherParticipantPubkey,
      type: 'user',
      name: `Chat ${otherParticipantPubkey.slice(0, 8)}`,
      last_message: '',
      last_message_at: createdAt,
      unread_count: 0,
      meta: {},
    });
    serviceMocks.chatDataService.createMessage.mockResolvedValue({
      id: 77,
      chat_public_key: otherParticipantPubkey,
      author_public_key: loggedInPubkey,
      created_at: createdAt,
      event_id: 'self-message',
      meta: {},
    });

    runtime.queuePrivateMessageIngestion(makeWrappedEvent(), loggedInPubkey, {
      uiThrottleMs: 25,
    });
    await runtime.getPrivateMessagesIngestQueue();

    expect(serviceMocks.chatDataService.createChat).toHaveBeenCalledWith(
      expect.objectContaining({
        public_key: otherParticipantPubkey,
      })
    );
    expect(serviceMocks.nostrEventDataService.upsertEvent).toHaveBeenCalledWith({
      event: expect.objectContaining({
        id: 'self-message',
      }),
      direction: 'out',
      relay_statuses: [makeRelayStatus()],
    });
    expect(serviceMocks.chatDataService.updateChatPreview).toHaveBeenCalledWith(
      otherParticipantPubkey,
      'Saved note',
      createdAt,
      0
    );
    expect(deps.showIncomingMessageBrowserNotification).not.toHaveBeenCalled();
  });
});
