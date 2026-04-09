import {
  NDKEvent,
  NDKKind,
  NDKRelaySet,
  NDKSubscriptionCacheUsage,
  type NDK,
  type NDKFilter,
  type NDKSubscriptionOptions
} from '@nostr-dev-kit/ndk';
import { chatDataService, type ChatRow } from 'src/services/chatDataService';
import { inputSanitizerService } from 'src/services/inputSanitizerService';
import {
  PRIVATE_MESSAGES_BACKFILL_DELAY_STEP_MS,
  PRIVATE_MESSAGES_BACKFILL_MAX_DELAY_MS,
  PRIVATE_MESSAGES_BACKFILL_WINDOW_SECONDS,
  PRIVATE_MESSAGES_STARTUP_RESTORE_THROTTLE_MS
} from 'src/stores/nostr/constants';
import type { PrivateMessagesBackfillState } from 'src/stores/nostr/types';

interface GroupEpochHistoryRestoreOptions {
  force?: boolean;
  seedRelayUrls?: string[];
}

interface PrivateMessagesBackfillRuntimeDeps {
  buildFilterSinceDetails: (since: number | undefined) => Record<string, unknown>;
  buildFilterUntilDetails: (until: number | undefined) => Record<string, unknown>;
  buildPrivateMessageSubscriptionTargetDetails: (
    recipientPubkeys: string[],
    loggedInPubkeyHex: string
  ) => Promise<Record<string, unknown>>;
  buildSubscriptionRelayDetails: (relayUrls: string[]) => Record<string, unknown>;
  ensureRelayConnections: (relayUrls: string[]) => Promise<void>;
  flushPrivateMessagesUiRefreshNow: () => void;
  formatSubscriptionLogValue: (value: string | null | undefined) => string | null;
  getLoggedInPublicKeyHex: () => string | null;
  getPrivateMessagesBackfillResumeState: (
    pubkeyHex: string,
    liveSince: number,
    floorSince: number
  ) => PrivateMessagesBackfillState | null;
  getPrivateMessagesIngestQueue: () => Promise<void>;
  getPrivateMessagesStartupFloorSince: (baseUnixTime?: number) => number;
  logSubscription: (
    label: 'private-messages',
    stage: string,
    details?: Record<string, unknown>
  ) => void;
  ndk: NDK;
  normalizeThrottleMs: (value: number | undefined) => number;
  queuePrivateMessageIngestion: (
    wrappedEvent: NDKEvent,
    loggedInPubkeyHex: string,
    options?: {
      uiThrottleMs?: number;
    }
  ) => void;
  relaySignature: (relays: string[]) => string;
  resolveGroupChatEpochEntries: (
    chat: Pick<ChatRow, 'meta' | 'type'>
  ) => Array<{ epoch_public_key: string }>;
  resolvePrivateMessageReadRelayUrls: (seedRelayUrls?: string[]) => Promise<string[]>;
  schedulePostPrivateMessagesEoseChecks: () => void;
  subscribeWithReqLogging: (
    label: string,
    requestLabel: string,
    filters: NDKFilter | NDKFilter[],
    options: NDKSubscriptionOptions & {
      onEvent?: (event: NDKEvent) => void;
      onEose?: () => void;
      onClose?: () => void;
    },
    details?: Record<string, unknown>
  ) => ReturnType<NDK['subscribe']>;
  toOptionalIsoTimestampFromUnix: (value: number | null | undefined) => string | null;
  updateStoredEventSinceFromCreatedAt: (value: unknown) => void;
  updateStoredPrivateMessagesLastReceivedFromCreatedAt: (value: unknown) => void;
  writePrivateMessagesBackfillState: (state: PrivateMessagesBackfillState) => void;
}

