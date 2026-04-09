import { type NDK, NDKKind, normalizeRelayUrl } from '@nostr-dev-kit/ndk';
import { chatDataService } from 'src/services/chatDataService';
import { contactsService } from 'src/services/contactsService';
import { inputSanitizerService } from 'src/services/inputSanitizerService';
import { useNip65RelayStore } from 'src/stores/nip65RelayStore';
import {
  GROUP_CURRENT_EPOCH_PRIVATE_KEY_ENCRYPTED_CHAT_META_KEY,
  GROUP_CURRENT_EPOCH_PUBLIC_KEY_CHAT_META_KEY,
  GROUP_EPOCH_KEYS_CHAT_META_KEY,
  PRIVATE_MESSAGES_STARTUP_RESTORE_THROTTLE_MS,
} from 'src/stores/nostr/constants';
import type {
  DeveloperDiagnosticsSnapshot,
  DeveloperGroupMessageSubscriptionSnapshot,
  DeveloperPendingDeletionSnapshot,
  DeveloperPendingQueueRefreshSummary,
  DeveloperPendingReactionSnapshot,
  PendingIncomingDeletion,
  PendingIncomingReaction,
  RelayConnectionState,
} from 'src/stores/nostr/types';
import { useRelayStore } from 'src/stores/relayStore';
import type { ContactMetadata } from 'src/types/contact';
import type { Ref } from 'vue';

interface DeveloperDiagnosticsDeps {
  applyPendingIncomingDeletionsForMessage: (
    message: Awaited<ReturnType<typeof chatDataService.getMessageByEventId>>,
    options?: { uiThrottleMs?: number }
  ) => Promise<Awaited<ReturnType<typeof chatDataService.getMessageByEventId>>>;
  applyPendingIncomingReactionsForMessage: (
    message: Awaited<ReturnType<typeof chatDataService.getMessageByEventId>>,
    options?: { uiThrottleMs?: number }
  ) => Promise<Awaited<ReturnType<typeof chatDataService.getMessageByEventId>>>;
  buildRelaySnapshot: (relay: unknown) => Record<string, unknown>;
  bumpDeveloperDiagnosticsVersion: () => void;
  configuredRelayUrls: Set<string>;
  ensureRelayConnections: (relayUrls: string[]) => Promise<void>;
  ensureStoredEventSince: () => number;
  flushPrivateMessagesUiRefreshNow: () => void;
  getAppRelayUrls: () => string[];
  getFilterSince: () => number;
  getLoggedInPublicKeyHex: () => string | null;
  getPrivateMessagesRestoreThrottleMs: () => number;
  getPrivateMessagesSubscription: () => unknown;
  getPrivateMessagesSubscriptionSignature: () => string;
  getRelayConnectionState: (relayUrl: string) => RelayConnectionState;
  getRelaySnapshots: (relayUrls: string[]) => Array<Record<string, unknown>>;
  getStoredAuthMethod: () => string | null;
  hasNip07Extension: () => boolean;
  isRestoringStartupState: Ref<boolean>;
  listPrivateMessageRecipientPubkeys: () => Promise<string[]>;
  ndk: NDK;
  normalizeChatGroupEpochKeys: (value: unknown) => Array<{
    epoch_number: number;
    epoch_public_key: string;
    epoch_private_key_encrypted: string;
    invitation_created_at?: string;
  }>;
  normalizeEventId: (value: unknown) => string | null;
  normalizeRelayStatusUrl: (value: string) => string | null;
  normalizeRelayStatusUrls: (relayUrls: string[]) => string[];
  pendingIncomingDeletions: Map<string, PendingIncomingDeletion[]>;
  pendingIncomingReactions: Map<string, PendingIncomingReaction[]>;
  privateMessagesSubscriptionLastEoseAt: Ref<string | null>;
  privateMessagesSubscriptionLastEventCreatedAt: Ref<number | null>;
  privateMessagesSubscriptionLastEventId: Ref<string | null>;
  privateMessagesSubscriptionLastEventSeenAt: Ref<string | null>;
  privateMessagesSubscriptionRelayUrls: Ref<string[]>;
  privateMessagesSubscriptionSince: Ref<number | null>;
  privateMessagesSubscriptionStartedAt: Ref<string | null>;
  processIncomingReactionDeletion: (
    reactionEventId: string,
    deletionAuthorPublicKey: string,
    options?: { uiThrottleMs?: number }
  ) => Promise<boolean>;
  resolveLoggedInPublishRelayUrls: (seedRelayUrls?: string[]) => Promise<string[]>;
  resolveLoggedInReadRelayUrls: (seedRelayUrls?: string[]) => Promise<string[]>;
  subscribePrivateMessagesForLoggedInUser: (
    force?: boolean,
    options?: {
      restoreThrottleMs?: number;
      seedRelayUrls?: string[];
      sinceOverride?: number;
      startupTrackStep?: boolean;
    }
  ) => Promise<void>;
  toOptionalIsoTimestampFromUnix: (value: number | null | undefined) => string | null;
}

