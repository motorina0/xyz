import NDK, {
  NDKEvent,
  type NDKFilter,
  NDKKind,
  NDKRelaySet,
  NDKSubscriptionCacheUsage,
  type NDKSubscriptionOptions,
  normalizeRelayUrl,
} from '@nostr-dev-kit/ndk';
import { chatDataService } from 'src/services/chatDataService';
import { contactsService } from 'src/services/contactsService';
import {
  PRIVATE_MESSAGES_STARTUP_RESTORE_THROTTLE_MS,
  PRIVATE_MESSAGES_WATCHDOG_INTERVAL_MS,
  PRIVATE_MESSAGES_WATCHDOG_RECOVERY_COOLDOWN_MS,
} from 'src/stores/nostr/constants';
import type { SubscribePrivateMessagesOptions } from 'src/stores/nostr/types';
import type { Ref } from 'vue';

interface PrivateMessagesSubscriptionRuntimeDeps {
  beginStartupStep: (stepId: 'private-message-events') => void;
  buildFilterSinceDetails: (since: number | undefined) => Record<string, unknown>;
  buildPrivateMessageSubscriptionTargetDetails: (
    recipientPubkeys: string[],
    loggedInPubkeyHex: string
  ) => Promise<Record<string, unknown>>;
  buildSubscriptionEventDetails: (
    event: Pick<NDKEvent, 'id' | 'kind' | 'created_at' | 'pubkey'>
  ) => Record<string, unknown>;
  buildSubscriptionRelayDetails: (relayUrls: string[]) => Record<string, unknown>;
  bumpDeveloperDiagnosticsVersion: () => void;
  clearPrivateMessagesUiRefreshState: () => void;
  completeStartupStep: (stepId: 'private-message-events') => void;
  ensureRelayConnections: (relayUrls: string[]) => Promise<void>;
  extractRelayUrlsFromEvent: (event: NDKEvent) => string[];
  failStartupStep: (stepId: 'private-message-events', error: unknown) => void;
  flushPrivateMessagesUiRefreshNow: () => void;
  formatSubscriptionLogValue: (value: string | null | undefined) => string | null;
  getFilterSince: () => number;
  getLoggedInPublicKeyHex: () => string | null;
  getOrCreateSigner: () => Promise<unknown>;
  getPrivateMessagesRestoreThrottleMs: () => number;
  getPrivateMessagesStartupLiveSince: () => number;
  getRelaySnapshots: (relayUrls: string[]) => unknown[];
  getStartupStepSnapshot: (stepId: 'private-message-events') => { status: string };
  getStoredAuthMethod: () => string | null;
  isRestoringStartupState: Ref<boolean>;
  listPrivateMessageRecipientPubkeys: () => Promise<string[]>;
  logSubscription: (
    label: 'private-messages',
    stage: string,
    details?: Record<string, unknown>
  ) => void;
  ndk: NDK;
  normalizeEventId: (value: unknown) => string | null;
  normalizeRelayStatusUrls: (relayUrls: string[]) => string[];
  normalizeThrottleMs: (value: number | undefined) => number;
  privateMessagesSubscriptionLastEoseAt: Ref<string | null>;
  privateMessagesSubscriptionLastEventCreatedAt: Ref<number | null>;
  privateMessagesSubscriptionLastEventId: Ref<string | null>;
  privateMessagesSubscriptionLastEventSeenAt: Ref<string | null>;
  privateMessagesSubscriptionRelayUrls: Ref<string[]>;
  privateMessagesSubscriptionSince: Ref<number | null>;
  privateMessagesSubscriptionStartedAt: Ref<string | null>;
  queuePrivateMessageIngestion: (wrappedEvent: NDKEvent, loggedInPubkeyHex: string) => void;
  refreshAllStoredContacts: () => Promise<unknown>;
  relaySignature: (relays: string[]) => string;
  resolvePrivateMessageReadRelayUrls: (seedRelayUrls?: string[]) => Promise<string[]>;
  schedulePostPrivateMessagesEoseChecks: () => void;
  setPrivateMessagesRestoreThrottleMs: (value: number) => void;
  startPrivateMessagesStartupBackfill: (
    loggedInPubkeyHex: string,
    recipientPubkeys: string[],
    relayUrls: string[],
    liveSince: number
  ) => void;
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
  updateStoredEventSinceFromCreatedAt: (value: unknown) => void;
  updateStoredPrivateMessagesLastReceivedFromCreatedAt: (value: unknown) => void;
}

