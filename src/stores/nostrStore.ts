import NDK, {
  type NDKEvent,
  NDKPrivateKeySigner,
  type NDKSigner,
  normalizeRelayUrl,
} from '@nostr-dev-kit/ndk';
import { defineStore } from 'pinia';
import type { ChatRow } from 'src/services/chatDataService';
import {
  inputSanitizerService,
  type NpubValidationResult,
  type NsecValidationResult,
  type PrivateKeyValidationResult,
} from 'src/services/inputSanitizerService';
import { nostrEventDataService } from 'src/services/nostrEventDataService';
import { useChatStore } from 'src/stores/chatStore';
import { useNip65RelayStore } from 'src/stores/nip65RelayStore';
import { createAuthIdentityRuntime } from 'src/stores/nostr/authIdentityRuntime';
import { createAuthSessionRuntime } from 'src/stores/nostr/authSessionRuntime';
import {
  DEFAULT_EVENT_SINCE_LOOKBACK_SECONDS,
  DEVELOPER_DIAGNOSTICS_STORAGE_KEY,
  INITIAL_CONNECT_TIMEOUT_MS,
  LAST_SEEN_RECEIVED_ACTIVITY_AT_META_KEY,
  PRIVATE_MESSAGES_EPOCH_SUBSCRIPTION_REFRESH_DEBOUNCE_MS,
  RELAY_CONNECT_FAILURE_COOLDOWN_MS,
  STARTUP_STEP_MIN_PROGRESS_MS,
} from 'src/stores/nostr/constants';
import { createContactProfileRuntime } from 'src/stores/nostr/contactProfileRuntime';
import { createContactRelayRuntime } from 'src/stores/nostr/contactRelayRuntime';
import { createContactSubscriptionsRuntime } from 'src/stores/nostr/contactSubscriptionsRuntime';
import { createDeveloperDiagnosticsRuntime } from 'src/stores/nostr/developerDiagnostics';
import { createDeveloperRelayRuntime } from 'src/stores/nostr/developerRelayRuntime';
import {
  createDeveloperTraceRuntime,
  readDeveloperDiagnosticsEnabledFromStorage,
} from 'src/stores/nostr/developerTrace';
import { createGroupEpochPublishRuntime } from 'src/stores/nostr/groupEpochPublishRuntime';
import { createGroupEpochStateRuntime } from 'src/stores/nostr/groupEpochStateRuntime';
import { createGroupInviteRuntime } from 'src/stores/nostr/groupInviteRuntime';
import { createInboundPresentationRuntime } from 'src/stores/nostr/inboundPresentationRuntime';
import { createMessageEventRuntime } from 'src/stores/nostr/messageEventRuntime';
import { createMessageMutationRuntime } from 'src/stores/nostr/messageMutationRuntime';
import { createMessageRelayRuntime } from 'src/stores/nostr/messageRelayRuntime';
import { createMyRelayListRuntime } from 'src/stores/nostr/myRelayListRuntime';
import { createPrivateContactListRuntime } from 'src/stores/nostr/privateContactListRuntime';
import { createPrivateContactMembershipRuntime } from 'src/stores/nostr/privateContactMembershipRuntime';
import { createPrivateMessagesBackfillRuntime } from 'src/stores/nostr/privateMessagesBackfillRuntime';
import { createPrivateMessagesIngestRuntime } from 'src/stores/nostr/privateMessagesIngestRuntime';
import { createPrivateMessagesSubscriptionRuntime } from 'src/stores/nostr/privateMessagesSubscriptionRuntime';
import { createPrivateMessagesUiRuntime } from 'src/stores/nostr/privateMessagesUiRuntime';
import { createPrivateStateRuntime } from 'src/stores/nostr/privateStateRuntime';
import { createRelayConnectionRuntime } from 'src/stores/nostr/relayConnectionRuntime';
import { createRelayPublishRuntime } from 'src/stores/nostr/relayPublishRuntime';
import { createStartupContactSyncRuntime } from 'src/stores/nostr/startupContactSyncRuntime';
import { createStartupRuntime } from 'src/stores/nostr/startupRuntime';
import {
  createInitialStartupStepSnapshots,
  type StartupDisplaySnapshot,
  type StartupStepSnapshot,
} from 'src/stores/nostr/startupState';
import { createStorageSessionRuntime } from 'src/stores/nostr/storageSession';
import { createSubscriptionLoggingRuntime } from 'src/stores/nostr/subscriptionLoggingRuntime';
import { createSubscriptionRefreshRuntime } from 'src/stores/nostr/subscriptionRefreshRuntime';
import { createTrackedContactStateRuntime } from 'src/stores/nostr/trackedContactStateRuntime';
import type {
  ContactCursorState,
  GroupIdentitySecretContent,
  PendingIncomingDeletion,
  PendingIncomingReaction,
  PrivatePreferences,
  RelaySaveStatus,
  SubscribePrivateMessagesOptions,
} from 'src/stores/nostr/types';
import { createUserActions } from 'src/stores/nostr/userActions';
import {
  buildIdentifierFallbacksValue,
  buildUpdatedContactMetaValue,
  contactMetadataEqualValue,
  contactRelayListsEqualValue,
  findConflictingKnownGroupEpochNumberValue,
  findHigherKnownGroupEpochConflictValue,
  isContactListedInPrivateContactListValue,
  normalizeChatGroupEpochKeysValue,
  normalizeRelayStatusUrlsValue,
  normalizeWritableRelayUrlsValue,
  relayEntriesFromRelayListValue,
  resolveCurrentGroupChatEpochEntryValue,
  resolveGroupChatEpochEntriesValue,
  resolveGroupDisplayNameValue,
  resolveGroupPublishRelayUrlsValue,
  resolveIncomingChatInboxStateValue,
  shouldPreserveExistingGroupRelaysValue,
} from 'src/stores/nostr/valueUtils';
import { useRelayStore } from 'src/stores/relayStore';
import type { ChatGroupEpochKey, MessageRelayStatus } from 'src/types/chat';
import type { ContactRecord } from 'src/types/contact';
import { ref, watch } from 'vue';

export type {
  StartupDisplaySnapshot,
  StartupStepId,
  StartupStepSnapshot,
  StartupStepStatus,
} from 'src/stores/nostr/startupState';
export type {
  AuthMethod,
  CreateGroupChatResult,
  DeveloperDiagnosticsSnapshot,
  DeveloperGroupMessageSubscriptionSnapshot,
  DeveloperPendingQueueRefreshSummary,
  DeveloperRelayRow,
  DeveloperTraceEntry,
  DeveloperTraceLevel,
  NostrIdentifierResolutionResult,
  NostrNip05DataResult,
  PublishGroupMemberChangesResult,
  PublishUserMetadataInput,
  RelayConnectionState,
  RelaySaveStatus,
  RotateGroupEpochResult,
} from 'src/stores/nostr/types';

export type NostrNpubValidationResult = NpubValidationResult;
export type NostrNsecValidationResult = NsecValidationResult;
export type NostrPrivateKeyValidationResult = PrivateKeyValidationResult;
export { __nostrStoreTestUtils } from 'src/stores/nostr/testUtils';

