import NDK, { type NDKEvent, type NDKFilter } from '@nostr-dev-kit/ndk';
import { createPrivateMessagesSubscriptionRuntime } from 'src/stores/nostr/privateMessagesSubscriptionRuntime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

const serviceMocks = vi.hoisted(() => ({
  chatDataService: {
    init: vi.fn(),
  },
  contactsService: {
    init: vi.fn(),
  },
}));

vi.mock('src/services/chatDataService', () => ({
  chatDataService: serviceMocks.chatDataService,
}));

vi.mock('src/services/contactsService', () => ({
  contactsService: serviceMocks.contactsService,
}));

const LOGGED_IN_PUBLIC_KEY = 'a'.repeat(64);
const RELAY_URLS = ['wss://relay.example'];

type SubscriptionOptions = {
  onEvent?: (event: NDKEvent) => void;
  onEose?: () => void;
  onClose?: () => void;
};

function createRuntime(overrides: { subscribeWithReqLogging?: ReturnType<typeof vi.fn> } = {}) {
  const privateMessagesSubscriptionLiveCoverageAt = ref<number | null>(null);
  const subscribeWithReqLogging =
    overrides.subscribeWithReqLogging ??
    vi.fn(
      (
        _label: string,
        _requestLabel: string,
        _filters: NDKFilter,
        options: SubscriptionOptions
      ) => {
        Promise.resolve().then(() => {
          options.onEose?.();
        });

        return {
          stop: vi.fn(),
        } as never;
      }
    );

  const logSubscription = vi.fn();
  const runtime = createPrivateMessagesSubscriptionRuntime({
    beginStartupStep: vi.fn(),
    buildFilterSinceDetails: (since) => ({ since }),
    buildPrivateMessageSubscriptionTargetDetails: vi.fn(async () => ({})),
    buildSubscriptionEventDetails: vi.fn(() => ({})),
    buildSubscriptionRelayDetails: (relayUrls) => ({ relayUrls }),
    bumpDeveloperDiagnosticsVersion: vi.fn(),
    clearPrivateMessagesUiRefreshState: vi.fn(),
    completeStartupStep: vi.fn(),
    ensureRelayConnections: vi.fn(async () => {}),
    extractRelayUrlsFromEvent: vi.fn(() => RELAY_URLS),
    failStartupStep: vi.fn(),
    flushPrivateMessagesUiRefreshNow: vi.fn(),
    formatSubscriptionLogValue: (value) => value ?? null,
    getFilterSince: () => 100,
    getLoggedInPublicKeyHex: () => LOGGED_IN_PUBLIC_KEY,
    getOrCreateSigner: vi.fn(async () => ({})),
    getPrivateMessagesRestoreThrottleMs: () => 0,
    getPrivateMessagesStartupLiveSince: () => 90,
    getRelaySnapshots: vi.fn(() => []),
    getStartupStepSnapshot: vi.fn(() => ({ status: 'idle' })),
    getStoredAuthMethod: () => 'nsec',
    isRestoringStartupState: ref(false),
    listPrivateMessageRecipientPubkeys: vi.fn(async () => [LOGGED_IN_PUBLIC_KEY]),
    logSubscription,
    ndk: new NDK(),
    normalizeEventId: (value) => (typeof value === 'string' ? value : null),
    normalizeRelayStatusUrls: (relayUrls) => relayUrls,
    normalizeThrottleMs: (value) => (typeof value === 'number' ? value : 0),
    privateMessagesSubscriptionLastEoseAt: ref(null),
    privateMessagesSubscriptionLastEventCreatedAt: ref(null),
    privateMessagesSubscriptionLastEventId: ref(null),
    privateMessagesSubscriptionLastEventSeenAt: ref(null),
    privateMessagesSubscriptionLiveCoverageAt,
    privateMessagesSubscriptionRelayUrls: ref([]),
    privateMessagesSubscriptionSince: ref(null),
    privateMessagesSubscriptionStartedAt: ref(null),
    queuePrivateMessageIngestion: vi.fn(),
    refreshAllStoredContacts: vi.fn(async () => ({})),
    relaySignature: (relayUrls) => relayUrls.join(','),
    resolvePrivateMessageReadRelayUrls: vi.fn(async () => RELAY_URLS),
    schedulePostPrivateMessagesEoseChecks: vi.fn(),
    setPrivateMessagesRestoreThrottleMs: vi.fn(),
    startPrivateMessagesStartupBackfill: vi.fn(),
    subscribeWithReqLogging,
    updateStoredEventSinceFromCreatedAt: vi.fn(),
    updateStoredPrivateMessagesLastReceivedFromCreatedAt: vi.fn(),
  });

  return {
    logSubscription,
    privateMessagesSubscriptionLiveCoverageAt,
    runtime,
    subscribeWithReqLogging,
  };
}

describe('privateMessagesSubscriptionRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMocks.chatDataService.init.mockResolvedValue(undefined);
    serviceMocks.contactsService.init.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('recreates the live subscription directly when forced', async () => {
    const { runtime, subscribeWithReqLogging } = createRuntime();

    const result = await runtime.refreshPrivateMessagesLiveSubscription({
      forceRecreate: true,
      sinceOverride: 123,
    });

    expect(result).toEqual({ recreatedLiveSubscription: true });
    expect(subscribeWithReqLogging).toHaveBeenCalledTimes(1);
    expect(subscribeWithReqLogging).toHaveBeenCalledWith(
      'private-messages',
      'private-messages-live',
      expect.objectContaining({
        '#p': [LOGGED_IN_PUBLIC_KEY],
        since: 123,
      }),
      expect.any(Object),
      expect.any(Object)
    );
  });

  it('keeps the live subscription when the probe reaches EOSE', async () => {
    const { privateMessagesSubscriptionLiveCoverageAt, runtime, subscribeWithReqLogging } =
      createRuntime();

    const result = await runtime.refreshPrivateMessagesLiveSubscription({
      sinceOverride: 123,
      probeTimeoutMs: 10,
    });

    expect(result).toEqual({ recreatedLiveSubscription: false });
    expect(subscribeWithReqLogging).toHaveBeenCalledTimes(1);
    expect(subscribeWithReqLogging).toHaveBeenCalledWith(
      'private-messages',
      'private-messages-live-probe',
      expect.objectContaining({
        '#p': [LOGGED_IN_PUBLIC_KEY],
        since: 123,
      }),
      expect.objectContaining({
        closeOnEose: true,
      }),
      expect.any(Object)
    );
    expect(privateMessagesSubscriptionLiveCoverageAt.value).toBeGreaterThan(0);
  });

  it('recreates the live subscription when the probe times out', async () => {
    vi.useFakeTimers();
    const subscribeWithReqLogging = vi.fn(
      (_label: string, _requestLabel: string, _filters: NDKFilter, _options: SubscriptionOptions) =>
        ({
          stop: vi.fn(),
        }) as never
    );
    const { runtime } = createRuntime({
      subscribeWithReqLogging,
    });

    const refreshPromise = runtime.refreshPrivateMessagesLiveSubscription({
      sinceOverride: 123,
      probeTimeoutMs: 10,
    });

    await vi.runAllTicks();
    await vi.advanceTimersByTimeAsync(10);
    const result = await refreshPromise;

    expect(result).toEqual({ recreatedLiveSubscription: true });
    expect(subscribeWithReqLogging).toHaveBeenCalledTimes(2);
    expect(subscribeWithReqLogging).toHaveBeenNthCalledWith(
      1,
      'private-messages',
      'private-messages-live-probe',
      expect.objectContaining({
        '#p': [LOGGED_IN_PUBLIC_KEY],
        since: 123,
      }),
      expect.any(Object),
      expect.any(Object)
    );
    expect(subscribeWithReqLogging).toHaveBeenNthCalledWith(
      2,
      'private-messages',
      'private-messages-live',
      expect.objectContaining({
        '#p': [LOGGED_IN_PUBLIC_KEY],
        since: 123,
      }),
      expect.any(Object),
      expect.any(Object)
    );
  });
});
