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
    } = {}
  ) {
    const healingState = ref(false);
    const statusLabel = ref<string | null>(null);
    const statusLabelUpdates: StatusLabelUpdate[] = [];
    const queueOutboundMessageReplay = vi.fn();
    const queuePrivateMessagesWatchdog = vi.fn();
    const refreshDeveloperPendingQueues = vi.fn(async () => ({
      initialEntryCount: 1,
      remainingEntryCount: 0,
    }));
    const refreshDirectMessages = vi.fn(async () => {});
    const restoreGroupEpochHistory = vi.fn(async () => {});

    const runtime = createReconnectHealingRuntime({
      getLoggedInPublicKeyHex: () => LOGGED_IN_PUBLIC_KEY,
      getVisibleChatTarget: () => options.visibleChat ?? null,
      isNativeAndroid: () => options.isNativeAndroid ?? false,
      isRestoringStartupState: ref(options.isRestoringStartupState ?? false),
      queueOutboundMessageReplay,
      queuePrivateMessagesWatchdog,
      refreshDeveloperPendingQueues,
      refreshDirectMessages,
      restoreGroupEpochHistory,
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
    });

    return {
      healingState,
      statusLabel,
      statusLabelUpdates,
      queueOutboundMessageReplay,
      queuePrivateMessagesWatchdog,
      refreshDeveloperPendingQueues,
      refreshDirectMessages,
      restoreGroupEpochHistory,
      runtime,
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

  it('heals the visible chat plus direct messages and logs the recovery pass', async () => {
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
      restoreGroupEpochHistory,
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
      'Queing message relay check',
      'Queing unsent message retries',
      'Refreshing group history',
      'Refreshing direct messages',
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
    expect(restoreGroupEpochHistory).toHaveBeenCalledWith(
      GROUP_PUBLIC_KEY,
      GROUP_EPOCH_PUBLIC_KEY,
      { force: true }
    );
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
        restoredVisibleGroupEpoch: true,
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
