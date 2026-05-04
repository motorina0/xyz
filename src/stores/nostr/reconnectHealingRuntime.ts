import { inputSanitizerService } from 'src/services/inputSanitizerService';
import {
  RECONNECT_HEALING_FOCUS_DELAY_MS,
  RECONNECT_HEALING_MIN_BACKGROUND_MS,
  RECONNECT_HEALING_MIN_INTERVAL_MS,
  RECONNECT_HEALING_ONLINE_DELAY_MS,
  RECONNECT_HEALING_RELAY_LIST_CHANGE_DELAY_MS,
  RECONNECT_HEALING_RELAY_RECONNECT_DELAY_MS,
  RECONNECT_HEALING_VISIBILITY_DELAY_MS,
} from 'src/stores/nostr/constants';
import type { ChatType } from 'src/types/chat';
import type { Ref } from 'vue';

export type ReconnectHealingReason =
  | 'browser-online'
  | 'window-focus'
  | 'visibility-regain'
  | 'relay-connected'
  | 'relay-list-changed';

interface RestoreOptions {
  force?: boolean;
}

interface RefreshDirectMessagesOptions {
  forceLiveSubscriptionRecreate?: boolean;
}

export interface ReconnectHealingChatTarget {
  id: string;
  publicKey: string;
  type: ChatType;
  epochPublicKey: string | null;
}

interface ReconnectHealingRuntimeDeps {
  getLoggedInPublicKeyHex: () => string | null;
  getVisibleChatTarget: () => ReconnectHealingChatTarget | null;
  isNativeAndroid: () => boolean;
  isRestoringStartupState: Ref<boolean>;
  queueOutboundMessageReplay: (reason: 'reconnect-healing', delayMs?: number) => void;
  queuePrivateMessagesWatchdog: (delayMs?: number) => void;
  refreshDeveloperPendingQueues: () => Promise<unknown>;
  refreshDirectMessages: (options?: RefreshDirectMessagesOptions) => Promise<void>;
  restoreGroupEpochHistory: (
    groupPublicKey: string,
    epochPublicKey: string,
    options?: RestoreOptions
  ) => Promise<void>;
  setIsReconnectHealing: (value: boolean) => void;
  setReconnectHealingStatusLabel: (value: string | null) => void;
}

const RECONNECT_HEALING_STATUS_LABELS = {
  preparingSync: 'Preparing sync',
  queueingPreparingSync: 'Queing preparing sync',
  checkingSessionAndNetwork: 'Checking session and network',
  queueingMessageRelayCheck: 'Queing message relay check',
  queueingUnsentMessageRetries: 'Queing unsent message retries',
  refreshingGroupHistory: 'Refreshing group history',
  refreshingDirectMessages: 'Refreshing direct messages',
  applyingPendingMessageUpdates: 'Applying pending message updates',
  finishingSync: 'Finishing sync',
} as const;
const RECONNECT_HEALING_STATUS_MIN_VISIBLE_MS = 200;

function hasWindow(): boolean {
  return typeof window !== 'undefined';
}

function isBrowserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function logReconnectHealing(phase: string, details: Record<string, unknown> = {}): void {
  console.log('[nostr-chat][reconnect-healing]', phase, details);
}

function normalizeChatTarget(
  target: ReconnectHealingChatTarget | null | undefined
): ReconnectHealingChatTarget | null {
  if (!target) {
    return null;
  }

  const normalizedId = inputSanitizerService.normalizeHexKey(target.id);
  const normalizedPublicKey = inputSanitizerService.normalizeHexKey(target.publicKey);
  const normalizedEpochPublicKey =
    typeof target.epochPublicKey === 'string'
      ? inputSanitizerService.normalizeHexKey(target.epochPublicKey)
      : null;
  if (!normalizedId || !normalizedPublicKey) {
    return null;
  }

  return {
    id: normalizedId,
    publicKey: normalizedPublicKey,
    type: target.type,
    epochPublicKey: normalizedEpochPublicKey,
  };
}

