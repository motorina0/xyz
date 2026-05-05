import {
  createReconnectHealingRuntime,
  type ReconnectHealingChatTarget,
} from 'src/stores/nostr/reconnectHealingRuntime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

const GROUP_PUBLIC_KEY = 'a'.repeat(64);
const GROUP_EPOCH_PUBLIC_KEY = 'b'.repeat(64);
const LOGGED_IN_PUBLIC_KEY = 'f'.repeat(64);
const MIN_STATUS_VISIBLE_MS = 200;

type StatusLabelUpdate = {
  at: number;
  value: string | null;
};

describe('reconnectHealingRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', {
      onLine: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function createRuntime(
    options: {
      visibleChat?: ReconnectHealingChatTarget | null;
      isRestoringStartupState?: boolean;
      isNativeAndroid?: boolean;
      refreshRecreatedLiveSubscription?: boolean;
    } = {}
  ) {
    let privateMessagesLiveEoseAt: string | null = null;
    const healingState = ref(false);
    const statusLabel = ref<string | null>(null);
    const statusLabelUpdates: StatusLabelUpdate[] = [];
    const queueOutboundMessageReplay = vi.fn();
    const queuePrivateMessagesWatchdog = vi.fn();
    const refreshDeveloperPendingQueues = vi.fn(async () => ({
      initialEntryCount: 1,
      remainingEntryCount: 0,
    }));
    const refreshDirectMessages = vi.fn(async () => ({
      recreatedLiveSubscription: options.refreshRecreatedLiveSubscription ?? false,
    }));
    const waitForPrivateMessagesIngestQueue = vi.fn(async () => {});

    const runtime = createReconnectHealingRuntime({
      getLoggedInPublicKeyHex: () => LOGGED_IN_PUBLIC_KEY,
      getPrivateMessagesLiveEoseAt: () => privateMessagesLiveEoseAt,
      getVisibleChatTarget: () => options.visibleChat ?? null,
      isNativeAndroid: () => options.isNativeAndroid ?? false,
      isRestoringStartupState: ref(options.isRestoringStartupState ?? false),
      queueOutboundMessageReplay,
      queuePrivateMessagesWatchdog,
      refreshDeveloperPendingQueues,
      refreshDirectMessages,
      setIsReconnectHealing: (value) => {
        healingState.value = value;
      },
      setReconnectHealingStatusLabel: (value) => {
        statusLabel.value = value;
        statusLabelUpdates.push({
          at: Date.now(),
          value,
        });
      },
      waitForPrivateMessagesIngestQueue,
    });

    return {
      healingState,
      statusLabel,
      statusLabelUpdates,
      setPrivateMessagesLiveEoseAt: (value: string | null) => {
        privateMessagesLiveEoseAt = value;
      },
      queueOutboundMessageReplay,
      queuePrivateMessagesWatchdog,
      refreshDeveloperPendingQueues,
      refreshDirectMessages,
      runtime,
      waitForPrivateMessagesIngestQueue,
    };
  }

  async function runQueuedTimersForStatusSteps(stepCount: number): Promise<void> {
    for (let index = 0; index < stepCount; index += 1) {
      await vi.advanceTimersByTimeAsync(MIN_STATUS_VISIBLE_MS);
      await vi.runAllTicks();
    }
  }

  function expectStatusLabels(
    statusLabelUpdates: StatusLabelUpdate[],
    labels: Array<string | null>
  ) {
    expect(statusLabelUpdates.map((entry) => entry.value)).toEqual(labels);
  }

  function expectStatusLabelsWereVisibleForMinimumDuration(
    statusLabelUpdates: StatusLabelUpdate[]
  ): void {
    for (let index = 0; index < statusLabelUpdates.length - 1; index += 1) {
      const current = statusLabelUpdates[index];
      const next = statusLabelUpdates[index + 1];
      if (current.value === null) {
        continue;
      }

      expect(next.at - current.at).toBeGreaterThanOrEqual(MIN_STATUS_VISIBLE_MS);
    }
  }

  it('refreshes direct messages and logs the recovery pass', async () => {
    const visibleChat: ReconnectHealingChatTarget = {
      id: GROUP_PUBLIC_KEY,
      publicKey: GROUP_PUBLIC_KEY,
      type: 'group',
      epochPublicKey: GROUP_EPOCH_PUBLIC_KEY,
    };
    const {
      healingState,
      queueOutboundMessageReplay,
      queuePrivateMessagesWatchdog,
      refreshDeveloperPendingQueues,
      refreshDirectMessages,
      runtime,
      statusLabelUpdates,
    } = createRuntime({
      visibleChat,
    });

    const runPromise = runtime.runReconnectHealing('relay-connected');
    await runQueuedTimersForStatusSteps(10);
    await runPromise;

    expect(healingState.value).toBe(false);
    expectStatusLabels(statusLabelUpdates, [
      'Preparing sync',
      'Checking session and network',
      'Refreshing direct messages',
      'Queing message relay check',
      'Queing unsent message retries',
      'Applying pending message updates',
      'Finishing sync',
      null,
    ]);
    expectStatusLabelsWereVisibleForMinimumDuration(statusLabelUpdates);
    expect(queuePrivateMessagesWatchdog).toHaveBeenCalledWith(0);
    expect(queueOutboundMessageReplay).toHaveBeenCalledWith('reconnect-healing', 0);
    expect(refreshDirectMessages).toHaveBeenCalledWith({
      forceLiveSubscriptionRecreate: false,
    });
    expect(refreshDeveloperPendingQueues).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(
      '[nostr-chat][reconnect-healing]',
      'start',
      expect.objectContaining({
        reason: 'relay-connected',
        visibleChatId: GROUP_PUBLIC_KEY,
        directMessageRecipientPubkey: LOGGED_IN_PUBLIC_KEY,
      })
    );
    expect(console.log).toHaveBeenCalledWith(
      '[nostr-chat][reconnect-healing]',
      'complete',
      expect.objectContaining({
        reason: 'relay-connected',
        refreshedDirectMessages: true,
      })
    );
  });

  it('forces the private messages live subscription rebuild during Android healing', async () => {
    const { refreshDirectMessages, runtime, statusLabelUpdates } = createRuntime({
      isNativeAndroid: true,
    });

    const runPromise = runtime.runReconnectHealing('visibility-regain');
    await runQueuedTimersForStatusSteps(8);
    await runPromise;

    expect(refreshDirectMessages).toHaveBeenCalledWith({
      forceLiveSubscriptionRecreate: true,
    });
    expectStatusLabelsWereVisibleForMinimumDuration(statusLabelUpdates);
  });

  it('waits for live private-message EOSE after a recreated subscription', async () => {
    const {
      refreshDeveloperPendingQueues,
      runtime,
      setPrivateMessagesLiveEoseAt,
      waitForPrivateMessagesIngestQueue,
    } = createRuntime({
      isNativeAndroid: true,
      refreshRecreatedLiveSubscription: true,
    });

    const runPromise = runtime.runReconnectHealing('visibility-regain');
    await runQueuedTimersForStatusSteps(3);
    expect(refreshDeveloperPendingQueues).not.toHaveBeenCalled();

    setPrivateMessagesLiveEoseAt('2026-05-05T10:00:00.000Z');
    await vi.advanceTimersByTimeAsync(100);
    await runQueuedTimersForStatusSteps(5);
    await runPromise;

    expect(waitForPrivateMessagesIngestQueue).toHaveBeenCalledTimes(1);
    expect(refreshDeveloperPendingQueues).toHaveBeenCalledTimes(1);
  });

  it('continues healing after the live private-message EOSE wait times out', async () => {
    const { refreshDeveloperPendingQueues, runtime, waitForPrivateMessagesIngestQueue } =
      createRuntime({
        isNativeAndroid: true,
        refreshRecreatedLiveSubscription: true,
      });

    const runPromise = runtime.runReconnectHealing('visibility-regain');
    await runQueuedTimersForStatusSteps(3);
    expect(refreshDeveloperPendingQueues).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60_000);
    await runQueuedTimersForStatusSteps(5);
    await runPromise;

    expect(waitForPrivateMessagesIngestQueue).not.toHaveBeenCalled();
    expect(refreshDeveloperPendingQueues).toHaveBeenCalledTimes(1);
  });

  it('runs healing when a window-focus notifier follows a long enough background period', async () => {
    const { refreshDeveloperPendingQueues, runtime, statusLabelUpdates } = createRuntime();

    runtime.notifyWindowBlur();
    await vi.advanceTimersByTimeAsync(3000);
    runtime.notifyWindowFocus();
    expectStatusLabels(statusLabelUpdates, ['Queing preparing sync']);
    await vi.advanceTimersByTimeAsync(750);
    await runQueuedTimersForStatusSteps(10);
    runtime.resetReconnectHealingRuntimeState();

    expect(refreshDeveloperPendingQueues).toHaveBeenCalledTimes(1);
    expectStatusLabelsWereVisibleForMinimumDuration(statusLabelUpdates);
  });
});
