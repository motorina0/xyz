import NDK, {
  NDKEvent,
  type NDKFilter,
  NDKKind,
  NDKRelaySet,
  NDKSubscriptionCacheUsage,
  type NDKSubscriptionOptions,
} from '@nostr-dev-kit/ndk';
import { GROUP_SHARED_ROSTER_FOLLOW_SET_D_TAG } from 'src/stores/nostr/constants';

interface GroupRosterSubscriptionRuntimeDeps {
  applyGroupMembershipRosterEvent: (
    event: NDKEvent,
    options?: {
      refreshMemberProfiles?: boolean;
      seedRelayUrls?: string[];
    }
  ) => Promise<boolean>;
  buildSubscriptionEventDetails: (
    event: Pick<NDKEvent, 'id' | 'kind' | 'created_at' | 'pubkey'>
  ) => Record<string, unknown>;
  buildSubscriptionRelayDetails: (relayUrls: string[]) => Record<string, unknown>;
  ensureRelayConnections: (relayUrls: string[]) => Promise<void>;
  extractRelayUrlsFromEvent: (event: NDKEvent) => string[];
  formatSubscriptionLogValue: (value: string | null | undefined) => string | null;
  getFilterSince: () => number;
  getLoggedInPublicKeyHex: () => string | null;
  getStoredAuthMethod: () => string | null;
  listGroupMembershipRosterSubscriptionContexts: (seedRelayUrls?: string[]) => Promise<
    Array<{
      currentEpochPublicKey: string;
      groupPublicKey: string;
      relayUrls: string[];
    }>
  >;
  logSubscription: (label: string, stage: string, details?: Record<string, unknown>) => void;
  ndk: NDK;
  relaySignature: (relays: string[]) => string;
  restoreGroupMembershipRoster: (
    groupPublicKey: string,
    seedRelayUrls?: string[]
  ) => Promise<boolean>;
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
}