export function createPrivateMessagesSubscriptionRuntime({
  beginStartupStep,
  buildFilterSinceDetails,
  buildPrivateMessageSubscriptionTargetDetails,
  buildSubscriptionEventDetails,
  buildSubscriptionRelayDetails,
  bumpDeveloperDiagnosticsVersion,
  clearPrivateMessagesUiRefreshState,
  completeStartupStep,
  ensureRelayConnections,
  extractRelayUrlsFromEvent,
  failStartupStep,
  flushPrivateMessagesUiRefreshNow,
  formatSubscriptionLogValue,
  getFilterSince,
  getLoggedInPublicKeyHex,
  getOrCreateSigner,
  getPrivateMessagesRestoreThrottleMs,
  getPrivateMessagesStartupLiveSince,
  getRelaySnapshots,
  getStartupStepSnapshot,
  getStoredAuthMethod,
  isRestoringStartupState,
  listPrivateMessageRecipientPubkeys,
  logSubscription,
  ndk,
  normalizeEventId,
  normalizeRelayStatusUrls,
  normalizeThrottleMs,
  privateMessagesSubscriptionLastEoseAt,
  privateMessagesSubscriptionLastEventCreatedAt,
  privateMessagesSubscriptionLastEventId,
  privateMessagesSubscriptionLastEventSeenAt,
  privateMessagesSubscriptionRelayUrls,
  privateMessagesSubscriptionSince,
  privateMessagesSubscriptionStartedAt,
  queuePrivateMessageIngestion,
  refreshAllStoredContacts,
  relaySignature,
  resolvePrivateMessageReadRelayUrls,
  schedulePostPrivateMessagesEoseChecks,
  setPrivateMessagesRestoreThrottleMs,
  startPrivateMessagesStartupBackfill,
  subscribeWithReqLogging,
  updateStoredEventSinceFromCreatedAt,
  updateStoredPrivateMessagesLastReceivedFromCreatedAt,
}: PrivateMessagesSubscriptionRuntimeDeps) {
  let privateMessagesSubscription: ReturnType<NDK['subscribe']> | null = null;
  let privateMessagesSubscriptionSignature = '';
  let privateMessagesWatchdogTimeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
  let privateMessagesWatchdogRunPromise: Promise<void> | null = null;
  let privateMessagesWatchdogLastRecoveryAt = 0;
  let privateMessagesSubscriptionShouldBeActive = false;
  let hasPrivateMessagesWatchdogOnlineListener = false;
  const privateMessagesWatchdogRelayConnectionStates = new Map<string, boolean>();

  function ensurePrivateMessagesWatchdog(): void {
    if (typeof window === 'undefined') {
      return;
    }

    if (!hasPrivateMessagesWatchdogOnlineListener) {
      window.addEventListener('online', handlePrivateMessagesWatchdogBrowserOnline);
      hasPrivateMessagesWatchdogOnlineListener = true;
    }

    queuePrivateMessagesWatchdog(PRIVATE_MESSAGES_WATCHDOG_INTERVAL_MS);
  }

  function handlePrivateMessagesWatchdogBrowserOnline(): void {
    if (!privateMessagesSubscriptionShouldBeActive) {
      return;
    }

    logSubscription('private-messages', 'watchdog-browser-online');
    queuePrivateMessagesWatchdog(0);
  }

  function queuePrivateMessagesWatchdog(delayMs = PRIVATE_MESSAGES_WATCHDOG_INTERVAL_MS): void {
    if (typeof window === 'undefined') {
      return;
    }

    if (privateMessagesWatchdogTimeoutId !== null) {
      globalThis.clearTimeout(privateMessagesWatchdogTimeoutId);
    }

    privateMessagesWatchdogTimeoutId = globalThis.setTimeout(
      () => {
        privateMessagesWatchdogTimeoutId = null;
        void runPrivateMessagesWatchdog();
      },
      Math.max(0, Math.floor(delayMs))
    );
  }

  function syncPrivateMessagesWatchdogRelayConnectionStates(relayUrls: string[]): void {
    const normalizedRelayUrls = normalizeRelayStatusUrls(relayUrls);
    const nextRelayUrlSet = new Set(normalizedRelayUrls);

    for (const relayUrl of privateMessagesWatchdogRelayConnectionStates.keys()) {
      if (!nextRelayUrlSet.has(relayUrl)) {
        privateMessagesWatchdogRelayConnectionStates.delete(relayUrl);
      }
    }

    for (const relayUrl of normalizedRelayUrls) {
      const relay = ndk.pool.getRelay(normalizeRelayUrl(relayUrl), false);
      privateMessagesWatchdogRelayConnectionStates.set(relayUrl, Boolean(relay?.connected));
    }
  }

  function markPrivateMessagesWatchdogRelayDisconnected(relayUrl: string): void {
    privateMessagesWatchdogRelayConnectionStates.set(relayUrl, false);
  }

  function isPrivateMessagesSubscriptionRelayTracked(relayUrl: string): boolean {
    return privateMessagesSubscriptionRelayUrls.value.includes(relayUrl);
  }

  function isBrowserOfflineForPrivateMessagesWatchdog(): boolean {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
  }

  async function recoverPrivateMessagesSubscriptionFromWatchdog(
    reason: string,
    details: Record<string, unknown> = {}
  ): Promise<void> {
    const now = Date.now();
    if (
      now - privateMessagesWatchdogLastRecoveryAt <
      PRIVATE_MESSAGES_WATCHDOG_RECOVERY_COOLDOWN_MS
    ) {
      logSubscription('private-messages', 'watchdog-recover-skipped', {
        reason,
        cooldownMs: PRIVATE_MESSAGES_WATCHDOG_RECOVERY_COOLDOWN_MS,
        ...details,
      });
      return;
    }

    privateMessagesWatchdogLastRecoveryAt = now;
    logSubscription('private-messages', 'watchdog-recover', {
      reason,
      ...details,
    });
    await subscribePrivateMessagesForLoggedInUser(true, {
      restoreThrottleMs: PRIVATE_MESSAGES_STARTUP_RESTORE_THROTTLE_MS,
    });
  }

  async function runPrivateMessagesWatchdog(): Promise<void> {
    if (privateMessagesWatchdogRunPromise) {
      return privateMessagesWatchdogRunPromise;
    }

    privateMessagesWatchdogRunPromise = (async () => {
      try {
        if (!privateMessagesSubscriptionShouldBeActive) {
          privateMessagesWatchdogRelayConnectionStates.clear();
          return;
        }

        if (isRestoringStartupState.value) {
          return;
        }

        const loggedInPubkeyHex = getLoggedInPublicKeyHex();
        const authMethod = getStoredAuthMethod();
        if (!loggedInPubkeyHex || !authMethod) {
          privateMessagesSubscriptionShouldBeActive = false;
          privateMessagesWatchdogRelayConnectionStates.clear();
          return;
        }

        const browserOffline = isBrowserOfflineForPrivateMessagesWatchdog();
        const relayUrls = normalizeRelayStatusUrls(privateMessagesSubscriptionRelayUrls.value);
        if (
          !privateMessagesSubscription ||
          !privateMessagesSubscriptionSignature ||
          relayUrls.length === 0
        ) {
          if (browserOffline) {
            return;
          }

          await recoverPrivateMessagesSubscriptionFromWatchdog('subscription-missing', {
            hasSubscription: Boolean(privateMessagesSubscription),
            hasSignature: Boolean(privateMessagesSubscriptionSignature),
            relayCount: relayUrls.length,
          });
          return;
        }

        const relayStatesBefore = new Map<string, boolean>();
        for (const relayUrl of relayUrls) {
          const relay = ndk.pool.getRelay(normalizeRelayUrl(relayUrl), false);
          relayStatesBefore.set(relayUrl, Boolean(relay?.connected));
        }

        const disconnectedRelayUrls = relayUrls.filter(
          (relayUrl) => !relayStatesBefore.get(relayUrl)
        );
        if (disconnectedRelayUrls.length > 0 && !browserOffline) {
          const shouldLogReconnectAttempt = disconnectedRelayUrls.some(
            (relayUrl) => privateMessagesWatchdogRelayConnectionStates.get(relayUrl) !== false
          );
          if (shouldLogReconnectAttempt) {
            logSubscription('private-messages', 'watchdog-reconnect-relays', {
              disconnectedRelayUrls,
              ...buildSubscriptionRelayDetails(relayUrls),
            });
          }
          await ensureRelayConnections(relayUrls);
        }

        const relayStatesAfter = new Map<string, boolean>();
        for (const relayUrl of relayUrls) {
          const relay = ndk.pool.getRelay(normalizeRelayUrl(relayUrl), false);
          relayStatesAfter.set(relayUrl, Boolean(relay?.connected));
        }

        const reconnectedRelayUrls = relayUrls.filter((relayUrl) => {
          const before = relayStatesBefore.get(relayUrl) ?? false;
          const after = relayStatesAfter.get(relayUrl) ?? false;
          const previous = privateMessagesWatchdogRelayConnectionStates.get(relayUrl);
          return (
            after && ((!before && disconnectedRelayUrls.includes(relayUrl)) || previous === false)
          );
        });

        syncPrivateMessagesWatchdogRelayConnectionStates(relayUrls);

        if (reconnectedRelayUrls.length > 0) {
          await recoverPrivateMessagesSubscriptionFromWatchdog('relay-reconnected', {
            reconnectedRelayUrls,
            ...buildSubscriptionRelayDetails(relayUrls),
          });
        }
      } catch (error) {
        console.warn('Private messages watchdog failed', error);
        logSubscription('private-messages', 'watchdog-error', {
          error,
        });
      } finally {
        privateMessagesWatchdogRunPromise = null;
        queuePrivateMessagesWatchdog(PRIVATE_MESSAGES_WATCHDOG_INTERVAL_MS);
      }
    })();

    return privateMessagesWatchdogRunPromise;
  }

  function stopPrivateMessagesLiveSubscription(reason = 'replace'): void {
    if (privateMessagesSubscription) {
      logSubscription('private-messages', 'stop', {
        reason,
        signature: privateMessagesSubscriptionSignature || null,
      });
      privateMessagesSubscription.stop();
      privateMessagesSubscription = null;
    }

    clearPrivateMessagesUiRefreshState();
    privateMessagesWatchdogRelayConnectionStates.clear();
    privateMessagesSubscriptionSignature = '';
    setPrivateMessagesRestoreThrottleMs(0);
    privateMessagesSubscriptionRelayUrls.value = [];
    privateMessagesSubscriptionSince.value = null;
    bumpDeveloperDiagnosticsVersion();
  }

  function resetPrivateMessagesSubscriptionRuntimeState(
    options: { clearLastEventState?: boolean } = {}
  ): void {
    privateMessagesWatchdogLastRecoveryAt = 0;
    privateMessagesSubscriptionShouldBeActive = false;
    privateMessagesWatchdogRelayConnectionStates.clear();

    if (!options.clearLastEventState) {
      return;
    }

    privateMessagesSubscriptionStartedAt.value = null;
    privateMessagesSubscriptionLastEventSeenAt.value = null;
    privateMessagesSubscriptionLastEventId.value = null;
    privateMessagesSubscriptionLastEventCreatedAt.value = null;
    privateMessagesSubscriptionLastEoseAt.value = null;
  }

  async function subscribePrivateMessagesForLoggedInUser(
    force = false,
    options: SubscribePrivateMessagesOptions = {}
  ): Promise<void> {
    const hasActiveStartupTracking =
      getStartupStepSnapshot('private-message-events').status === 'in_progress';
    const shouldTrackStartupStep = options.startupTrackStep === true || hasActiveStartupTracking;
    const shouldRunStartupBackfill =
      !Number.isInteger(options.sinceOverride) &&
      (options.startupTrackStep === true ||
        hasActiveStartupTracking ||
        isRestoringStartupState.value);
    if (options.startupTrackStep === true) {
      beginStartupStep('private-message-events');
    }

    const loggedInPubkeyHex = getLoggedInPublicKeyHex();
    const authMethod = getStoredAuthMethod();

    if (!loggedInPubkeyHex || !authMethod) {
      privateMessagesSubscriptionShouldBeActive = false;
      logSubscription('private-messages', 'skip', {
        reason: 'missing-login',
        pubkey: formatSubscriptionLogValue(loggedInPubkeyHex),
        authMethod: authMethod ?? null,
      });
      stopPrivateMessagesLiveSubscription('missing-login');
      if (shouldTrackStartupStep) {
        completeStartupStep('private-message-events');
      }
      return;
    }

    try {
      privateMessagesSubscriptionShouldBeActive = true;
      await contactsService.init();
      await chatDataService.init();
      const relayUrls = await resolvePrivateMessageReadRelayUrls(options.seedRelayUrls);
      if (relayUrls.length === 0) {
        privateMessagesSubscriptionShouldBeActive = false;
        logSubscription('private-messages', 'skip', {
          reason: 'no-relays',
          pubkey: formatSubscriptionLogValue(loggedInPubkeyHex),
          authMethod,
        });
        stopPrivateMessagesLiveSubscription('no-relays');
        if (shouldTrackStartupStep) {
          completeStartupStep('private-message-events');
        }
        return;
      }

      const recipientPubkeys = await listPrivateMessageRecipientPubkeys();
      if (recipientPubkeys.length === 0) {
        privateMessagesSubscriptionShouldBeActive = false;
        logSubscription('private-messages', 'skip', {
          reason: 'no-recipients',
          pubkey: formatSubscriptionLogValue(loggedInPubkeyHex),
          authMethod,
        });
        stopPrivateMessagesLiveSubscription('no-recipients');
        if (shouldTrackStartupStep) {
          completeStartupStep('private-message-events');
        }
        return;
      }

      const signature = `${recipientPubkeys.join(',')}:${relaySignature(relayUrls)}`;
      const filterSince =
        Number.isInteger(options.sinceOverride) && Number(options.sinceOverride) >= 0
          ? Math.floor(Number(options.sinceOverride))
          : shouldRunStartupBackfill
            ? getPrivateMessagesStartupLiveSince()
            : getFilterSince();
      const hasMatchingActiveSubscription =
        Boolean(privateMessagesSubscription) && privateMessagesSubscriptionSignature === signature;
      const currentSubscriptionSince =
        Number.isInteger(privateMessagesSubscriptionSince.value) &&
        Number(privateMessagesSubscriptionSince.value) >= 0
          ? Number(privateMessagesSubscriptionSince.value)
          : null;
      const requiresBroaderSinceWindow =
        currentSubscriptionSince === null || filterSince < currentSubscriptionSince;

      if (hasMatchingActiveSubscription && !force && !requiresBroaderSinceWindow) {
        setPrivateMessagesRestoreThrottleMs(
          Math.max(
            getPrivateMessagesRestoreThrottleMs(),
            normalizeThrottleMs(options.restoreThrottleMs)
          )
        );
        syncPrivateMessagesWatchdogRelayConnectionStates(relayUrls);
        logSubscription('private-messages', 'skip', {
          reason: 'already-active',
          signature,
          pubkey: formatSubscriptionLogValue(loggedInPubkeyHex),
          authMethod,
          recipientCount: recipientPubkeys.length,
          recipients: recipientPubkeys.map((value) => formatSubscriptionLogValue(value)),
          requestedSince: filterSince,
          currentSince: currentSubscriptionSince,
          ...buildSubscriptionRelayDetails(relayUrls),
        });
        if (shouldTrackStartupStep) {
          completeStartupStep('private-message-events');
        }
        return;
      }

      logSubscription('private-messages', 'prepare', {
        force,
        signature,
        pubkey: formatSubscriptionLogValue(loggedInPubkeyHex),
        authMethod,
        recipientCount: recipientPubkeys.length,
        recipients: recipientPubkeys.map((value) => formatSubscriptionLogValue(value)),
        ...buildFilterSinceDetails(filterSince),
        restoreThrottleMs: normalizeThrottleMs(options.restoreThrottleMs),
        relaySnapshots: getRelaySnapshots(relayUrls),
        ...buildSubscriptionRelayDetails(relayUrls),
      });

      await ensureRelayConnections(relayUrls);
      await getOrCreateSigner();
      stopPrivateMessagesLiveSubscription();
      setPrivateMessagesRestoreThrottleMs(normalizeThrottleMs(options.restoreThrottleMs));
      const relaySnapshots = getRelaySnapshots(relayUrls);
      const disconnectedRelayUrls = relayUrls.filter((relayUrl) => {
        const relay = ndk.pool.getRelay(normalizeRelayUrl(relayUrl), false);
        return !relay?.connected;
      });
      const privateMessageTargetDetails = await buildPrivateMessageSubscriptionTargetDetails(
        recipientPubkeys,
        loggedInPubkeyHex
      );

      if (disconnectedRelayUrls.length > 0) {
        logSubscription('private-messages', 'relay-health', {
          reason: 'subscription-relays-disconnected',
          signature,
          disconnectedRelayUrls,
          relaySnapshots,
        });
      }

      logSubscription('private-messages', 'start', {
        force,
        signature,
        pubkey: formatSubscriptionLogValue(loggedInPubkeyHex),
        authMethod,
        recipientCount: recipientPubkeys.length,
        recipients: recipientPubkeys.map((value) => formatSubscriptionLogValue(value)),
        ...buildFilterSinceDetails(filterSince),
        restoreThrottleMs: getPrivateMessagesRestoreThrottleMs(),
        relaySnapshots,
        ...buildSubscriptionRelayDetails(relayUrls),
        ...privateMessageTargetDetails,
      });
      privateMessagesSubscriptionRelayUrls.value = [...relayUrls];
      privateMessagesSubscriptionSince.value = filterSince;
      privateMessagesSubscriptionStartedAt.value = new Date().toISOString();
      privateMessagesSubscriptionLastEoseAt.value = null;
      bumpDeveloperDiagnosticsVersion();

      const relaySet = NDKRelaySet.fromRelayUrls(relayUrls, ndk, false);
      const privateMessagesFilters: NDKFilter = {
        kinds: [NDKKind.GiftWrap],
        '#p': recipientPubkeys,
        since: filterSince,
      };
      privateMessagesSubscription = subscribeWithReqLogging(
        'private-messages',
        'private-messages-live',
        privateMessagesFilters,
        {
          relaySet,
          cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
          onEvent: (event) => {
            const wrappedEvent = event instanceof NDKEvent ? event : new NDKEvent(ndk, event);
            logSubscription('private-messages', 'event', {
              signature,
              ...buildSubscriptionEventDetails(wrappedEvent),
              ...buildSubscriptionRelayDetails(extractRelayUrlsFromEvent(wrappedEvent)),
            });
            privateMessagesSubscriptionLastEventSeenAt.value = new Date().toISOString();
            privateMessagesSubscriptionLastEventId.value =
              normalizeEventId(wrappedEvent.id) ?? wrappedEvent.id ?? null;
            privateMessagesSubscriptionLastEventCreatedAt.value = Number.isInteger(
              wrappedEvent.created_at
            )
              ? Number(wrappedEvent.created_at)
              : null;
            bumpDeveloperDiagnosticsVersion();
            updateStoredPrivateMessagesLastReceivedFromCreatedAt(wrappedEvent.created_at);
            updateStoredEventSinceFromCreatedAt(wrappedEvent.created_at);
            queuePrivateMessageIngestion(wrappedEvent, loggedInPubkeyHex);
          },
          onEose: () => {
            logSubscription('private-messages', 'eose', {
              signature,
              restoreThrottleMs: getPrivateMessagesRestoreThrottleMs(),
            });
            privateMessagesSubscriptionLastEoseAt.value = new Date().toISOString();
            bumpDeveloperDiagnosticsVersion();
            setPrivateMessagesRestoreThrottleMs(0);
            flushPrivateMessagesUiRefreshNow();
            schedulePostPrivateMessagesEoseChecks();
            if (shouldTrackStartupStep) {
              completeStartupStep('private-message-events');
            }
            if (shouldRunStartupBackfill) {
              void (async () => {
                try {
                  const contactRefreshSummary = await refreshAllStoredContacts();
                  logSubscription('private-messages', 'contacts-refresh-after-eose', {
                    signature,
                    ...(contactRefreshSummary && typeof contactRefreshSummary === 'object'
                      ? contactRefreshSummary
                      : {}),
                  });
                } catch (error) {
                  console.warn(
                    'Failed to refresh contacts after private messages startup EOSE',
                    error
                  );
                  logSubscription('private-messages', 'contacts-refresh-after-eose-error', {
                    signature,
                    error,
                  });
                } finally {
                  startPrivateMessagesStartupBackfill(
                    loggedInPubkeyHex,
                    recipientPubkeys,
                    relayUrls,
                    filterSince
                  );
                }
              })();
            }
          },
        },
        {
          signature,
          ...buildFilterSinceDetails(filterSince),
          ...buildSubscriptionRelayDetails(relayUrls),
          ...privateMessageTargetDetails,
        }
      );
      privateMessagesSubscriptionSignature = signature;
      syncPrivateMessagesWatchdogRelayConnectionStates(relayUrls);

      logSubscription('private-messages', 'active', {
        signature,
        pubkey: formatSubscriptionLogValue(loggedInPubkeyHex),
        authMethod,
        recipientCount: recipientPubkeys.length,
        recipients: recipientPubkeys.map((value) => formatSubscriptionLogValue(value)),
        ...buildFilterSinceDetails(filterSince),
        restoreThrottleMs: getPrivateMessagesRestoreThrottleMs(),
        relaySnapshots,
        ...buildSubscriptionRelayDetails(relayUrls),
      });
    } catch (error) {
      if (shouldTrackStartupStep) {
        failStartupStep('private-message-events', error);
      }
      throw error;
    }
  }

  function getPrivateMessagesSubscription(): ReturnType<NDK['subscribe']> | null {
    return privateMessagesSubscription;
  }

  function getPrivateMessagesSubscriptionSignature(): string {
    return privateMessagesSubscriptionSignature;
  }

  return {
    ensurePrivateMessagesWatchdog,
    getPrivateMessagesSubscription,
    getPrivateMessagesSubscriptionSignature,
    isPrivateMessagesSubscriptionRelayTracked,
    markPrivateMessagesWatchdogRelayDisconnected,
    queuePrivateMessagesWatchdog,
    resetPrivateMessagesSubscriptionRuntimeState,
    stopPrivateMessagesLiveSubscription,
    subscribePrivateMessagesForLoggedInUser,
  };
}