export const useNostrStore = defineStore('nostrStore', () => {
  const ndk = new NDK();
  const chatStore = useChatStore();
  const nip65RelayStore = useNip65RelayStore();
  const relayStore = useRelayStore();
  const relayStatusVersion = ref(0);
  const contactListVersion = ref(0);
  const isRestoringStartupState = ref(false);
  const eventSince = ref(0);
  const startupSteps = ref<StartupStepSnapshot[]>(createInitialStartupStepSnapshots());
  const startupDisplay = ref<StartupDisplaySnapshot>({
    stepId: null,
    label: null,
    status: null,
    showProgress: false,
  });
  const developerDiagnosticsEnabled = ref(
    readDeveloperDiagnosticsEnabledFromStorage(DEVELOPER_DIAGNOSTICS_STORAGE_KEY)
  );
  const developerDiagnosticsVersion = ref(0);
  const developerTraceVersion = ref(0);
  const privateMessagesSubscriptionRelayUrls = ref<string[]>([]);
  const privateMessagesSubscriptionSince = ref<number | null>(null);
  const privateMessagesSubscriptionStartedAt = ref<string | null>(null);
  const privateMessagesSubscriptionLastEventSeenAt = ref<string | null>(null);
  const privateMessagesSubscriptionLastEventId = ref<string | null>(null);
  const privateMessagesSubscriptionLastEventCreatedAt = ref<number | null>(null);
  const privateMessagesSubscriptionLastEoseAt = ref<string | null>(null);
  let cachedSigner: NDKSigner | null = null;
  let cachedSignerSessionKey: string | null = null;
  const configuredRelayUrls = new Set<string>();
  const relayConnectPromises = new Map<string, Promise<void>>();
  const relayConnectFailureCooldownUntilByUrl = new Map<string, number>();
  let connectPromise: Promise<void> | null = null;
  let hasActivatedPool = false;
  let hasRelayStatusListeners = false;
  const relayAuthFailureListenerUrls = new Set<string>();
  let restoreStartupStatePromise: Promise<void> | null = null;
  let syncLoggedInContactProfilePromise: Promise<void> | null = null;
  let syncRecentChatContactsPromise: Promise<void> | null = null;
  const groupContactRefreshPromises = new Map<string, Promise<ContactRecord | null>>();
  const backgroundGroupContactRefreshStartedAt = new Map<string, number>();
  const pendingIncomingReactions = new Map<string, PendingIncomingReaction[]>();
  const pendingIncomingDeletions = new Map<string, PendingIncomingDeletion[]>();
  const pendingContactCursorPublishTimers = new Map<
    string,
    ReturnType<typeof globalThis.setTimeout>
  >();
  const pendingContactCursorPublishStates = new Map<string, ContactCursorState>();
  const restoreRuntimeState = {
    restoreContactCursorStatePromise: null as Promise<void> | null,
    restoreGroupIdentitySecretsPromise: null as Promise<void> | null,
    restorePrivatePreferencesPromise: null as Promise<void> | null,
  };
  let privateMessagesEpochSubscriptionRefreshTimerId: ReturnType<
    typeof globalThis.setTimeout
  > | null = null;
  let pendingPrivateMessagesEpochSubscriptionRefreshOptions: SubscribePrivateMessagesOptions | null =
    null;
  let privateMessagesEpochSubscriptionRefreshQueue = Promise.resolve();
  const loggedInvalidGroupEpochConflictKeys = new Set<string>();
  let privateMessagesRestoreThrottleMs = 0;
  let getPrivateMessagesIngestQueueRuntime: () => Promise<void> = () => Promise.resolve();
  let subscribePrivateMessagesForLoggedInUserRuntime: (
    force?: boolean,
    options?: SubscribePrivateMessagesOptions
  ) => Promise<void> = async () => {
    throw new Error('Private messages subscription runtime is not initialized.');
  };
  let _ensurePrivateMessagesWatchdogRuntime: () => void = () => {};
  let isPrivateMessagesSubscriptionRelayTrackedRuntime: (relayUrl: string) => boolean = () => false;
  let markPrivateMessagesWatchdogRelayDisconnectedRuntime: (relayUrl: string) => void = () => {};
  let queuePrivateMessagesWatchdogRuntime: (delayMs?: number) => void = () => {};
  let getOrCreateSignerRuntime: () => Promise<NDKSigner> = async () => {
    throw new Error('Relay connection runtime is not initialized.');
  };
  let getPrivateKeyHexRuntime: () => string | null = () => {
    throw new Error('Auth session runtime is not initialized.');
  };
  let refreshAllStoredContactsRuntime: () => Promise<unknown> = async () => {
    throw new Error('Private messages refresh runtime is not initialized.');
  };
  let queueBackgroundGroupContactRefreshRuntime: (
    groupPublicKey: string,
    fallbackName: string
  ) => void = () => {};
  let startPrivateMessagesStartupBackfillRuntime: (
    loggedInPubkeyHex: string,
    recipientPubkeys: string[],
    relayUrls: string[],
    liveSince: number
  ) => void = () => {
    throw new Error('Private messages backfill runtime is not initialized.');
  };
  let stopPrivateMessagesBackfillRuntime: (reason?: string) => void = () => {};
  let restoreGroupEpochHistoryRuntime: (
    groupPublicKey: string,
    epochPublicKey: string,
    options?: {
      force?: boolean;
      seedRelayUrls?: string[];
    }
  ) => Promise<void> = async () => {
    throw new Error('Group epoch history runtime is not initialized.');
  };
  let restorePrivateMessagesForRecipientRuntime: (
    recipientPubkey: string,
    options?: {
      force?: boolean;
      seedRelayUrls?: string[];
    }
  ) => Promise<void> = async () => {
    throw new Error('Private messages for recipient runtime is not initialized.');
  };
  let upsertIncomingGroupInviteRequestChatRuntime: (
    groupPublicKey: string,
    createdAt: string,
    preview?: Pick<ContactRecord, 'name' | 'meta'> | null
  ) => Promise<void> = async () => {
    throw new Error('Group invite runtime is not initialized.');
  };
  let publishGroupIdentitySecretRuntime: (
    groupPublicKey: string,
    encryptedPrivateKey: string,
    seedRelayUrls?: string[]
  ) => Promise<RelaySaveStatus> = async () => {
    throw new Error('Private state runtime is not initialized.');
  };
  let publishGroupMembershipFollowSetRuntime: (
    groupPublicKey: string,
    memberPublicKeys: string[],
    seedRelayUrls?: string[]
  ) => Promise<RelaySaveStatus> = async () => {
    throw new Error('Private state runtime is not initialized.');
  };
  const authenticatedRelayUrls = new Set<string>();
  const pendingEventSinceState = {
    pendingEventSinceUpdate: 0,
  };
  const startupRuntimeState = {
    startupDisplayShownAt: 0,
    startupDisplayTimer: null as ReturnType<typeof globalThis.setTimeout> | null,
    startupDisplayToken: 0,
  };
  const developerTraceState = {
    developerTraceCounter: 0,
  };
  const {
    buildContactProfileEventState,
    buildContactRelayListEventState,
    markContactProfileEventApplied,
    markContactRelayListEventApplied,
    markPrivateContactListEventApplied,
    pruneTrackedContactProfileEventState,
    pruneTrackedContactRelayListEventState,
    resetTrackedContactEventState,
    shouldApplyContactProfileEvent,
    shouldApplyContactRelayListEvent,
    shouldApplyPrivateContactListEvent,
  } = createTrackedContactStateRuntime();
  const {
    beginStartupStep,
    completeStartupStep,
    createStartupBatchTracker,
    failStartupStep,
    getStartupStepSnapshot,
    resetStartupStepTracking,
  } = createStartupRuntime({
    startupDisplay,
    startupState: startupRuntimeState,
    startupSteps,
    startupStepMinProgressMs: STARTUP_STEP_MIN_PROGRESS_MS,
  });
  const {
    derivePublicKeyFromPrivateKey,
    encodeNprofile,
    encodeNpub,
    getLoggedInPublicKeyHex,
    getLoggedInSignerUser,
    getStoredAuthMethod,
    hasNip07Extension,
  } = createAuthIdentityRuntime({
    getOrCreateSigner,
    getPrivateKeyHex: () => getPrivateKeyHexRuntime(),
    ndk,
  });
  const {
    bumpDeveloperDiagnosticsVersion,
    clearDeveloperTraceEntries,
    listDeveloperTraceEntries,
    logDeveloperTrace,
    setDeveloperDiagnosticsEnabled,
    toOptionalIsoTimestampFromUnix,
  } = createDeveloperTraceRuntime({
    developerDiagnosticsEnabled,
    developerDiagnosticsStorageKey: DEVELOPER_DIAGNOSTICS_STORAGE_KEY,
    developerDiagnosticsVersion,
    getLoggedInPublicKeyHex,
    developerTraceState,
    developerTraceVersion,
  });
  const { buildRelaySnapshot, getRelaySnapshots, logMessageRelayDiagnostics, logRelayLifecycle } =
    createDeveloperRelayRuntime({
      logDeveloperTrace,
      ndk,
    });
  const {
    buildFreshPrivatePreferences,
    clearPrivateMessagesBackfillState,
    clearPrivatePreferencesStorage,
    clearStoredPrivateMessagesLastReceivedCreatedAt,
    decryptContactCursorContent,
    decryptGroupIdentitySecretContent,
    decryptPrivatePreferencesContent,
    decryptPrivateStringContent,
    encryptContactCursorContent,
    encryptGroupIdentitySecretContent,
    encryptPrivatePreferencesContent,
    encryptPrivateStringContent,
    ensureStoredEventSince,
    flushPendingEventSinceUpdate,
    getFilterSince,
    getPrivateMessagesBackfillResumeState,
    getPrivateMessagesEpochSwitchSince,
    getPrivateMessagesStartupFloorSince,
    getPrivateMessagesStartupLiveSince,

    normalizeTimestamp,

    readPrivatePreferencesFromStorage,

    resetEventSinceForFreshLogin,

    sha256Hex,
    toComparableTimestamp,
    updateStoredEventSinceFromCreatedAt,
    updateStoredPrivateMessagesLastReceivedFromCreatedAt,
    writePrivateMessagesBackfillState,
    writePrivatePreferencesToStorage,
  } = createStorageSessionRuntime({
    eventSince,
    getDefaultEventSince,
    getLoggedInSignerUser,
    isRestoringStartupState,
    ndk,
    normalizeEventId,
    pendingEventSinceState,
  });

  watch(
    () =>
      relayStore.relayEntries.map(
        (entry) => `${entry.url}:${entry.read !== false}:${entry.write !== false}`
      ),
    () => {
      queueTrackedContactSubscriptionsRefresh();
    }
  );

  function normalizeThrottleMs(value: number | undefined): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      return 0;
    }

    return Math.floor(value);
  }

  function getDefaultEventSince(): number {
    return Math.max(0, Math.floor(Date.now() / 1000) - DEFAULT_EVENT_SINCE_LOOKBACK_SECONDS);
  }

  function createInitialGroupEpochSecretState(): Pick<
    GroupIdentitySecretContent,
    'epoch_number' | 'epoch_privkey'
  > {
    const epochSigner = NDKPrivateKeySigner.generate();
    return {
      epoch_number: 0,
      epoch_privkey: epochSigner.privateKey,
    };
  }

  function readFirstTagValue(tags: string[][], tagName: string): string | null {
    for (const tag of tags) {
      if (!Array.isArray(tag) || tag[0] !== tagName) {
        continue;
      }

      const value = typeof tag[1] === 'string' ? tag[1].trim() : '';
      if (value) {
        return value;
      }
    }

    return null;
  }

  function readEpochNumberTag(tags: string[][]): number | null {
    const epochValue = readFirstTagValue(tags, 'epoch');
    if (!epochValue) {
      return null;
    }

    const epochNumber = Number(epochValue);
    if (!Number.isInteger(epochNumber) || epochNumber < 0) {
      return null;
    }

    return Math.floor(epochNumber);
  }

  const normalizeChatGroupEpochKeys = normalizeChatGroupEpochKeysValue;
  const resolveGroupChatEpochEntries = resolveGroupChatEpochEntriesValue;
  const resolveCurrentGroupChatEpochEntry = resolveCurrentGroupChatEpochEntryValue;

  const findHigherKnownGroupEpochConflict = findHigherKnownGroupEpochConflictValue;
  const findConflictingKnownGroupEpochNumber = findConflictingKnownGroupEpochNumberValue;

  function logInvalidIncomingEpochNumber(
    groupPublicKey: string,
    epochNumber: number,
    epochPublicKey: string | null,
    createdAt: string | null,
    conflict: {
      higherEpochEntry: ChatGroupEpochKey;
      olderHigherEpochEntry: ChatGroupEpochKey | null;
    }
  ): void {
    const logKey = [
      inputSanitizerService.normalizeHexKey(groupPublicKey) ?? groupPublicKey,
      String(epochNumber),
      inputSanitizerService.normalizeHexKey(epochPublicKey ?? '') ?? '',
      createdAt ?? '',
    ].join(':');
    if (loggedInvalidGroupEpochConflictKeys.has(logKey)) {
      return;
    }

    loggedInvalidGroupEpochConflictKeys.add(logKey);
    console.warn(
      `Invalid epoch number ${epochNumber}. A higher epoch was issued which is older than this epoch ${epochNumber} ${createdAt ?? 'unknown'}`,
      {
        groupPublicKey,
        epochPublicKey: epochPublicKey ?? null,
        higherEpochNumber: conflict.higherEpochEntry.epoch_number,
        higherEpochPublicKey: conflict.higherEpochEntry.epoch_public_key,
        higherEpochCreatedAt:
          conflict.olderHigherEpochEntry?.invitation_created_at ??
          conflict.higherEpochEntry.invitation_created_at ??
          null,
        createdAt: createdAt ?? null,
      }
    );
  }

  function logConflictingIncomingEpochNumber(
    groupPublicKey: string,
    epochNumber: number,
    epochPublicKey: string | null,
    createdAt: string | null,
    conflict: ChatGroupEpochKey
  ): void {
    const logKey = [
      'conflicting-epoch-number',
      inputSanitizerService.normalizeHexKey(groupPublicKey) ?? groupPublicKey,
      String(epochNumber),
      inputSanitizerService.normalizeHexKey(epochPublicKey ?? '') ?? '',
      inputSanitizerService.normalizeHexKey(conflict.epoch_public_key) ?? conflict.epoch_public_key,
      createdAt ?? '',
    ].join(':');
    if (loggedInvalidGroupEpochConflictKeys.has(logKey)) {
      return;
    }

    loggedInvalidGroupEpochConflictKeys.add(logKey);
    console.warn(
      `Invalid epoch number ${epochNumber}. Epoch ${epochNumber} was already issued with a different epoch public key ${createdAt ?? 'unknown'}`,
      {
        groupPublicKey,
        epochPublicKey: epochPublicKey ?? null,
        conflictingEpochPublicKey: conflict.epoch_public_key,
        conflictingEpochCreatedAt: conflict.invitation_created_at ?? null,
        createdAt: createdAt ?? null,
      }
    );
  }

  const isContactListedInPrivateContactList = isContactListedInPrivateContactListValue;
  async function findGroupChatEpochContextByRecipientPubkey(epochPublicKey: string): Promise<{
    chat: ChatRow;
    epochEntry: ChatGroupEpochKey;
  } | null> {
    return findGroupChatEpochContextByRecipientPubkeyRuntime(epochPublicKey);
  }

  async function upsertIncomingGroupInviteRequestChat(
    groupPublicKey: string,
    createdAt: string,
    preview: Pick<ContactRecord, 'name' | 'meta'> | null = null
  ): Promise<void> {
    return upsertIncomingGroupInviteRequestChatRuntime(groupPublicKey, createdAt, preview);
  }

  function buildRelaySaveStatus(relayStatuses: MessageRelayStatus[]): RelaySaveStatus {
    const relayUrls = normalizeRelayStatusUrls(relayStatuses.map((entry) => entry.relay_url));
    const publishedRelayUrls = normalizeRelayStatusUrls(
      relayStatuses
        .filter((entry) => entry.direction === 'outbound' && entry.status === 'published')
        .map((entry) => entry.relay_url)
    );
    const failedRelayUrls = normalizeRelayStatusUrls(
      relayStatuses
        .filter((entry) => entry.direction === 'outbound' && entry.status === 'failed')
        .map((entry) => entry.relay_url)
    );
    const firstFailure = relayStatuses.find(
      (entry) => entry.direction === 'outbound' && entry.status === 'failed' && entry.detail?.trim()
    );

    return {
      relayUrls,
      publishedRelayUrls,
      failedRelayUrls,
      errorMessage: firstFailure?.detail?.trim() ?? null,
    };
  }

  function compareReplaceableEventState(
    first: Pick<NDKEvent, 'created_at' | 'id'> | null | undefined,
    second: Pick<NDKEvent, 'created_at' | 'id'> | null | undefined
  ): number {
    const firstCreatedAt = Number(first?.created_at ?? 0);
    const secondCreatedAt = Number(second?.created_at ?? 0);
    if (firstCreatedAt !== secondCreatedAt) {
      return firstCreatedAt - secondCreatedAt;
    }

    const firstId = first?.id?.trim() ?? '';
    const secondId = second?.id?.trim() ?? '';
    return firstId.localeCompare(secondId);
  }

  const resolveGroupDisplayName = resolveGroupDisplayNameValue;

  async function ensurePrivatePreferences(
    options: { publishIfCreated?: boolean } = {}
  ): Promise<PrivatePreferences> {
    const existing = readPrivatePreferencesFromStorage();
    if (existing) {
      return existing;
    }

    const nextPreferences = buildFreshPrivatePreferences();
    writePrivatePreferencesToStorage(nextPreferences);

    if (options.publishIfCreated) {
      await publishPrivatePreferences(nextPreferences);
    }

    return nextPreferences;
  }

  async function deriveContactCursorDTag(contactPublicKey: string): Promise<string | null> {
    const preferences = readPrivatePreferencesFromStorage();
    const normalizedContactPublicKey = inputSanitizerService.normalizeHexKey(contactPublicKey);
    if (!preferences?.contactSecret || !normalizedContactPublicKey) {
      return null;
    }

    return sha256Hex(`${preferences.contactSecret}${normalizedContactPublicKey}`);
  }

  function chunkValues<T>(values: T[], chunkSize: number): T[][] {
    if (chunkSize <= 0) {
      return [values];
    }

    const chunks: T[][] = [];
    for (let index = 0; index < values.length; index += chunkSize) {
      chunks.push(values.slice(index, index + chunkSize));
    }
    return chunks;
  }
  let refreshDeveloperPendingQueuesRuntime: () => Promise<unknown> = async () => {};

  const {
    clearPrivateMessagesUiRefreshState,
    flushPrivateMessagesUiRefreshNow,
    queuePrivateMessagesUiRefresh,
    resetPrivateMessagesUiRuntimeState,
    scheduleChatChecks,
    schedulePostPrivateMessagesEoseChecks,
  } = createPrivateMessagesUiRuntime({
    chatStore,
    normalizeThrottleMs,
    refreshDeveloperPendingQueues: async () => {
      await refreshDeveloperPendingQueuesRuntime();
    },
    waitForPrivateMessagesIngestQueue: () =>
      getPrivateMessagesIngestQueueRuntime().catch((error) => {
        console.error(
          'Failed while draining private message ingest queue before EOSE checks',
          error
        );
      }),
  });
  const {
    createDirectMessageRumorEvent,
    createEventDeletionRumorEvent,
    createReactionRumorEvent,
    createStoredDirectMessageRumorEvent,
    createStoredSignedEvent,
    giftWrapSignedEvent,
    normalizeEventId: normalizeEventIdRuntime,
    readDeletionTargetEntries,
    readDirectMessageRecipientPubkey,
    readReactionTargetAuthorPubkey,
    readReactionTargetEventId,
    readReplyTargetEventId,
    resolveIncomingPrivateMessageRecipientContext,
    toStoredNostrEvent,
    unwrapGiftWrapSealEvent,
    verifyIncomingGroupEpochTicket,
  } = createMessageEventRuntime({
    decryptPrivateStringContent,
    derivePublicKeyFromPrivateKey,
    findGroupChatEpochContextByRecipientPubkey,
    getOrCreateSigner,
    ndk,
    readEpochNumberTag,
    readFirstTagValue,
  });
  const {
    appendRelayStatusesToMessageEvent,
    buildInboundRelayStatuses,
    consumePendingIncomingDeletions: consumePendingIncomingDeletionsRuntime,
    consumePendingIncomingReactions: consumePendingIncomingReactionsRuntime,
    queuePendingIncomingDeletion: queuePendingIncomingDeletionRuntime,
    queuePendingIncomingReaction: queuePendingIncomingReactionRuntime,
    refreshMessageInLiveState: refreshMessageInLiveStateRuntime,
    removePendingIncomingReaction: removePendingIncomingReactionRuntime,
  } = createMessageRelayRuntime({
    bumpDeveloperDiagnosticsVersion,
    formatSubscriptionLogValue,
    logMessageRelayDiagnostics,
    normalizeEventId,
    normalizeRelayStatusUrls,
    normalizeThrottleMs,
    pendingIncomingDeletions,
    pendingIncomingReactions,
    queuePrivateMessagesUiRefresh,
  });

  async function resolveStalePendingOutboundMessageRelayStatuses(): Promise<void> {
    await nostrEventDataService.init();
    const updatedStatusCount = await nostrEventDataService.resolvePendingOutboundRelayStatuses();
    if (updatedStatusCount <= 0) {
      return;
    }

    try {
      const { useMessageStore } = await import('src/stores/messageStore');
      await useMessageStore().reloadLoadedMessages();
    } catch (error) {
      console.warn('Failed to reload messages after resolving stale relay statuses', error);
    }
  }

  const {
    buildFilterSinceDetails,
    buildFilterUntilDetails,
    buildLoggedNostrEvent,
    buildPrivateMessageSubscriptionTargetDetails,
    buildSubscriptionEventDetails,
    buildSubscriptionRelayDetails,
    buildTrackedContactSubscriptionTargetDetails,
    formatSubscriptionLogValue: formatSubscriptionLogValueRuntime,
    relaySignature,
    subscribeWithReqLogging,
  } = createSubscriptionLoggingRuntime({
    logDeveloperTrace,
    ndk,
    normalizeEventId,
    resolveGroupChatEpochEntries,
  });

  function formatSubscriptionLogValue(value: string | null | undefined): string | null {
    return formatSubscriptionLogValueRuntime(value);
  }

  function logSubscription(
    name: string,
    phase: string,
    details: Record<string, unknown> = {}
  ): void {
    logDeveloperTrace('info', `subscription:${name}`, phase, details);
  }

  const {
    buildInboundTraceDetails,
    deriveChatName,
    logInboundEvent,
    shouldNotifyForAcceptedChatOnly,
    showIncomingMessageBrowserNotification,
  } = createInboundPresentationRuntime({
    formatSubscriptionLogValue,
    getLoggedInPublicKeyHex,
    getVisibleChatId: () => chatStore.visibleChatId,
    isRestoringStartupState,
    logDeveloperTrace,
    normalizeEventId,
  });

  function bumpContactListVersion(): void {
    contactListVersion.value += 1;
  }

  const { ensureContactListedInPrivateContactList, reconcileAcceptedChatFromPrivateContactList } =
    createPrivateContactMembershipRuntime({
      bumpContactListVersion,
      chatStore,
    });

  function toIsoTimestampFromUnix(value: number | undefined): string {
    if (!Number.isInteger(value) || Number(value) <= 0) {
      return new Date().toISOString();
    }

    return new Date(Number(value) * 1000).toISOString();
  }

  function toUnixTimestamp(value: string | undefined): number {
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) {
        return Math.floor(parsed / 1000);
      }
    }

    return Math.floor(Date.now() / 1000);
  }

  function normalizeRelayStatusUrl(value: string): string | null {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    try {
      return normalizeRelayUrl(normalized);
    } catch {
      return normalized;
    }
  }

  function normalizeRelayStatusUrls(relayUrls: string[]): string[] {
    return normalizeRelayStatusUrlsValue(relayUrls);
  }

  function normalizeEventId(value: unknown): string | null {
    return normalizeEventIdRuntime(value);
  }

  const buildUpdatedContactMeta = buildUpdatedContactMetaValue;
  const buildIdentifierFallbacks = buildIdentifierFallbacksValue;
  const relayEntriesFromRelayList = relayEntriesFromRelayListValue;
  const contactRelayListsEqual = contactRelayListsEqualValue;
  const contactMetadataEqual = contactMetadataEqualValue;
  const shouldPreserveExistingGroupRelays = shouldPreserveExistingGroupRelaysValue;

  const {
    ensureRelayConnections,
    fetchRelayNip11Info,
    getOrCreateSigner: getOrCreateSignerImpl,
    getRelayConnectionState,
  } = createRelayConnectionRuntime({
    authenticatedRelayUrls,
    buildRelaySnapshot,
    bumpRelayStatusVersion,
    configuredRelayUrls,
    getCachedSigner: () => cachedSigner,
    getCachedSignerSessionKey: () => cachedSignerSessionKey,
    getConnectPromise: () => connectPromise,
    getHasActivatedPool: () => hasActivatedPool,
    getHasRelayStatusListeners: () => hasRelayStatusListeners,
    getLoggedInPublicKeyHex,
    getPrivateKeyHex: () => getPrivateKeyHexRuntime(),
    getStoredAuthMethod,
    hasNip07Extension,
    initialConnectTimeoutMs: INITIAL_CONNECT_TIMEOUT_MS,
    isPrivateMessagesSubscriptionRelayTracked: (relayUrl) =>
      isPrivateMessagesSubscriptionRelayTrackedRuntime(relayUrl),
    logDeveloperTrace,
    logRelayLifecycle,
    markPrivateMessagesWatchdogRelayDisconnected: (relayUrl) => {
      markPrivateMessagesWatchdogRelayDisconnectedRuntime(relayUrl);
    },
    ndk,
    queuePrivateMessagesWatchdog: (delayMs) => {
      queuePrivateMessagesWatchdogRuntime(delayMs);
    },
    relayAuthFailureListenerUrls,
    relayConnectFailureCooldownMs: RELAY_CONNECT_FAILURE_COOLDOWN_MS,
    relayConnectFailureCooldownUntilByUrl,
    relayConnectPromises,
    setCachedSigner: (signer) => {
      cachedSigner = signer;
    },
    setCachedSignerSessionKey: (sessionKey) => {
      cachedSignerSessionKey = sessionKey;
    },
    setConnectPromise: (promise) => {
      connectPromise = promise;
    },
    setHasActivatedPool: (value) => {
      hasActivatedPool = value;
    },
    setHasRelayStatusListeners: (value) => {
      hasRelayStatusListeners = value;
    },
  });
  getOrCreateSignerRuntime = getOrCreateSignerImpl;

  async function getOrCreateSigner(): Promise<NDKSigner> {
    return getOrCreateSignerRuntime();
  }
  const {
    buildPrivateContactListTags,
    decryptPrivateContactListContent,
    encryptPrivateContactListTags,
    extractContactProfileEventStateFromProfile,
    fetchContactRelayList,
    getAppRelayUrls,
    listTrackedContactPubkeys,

    parseContactProfileEvent,
    refreshContactRelayList,
    refreshGroupRelayListsOnStartup,

    resolveGroupPublishRelayUrls,
    resolveLoggedInPublishRelayUrls,
    resolveLoggedInReadRelayUrls,
    resolvePrivateContactListPublishRelayUrls,
    resolvePrivateContactListReadRelayUrls,
    resolvePrivateMessageReadRelayUrls,
    resolveTrackedContactReadRelayUrls,
  } = createContactRelayRuntime({
    bumpContactListVersion,
    contactRelayListsEqual,
    ensureRelayConnections,
    getFilterSince,
    getLoggedInPublicKeyHex,
    getLoggedInSignerUser,
    ndk,
    normalizeRelayStatusUrls,
    normalizeWritableRelayUrlsValue,
    relayEntriesFromRelayList,
    relayStore,
    resolveGroupPublishRelayUrlsValue,
    shouldPreserveExistingGroupRelays,
    updateStoredEventSinceFromCreatedAt,
  });

  const {
    buildFailedOutboundRelayStatuses,
    buildPendingOutboundRelayStatuses,
    extractRelayUrlsFromEvent,
    publishEventWithRelayStatuses,
    publishGroupMetadata,
    publishGroupRelayList,
    publishReplaceableEventWithRelayStatuses,
    publishUserMetadata,
    sendGiftWrappedRumor,
  } = createRelayPublishRuntime({
    appendRelayStatusesToMessageEvent,
    buildRelaySaveStatus,
    decryptGroupIdentitySecretContent,
    ensureRelayConnections,
    getLoggedInPublicKeyHex,
    getOrCreateSigner,
    ndk,
    normalizeEventId,
    normalizeRelayStatusUrl,
    normalizeRelayStatusUrls,
    resolveGroupPublishRelayUrls,
    resolveLoggedInPublishRelayUrls,
    toStoredNostrEvent,
    toUnixTimestamp,
    updateStoredEventSinceFromCreatedAt,
  });

  const {
    queueEpochDrivenPrivateMessagesSubscriptionRefresh,
    queueTrackedContactSubscriptionsRefresh,
  } = createSubscriptionRefreshRuntime({
    getPendingPrivateMessagesEpochSubscriptionRefreshOptions: () =>
      pendingPrivateMessagesEpochSubscriptionRefreshOptions,
    getPrivateMessagesEpochSubscriptionRefreshQueue: () =>
      privateMessagesEpochSubscriptionRefreshQueue,
    getPrivateMessagesEpochSubscriptionRefreshTimerId: () =>
      privateMessagesEpochSubscriptionRefreshTimerId,
    normalizeRelayStatusUrls,
    normalizeThrottleMs,
    privateMessagesEpochSubscriptionRefreshDebounceMs:
      PRIVATE_MESSAGES_EPOCH_SUBSCRIPTION_REFRESH_DEBOUNCE_MS,
    setPendingPrivateMessagesEpochSubscriptionRefreshOptions: (options) => {
      pendingPrivateMessagesEpochSubscriptionRefreshOptions = options;
    },
    setPrivateMessagesEpochSubscriptionRefreshQueue: (queue) => {
      privateMessagesEpochSubscriptionRefreshQueue = queue;
    },
    setPrivateMessagesEpochSubscriptionRefreshTimerId: (timerId) => {
      privateMessagesEpochSubscriptionRefreshTimerId = timerId;
    },
    subscribeContactProfileUpdates: (seedRelayUrls, force) =>
      subscribeContactProfileUpdates(seedRelayUrls, force),
    subscribeContactRelayListUpdates: (seedRelayUrls, force) =>
      subscribeContactRelayListUpdates(seedRelayUrls, force),
    subscribePrivateMessagesForLoggedInUser: (force, options) =>
      subscribePrivateMessagesForLoggedInUserRuntime(force, options),
  });

  const {
    fetchMyRelayList,
    publishMyRelayList,
    resetMyRelayListRuntimeState,
    restoreMyRelayList,

    subscribeMyRelayListUpdates,
    updateLoggedInUserRelayList,
  } = createMyRelayListRuntime({
    beginStartupStep,
    buildSubscriptionEventDetails,
    buildSubscriptionRelayDetails,
    completeStartupStep,
    ensureRelayConnections,
    extractRelayUrlsFromEvent,
    failStartupStep,
    formatSubscriptionLogValue,
    getFilterSince,
    getLoggedInPublicKeyHex,
    getLoggedInSignerUser,
    getRelaySnapshots,
    getStoredAuthMethod,
    logSubscription,
    ndk,
    queueTrackedContactSubscriptionsRefresh,
    relayEntriesFromRelayList,
    relaySignature,
    resolveLoggedInPublishRelayUrls,
    resolveLoggedInReadRelayUrls,
    subscribePrivateMessagesForLoggedInUser: (force) =>
      subscribePrivateMessagesForLoggedInUserRuntime(force),
    subscribeWithReqLogging,
    updateStoredEventSinceFromCreatedAt,
  });

  const {
    appendRelayStatusesToGroupMemberTicketEvent,
    ensureGroupContactAndChat,
    ensureGroupIdentitySecretEpochState,
    findGroupChatEpochContextByRecipientPubkey: findGroupChatEpochContextByRecipientPubkeyRuntime,
    listPrivateMessageRecipientPubkeys,
    persistIncomingGroupEpochTicket,
  } = createGroupEpochStateRuntime({
    bumpContactListVersion,
    chatStore,
    decryptGroupIdentitySecretContent,
    derivePublicKeyFromPrivateKey,
    encryptGroupIdentitySecretContent,
    encryptPrivateStringContent,
    getLoggedInPublicKeyHex,
    getPrivateMessagesEpochSwitchSince,
    logConflictingIncomingEpochNumber,
    logInvalidIncomingEpochNumber,
    publishGroupIdentitySecret: (groupPublicKey, encryptedPrivateKey, seedRelayUrls = []) =>
      publishGroupIdentitySecretRuntime(groupPublicKey, encryptedPrivateKey, seedRelayUrls),
    queueEpochDrivenPrivateMessagesSubscriptionRefresh,
    restoreGroupEpochHistory: (groupPublicKey, epochPublicKey, options) =>
      restoreGroupEpochHistoryRuntime(groupPublicKey, epochPublicKey, options),
  });

  const { publishGroupMemberChanges, rotateGroupEpochAndSendTickets, sendGroupEpochTicket } =
    createGroupEpochPublishRuntime({
      appendRelayStatusesToGroupMemberTicketEvent,
      buildFailedOutboundRelayStatuses,
      buildPendingOutboundRelayStatuses,
      buildRelaySaveStatus,
      encryptGroupIdentitySecretContent,
      ensureGroupIdentitySecretEpochState,
      ensureRelayConnections,
      getAppRelayUrls,
      getLoggedInPublicKeyHex,
      giftWrapSignedEvent,
      ndk,
      normalizeEventId,
      persistIncomingGroupEpochTicket,
      publishEventWithRelayStatuses,
      publishGroupIdentitySecret: (groupPublicKey, encryptedPrivateKey, seedRelayUrls = []) =>
        publishGroupIdentitySecretRuntime(groupPublicKey, encryptedPrivateKey, seedRelayUrls),
      publishGroupMembershipFollowSet: (groupPublicKey, memberPublicKeys, seedRelayUrls = []) =>
        publishGroupMembershipFollowSetRuntime(groupPublicKey, memberPublicKeys, seedRelayUrls),
      toIsoTimestampFromUnix,
      toStoredNostrEvent,
    });

  const {
    applyPendingIncomingDeletionsForMessage,
    applyPendingIncomingReactionsForMessage,
    buildReplyPreviewFromTargetEvent,
    processIncomingDeletionRumorEvent,
    processIncomingReactionDeletion,
    processIncomingReactionRumorEvent,
  } = createMessageMutationRuntime({
    buildInboundTraceDetails,
    deriveChatName,
    formatSubscriptionLogValue,
    getLoggedInPublicKeyHex,
    logInboundEvent,
    ndk,
    normalizeEventId,
    normalizeThrottleMs,
    queuePendingIncomingDeletion: queuePendingIncomingDeletionRuntime,
    queuePendingIncomingReaction: queuePendingIncomingReactionRuntime,
    queuePrivateMessagesUiRefresh,
    readDeletionTargetEntries,
    readReactionTargetAuthorPubkey,
    readReactionTargetEventId,
    refreshMessageInLiveState: refreshMessageInLiveStateRuntime,
    removePendingIncomingReaction: removePendingIncomingReactionRuntime,
    toIsoTimestampFromUnix,
    consumePendingIncomingDeletions: consumePendingIncomingDeletionsRuntime,
    consumePendingIncomingReactions: consumePendingIncomingReactionsRuntime,
  });

  const {
    getPrivateMessagesIngestQueue,
    queuePrivateMessageIngestion,
    resetPrivateMessagesIngestRuntimeState,
  } = createPrivateMessagesIngestRuntime({
    appendRelayStatusesToMessageEvent,
    applyPendingIncomingDeletionsForMessage,
    applyPendingIncomingReactionsForMessage,
    buildInboundRelayStatuses,
    buildInboundTraceDetails,
    buildLoggedNostrEvent,
    buildReplyPreviewFromTargetEvent,
    buildSubscriptionEventDetails,
    chatStore,
    deriveChatName,
    derivePublicKeyFromPrivateKey,
    extractRelayUrlsFromEvent,
    findConflictingKnownGroupEpochNumber,
    findGroupChatEpochContextByRecipientPubkey,
    findHigherKnownGroupEpochConflict,
    formatSubscriptionLogValue,
    getPrivateMessagesRestoreThrottleMs: () => privateMessagesRestoreThrottleMs,
    isContactListedInPrivateContactList,
    lastSeenReceivedActivityAtMetaKey: LAST_SEEN_RECEIVED_ACTIVITY_AT_META_KEY,
    logConflictingIncomingEpochNumber,
    logDeveloperTrace,
    logInboundEvent,
    logInvalidIncomingEpochNumber,
    logSubscription,
    normalizeEventId,
    normalizeThrottleMs,
    normalizeTimestamp,
    persistIncomingGroupEpochTicket,
    processIncomingDeletionRumorEvent,
    processIncomingReactionRumorEvent,
    queueBackgroundGroupContactRefresh: (groupPublicKey, fallbackName) => {
      queueBackgroundGroupContactRefreshRuntime(groupPublicKey, fallbackName);
    },
    queuePrivateMessagesUiRefresh,
    readReplyTargetEventId,
    resolveCurrentGroupChatEpochEntry,
    resolveGroupDisplayName,
    resolveIncomingChatInboxStateValue,
    resolveIncomingPrivateMessageRecipientContext,
    shouldNotifyForAcceptedChatOnly,
    showIncomingMessageBrowserNotification,
    toComparableTimestamp,
    toIsoTimestampFromUnix,
    toStoredNostrEvent,
    unwrapGiftWrapSealEvent,
    upsertIncomingGroupInviteRequestChat,
    verifyIncomingGroupEpochTicket,
  });
  getPrivateMessagesIngestQueueRuntime = getPrivateMessagesIngestQueue;

  const {
    ensurePrivateMessagesWatchdog: ensurePrivateMessagesWatchdogImpl,
    getPrivateMessagesSubscription,
    getPrivateMessagesSubscriptionSignature,
    isPrivateMessagesSubscriptionRelayTracked,
    markPrivateMessagesWatchdogRelayDisconnected,
    queuePrivateMessagesWatchdog,
    resetPrivateMessagesSubscriptionRuntimeState,
    stopPrivateMessagesLiveSubscription,
    subscribePrivateMessagesForLoggedInUser: subscribePrivateMessagesForLoggedInUserImpl,
  } = createPrivateMessagesSubscriptionRuntime({
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
    getPrivateMessagesRestoreThrottleMs: () => privateMessagesRestoreThrottleMs,
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
    refreshAllStoredContacts: () => refreshAllStoredContactsRuntime(),
    relaySignature,
    resolvePrivateMessageReadRelayUrls,
    schedulePostPrivateMessagesEoseChecks,
    setPrivateMessagesRestoreThrottleMs: (value) => {
      privateMessagesRestoreThrottleMs = value;
    },
    startPrivateMessagesStartupBackfill: (
      loggedInPubkeyHex,
      recipientPubkeys,
      relayUrls,
      liveSince
    ) => {
      startPrivateMessagesStartupBackfillRuntime(
        loggedInPubkeyHex,
        recipientPubkeys,
        relayUrls,
        liveSince
      );
    },
    subscribeWithReqLogging,
    updateStoredEventSinceFromCreatedAt,
    updateStoredPrivateMessagesLastReceivedFromCreatedAt,
  });
  _ensurePrivateMessagesWatchdogRuntime = ensurePrivateMessagesWatchdogImpl;
  isPrivateMessagesSubscriptionRelayTrackedRuntime = isPrivateMessagesSubscriptionRelayTracked;
  markPrivateMessagesWatchdogRelayDisconnectedRuntime =
    markPrivateMessagesWatchdogRelayDisconnected;
  queuePrivateMessagesWatchdogRuntime = queuePrivateMessagesWatchdog;
  subscribePrivateMessagesForLoggedInUserRuntime = subscribePrivateMessagesForLoggedInUserImpl;
  ensurePrivateMessagesWatchdogImpl();

  const {
    restoreGroupEpochHistory: restoreGroupEpochHistoryImpl,
    restorePrivateMessagesForRecipient: restorePrivateMessagesForRecipientImpl,
    startPrivateMessagesStartupBackfill: startPrivateMessagesStartupBackfillImpl,
    stopPrivateMessagesBackfill: stopPrivateMessagesBackfillImpl,
  } = createPrivateMessagesBackfillRuntime({
    buildFilterSinceDetails,
    buildFilterUntilDetails,
    buildPrivateMessageSubscriptionTargetDetails,
    buildSubscriptionRelayDetails,
    ensureRelayConnections,
    flushPrivateMessagesUiRefreshNow,
    formatSubscriptionLogValue,
    getLoggedInPublicKeyHex,
    getPrivateMessagesBackfillResumeState,
    getPrivateMessagesIngestQueue: () => getPrivateMessagesIngestQueueRuntime(),
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
    writePrivateMessagesBackfillState,
  });
  restoreGroupEpochHistoryRuntime = restoreGroupEpochHistoryImpl;
  restorePrivateMessagesForRecipientRuntime = restorePrivateMessagesForRecipientImpl;
  startPrivateMessagesStartupBackfillRuntime = startPrivateMessagesStartupBackfillImpl;
  stopPrivateMessagesBackfillRuntime = stopPrivateMessagesBackfillImpl;

  const {
    resetContactSubscriptionsRuntimeState,
    subscribeContactProfileUpdates,
    subscribeContactRelayListUpdates,
  } = createContactSubscriptionsRuntime({
    buildContactProfileEventState,
    buildContactRelayListEventState,
    buildSubscriptionEventDetails,
    buildSubscriptionRelayDetails,
    buildTrackedContactSubscriptionTargetDetails,
    buildUpdatedContactMeta,
    bumpContactListVersion,
    chatStore,
    contactMetadataEqual,
    contactRelayListsEqual,
    encodeNprofile,
    encodeNpub,
    ensureRelayConnections,
    extractRelayUrlsFromEvent,
    formatSubscriptionLogValue,
    getFilterSince,
    getLoggedInPublicKeyHex,
    getLoggedInSignerUser,
    listTrackedContactPubkeys,
    logSubscription,
    markContactProfileEventApplied,
    markContactRelayListEventApplied,
    ndk,
    parseContactProfileEvent,
    pruneTrackedContactProfileEventState,
    pruneTrackedContactRelayListEventState,
    relayEntriesFromRelayList,
    relaySignature,
    resolveTrackedContactReadRelayUrls,
    shouldApplyContactProfileEvent,
    shouldApplyContactRelayListEvent,
    shouldPreserveExistingGroupRelays,
    subscribeWithReqLogging,
    updateStoredEventSinceFromCreatedAt,
  });

  let refreshContactByPublicKeyRuntime: (
    pubkeyHex: string,
    fallbackName?: string,
    lifecycle?: Record<string, unknown>
  ) => Promise<unknown> = async () => {
    throw new Error('Contact profile runtime is not initialized.');
  };

  const {
    publishPrivateContactList,
    resetPrivateContactListRuntimeState,
    restorePrivateContactList,
    subscribePrivateContactListUpdates,
  } = createPrivateContactListRuntime({
    beginStartupStep,
    bumpContactListVersion,
    buildPrivateContactListTags,
    buildSubscriptionEventDetails,
    buildSubscriptionRelayDetails,
    chatStore,
    completeStartupStep,
    createStartupBatchTracker,
    decryptPrivateContactListContent,
    encryptPrivateContactListTags,
    ensureContactListedInPrivateContactList,
    ensureRelayConnections,
    extractRelayUrlsFromEvent,
    failStartupStep,
    formatSubscriptionLogValue,
    getFilterSince,
    getLoggedInPublicKeyHex,
    getLoggedInSignerUser,
    getStartupStepSnapshot,
    isRestoringStartupState,
    logSubscription,
    markPrivateContactListEventApplied,
    ndk,
    queueTrackedContactSubscriptionsRefresh,
    reconcileAcceptedChatFromPrivateContactList,
    refreshContactByPublicKey: (pubkeyHex, fallbackName, lifecycle) =>
      refreshContactByPublicKeyRuntime(pubkeyHex, fallbackName, lifecycle),
    relaySignature,
    resolvePrivateContactListPublishRelayUrls,
    resolvePrivateContactListReadRelayUrls,
    shouldApplyPrivateContactListEvent,
    subscribeWithReqLogging,
    updateStoredEventSinceFromCreatedAt,
  });

  const {
    ensureContactStoredAsGroup,
    ensureRespondedPubkeyIsContact,
    fetchContactPreviewByPublicKey,
    queueBackgroundGroupContactRefresh,
    refreshContactByPublicKey,
    refreshGroupContactByPublicKey,
  } = createContactProfileRuntime({
    backgroundGroupContactRefreshStartedAt,
    buildIdentifierFallbacks,
    buildUpdatedContactMeta,
    bumpContactListVersion,
    chatStore,
    contactMetadataEqual,
    contactRelayListsEqual,
    ensureContactListedInPrivateContactList,
    extractContactProfileEventStateFromProfile,
    fetchContactRelayList,
    getAppRelayUrls,
    getLoggedInPublicKeyHex,
    groupContactRefreshPromises,
    isContactListedInPrivateContactList,
    markContactProfileEventApplied,
    markContactRelayListEventApplied,
    ndk,
    publishPrivateContactList,
    refreshContactRelayList,
    resolveGroupDisplayName,
    shouldPreserveExistingGroupRelays,
  });
  refreshContactByPublicKeyRuntime = refreshContactByPublicKey;
  queueBackgroundGroupContactRefreshRuntime = queueBackgroundGroupContactRefresh;

  const {
    ensureGroupInvitePubkeyIsContact,
    upsertIncomingGroupInviteRequestChat: upsertIncomingGroupInviteRequestChatImpl,
  } = createGroupInviteRuntime({
    bumpContactListVersion,
    chatStore,
    ensureContactListedInPrivateContactList,
    ensureContactStoredAsGroup,
    getAppRelayUrls,
    getLoggedInPublicKeyHex,
    publishPrivateContactList,
    refreshGroupContactByPublicKey,
    subscribePrivateMessagesForLoggedInUser: (force) =>
      subscribePrivateMessagesForLoggedInUserRuntime(force),
  });
  upsertIncomingGroupInviteRequestChatRuntime = upsertIncomingGroupInviteRequestChatImpl;

  const {
    applyContactCursorStateToContact,

    createGroupChat,
    fetchContactCursorEvents,
    fetchGroupMembershipFollowSetPubkeys,

    publishGroupIdentitySecret: publishGroupIdentitySecretImpl,
    publishGroupMembershipFollowSet: publishGroupMembershipFollowSetImpl,
    publishPrivatePreferences,
    restoreContactCursorState,
    restoreGroupIdentitySecrets,
    restorePrivatePreferences,
    scheduleContactCursorPublish,
  } = createPrivateStateRuntime({
    beginStartupStep,
    buildFreshPrivatePreferences,
    buildRelaySaveStatus,
    bumpContactListVersion,
    chatStore,
    chunkValues,
    compareReplaceableEventState,
    completeStartupStep,
    contactRelayListsEqual,
    createInitialGroupEpochSecretState,
    createStartupBatchTracker,
    decryptContactCursorContent,
    decryptGroupIdentitySecretContent,
    decryptPrivatePreferencesContent,
    deriveContactCursorDTag,
    encryptContactCursorContent,
    encryptGroupIdentitySecretContent,
    encryptPrivatePreferencesContent,
    ensureGroupContactAndChat,
    ensureLoggedInSignerUser: getLoggedInSignerUser,
    ensurePrivatePreferences,
    ensureRelayConnections,
    failStartupStep,
    getFilterSince,
    getLoggedInPublicKeyHex,
    getStartupStepSnapshot,
    isRestoringStartupState,
    ndk,
    normalizeEventId,
    normalizeTimestamp,
    pendingContactCursorPublishStates,
    pendingContactCursorPublishTimers,
    persistIncomingGroupEpochTicket,
    publishGroupRelayList,
    publishPrivateContactList,
    publishEventWithRelayStatuses,
    publishReplaceableEventWithRelayStatuses,
    queueTrackedContactSubscriptionsRefresh,
    readPrivatePreferencesFromStorage,
    refreshContactByPublicKey,
    refreshContactRelayList,
    resolveLoggedInPublishRelayUrls,
    resolveLoggedInReadRelayUrls,
    restoreState: restoreRuntimeState,
    scheduleChatChecks,
    sha256Hex,
    shouldApplyPrivateContactListEvent,
    toComparableTimestamp,
    toIsoTimestampFromUnix,
    updateStoredEventSinceFromCreatedAt,
    writePrivatePreferencesToStorage,
  });
  publishGroupIdentitySecretRuntime = publishGroupIdentitySecretImpl;
  publishGroupMembershipFollowSetRuntime = publishGroupMembershipFollowSetImpl;
  const {
    refreshAllStoredContacts: refreshAllStoredContactsImpl,
    restoreStartupState,
    syncLoggedInContactProfile,
    syncRecentChatContacts,
  } = createStartupContactSyncRuntime({
    applyContactCursorStateToContact,
    bumpContactListVersion,
    createStartupBatchTracker,
    deriveContactCursorDTag,
    ensureRelayConnections,
    ensureStoredEventSince,
    fetchContactCursorEvents,
    flushPendingEventSinceUpdate,
    getLoggedInPublicKeyHex,
    getRestoreStartupStatePromise: () => restoreStartupStatePromise,
    getSyncLoggedInContactProfilePromise: () => syncLoggedInContactProfilePromise,
    getSyncRecentChatContactsPromise: () => syncRecentChatContactsPromise,
    isRestoringStartupState,
    readPrivatePreferencesFromStorage,
    reloadChats: () => chatStore.reload(),
    refreshContactByPublicKey,
    refreshGroupRelayListsOnStartup,
    resetStartupStepTracking,
    resolveStalePendingOutboundMessageRelayStatuses,
    restoreContactCursorState,
    restoreGroupIdentitySecrets,
    restoreMyRelayList,
    restorePrivateContactList,
    restorePrivatePreferences,
    setRestoreStartupStatePromise: (promise) => {
      restoreStartupStatePromise = promise;
    },
    setSyncLoggedInContactProfilePromise: (promise) => {
      syncLoggedInContactProfilePromise = promise;
    },
    setSyncRecentChatContactsPromise: (promise) => {
      syncRecentChatContactsPromise = promise;
    },
    subscribeContactProfileUpdates,
    subscribeContactRelayListUpdates,
    subscribeMyRelayListUpdates,
    subscribePrivateContactListUpdates,
    subscribePrivateMessagesForLoggedInUser: (force, options) =>
      subscribePrivateMessagesForLoggedInUserRuntime(force, options),
  });
  refreshAllStoredContactsRuntime = refreshAllStoredContactsImpl;

  function bumpRelayStatusVersion(): void {
    relayStatusVersion.value += 1;
  }

  const {
    clearPrivateKey: clearPrivateKeyImpl,
    getPrivateKeyHex: getPrivateKeyHexImpl,
    loginWithExtension: loginWithExtensionImpl,
    logout: logoutImpl,
    savePrivateKeyHex: savePrivateKeyHexImpl,
  } = createAuthSessionRuntime({
    authenticatedRelayUrls,
    backgroundGroupContactRefreshStartedAt,
    bumpDeveloperDiagnosticsVersion,
    chatStoreClearAllComposerDrafts: chatStore.clearAllComposerDrafts,
    clearDeveloperTraceEntries,
    clearNip65RelayStoreState: nip65RelayStore.clear,
    clearPrivateMessagesBackfillState,
    clearPrivatePreferencesStorage,
    clearRelayStoreState: relayStore.clear,
    clearStoredPrivateMessagesLastReceivedCreatedAt,
    configuredRelayUrls,
    contactListVersion,
    eventSince,
    getPrivateMessagesEpochSubscriptionRefreshTimerId: () =>
      privateMessagesEpochSubscriptionRefreshTimerId,
    groupContactRefreshPromises,
    hasNip07Extension,
    isRestoringStartupState,
    loggedInvalidGroupEpochConflictKeys,
    ndk,
    pendingContactCursorPublishStates,
    pendingContactCursorPublishTimers,
    pendingEventSinceState,
    pendingIncomingDeletions,
    pendingIncomingReactions,
    relayConnectFailureCooldownUntilByUrl,
    relayConnectPromises,
    relayStatusVersion,
    resetContactSubscriptionsRuntimeState,
    resetEventSinceForFreshLogin,
    resetMyRelayListRuntimeState,
    resetPrivateContactListRuntimeState,
    resetPrivateMessagesIngestRuntimeState,
    resetPrivateMessagesSubscriptionRuntimeState,
    resetPrivateMessagesUiRuntimeState,
    resetStartupStepTracking,
    resetTrackedContactEventState,
    restoreRuntimeState,
    setCachedSigner: (signer) => {
      cachedSigner = signer;
    },
    setCachedSignerSessionKey: (sessionKey) => {
      cachedSignerSessionKey = sessionKey;
    },
    setPendingPrivateMessagesEpochSubscriptionRefreshOptions: (options) => {
      pendingPrivateMessagesEpochSubscriptionRefreshOptions = options;
    },
    setPrivateMessagesEpochSubscriptionRefreshQueue: (queue) => {
      privateMessagesEpochSubscriptionRefreshQueue = queue;
    },
    setPrivateMessagesEpochSubscriptionRefreshTimerId: (timerId) => {
      privateMessagesEpochSubscriptionRefreshTimerId = timerId;
    },
    setRestoreStartupStatePromise: (promise) => {
      restoreStartupStatePromise = promise;
    },
    setSyncLoggedInContactProfilePromise: (promise) => {
      syncLoggedInContactProfilePromise = promise;
    },
    setSyncRecentChatContactsPromise: (promise) => {
      syncRecentChatContactsPromise = promise;
    },
    stopPrivateMessagesSubscription: (reason = 'replace') => {
      stopPrivateMessagesBackfillRuntime(reason);
      stopPrivateMessagesLiveSubscription(reason);
    },
  });
  getPrivateKeyHexRuntime = getPrivateKeyHexImpl;
  const {
    getNip05Data,
    resolveIdentifier,
    retryDirectMessageRelay,
    retryGroupEpochTicketRelay,
    savePrivateKey,
    savePrivateKeyFromNsec,
    sendDirectMessage,
    sendDirectMessageDeletion,
    sendDirectMessageReaction,
    validateNpub,
    validateNsec,
    validatePrivateKey,
  } = createUserActions({
    appendRelayStatusesToGroupMemberTicketEvent,
    appendRelayStatusesToMessageEvent,
    buildFailedOutboundRelayStatuses,
    buildPendingOutboundRelayStatuses,
    createDirectMessageRumorEvent,
    createEventDeletionRumorEvent,
    createReactionRumorEvent,
    createStoredDirectMessageRumorEvent,
    createStoredSignedEvent,
    ensureGroupIdentitySecretEpochState,
    ensureRelayConnections,
    getLoggedInPublicKeyHex,
    getOrCreateSigner,
    giftWrapSignedEvent,
    ndk,
    normalizeEventId,
    normalizeRelayStatusUrl,
    publishEventWithRelayStatuses,
    readDirectMessageRecipientPubkey,
    readEpochNumberTag,
    readFirstTagValue,
    savePrivateKeyHex: savePrivateKeyHexImpl,
    sendGiftWrappedRumor,
    toIsoTimestampFromUnix,
  });

  const {
    getDeveloperDiagnosticsSnapshot,
    reconnectAllDeveloperRelays,
    reconnectDeveloperRelay,
    refreshDeveloperPendingQueues,
    refreshPrivateMessages,
    restartPrivateMessagesDiagnosticsSubscription,
  } = createDeveloperDiagnosticsRuntime({
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
    getPrivateMessagesRestoreThrottleMs: () => privateMessagesRestoreThrottleMs,
    getPrivateMessagesSubscription,
    getPrivateMessagesSubscriptionSignature,
    getRelayConnectionState,
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
    subscribePrivateMessagesForLoggedInUser: (force, options) =>
      subscribePrivateMessagesForLoggedInUserRuntime(force, options),
    toOptionalIsoTimestampFromUnix,
  });
  refreshDeveloperPendingQueuesRuntime = refreshDeveloperPendingQueues;

  return {
    clearPrivateKey: clearPrivateKeyImpl,
    createGroupChat,
    clearDeveloperTraceEntries,
    contactListVersion,
    developerDiagnosticsEnabled,
    developerDiagnosticsVersion,
    developerTraceVersion,
    encodeNpub,
    ensureGroupInvitePubkeyIsContact,
    ensureRelayConnections,
    fetchRelayNip11Info,
    fetchMyRelayList,
    fetchGroupMembershipFollowSetPubkeys,
    refreshContactRelayList,
    getDeveloperDiagnosticsSnapshot,
    getNip05Data,
    hasNip07Extension,
    getLoggedInPublicKeyHex,
    getPrivateKeyHex: getPrivateKeyHexRuntime,
    refreshDeveloperPendingQueues,
    refreshPrivateMessages,
    getRelayConnectionState,
    isRestoringStartupState,
    listDeveloperTraceEntries,
    loginWithExtension: loginWithExtensionImpl,
    logout: logoutImpl,
    publishPrivateContactList,
    publishGroupRelayList,
    publishGroupMetadata,
    publishGroupMemberChanges,
    publishUserMetadata,
    publishMyRelayList,
    relayStatusVersion,
    resolveIdentifier,
    rotateGroupEpochAndSendTickets,
    ensureRespondedPubkeyIsContact,
    fetchContactPreviewByPublicKey,
    refreshContactByPublicKey,
    restoreContactCursorState,
    restoreGroupIdentitySecrets,
    restoreGroupEpochHistory: restoreGroupEpochHistoryRuntime,
    restoreMyRelayList,
    restorePrivateMessagesForRecipient: restorePrivateMessagesForRecipientRuntime,
    restorePrivateContactList,
    restorePrivatePreferences,
    restoreStartupState,
    reconnectAllDeveloperRelays,
    reconnectDeveloperRelay,
    restartPrivateMessagesDiagnosticsSubscription,
    retryDirectMessageRelay,
    retryGroupEpochTicketRelay,
    scheduleContactCursorPublish,
    sendGroupEpochTicket,
    sendDirectMessage,
    sendDirectMessageDeletion,
    sendDirectMessageReaction,
    savePrivateKey,
    savePrivateKeyFromNsec,
    savePrivateKeyHex: savePrivateKeyHexImpl,
    subscribeMyRelayListUpdates,
    subscribePrivateContactListUpdates,
    subscribePrivateMessagesForLoggedInUser: subscribePrivateMessagesForLoggedInUserRuntime,
    updateLoggedInUserRelayList,
    setDeveloperDiagnosticsEnabled,
    syncLoggedInContactProfile,
    syncRecentChatContacts,
    startupDisplay,
    startupSteps,
    validatePrivateKey,
    validateNpub,
    validateNsec,
  };
});