export function createPrivateMessagesBackfillRuntime({
  buildFilterSinceDetails,
  buildFilterUntilDetails,
  buildPrivateMessageSubscriptionTargetDetails,
  buildSubscriptionRelayDetails,
  ensureRelayConnections,
  flushPrivateMessagesUiRefreshNow,
  formatSubscriptionLogValue,
  getLoggedInPublicKeyHex,
  getPrivateMessagesBackfillResumeState,
  getPrivateMessagesIngestQueue,
  getPrivateMessagesStartupFloorSince,
  logSubscription,
  ndk,
  normalizeThrottleMs,
  queuePrivateMessageIngestion,
  relaySignature,
  resolveGroupChatEpochEntries,
  resolvePrivateMessageReadRelayUrls,
  schedulePostPrivateMessagesEoseChecks,
  subscribeWithReqLogging,
  toOptionalIsoTimestampFromUnix,
  updateStoredEventSinceFromCreatedAt,
  updateStoredPrivateMessagesLastReceivedFromCreatedAt,
  writePrivateMessagesBackfillState
}: PrivateMessagesBackfillRuntimeDeps) {
  let privateMessagesBackfillSubscription: ReturnType<NDK['subscribe']> | null = null;
  let privateMessagesBackfillPromise: Promise<void> | null = null;
  let privateMessagesBackfillRunToken = 0;
  let privateMessagesBackfillSignature = '';
  let privateMessagesBackfillDelayTimerId: ReturnType<typeof globalThis.setTimeout> | null = null;
  let privateMessagesBackfillDelayResolver: (() => void) | null = null;
  const groupEpochHistoryRestorePromises = new Map<string, Promise<void>>();
  const restoredGroupEpochHistoryKeys = new Set<string>();

  function clearPrivateMessagesBackfillDelay(): void {
    if (privateMessagesBackfillDelayTimerId !== null) {
      globalThis.clearTimeout(privateMessagesBackfillDelayTimerId);
      privateMessagesBackfillDelayTimerId = null;
    }

    if (privateMessagesBackfillDelayResolver) {
      const resolver = privateMessagesBackfillDelayResolver;
      privateMessagesBackfillDelayResolver = null;
      resolver();
    }
  }

  function stopPrivateMessagesBackfill(reason = 'replace'): void {
    privateMessagesBackfillRunToken += 1;
    clearPrivateMessagesBackfillDelay();

    if (privateMessagesBackfillSubscription) {
      logSubscription('private-messages', 'backfill-stop', {
        reason,
        signature: privateMessagesBackfillSignature || null
      });
      privateMessagesBackfillSubscription.stop();
      privateMessagesBackfillSubscription = null;
    }

    privateMessagesBackfillPromise = null;
    privateMessagesBackfillSignature = '';
  }

  async function waitForPrivateMessagesBackfillDelay(
    delayMs: number,
    runToken: number
  ): Promise<boolean> {
    const normalizedDelayMs = normalizeThrottleMs(delayMs);
    if (normalizedDelayMs <= 0) {
      return runToken === privateMessagesBackfillRunToken;
    }

    await new Promise<void>((resolve) => {
      privateMessagesBackfillDelayResolver = () => {
        privateMessagesBackfillDelayResolver = null;
        resolve();
      };
      privateMessagesBackfillDelayTimerId = globalThis.setTimeout(() => {
        privateMessagesBackfillDelayTimerId = null;
        const resolver = privateMessagesBackfillDelayResolver;
        privateMessagesBackfillDelayResolver = null;
        resolver?.();
      }, normalizedDelayMs);
    });

    return runToken === privateMessagesBackfillRunToken;
  }

  async function runPrivateMessagesBackfillWindow(options: {
    loggedInPubkeyHex: string;
    recipientPubkeys: string[];
    relayUrls: string[];
    since: number;
    until: number;
    signature: string;
  }): Promise<number> {
    const privateMessageTargetDetails = await buildPrivateMessageSubscriptionTargetDetails(
      options.recipientPubkeys,
      options.loggedInPubkeyHex
    );

    return new Promise<number>((resolve, reject) => {
      let didFinish = false;
      let eventCount = 0;
      let subscription: ReturnType<NDK['subscribe']> | null = null;

      const finish = (error?: unknown) => {
        if (didFinish) {
          return;
        }

        didFinish = true;
        if (subscription && privateMessagesBackfillSubscription === subscription) {
          privateMessagesBackfillSubscription = null;
        }

        if (error) {
          reject(error);
          return;
        }

        resolve(eventCount);
      };

      try {
        const relaySet = NDKRelaySet.fromRelayUrls(options.relayUrls, ndk);
        logSubscription('private-messages', 'backfill-window-subscribe', {
          signature: options.signature,
          ...buildFilterSinceDetails(options.since),
          ...buildFilterUntilDetails(options.until),
          ...buildSubscriptionRelayDetails(options.relayUrls),
          recipientCount: options.recipientPubkeys.length,
          recipients: options.recipientPubkeys.map((value) => formatSubscriptionLogValue(value)),
          ...privateMessageTargetDetails
        });
        const privateMessagesBackfillFilters: NDKFilter = {
          kinds: [NDKKind.GiftWrap],
          '#p': options.recipientPubkeys,
          since: options.since,
          until: options.until
        };
        subscription = subscribeWithReqLogging(
          'private-messages',
          'private-messages-backfill',
          privateMessagesBackfillFilters,
          {
            relaySet,
            cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
            closeOnEose: true,
            onEvent: (event) => {
              const wrappedEvent = event instanceof NDKEvent ? event : new NDKEvent(ndk, event);
              eventCount += 1;
              updateStoredPrivateMessagesLastReceivedFromCreatedAt(wrappedEvent.created_at);
              updateStoredEventSinceFromCreatedAt(wrappedEvent.created_at);
              queuePrivateMessageIngestion(wrappedEvent, options.loggedInPubkeyHex, {
                uiThrottleMs: PRIVATE_MESSAGES_STARTUP_RESTORE_THROTTLE_MS
              });
            },
            onEose: () => {
              logSubscription('private-messages', 'backfill-eose', {
                signature: options.signature,
                eventCount,
                ...buildFilterSinceDetails(options.since),
                ...buildFilterUntilDetails(options.until)
              });
              schedulePostPrivateMessagesEoseChecks();
              flushPrivateMessagesUiRefreshNow();
              finish();
            },
            onClose: () => {
              finish();
            }
          },
          {
            signature: options.signature,
            ...buildFilterSinceDetails(options.since),
            ...buildFilterUntilDetails(options.until),
            ...buildSubscriptionRelayDetails(options.relayUrls)
          }
        );

        privateMessagesBackfillSubscription = subscription;
      } catch (error) {
        reject(error);
      }
    });
  }

  async function runGroupEpochHistoryRestoreWindow(options: {
    loggedInPubkeyHex: string;
    groupPublicKey: string;
    recipientPubkey: string;
    relayUrls: string[];
    since: number;
    until: number;
  }): Promise<void> {
    if (options.since >= options.until || options.relayUrls.length === 0) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      let didFinish = false;
      let subscription: ReturnType<NDK['subscribe']> | null = null;

      const finish = (error?: unknown) => {
        if (didFinish) {
          return;
        }

        didFinish = true;
        if (subscription) {
          subscription.stop();
          subscription = null;
        }

        if (error) {
          reject(error);
          return;
        }

        resolve();
      };

      try {
        const relaySet = NDKRelaySet.fromRelayUrls(options.relayUrls, ndk);
        logSubscription('private-messages', 'epoch-history-subscribe', {
          subscriptionTargetType: 'epoch',
          groupChatPubkeys: [formatSubscriptionLogValue(options.groupPublicKey)],
          epochRecipientCount: 1,
          epochRecipients: [
            {
              groupChatPubkey:
                formatSubscriptionLogValue(options.groupPublicKey) ?? options.groupPublicKey,
              epochRecipientPubkey:
                formatSubscriptionLogValue(options.recipientPubkey) ?? options.recipientPubkey
            }
          ],
          ...buildFilterSinceDetails(options.since),
          ...buildFilterUntilDetails(options.until),
          ...buildSubscriptionRelayDetails(options.relayUrls)
        });
        const groupEpochHistoryFilters: NDKFilter = {
          kinds: [NDKKind.GiftWrap],
          '#p': [options.recipientPubkey],
          since: options.since,
          until: options.until
        };
        subscription = subscribeWithReqLogging(
          'private-messages',
          'private-messages-epoch-history',
          groupEpochHistoryFilters,
          {
            relaySet,
            cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
            closeOnEose: true,
            onEvent: (event) => {
              const wrappedEvent = event instanceof NDKEvent ? event : new NDKEvent(ndk, event);
              updateStoredPrivateMessagesLastReceivedFromCreatedAt(wrappedEvent.created_at);
              updateStoredEventSinceFromCreatedAt(wrappedEvent.created_at);
              queuePrivateMessageIngestion(wrappedEvent, options.loggedInPubkeyHex, {
                uiThrottleMs: PRIVATE_MESSAGES_STARTUP_RESTORE_THROTTLE_MS
              });
            },
            onEose: () => {
              schedulePostPrivateMessagesEoseChecks();
              flushPrivateMessagesUiRefreshNow();
              finish();
            },
            onClose: () => {
              finish();
            }
          },
          {
            groupPublicKey: formatSubscriptionLogValue(options.groupPublicKey),
            epochRecipientPubkey: formatSubscriptionLogValue(options.recipientPubkey),
            ...buildFilterSinceDetails(options.since),
            ...buildFilterUntilDetails(options.until),
            ...buildSubscriptionRelayDetails(options.relayUrls)
          }
        );
      } catch (error) {
        reject(error);
      }
    });

    await getPrivateMessagesIngestQueue();
  }

  async function restoreGroupEpochHistory(
    groupPublicKey: string,
    epochPublicKey: string,
    options: GroupEpochHistoryRestoreOptions = {}
  ): Promise<void> {
    const normalizedGroupPublicKey = inputSanitizerService.normalizeHexKey(groupPublicKey);
    const normalizedEpochPublicKey = inputSanitizerService.normalizeHexKey(epochPublicKey);
    const loggedInPubkeyHex = getLoggedInPublicKeyHex();
    if (!normalizedGroupPublicKey || !normalizedEpochPublicKey || !loggedInPubkeyHex) {
      return;
    }

    const restoreKey = `${normalizedGroupPublicKey}:${normalizedEpochPublicKey}`;
    if (!options.force && restoredGroupEpochHistoryKeys.has(restoreKey)) {
      return;
    }

    const existingRestore = groupEpochHistoryRestorePromises.get(restoreKey);
    if (existingRestore) {
      return existingRestore;
    }

    const restorePromise = (async () => {
      await chatDataService.init();
      const groupChat = await chatDataService.getChatByPublicKey(normalizedGroupPublicKey);
      if (!groupChat || groupChat.type !== 'group') {
        return;
      }

      const hasEpoch = resolveGroupChatEpochEntries(groupChat).some(
        (entry) => entry.epoch_public_key === normalizedEpochPublicKey
      );
      if (!hasEpoch) {
        return;
      }

      const relayUrls = await resolvePrivateMessageReadRelayUrls(options.seedRelayUrls);
      if (relayUrls.length === 0) {
        return;
      }

      await ensureRelayConnections(relayUrls);
      const now = Math.floor(Date.now() / 1000);
      await runGroupEpochHistoryRestoreWindow({
        loggedInPubkeyHex,
        groupPublicKey: normalizedGroupPublicKey,
        recipientPubkey: normalizedEpochPublicKey,
        relayUrls,
        since: getPrivateMessagesStartupFloorSince(now),
        until: now
      });
      restoredGroupEpochHistoryKeys.add(restoreKey);
    })()
      .catch((error) => {
        console.warn(
          'Failed to restore group epoch history',
          normalizedGroupPublicKey,
          normalizedEpochPublicKey,
          error
        );
      })
      .finally(() => {
        groupEpochHistoryRestorePromises.delete(restoreKey);
      });

    groupEpochHistoryRestorePromises.set(restoreKey, restorePromise);
    return restorePromise;
  }

  function startPrivateMessagesStartupBackfill(
    loggedInPubkeyHex: string,
    recipientPubkeys: string[],
    relayUrls: string[],
    liveSince: number
  ): void {
    const normalizedPubkey = inputSanitizerService.normalizeHexKey(loggedInPubkeyHex);
    const normalizedRecipientPubkeys = Array.from(
      new Set(
        recipientPubkeys
          .map((pubkey) => inputSanitizerService.normalizeHexKey(pubkey))
          .filter((pubkey): pubkey is string => Boolean(pubkey))
      )
    );
    if (!normalizedPubkey || relayUrls.length === 0 || normalizedRecipientPubkeys.length === 0) {
      return;
    }

    const signature = `${normalizedPubkey}:${normalizedRecipientPubkeys.join(',')}:${relaySignature(relayUrls)}:${liveSince}`;
    if (privateMessagesBackfillPromise && privateMessagesBackfillSignature === signature) {
      return;
    }

    stopPrivateMessagesBackfill('replace');
    privateMessagesBackfillSignature = signature;
    const runToken = ++privateMessagesBackfillRunToken;
    privateMessagesBackfillPromise = (async () => {
      const floorSince = getPrivateMessagesStartupFloorSince();
      let state = getPrivateMessagesBackfillResumeState(normalizedPubkey, liveSince, floorSince);

      if (!state) {
        logSubscription('private-messages', 'backfill-skip', {
          signature,
          reason: 'no-pending-window',
          ...buildFilterSinceDetails(liveSince),
          floorSince,
          floorSinceIso: toOptionalIsoTimestampFromUnix(floorSince)
        });
        return;
      }

      logSubscription('private-messages', 'backfill-start', {
        signature,
        ...buildFilterSinceDetails(state.nextSince),
        ...buildFilterUntilDetails(state.nextUntil),
        floorSince: state.floorSince,
        floorSinceIso: toOptionalIsoTimestampFromUnix(state.floorSince),
        delayMs: state.delayMs
      });

      while (runToken === privateMessagesBackfillRunToken) {
        if (state.nextSince >= state.nextUntil || state.nextUntil <= state.floorSince) {
          writePrivateMessagesBackfillState({
            ...state,
            completed: true
          });
          logSubscription('private-messages', 'backfill-complete', {
            signature,
            ...buildFilterSinceDetails(state.nextSince),
            ...buildFilterUntilDetails(state.nextUntil),
            floorSince: state.floorSince,
            floorSinceIso: toOptionalIsoTimestampFromUnix(state.floorSince)
          });
          return;
        }

        writePrivateMessagesBackfillState(state);
        logSubscription('private-messages', 'backfill-window-start', {
          signature,
          ...buildFilterSinceDetails(state.nextSince),
          ...buildFilterUntilDetails(state.nextUntil),
          delayMs: state.delayMs
        });

        await runPrivateMessagesBackfillWindow({
          loggedInPubkeyHex: normalizedPubkey,
          recipientPubkeys: normalizedRecipientPubkeys,
          relayUrls,
          since: state.nextSince,
          until: state.nextUntil,
          signature
        });

        if (runToken !== privateMessagesBackfillRunToken) {
          return;
        }

        const reachedFloor = state.nextSince <= state.floorSince;
        if (reachedFloor) {
          writePrivateMessagesBackfillState({
            ...state,
            completed: true
          });
          logSubscription('private-messages', 'backfill-complete', {
            signature,
            ...buildFilterSinceDetails(state.nextSince),
            ...buildFilterUntilDetails(state.nextUntil),
            floorSince: state.floorSince,
            floorSinceIso: toOptionalIsoTimestampFromUnix(state.floorSince)
          });
          return;
        }

        const waitDelayMs = state.delayMs;
        const nextUntil = state.nextSince;
        const nextSince = Math.max(
          state.floorSince,
          nextUntil - PRIVATE_MESSAGES_BACKFILL_WINDOW_SECONDS
        );
        state = {
          ...state,
          nextSince,
          nextUntil,
          delayMs: Math.min(
            PRIVATE_MESSAGES_BACKFILL_MAX_DELAY_MS,
            state.delayMs + PRIVATE_MESSAGES_BACKFILL_DELAY_STEP_MS
          ),
          completed: false
        };
        writePrivateMessagesBackfillState(state);

        logSubscription('private-messages', 'backfill-wait', {
          signature,
          delayMs: waitDelayMs,
          nextSince,
          nextSinceIso: toOptionalIsoTimestampFromUnix(nextSince),
          nextUntil,
          nextUntilIso: toOptionalIsoTimestampFromUnix(nextUntil)
        });

        const shouldContinue = await waitForPrivateMessagesBackfillDelay(waitDelayMs, runToken);
        if (!shouldContinue) {
          return;
        }
      }
    })()
      .catch((error) => {
        console.error('Failed to backfill private messages', error);
        logSubscription('private-messages', 'backfill-error', {
          signature,
          error
        });
      })
      .finally(() => {
        if (runToken !== privateMessagesBackfillRunToken) {
          return;
        }

        clearPrivateMessagesBackfillDelay();
        privateMessagesBackfillSubscription = null;
        privateMessagesBackfillPromise = null;
        privateMessagesBackfillSignature = '';
      });
  }

  return {
    restoreGroupEpochHistory,
    startPrivateMessagesStartupBackfill,
    stopPrivateMessagesBackfill
  };
}
