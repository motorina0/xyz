import NDK from '@nostr-dev-kit/ndk';
import { createPrivateMessagesBackfillRuntime } from 'src/stores/nostr/privateMessagesBackfillRuntime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const serviceMocks = vi.hoisted(() => ({
  chatDataService: {
    getChatByPublicKey: vi.fn(),
    getMessageByEventId: vi.fn(),
    init: vi.fn(),
  },
  nostrEventDataService: {
    getEventById: vi.fn(),
    init: vi.fn(),
  },
}));

vi.mock('src/services/chatDataService', () => ({
  chatDataService: serviceMocks.chatDataService,
}));

vi.mock('src/services/nostrEventDataService', () => ({
  nostrEventDataService: serviceMocks.nostrEventDataService,
}));

const LOGGED_IN_PUBLIC_KEY = 'a'.repeat(64);
const DIRECT_CHAT_PUBLIC_KEY = 'b'.repeat(64);
const GROUP_CHAT_PUBLIC_KEY = 'c'.repeat(64);
const GROUP_EPOCH_A = 'd'.repeat(64);
const GROUP_EPOCH_B = 'e'.repeat(64);
const TARGET_EVENT_ID = 'f'.repeat(64);

function createRuntime(
  overrides: {
    subscribeWithReqLogging?: ReturnType<typeof vi.fn>;
    resolveGroupChatEpochEntries?: (chat: {
      meta: Record<string, unknown>;
      type: string;
    }) => Array<{
      epoch_public_key: string;
    }>;
  } = {}
) {
  const subscribeWithReqLogging =
    overrides.subscribeWithReqLogging ??
    vi.fn((_label, _requestLabel, _filters, options) => {
      Promise.resolve().then(() => {
        options.onEose?.();
      });

      return {
        stop: vi.fn(),
      } as never;
    });

  const runtime = createPrivateMessagesBackfillRuntime({
    buildFilterSinceDetails: (since) => ({ since }),
    buildFilterUntilDetails: (until) => ({ until }),
    buildPrivateMessageSubscriptionTargetDetails: vi.fn(async () => ({})),
    buildSubscriptionRelayDetails: (relayUrls) => ({ relayUrls }),
    ensureRelayConnections: vi.fn(async () => {}),
    flushPrivateMessagesUiRefreshNow: vi.fn(),
    formatSubscriptionLogValue: (value) => value ?? null,
    getLoggedInPublicKeyHex: () => LOGGED_IN_PUBLIC_KEY,
    getPrivateMessagesBackfillResumeState: vi.fn(() => null),
    getPrivateMessagesIngestQueue: vi.fn(async () => {}),
    getPrivateMessagesStartupFloorSince: vi.fn(() => 1700000000),
    logSubscription: vi.fn(),
    ndk: new NDK(),
    normalizeThrottleMs: (value) => value ?? 0,
    queuePrivateMessageIngestion: vi.fn(),
    relaySignature: (relayUrls) => relayUrls.join(','),
    resolveGroupChatEpochEntries:
      overrides.resolveGroupChatEpochEntries ??
      (() => [
        {
          epoch_public_key: GROUP_EPOCH_A,
        },
      ]),
    resolvePrivateMessageReadRelayUrls: vi.fn(async () => ['wss://relay.example']),
    schedulePostPrivateMessagesEoseChecks: vi.fn(),
    subscribeWithReqLogging,
    toOptionalIsoTimestampFromUnix: (value) =>
      typeof value === 'number' ? new Date(value * 1000).toISOString() : null,
    updateStoredEventSinceFromCreatedAt: vi.fn(),
    updateStoredPrivateMessagesLastReceivedFromCreatedAt: vi.fn(),
    writePrivateMessagesBackfillState: vi.fn(),
  });

  return {
    runtime,
    subscribeWithReqLogging,
  };
}

describe('privateMessagesBackfillRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    serviceMocks.chatDataService.init.mockResolvedValue(undefined);
    serviceMocks.chatDataService.getChatByPublicKey.mockResolvedValue(null);
    serviceMocks.chatDataService.getMessageByEventId.mockResolvedValue(null);
    serviceMocks.nostrEventDataService.init.mockResolvedValue(undefined);
    serviceMocks.nostrEventDataService.getEventById.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('repairs missing direct-message targets from the conversation recipients', async () => {
    let targetFound = false;
    serviceMocks.chatDataService.getMessageByEventId.mockImplementation(async () => {
      return targetFound ? ({ id: 7 } as never) : null;
    });

    const subscribeWithReqLogging = vi.fn((_label, requestLabel, filters, options) => {
      expect(requestLabel).toBe('private-messages-recipient-restore');
      expect((filters as { '#p': string[] })['#p']).toEqual([LOGGED_IN_PUBLIC_KEY]);
      Promise.resolve().then(() => {
        targetFound = true;
        options.onEose?.();
      });

      return {
        stop: vi.fn(),
      } as never;
    });
    const { runtime } = createRuntime({
      subscribeWithReqLogging,
    });

    await expect(
      runtime.repairMissingMessageDependency(DIRECT_CHAT_PUBLIC_KEY, TARGET_EVENT_ID, {
        reason: 'reply-target-missing',
        immediate: true,
        referenceCreatedAt: 1700003600,
      })
    ).resolves.toBe(true);

    expect(subscribeWithReqLogging).toHaveBeenCalledTimes(1);

    runtime.resetPrivateMessagesBackfillRuntimeState();
  });

  it('repairs group targets across all known epoch recipients', async () => {
    serviceMocks.chatDataService.getChatByPublicKey.mockResolvedValue({
      public_key: GROUP_CHAT_PUBLIC_KEY,
      type: 'group',
      meta: {},
    });

    const subscribeWithReqLogging = vi.fn((_label, requestLabel, _filters, options, details) => {
      expect(requestLabel).toBe('private-messages-epoch-history');
      expect(details).toEqual(
        expect.objectContaining({
          groupPublicKey: GROUP_CHAT_PUBLIC_KEY,
        })
      );
      Promise.resolve().then(() => {
        options.onEose?.();
      });

      return {
        stop: vi.fn(),
      } as never;
    });
    const { runtime } = createRuntime({
      subscribeWithReqLogging,
      resolveGroupChatEpochEntries: () => [
        {
          epoch_public_key: GROUP_EPOCH_A,
        },
        {
          epoch_public_key: GROUP_EPOCH_B,
        },
      ],
    });

    await expect(
      runtime.repairMissingMessageDependency(GROUP_CHAT_PUBLIC_KEY, TARGET_EVENT_ID, {
        reason: 'deletion-target-missing',
        immediate: true,
        referenceCreatedAt: 1700003600,
      })
    ).resolves.toBe(false);

    expect(subscribeWithReqLogging).toHaveBeenCalledTimes(2);
    expect(subscribeWithReqLogging).toHaveBeenNthCalledWith(
      1,
      'private-messages',
      'private-messages-epoch-history',
      expect.objectContaining({
        '#p': [GROUP_EPOCH_A],
      }),
      expect.any(Object),
      expect.any(Object)
    );
    expect(subscribeWithReqLogging).toHaveBeenNthCalledWith(
      2,
      'private-messages',
      'private-messages-epoch-history',
      expect.objectContaining({
        '#p': [GROUP_EPOCH_B],
      }),
      expect.any(Object),
      expect.any(Object)
    );

    runtime.resetPrivateMessagesBackfillRuntimeState();
  });
});