export function createDeveloperDiagnosticsRuntime({
  applyPendingIncomingDeletionsForMessage,
  applyPendingIncomingReactionsForMessage,
  buildRelaySnapshot,
  bumpDeveloperDiagnosticsVersion,
  configuredRelayUrls,
  ensureRelayConnections,
  ensureStoredEventSince,
  flushPrivateMessagesUiRefreshNow,
  getAppRelayUrls,
  getFilterSince,
  getLoggedInPublicKeyHex,
  getPrivateMessagesRestoreThrottleMs,
  getPrivateMessagesSubscription,
  getPrivateMessagesSubscriptionSignature,
  getRelaySnapshots,
  getStoredAuthMethod,
  hasNip07Extension,
  isRestoringStartupState,
  listPrivateMessageRecipientPubkeys,
  ndk,
  normalizeChatGroupEpochKeys,
  normalizeEventId,
  normalizeRelayStatusUrl,
  normalizeRelayStatusUrls,
  pendingIncomingDeletions,
  pendingIncomingReactions,
  privateMessagesSubscriptionLastEoseAt,
  privateMessagesSubscriptionLastEventCreatedAt,
  privateMessagesSubscriptionLastEventId,
  privateMessagesSubscriptionLastEventSeenAt,
  privateMessagesSubscriptionRelayUrls,
  privateMessagesSubscriptionSince,
  privateMessagesSubscriptionStartedAt,
  processIncomingReactionDeletion,
  resolveLoggedInPublishRelayUrls,
  resolveLoggedInReadRelayUrls,
  subscribePrivateMessagesForLoggedInUser,
  toOptionalIsoTimestampFromUnix,
}: DeveloperDiagnosticsDeps) {
  function buildPendingReactionDiagnostics(): DeveloperPendingReactionSnapshot[] {
    return Array.from(pendingIncomingReactions.entries())
      .map(([targetEventId, entries]) => ({
        targetEventId,
        count: entries.length,
        entries: entries.map((entry) => ({
          chatPublicKey: entry.chatPublicKey,
          targetAuthorPublicKey: entry.targetAuthorPublicKey,
          emoji: entry.reaction.emoji,
          reactorPublicKey: entry.reaction.reactorPublicKey,
          createdAt: entry.reaction.createdAt,
          eventId: normalizeEventId(entry.reaction.eventId) ?? null,
        })),
      }))
      .sort((first, second) => second.count - first.count);
  }

  function buildPendingDeletionDiagnostics(): DeveloperPendingDeletionSnapshot[] {
    return Array.from(pendingIncomingDeletions.entries())
      .map(([targetEventId, entries]) => ({
        targetEventId,
        count: entries.length,
        entries: entries.map((entry) => ({
          deletionAuthorPublicKey: entry.deletionAuthorPublicKey,
          deleteEventId: normalizeEventId(entry.deleteEventId) ?? null,
          deletedAt: entry.deletedAt,
          targetKind: entry.targetKind,
        })),
      }))
      .sort((first, second) => second.count - first.count);
  }

  function buildDeveloperGroupSubscriptionContactMeta(
    meta: ContactMetadata | undefined
  ): Record<string, unknown> {
    if (!meta || typeof meta !== 'object') {
      return {};
    }

    return {
      ...meta,
      ...(meta.group_private_key_encrypted ? { group_private_key_encrypted: '[redacted]' } : {}),
      ...(Array.isArray(meta.group_members)
        ? {
            group_members: meta.group_members.map((member) => ({ ...member })),
          }
        : {}),
    };
  }

  function buildDeveloperGroupSubscriptionChatMeta(
    meta: Record<string, unknown> | undefined
  ): Record<string, unknown> {
    const normalizedEpochKeys = normalizeChatGroupEpochKeys(meta?.[GROUP_EPOCH_KEYS_CHAT_META_KEY]);

    return {
      ...(meta && typeof meta === 'object' ? { ...meta } : {}),
      ...(normalizedEpochKeys.length > 0
        ? {
            [GROUP_EPOCH_KEYS_CHAT_META_KEY]: normalizedEpochKeys.map((entry) => ({
              epoch_number: entry.epoch_number,
              epoch_public_key: entry.epoch_public_key,
              epoch_private_key_encrypted: '[redacted]',
              ...(entry.invitation_created_at
                ? { invitation_created_at: entry.invitation_created_at }
                : {}),
            })),
          }
        : {}),
      ...(typeof meta?.[GROUP_CURRENT_EPOCH_PRIVATE_KEY_ENCRYPTED_CHAT_META_KEY] === 'string' &&
      String(meta[GROUP_CURRENT_EPOCH_PRIVATE_KEY_ENCRYPTED_CHAT_META_KEY]).trim()
        ? {
            [GROUP_CURRENT_EPOCH_PRIVATE_KEY_ENCRYPTED_CHAT_META_KEY]: '[redacted]',
          }
        : {}),
    };
  }

  async function buildDeveloperGroupMessageSubscriptionSnapshot(): Promise<
    DeveloperGroupMessageSubscriptionSnapshot[]
  > {
    await Promise.all([contactsService.init(), chatDataService.init()]);

    const recipientPubkeys = new Set(await listPrivateMessageRecipientPubkeys());
    const groupContacts = (await contactsService.listContacts()).filter(
      (contact) => contact.type === 'group'
    );
    if (groupContacts.length === 0) {
      return [];
    }

    const chatsByPubkey = new Map(
      (await chatDataService.listChats()).map((chat) => [chat.public_key, chat] as const)
    );

    return groupContacts
      .map((contact) => {
        const normalizedGroupPubkey = inputSanitizerService.normalizeHexKey(contact.public_key);
        if (!normalizedGroupPubkey) {
          return null;
        }

        const groupChat = chatsByPubkey.get(normalizedGroupPubkey) ?? null;
        const epochKeys = normalizeChatGroupEpochKeys(
          groupChat?.meta?.[GROUP_EPOCH_KEYS_CHAT_META_KEY]
        );
        const currentEpochPubkey = inputSanitizerService.normalizeHexKey(
          typeof groupChat?.meta?.[GROUP_CURRENT_EPOCH_PUBLIC_KEY_CHAT_META_KEY] === 'string'
            ? String(groupChat.meta[GROUP_CURRENT_EPOCH_PUBLIC_KEY_CHAT_META_KEY])
            : (epochKeys[0]?.epoch_public_key ?? '')
        );
        if (!currentEpochPubkey || !recipientPubkeys.has(currentEpochPubkey)) {
          return null;
        }

        const currentEpochEntry =
          epochKeys.find((entry) => entry.epoch_public_key === currentEpochPubkey) ??
          epochKeys[0] ??
          null;
        const name = contact.name.trim() || groupChat?.name?.trim() || normalizedGroupPubkey;

        return {
          name,
          pubkey: normalizedGroupPubkey,
          epochPubkey: currentEpochPubkey,
          epochNumber: currentEpochEntry?.epoch_number ?? null,
          details: {
            contactId: contact.id,
            contactType: contact.type,
            contactRelays: Array.isArray(contact.relays)
              ? contact.relays.map((relay) => ({ ...relay }))
              : [],
            contactMeta: buildDeveloperGroupSubscriptionContactMeta(contact.meta),
            chatId: groupChat?.id ?? null,
            chatType: groupChat?.type ?? null,
            unreadCount: groupChat?.unread_count ?? null,
            lastMessageAt: groupChat?.last_message_at ?? null,
            lastMessage: groupChat?.last_message ?? null,
            epochCount: epochKeys.length,
            chatMeta: buildDeveloperGroupSubscriptionChatMeta(groupChat?.meta),
          },
        };
      })
      .filter((entry): entry is DeveloperGroupMessageSubscriptionSnapshot => Boolean(entry))
      .sort((first, second) => first.name.localeCompare(second.name));
  }

  function getPendingDeveloperQueueTargetEventIds(): string[] {
    return Array.from(
      new Set([...pendingIncomingReactions.keys(), ...pendingIncomingDeletions.keys()])
    );
  }

  function getPendingDeveloperQueueEntryCount(): number {
    let total = 0;

    for (const entries of pendingIncomingReactions.values()) {
      total += entries.length;
    }

    for (const entries of pendingIncomingDeletions.values()) {
      total += entries.length;
    }

    return total;
  }

  async function applyPendingReactionDeletionTarget(
    targetEventId: string,
    options: {
      uiThrottleMs?: number;
    } = {}
  ): Promise<boolean> {
    const normalizedTargetEventId = normalizeEventId(targetEventId);
    if (!normalizedTargetEventId) {
      return false;
    }

    const pendingEntries = pendingIncomingDeletions.get(normalizedTargetEventId) ?? [];
    if (pendingEntries.length === 0) {
      return false;
    }

    const remainingEntries: PendingIncomingDeletion[] = [];
    let didApply = false;

    for (const pendingDeletion of pendingEntries) {
      const shouldTryReactionDeletion =
        pendingDeletion.targetKind === null || pendingDeletion.targetKind === NDKKind.Reaction;
      if (!shouldTryReactionDeletion) {
        remainingEntries.push(pendingDeletion);
        continue;
      }

      const handled = await processIncomingReactionDeletion(
        normalizedTargetEventId,
        pendingDeletion.deletionAuthorPublicKey,
        options
      );
      if (!handled) {
        remainingEntries.push(pendingDeletion);
        continue;
      }

      didApply = true;
    }

    if (!didApply) {
      return false;
    }

    if (remainingEntries.length > 0) {
      pendingIncomingDeletions.set(normalizedTargetEventId, remainingEntries);
    } else {
      pendingIncomingDeletions.delete(normalizedTargetEventId);
    }

    return true;
  }

  async function applyPendingQueuesForStoredTargets(
    targetEventIds: string[],
    options: {
      uiThrottleMs?: number;
    } = {}
  ): Promise<boolean> {
    let didChange = false;

    for (const targetEventId of targetEventIds) {
      const normalizedTargetEventId = normalizeEventId(targetEventId);
      if (!normalizedTargetEventId) {
        continue;
      }

      const targetMessage = await chatDataService.getMessageByEventId(normalizedTargetEventId);
      if (targetMessage) {
        const previousReactionCount =
          pendingIncomingReactions.get(normalizedTargetEventId)?.length ?? 0;
        const previousDeletionCount =
          pendingIncomingDeletions.get(normalizedTargetEventId)?.length ?? 0;

        let nextMessage = await applyPendingIncomingReactionsForMessage(targetMessage, options);
        nextMessage = await applyPendingIncomingDeletionsForMessage(nextMessage, options);

        const nextReactionCount =
          pendingIncomingReactions.get(normalizedTargetEventId)?.length ?? 0;
        const nextDeletionCount =
          pendingIncomingDeletions.get(normalizedTargetEventId)?.length ?? 0;

        if (
          nextReactionCount !== previousReactionCount ||
          nextDeletionCount !== previousDeletionCount
        ) {
          didChange = true;
        }
        continue;
      }

      if (await applyPendingReactionDeletionTarget(normalizedTargetEventId, options)) {
        didChange = true;
      }
    }

    return didChange;
  }

  async function refreshDeveloperPendingQueues(): Promise<DeveloperPendingQueueRefreshSummary> {
    await Promise.all([chatDataService.init(), contactsService.init()]);

    const initialTargetCount = getPendingDeveloperQueueTargetEventIds().length;
    const initialEntryCount = getPendingDeveloperQueueEntryCount();
    if (initialEntryCount === 0) {
      return {
        initialTargetCount,
        initialEntryCount,
        remainingTargetCount: 0,
        remainingEntryCount: 0,
      };
    }

    const didChange = await applyPendingQueuesForStoredTargets(
      getPendingDeveloperQueueTargetEventIds(),
      {
        uiThrottleMs: PRIVATE_MESSAGES_STARTUP_RESTORE_THROTTLE_MS,
      }
    );

    if (didChange) {
      flushPrivateMessagesUiRefreshNow();
      bumpDeveloperDiagnosticsVersion();
    }

    return {
      initialTargetCount,
      initialEntryCount,
      remainingTargetCount: getPendingDeveloperQueueTargetEventIds().length,
      remainingEntryCount: getPendingDeveloperQueueEntryCount(),
    };
  }

  async function getDeveloperDiagnosticsSnapshot(): Promise<DeveloperDiagnosticsSnapshot> {
    const relayStore = useRelayStore();
    const nip65RelayStore = useNip65RelayStore();
    relayStore.init();
    nip65RelayStore.init();

    const loggedInPubkey = getLoggedInPublicKeyHex();
    const authMethod = getStoredAuthMethod();
    const storedEventSince = ensureStoredEventSince();
    const filterSince = getFilterSince();
    const appRelayUrls = getAppRelayUrls();
    const effectiveReadRelayUrls = await resolveLoggedInReadRelayUrls();
    const effectivePublishRelayUrls = await resolveLoggedInPublishRelayUrls();
    const configuredRelayList = Array.from(configuredRelayUrls);
    const privateMessagesRelayUrls = normalizeRelayStatusUrls(
      privateMessagesSubscriptionRelayUrls.value
    );
    const groupMessagesSubscription = await buildDeveloperGroupMessageSubscriptionSnapshot();
    const relayRows = normalizeRelayStatusUrls([
      ...appRelayUrls,
      ...effectiveReadRelayUrls,
      ...effectivePublishRelayUrls,
      ...privateMessagesRelayUrls,
      ...configuredRelayList,
    ]).map((relayUrl) => {
      const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
      const snapshot = buildRelaySnapshot(ndk.pool.getRelay(normalizedRelayUrl, false));

      return {
        ...snapshot,
        url: normalizedRelayUrl,
        inReadSet: effectiveReadRelayUrls.includes(normalizedRelayUrl),
        inPublishSet: effectivePublishRelayUrls.includes(normalizedRelayUrl),
        inPrivateMessagesSubscription: privateMessagesRelayUrls.includes(normalizedRelayUrl),
        isConfigured: configuredRelayUrls.has(normalizedRelayUrl),
      };
    });

    return {
      session: {
        loggedInPubkey,
        authMethod,
        eventSince: storedEventSince,
        eventSinceIso: toOptionalIsoTimestampFromUnix(storedEventSince),
        filterSince,
        filterSinceIso: toOptionalIsoTimestampFromUnix(filterSince),
        isRestoringStartupState: isRestoringStartupState.value,
        hasNip07Extension: hasNip07Extension(),
        appRelayUrls,
        myRelayEntries: nip65RelayStore.relayEntries.map((entry) => ({ ...entry })),
        effectiveReadRelayUrls,
        effectivePublishRelayUrls,
        configuredRelayUrls: configuredRelayList,
      },
      privateMessagesSubscription: {
        active: Boolean(getPrivateMessagesSubscription()),
        signature: getPrivateMessagesSubscriptionSignature() || null,
        relayUrls: privateMessagesRelayUrls,
        relaySnapshots: getRelaySnapshots(privateMessagesRelayUrls),
        since: privateMessagesSubscriptionSince.value,
        sinceIso: toOptionalIsoTimestampFromUnix(privateMessagesSubscriptionSince.value),
        restoreThrottleMs: getPrivateMessagesRestoreThrottleMs(),
        startedAt: privateMessagesSubscriptionStartedAt.value,
        lastEventSeenAt: privateMessagesSubscriptionLastEventSeenAt.value,
        lastEventId: privateMessagesSubscriptionLastEventId.value,
        lastEventCreatedAt: privateMessagesSubscriptionLastEventCreatedAt.value,
        lastEventCreatedAtIso: toOptionalIsoTimestampFromUnix(
          privateMessagesSubscriptionLastEventCreatedAt.value
        ),
        lastEoseAt: privateMessagesSubscriptionLastEoseAt.value,
      },
      groupMessagesSubscription,
      relayRows,
      pendingReactions: buildPendingReactionDiagnostics(),
      pendingDeletions: buildPendingDeletionDiagnostics(),
    };
  }

  async function reconnectDeveloperRelay(relayUrl: string): Promise<void> {
    const normalizedRelayUrl = normalizeRelayStatusUrl(relayUrl);
    if (!normalizedRelayUrl) {
      throw new Error('Relay URL is required.');
    }

    await ensureRelayConnections([normalizedRelayUrl]);
    bumpDeveloperDiagnosticsVersion();
  }

  async function reconnectAllDeveloperRelays(): Promise<void> {
    const snapshot = await getDeveloperDiagnosticsSnapshot();
    const relayUrls = snapshot.relayRows
      .map((entry) => entry.url)
      .filter((value): value is string => Boolean(value));
    if (relayUrls.length === 0) {
      return;
    }

    await ensureRelayConnections(relayUrls);
    bumpDeveloperDiagnosticsVersion();
  }

  async function refreshPrivateMessages(options: { lookbackMinutes?: number } = {}): Promise<void> {
    const lookbackMinutes =
      typeof options.lookbackMinutes === 'number' && Number.isFinite(options.lookbackMinutes)
        ? Math.max(1, Math.floor(options.lookbackMinutes))
        : 0;
    const sinceOverride =
      lookbackMinutes > 0
        ? Math.max(0, Math.floor(Date.now() / 1000) - lookbackMinutes * 60)
        : undefined;

    console.log('Refreshing private messages', {
      lookbackMinutes,
      sinceOverride: sinceOverride ?? null,
      sinceOverrideIso: toOptionalIsoTimestampFromUnix(sinceOverride ?? null),
    });

    await subscribePrivateMessagesForLoggedInUser(true, {
      restoreThrottleMs: PRIVATE_MESSAGES_STARTUP_RESTORE_THROTTLE_MS,
      sinceOverride,
    });
    bumpDeveloperDiagnosticsVersion();
  }

  async function restartPrivateMessagesDiagnosticsSubscription(
    options: { lookbackMinutes?: number } = {}
  ): Promise<void> {
    await refreshPrivateMessages(options);
  }

  return {
    getDeveloperDiagnosticsSnapshot,
    reconnectAllDeveloperRelays,
    reconnectDeveloperRelay,
    refreshDeveloperPendingQueues,
    refreshPrivateMessages,
    restartPrivateMessagesDiagnosticsSubscription,
  };
}