function getReconnectHealingDelayMs(reason: ReconnectHealingReason): number {
  switch (reason) {
    case 'window-focus':
      return RECONNECT_HEALING_FOCUS_DELAY_MS;
    case 'visibility-regain':
      return RECONNECT_HEALING_VISIBILITY_DELAY_MS;
    case 'relay-connected':
      return RECONNECT_HEALING_RELAY_RECONNECT_DELAY_MS;
    case 'relay-list-changed':
      return RECONNECT_HEALING_RELAY_LIST_CHANGE_DELAY_MS;
    default:
      return RECONNECT_HEALING_ONLINE_DELAY_MS;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, Math.max(0, Math.floor(ms)));
  });
}

export function createReconnectHealingRuntime({
  getLoggedInPublicKeyHex,
  getVisibleChatTarget,
  isNativeAndroid,
  isRestoringStartupState,
  queueOutboundMessageReplay,
  queuePrivateMessagesWatchdog,
  refreshDeveloperPendingQueues,
  refreshDirectMessages,
  restoreGroupEpochHistory,
  setIsReconnectHealing,
  setReconnectHealingStatusLabel,
}: ReconnectHealingRuntimeDeps) {
  let reconnectHealingTimeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
  let reconnectHealingScheduledAt = 0;
  let reconnectHealingRunPromise: Promise<void> | null = null;
  let reconnectHealingQueuedReason: ReconnectHealingReason | null = null;
  let reconnectHealingQueuedDelayMs: number | null = null;
  let reconnectHealingLastStartedAt = 0;
  let reconnectHealingLastBlurAt = 0;
  let reconnectHealingLastHiddenAt = 0;
  let reconnectHealingStatusLabel: string | null = null;
  let reconnectHealingStatusLabelSetAt = 0;
  let reconnectHealingStatusLabelVersion = 0;

  function setReconnectHealingStatusLabelNow(value: string | null): void {
    reconnectHealingStatusLabel = value;
    reconnectHealingStatusLabelSetAt = value === null ? 0 : Date.now();
    reconnectHealingStatusLabelVersion += 1;
    setReconnectHealingStatusLabel(value);
  }

  function getReconnectHealingStatusRemainingVisibleMs(): number {
    if (reconnectHealingStatusLabel === null || reconnectHealingStatusLabelSetAt <= 0) {
      return 0;
    }

    return Math.max(
      0,
      RECONNECT_HEALING_STATUS_MIN_VISIBLE_MS - (Date.now() - reconnectHealingStatusLabelSetAt)
    );
  }

  async function waitForReconnectHealingStatusMinimumVisibleMs(): Promise<boolean> {
    const statusLabelVersion = reconnectHealingStatusLabelVersion;
    const remainingMs = getReconnectHealingStatusRemainingVisibleMs();
    if (remainingMs > 0) {
      await delay(remainingMs);
    }

    return statusLabelVersion === reconnectHealingStatusLabelVersion;
  }

  async function showReconnectHealingStatusLabel(value: string): Promise<boolean> {
    if (!(await waitForReconnectHealingStatusMinimumVisibleMs())) {
      return false;
    }

    setReconnectHealingStatusLabelNow(value);
    return true;
  }

  async function hideReconnectHealingStatus(): Promise<void> {
    await waitForReconnectHealingStatusMinimumVisibleMs();
    setIsReconnectHealing(false);
    setReconnectHealingStatusLabelNow(null);
  }

  function clearReconnectHealingTimer(): void {
    if (reconnectHealingTimeoutId !== null) {
      globalThis.clearTimeout(reconnectHealingTimeoutId);
      reconnectHealingTimeoutId = null;
    }

    reconnectHealingScheduledAt = 0;
  }

  function queueReconnectHealingWhileRunning(
    reason: ReconnectHealingReason,
    delayMs: number
  ): void {
    if (
      reconnectHealingQueuedReason === null ||
      reconnectHealingQueuedDelayMs === null ||
      delayMs < reconnectHealingQueuedDelayMs
    ) {
      reconnectHealingQueuedReason = reason;
      reconnectHealingQueuedDelayMs = delayMs;
    }
  }

  function notifyBrowserOnline(): void {
    if (!getLoggedInPublicKeyHex()) {
      return;
    }

    queueReconnectHealing('browser-online');
  }

  function notifyWindowBlur(): void {
    reconnectHealingLastBlurAt = Date.now();
  }

  function shouldRunAfterBackground(lastBackgroundAt: number): boolean {
    return (
      lastBackgroundAt > 0 && Date.now() - lastBackgroundAt >= RECONNECT_HEALING_MIN_BACKGROUND_MS
    );
  }

  function notifyWindowFocus(): void {
    if (!getLoggedInPublicKeyHex()) {
      return;
    }

    const lastBackgroundAt = Math.max(reconnectHealingLastBlurAt, reconnectHealingLastHiddenAt);
    if (!shouldRunAfterBackground(lastBackgroundAt)) {
      return;
    }

    queueReconnectHealing('window-focus');
  }

  function notifyVisibilityHidden(): void {
    reconnectHealingLastHiddenAt = Date.now();
  }

  function notifyVisibilityRegain(): void {
    if (!getLoggedInPublicKeyHex()) {
      return;
    }

    if (!shouldRunAfterBackground(reconnectHealingLastHiddenAt)) {
      return;
    }

    queueReconnectHealing('visibility-regain');
  }

  function queueReconnectHealing(
    reason: ReconnectHealingReason,
    delayMs = getReconnectHealingDelayMs(reason)
  ): void {
    if (!hasWindow() || !getLoggedInPublicKeyHex()) {
      return;
    }

    const cooldownRemainingMs = Math.max(
      0,
      reconnectHealingLastStartedAt + RECONNECT_HEALING_MIN_INTERVAL_MS - Date.now()
    );
    const normalizedDelayMs = Math.max(0, Math.floor(delayMs), cooldownRemainingMs);

    if (reconnectHealingRunPromise) {
      queueReconnectHealingWhileRunning(reason, normalizedDelayMs);
      return;
    }

    const nextScheduledAt = Date.now() + normalizedDelayMs;
    if (
      reconnectHealingTimeoutId !== null &&
      reconnectHealingScheduledAt > 0 &&
      reconnectHealingScheduledAt <= nextScheduledAt
    ) {
      return;
    }

    clearReconnectHealingTimer();
    reconnectHealingScheduledAt = nextScheduledAt;
    setReconnectHealingStatusLabelNow(RECONNECT_HEALING_STATUS_LABELS.queueingPreparingSync);
    setIsReconnectHealing(true);
    logReconnectHealing('queued', {
      reason,
      delayMs: normalizedDelayMs,
    });
    reconnectHealingTimeoutId = globalThis.setTimeout(() => {
      clearReconnectHealingTimer();
      void runReconnectHealing(reason);
    }, normalizedDelayMs);
  }

  async function runReconnectHealing(reason: ReconnectHealingReason): Promise<void> {
    if (reconnectHealingRunPromise) {
      return reconnectHealingRunPromise;
    }

    reconnectHealingRunPromise = (async () => {
      await showReconnectHealingStatusLabel(RECONNECT_HEALING_STATUS_LABELS.preparingSync);
      setIsReconnectHealing(true);

      const loggedInPublicKeyHex = getLoggedInPublicKeyHex();
      if (!loggedInPublicKeyHex) {
        return;
      }

      await showReconnectHealingStatusLabel(
        RECONNECT_HEALING_STATUS_LABELS.checkingSessionAndNetwork
      );
      if (isRestoringStartupState.value) {
        logReconnectHealing('skip', {
          reason,
          skipReason: 'startup-restore-in-progress',
        });
        queueReconnectHealingWhileRunning(reason, RECONNECT_HEALING_ONLINE_DELAY_MS);
        return;
      }

      if (isBrowserOffline()) {
        logReconnectHealing('skip', {
          reason,
          skipReason: 'browser-offline',
        });
        return;
      }

      reconnectHealingLastStartedAt = Date.now();
      await showReconnectHealingStatusLabel(
        RECONNECT_HEALING_STATUS_LABELS.queueingMessageRelayCheck
      );
      queuePrivateMessagesWatchdog(0);
      await showReconnectHealingStatusLabel(
        RECONNECT_HEALING_STATUS_LABELS.queueingUnsentMessageRetries
      );
      queueOutboundMessageReplay('reconnect-healing', 0);

      const visibleChatTarget = normalizeChatTarget(getVisibleChatTarget());
      logReconnectHealing('start', {
        reason,
        visibleChatId: visibleChatTarget?.id ?? null,
        visibleChatType: visibleChatTarget?.type ?? null,
        directMessageRecipientPubkey: loggedInPublicKeyHex,
      });

      let restoredVisibleGroupEpoch = false;
      let refreshedDirectMessages = false;

      if (visibleChatTarget?.type === 'group' && visibleChatTarget.epochPublicKey) {
        await showReconnectHealingStatusLabel(
          RECONNECT_HEALING_STATUS_LABELS.refreshingGroupHistory
        );
        await restoreGroupEpochHistory(
          visibleChatTarget.publicKey,
          visibleChatTarget.epochPublicKey,
          {
            force: true,
          }
        );
        restoredVisibleGroupEpoch = true;
      }

      await showReconnectHealingStatusLabel(
        RECONNECT_HEALING_STATUS_LABELS.refreshingDirectMessages
      );
      await refreshDirectMessages({
        forceLiveSubscriptionRecreate: isNativeAndroid(),
      });
      refreshedDirectMessages = true;

      await showReconnectHealingStatusLabel(
        RECONNECT_HEALING_STATUS_LABELS.applyingPendingMessageUpdates
      );
      const pendingQueueSummary = await refreshDeveloperPendingQueues();
      await showReconnectHealingStatusLabel(RECONNECT_HEALING_STATUS_LABELS.finishingSync);
      logReconnectHealing('complete', {
        reason,
        restoredVisibleGroupEpoch,
        refreshedDirectMessages,
        pendingQueueSummary,
      });
    })()
      .catch((error) => {
        console.warn('[nostr-chat][reconnect-healing] failed', {
          reason,
          error: error instanceof Error ? error.message : String(error ?? ''),
        });
      })
      .finally(async () => {
        await hideReconnectHealingStatus();
        reconnectHealingRunPromise = null;

        if (
          reconnectHealingQueuedReason !== null &&
          reconnectHealingQueuedDelayMs !== null &&
          getLoggedInPublicKeyHex()
        ) {
          const nextReason = reconnectHealingQueuedReason;
          const nextDelayMs = reconnectHealingQueuedDelayMs;
          reconnectHealingQueuedReason = null;
          reconnectHealingQueuedDelayMs = null;
          queueReconnectHealing(nextReason, nextDelayMs);
          return;
        }

        reconnectHealingQueuedReason = null;
        reconnectHealingQueuedDelayMs = null;
      });

    return reconnectHealingRunPromise;
  }

  function notifyRelayConnected(): void {
    queueReconnectHealing('relay-connected');
  }

  function notifyRelayListChanged(): void {
    queueReconnectHealing('relay-list-changed');
  }

  function resetReconnectHealingRuntimeState(): void {
    clearReconnectHealingTimer();
    reconnectHealingQueuedReason = null;
    reconnectHealingQueuedDelayMs = null;
    reconnectHealingRunPromise = null;
    reconnectHealingLastStartedAt = 0;
    reconnectHealingLastBlurAt = 0;
    reconnectHealingLastHiddenAt = 0;
    setIsReconnectHealing(false);
    setReconnectHealingStatusLabelNow(null);
  }

  return {
    notifyBrowserOnline,
    notifyRelayConnected,
    notifyRelayListChanged,
    notifyVisibilityHidden,
    notifyVisibilityRegain,
    notifyWindowBlur,
    notifyWindowFocus,
    queueReconnectHealing,
    resetReconnectHealingRuntimeState,
    runReconnectHealing,
  };
}