export function createGroupRosterSubscriptionRuntime({
  applyGroupMembershipRosterEvent,
  buildSubscriptionEventDetails,
  buildSubscriptionRelayDetails,
  ensureRelayConnections,
  extractRelayUrlsFromEvent,
  formatSubscriptionLogValue,
  getFilterSince,
  getLoggedInPublicKeyHex,
  getStoredAuthMethod,
  listGroupMembershipRosterSubscriptionContexts,
  logSubscription,
  ndk,
  relaySignature,
  restoreGroupMembershipRoster,
  subscribeWithReqLogging,
  updateStoredEventSinceFromCreatedAt,
}: GroupRosterSubscriptionRuntimeDeps) {
  let groupRosterSubscription: ReturnType<NDK['subscribe']> | null = null;
  let groupRosterSubscriptionSignature = '';
  let groupRosterApplyQueue = Promise.resolve();

  function buildSubscriptionContextDetails(
    contexts: Array<{
      currentEpochPublicKey: string;
      groupPublicKey: string;
      relayUrls: string[];
    }>
  ): Record<string, unknown> {
    return {
      groupCount: contexts.length,
      groups: contexts.map((context) => ({
        groupPublicKey:
          formatSubscriptionLogValue(context.groupPublicKey) ?? context.groupPublicKey,
        currentEpochPublicKey:
          formatSubscriptionLogValue(context.currentEpochPublicKey) ??
          context.currentEpochPublicKey,
        relayCount: context.relayUrls.length,
      })),
    };
  }

  function queueGroupRosterEventApplication(event: NDKEvent, seedRelayUrls: string[] = []): void {
    groupRosterApplyQueue = groupRosterApplyQueue
      .then(async () => {
        await applyGroupMembershipRosterEvent(event, { seedRelayUrls });
      })
      .catch((error) => {
        console.error('Failed to process incoming group roster event', error);
      });
  }

  async function syncCurrentGroupRosters(
    contexts: Array<{
      currentEpochPublicKey: string;
      groupPublicKey: string;
      relayUrls: string[];
    }>,
    seedRelayUrls: string[] = []
  ): Promise<void> {
    for (const context of contexts) {
      try {
        await restoreGroupMembershipRoster(context.groupPublicKey, seedRelayUrls);
      } catch (error) {
        console.warn('Failed to refresh current group roster after subscription start', {
          groupPublicKey: context.groupPublicKey,
          error,
        });
      }
    }
  }

  function stopGroupRosterSubscription(reason = 'replace'): void {
    if (groupRosterSubscription) {
      logSubscription('group-roster', 'stop', {
        reason,
        signature: groupRosterSubscriptionSignature || null,
      });
      groupRosterSubscription.stop();
      groupRosterSubscription = null;
    }

    groupRosterSubscriptionSignature = '';
  }

  async function subscribeGroupMembershipRosterUpdates(
    seedRelayUrls: string[] = [],
    force = false
  ): Promise<void> {
    const loggedInPubkeyHex = getLoggedInPublicKeyHex();
    const authMethod = getStoredAuthMethod();
    if (!loggedInPubkeyHex || !authMethod) {
      stopGroupRosterSubscription('missing-login');
      return;
    }

    const contexts = await listGroupMembershipRosterSubscriptionContexts(seedRelayUrls);
    if (contexts.length === 0) {
      stopGroupRosterSubscription('no-groups');
      return;
    }

    const relayUrls = Array.from(new Set(contexts.flatMap((context) => context.relayUrls))).sort(
      (first, second) => first.localeCompare(second)
    );
    if (relayUrls.length === 0) {
      stopGroupRosterSubscription('no-relays');
      return;
    }

    const signature = `${relaySignature(relayUrls)}:${contexts
      .map(
        (context) =>
          `${context.groupPublicKey}:${context.currentEpochPublicKey}:${relaySignature(context.relayUrls)}`
      )
      .join(',')}`;
    if (!force && groupRosterSubscription && groupRosterSubscriptionSignature === signature) {
      logSubscription('group-roster', 'skip', {
        reason: 'already-active',
        signature,
        ...buildSubscriptionRelayDetails(relayUrls),
        ...buildSubscriptionContextDetails(contexts),
      });
      return;
    }

    logSubscription('group-roster', 'prepare', {
      force,
      signature,
      since: getFilterSince(),
      ...buildSubscriptionRelayDetails(relayUrls),
      ...buildSubscriptionContextDetails(contexts),
    });

    await ensureRelayConnections(relayUrls);
    stopGroupRosterSubscription();

    logSubscription('group-roster', 'start', {
      force,
      signature,
      since: getFilterSince(),
      ...buildSubscriptionRelayDetails(relayUrls),
      ...buildSubscriptionContextDetails(contexts),
    });

    const relaySet = NDKRelaySet.fromRelayUrls(relayUrls, ndk);
    const filters: NDKFilter = {
      kinds: [NDKKind.FollowSet],
      authors: contexts.map((context) => context.groupPublicKey),
      '#d': [GROUP_SHARED_ROSTER_FOLLOW_SET_D_TAG],
      since: getFilterSince(),
    };
    groupRosterSubscription = subscribeWithReqLogging(
      'group-roster',
      'group-roster',
      filters,
      {
        relaySet,
        cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
        onEvent: (event) => {
          const wrappedEvent = event instanceof NDKEvent ? event : new NDKEvent(ndk, event);
          logSubscription('group-roster', 'event', {
            signature,
            ...buildSubscriptionEventDetails(wrappedEvent),
            ...buildSubscriptionRelayDetails(extractRelayUrlsFromEvent(wrappedEvent)),
          });
          updateStoredEventSinceFromCreatedAt(wrappedEvent.created_at);
          queueGroupRosterEventApplication(wrappedEvent, seedRelayUrls);
        },
        onEose: () => {
          logSubscription('group-roster', 'eose', {
            signature,
          });
        },
      },
      {
        signature,
        ...buildSubscriptionRelayDetails(relayUrls),
        ...buildSubscriptionContextDetails(contexts),
      }
    );
    groupRosterSubscriptionSignature = signature;

    logSubscription('group-roster', 'active', {
      signature,
      ...buildSubscriptionRelayDetails(relayUrls),
      ...buildSubscriptionContextDetails(contexts),
    });

    await syncCurrentGroupRosters(contexts, seedRelayUrls);
  }

  function resetGroupRosterSubscriptionRuntimeState(reason = 'replace'): void {
    stopGroupRosterSubscription(reason);
    groupRosterApplyQueue = Promise.resolve();
  }

  return {
    resetGroupRosterSubscriptionRuntimeState,
    stopGroupRosterSubscription,
    subscribeGroupMembershipRosterUpdates,
  };
}
