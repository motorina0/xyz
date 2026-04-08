import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import NDK, {
  NDKEvent,
  type NDKFilter,
  NDKKind,
  NDKNip07Signer,
  NDKPublishError,
  NDKPrivateKeySigner,
  type NDKRelay,
  type NDKRelayConnectionStats,
  NDKRelayList,
  NDKSubscriptionCacheUsage,
  type NDKSigner,
  type NDKUserProfile,
  type NDKRelayInformation,
  NDKRelayStatus,
  NDKRelaySet,
  type NDKSubscriptionOptions,
  NDKUser,
  giftUnwrap,
  giftWrap,
  isValidNip05,
  isValidPubkey,
  nip19,
  normalizeRelayUrl,
  type NostrEvent
} from '@nostr-dev-kit/ndk';
import { getEmojiEntryByValue } from 'src/data/topEmojis';
import { chatDataService, type ChatRow } from 'src/services/chatDataService';
import { contactsService } from 'src/services/contactsService';
import { imageCacheService } from 'src/services/imageCacheService';
import { nostrEventDataService } from 'src/services/nostrEventDataService';
import {
  inputSanitizerService,
  type PrivateKeyValidationResult,
  type NpubValidationResult,
  type NsecValidationResult
} from 'src/services/inputSanitizerService';
import {
  beginStartupStepSnapshotValue,
  completeStartupStepSnapshotValue,
  createInitialStartupStepSnapshots,
  failStartupStepSnapshotValue,
  resetStartupStepSnapshotsValue,
  type StartupDisplaySnapshot,
  type StartupStepId,
  type StartupStepSnapshot,
  type StartupStepStatus
} from 'src/stores/nostr/startupState';
import {
  AUTH_METHOD_STORAGE_KEY,
  BACKGROUND_GROUP_CONTACT_REFRESH_COOLDOWN_MS,
  CHAT_LAST_INCOMING_MESSAGE_AT_META_KEY,
  CHAT_REQUEST_MESSAGE_META_KEY,
  CHAT_REQUEST_TYPE_META_KEY,
  CONTACT_CURSOR_FETCH_BATCH_SIZE,
  CONTACT_CURSOR_PUBLISH_DELAY_MS,
  CONTACT_CURSOR_VERSION,
  DEFAULT_EVENT_SINCE_LOOKBACK_SECONDS,
  DEVELOPER_DIAGNOSTICS_STORAGE_KEY,
  EVENT_FILTER_LOOKBACK_SECONDS,
  EVENT_SINCE_STORAGE_KEY,
  GROUP_CHAT_EPOCH_PUBLIC_KEY_META_KEY,
  GROUP_CURRENT_EPOCH_PRIVATE_KEY_ENCRYPTED_CHAT_META_KEY,
  GROUP_CURRENT_EPOCH_PUBLIC_KEY_CHAT_META_KEY,
  GROUP_EPOCH_KEYS_CHAT_META_KEY,
  GROUP_IDENTITY_SECRET_TAG,
  GROUP_IDENTITY_SECRET_VERSION,
  GROUP_INVITE_REQUEST_MESSAGE,
  GROUP_INVITE_REQUEST_TYPE,
  GROUP_MEMBER_TICKET_DELIVERIES_CHAT_META_KEY,
  GROUP_OWNER_PUBLIC_KEY_CONTACT_META_KEY,
  GROUP_PRIVATE_KEY_CONTACT_META_KEY,
  INITIAL_CONNECT_TIMEOUT_MS,
  INVITATION_PROOF_TAG,
  LAST_SEEN_RECEIVED_ACTIVITY_AT_META_KEY,
  PRIVATE_CONTACT_LIST_D_TAG,
  PRIVATE_CONTACT_LIST_MEMBER_CONTACT_META_KEY,
  PRIVATE_CONTACT_LIST_TITLE,
  PRIVATE_KEY_STORAGE_KEY,
  PRIVATE_MESSAGES_BACKFILL_INITIAL_DELAY_MS,
  PRIVATE_MESSAGES_BACKFILL_MAX_AGE_SECONDS,
  PRIVATE_MESSAGES_BACKFILL_MAX_DELAY_MS,
  PRIVATE_MESSAGES_BACKFILL_STATE_STORAGE_KEY,
  PRIVATE_MESSAGES_BACKFILL_WINDOW_SECONDS,
  PRIVATE_MESSAGES_EPOCH_SUBSCRIPTION_REFRESH_DEBOUNCE_MS,
  PRIVATE_MESSAGES_LAST_RECEIVED_EVENT_STORAGE_KEY,
  PRIVATE_MESSAGES_STARTUP_LIVE_LOOKBACK_SECONDS,
  PRIVATE_MESSAGES_STARTUP_RESTORE_THROTTLE_MS,
  PRIVATE_MESSAGES_WATCHDOG_INTERVAL_MS,
  PRIVATE_MESSAGES_WATCHDOG_RECOVERY_COOLDOWN_MS,
  PRIVATE_PREFERENCES_D_TAG,
  PRIVATE_PREFERENCES_KIND,
  PRIVATE_PREFERENCES_STORAGE_KEY,
  PUBLIC_KEY_STORAGE_KEY,
  RELAY_CONNECT_FAILURE_COOLDOWN_MS,
  RELAY_STORAGE_KEYS,
  STARTUP_STEP_MIN_PROGRESS_MS,
  UNKNOWN_REPLY_MESSAGE_TEXT
} from 'src/stores/nostr/constants';
import {
  createDeveloperTraceRuntime,
  readDeveloperDiagnosticsEnabledFromStorage
} from 'src/stores/nostr/developerTrace';
import { createDeveloperDiagnosticsRuntime } from 'src/stores/nostr/developerDiagnostics';
import { createContactProfileRuntime } from 'src/stores/nostr/contactProfileRuntime';
import { createContactRelayRuntime } from 'src/stores/nostr/contactRelayRuntime';
import { hasStorage, isPlainRecord } from 'src/stores/nostr/shared';
import { createPrivateStateRuntime } from 'src/stores/nostr/privateStateRuntime';
import { createStorageSessionRuntime } from 'src/stores/nostr/storageSession';
import { createStartupRuntime } from 'src/stores/nostr/startupRuntime';
import { createTrackedContactStateRuntime } from 'src/stores/nostr/trackedContactStateRuntime';
import { createUserActions } from 'src/stores/nostr/userActions';
import {
  buildAvatarFallbackValue,
  buildGroupInviteRequestPlanValue,
  buildIdentifierFallbacksValue,
  buildUpdatedContactMetaValue,
  contactMetadataEqualValue,
  contactRelayListsEqualValue,
  findConflictingKnownGroupEpochNumberValue,
  findHigherKnownGroupEpochConflictValue,
  normalizeChatGroupEpochKeysValue,
  normalizeRelayStatusUrlsValue,
  normalizeWritableRelayUrlsValue,
  relayEntriesFromRelayListValue,
  resolveCurrentGroupChatEpochEntryValue,
  resolveGroupChatEpochEntriesValue,
  resolveGroupDisplayNameValue,
  resolveGroupPublishRelayUrlsValue,
  resolveIncomingChatInboxStateValue,
  shouldPreserveExistingGroupRelaysValue
} from 'src/stores/nostr/valueUtils';
import { __nostrStoreTestUtils } from 'src/stores/nostr/testUtils';
import type {
  AuthMethod,
  ContactCursorContent,
  ContactCursorState,
  ContactProfileEventState,
  ContactRefreshLifecycle,
  ContactRelayListEventState,
  ContactRelayListFetchResult,
  CreateGroupChatInput,
  CreateGroupChatResult,
  DeveloperDiagnosticsSnapshot,
  DeveloperGroupMessageSubscriptionSnapshot,
  DeveloperPendingDeletionSnapshot,
  DeveloperPendingQueueRefreshSummary,
  DeveloperPendingReactionSnapshot,
  DeveloperPrivateMessagesSubscriptionSnapshot,
  DeveloperRelayRow,
  DeveloperRelaySnapshot,
  DeveloperSessionSnapshot,
  DeveloperTraceEntry,
  DeveloperTraceLevel,
  GiftWrappedRumorPublishResult,
  GroupIdentitySecretContent,
  MessageRow,
  NostrIdentifierResolutionResult,
  NostrNip05DataResult,
  PendingIncomingDeletion,
  PendingIncomingReaction,
  PrivateMessagesBackfillState,
  PrivatePreferences,
  PublishGroupMemberChangesResult,
  PublishUserMetadataInput,
  QueuePrivateMessageUiRefreshOptions,
  RelayConnectionState,
  RelayListMetadataEntry,
  RelayPublishStatusesResult,
  RelaySaveStatus,
  RotateGroupEpochResult,
  SendDirectMessageDeletionOptions,
  SendDirectMessageOptions,
  SendDirectMessageReactionOptions,
  SendGiftWrappedRumorOptions,
  SubscribePrivateMessagesOptions,
  SubscriptionLogName
} from 'src/stores/nostr/types';
import { useChatStore } from 'src/stores/chatStore';
import { useNip65RelayStore } from 'src/stores/nip65RelayStore';
import { useRelayStore } from 'src/stores/relayStore';
import type {
  ChatGroupEpochKey,
  ChatMetadata,
  DeletedMessageMetadata,
  GroupMemberTicketDelivery,
  MessageReplyPreview,
  MessageReaction,
  MessageRelayStatus,
  NostrEventDirection
} from 'src/types/chat';
import type { ContactMetadata, ContactRecord, ContactRelay } from 'src/types/contact';
import {
  areMessageReactionsEqual,
  buildMetaWithReactions,
  countUnseenReactionsForAuthor,
  normalizeMessageReactions
} from 'src/utils/messageReactions';
import { normalizeMessageRelayStatuses } from 'src/utils/messageRelayStatus';
import {
  mergeGroupMemberTicketDeliveries,
  normalizeGroupMemberTicketDeliveries
} from 'src/utils/groupMemberTicketDelivery';
import {
  areBrowserNotificationsEnabled,
  clearBrowserNotificationsPreference
} from 'src/utils/browserNotificationPreference';
import { clearDarkModePreference, clearPanelOpacityPreference } from 'src/utils/themeStorage';

export type {
  StartupDisplaySnapshot,
  StartupStepId,
  StartupStepSnapshot,
  StartupStepStatus
} from 'src/stores/nostr/startupState';
export type {
  AuthMethod,
  CreateGroupChatResult,
  DeveloperDiagnosticsSnapshot,
  DeveloperPendingQueueRefreshSummary,
  DeveloperTraceEntry,
  DeveloperTraceLevel,
  NostrIdentifierResolutionResult,
  NostrNip05DataResult,
  PublishGroupMemberChangesResult,
  PublishUserMetadataInput,
  RelayConnectionState,
  RelaySaveStatus,
  RotateGroupEpochResult
} from 'src/stores/nostr/types';

export type NostrNpubValidationResult = NpubValidationResult;
export type NostrNsecValidationResult = NsecValidationResult;
export type NostrPrivateKeyValidationResult = PrivateKeyValidationResult;
export { __nostrStoreTestUtils } from 'src/stores/nostr/testUtils';

export const useNostrStore = defineStore('nostrStore', () => {
  const ndk = new NDK();
  const chatStore = useChatStore();
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
    showProgress: false
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
  let nostrSubscriptionRequestCounter = 0;
  const configuredRelayUrls = new Set<string>();
  const relayConnectPromises = new Map<string, Promise<void>>();
  const relayConnectFailureCooldownUntilByUrl = new Map<string, number>();
  let connectPromise: Promise<void> | null = null;
  let hasActivatedPool = false;
  let hasRelayStatusListeners = false;
  const relayAuthFailureListenerUrls = new Set<string>();
  let restoreStartupStatePromise: Promise<void> | null = null;
  let restoreMyRelayListPromise: Promise<void> | null = null;
  let syncLoggedInContactProfilePromise: Promise<void> | null = null;
  let restorePrivateContactListPromise: Promise<void> | null = null;
  let syncRecentChatContactsPromise: Promise<void> | null = null;
  const groupContactRefreshPromises = new Map<string, Promise<ContactRecord | null>>();
  const backgroundGroupContactRefreshStartedAt = new Map<string, number>();
  const pendingIncomingReactions = new Map<string, PendingIncomingReaction[]>();
  const pendingIncomingDeletions = new Map<string, PendingIncomingDeletion[]>();
  const pendingContactCursorPublishTimers = new Map<string, ReturnType<typeof globalThis.setTimeout>>();
  const pendingContactCursorPublishStates = new Map<string, ContactCursorState>();
  const restoreRuntimeState = {
    restoreContactCursorStatePromise: null as Promise<void> | null,
    restoreGroupIdentitySecretsPromise: null as Promise<void> | null,
    restorePrivatePreferencesPromise: null as Promise<void> | null
  };
  let contactProfileSubscription: ReturnType<typeof ndk.subscribe> | null = null;
  let contactProfileSubscriptionSignature = '';
  let contactProfileApplyQueue = Promise.resolve();
  let contactRelayListSubscription: ReturnType<typeof ndk.subscribe> | null = null;
  let contactRelayListSubscriptionSignature = '';
  let contactRelayListApplyQueue = Promise.resolve();
  let myRelayListSubscription: ReturnType<typeof ndk.subscribe> | null = null;
  let myRelayListSubscriptionSignature = '';
  let myRelayListApplyQueue = Promise.resolve();
  let privateContactListSubscription: ReturnType<typeof ndk.subscribe> | null = null;
  let privateContactListSubscriptionSignature = '';
  let privateContactListApplyQueue = Promise.resolve();
  let privateMessagesSubscription: ReturnType<typeof ndk.subscribe> | null = null;
  let privateMessagesSubscriptionSignature = '';
  let privateMessagesBackfillSubscription: ReturnType<typeof ndk.subscribe> | null = null;
  let privateMessagesBackfillPromise: Promise<void> | null = null;
  let privateMessagesBackfillRunToken = 0;
  let privateMessagesBackfillSignature = '';
  let privateMessagesBackfillDelayTimerId: ReturnType<typeof globalThis.setTimeout> | null = null;
  let privateMessagesBackfillDelayResolver: (() => void) | null = null;
  const groupEpochHistoryRestorePromises = new Map<string, Promise<void>>();
  const restoredGroupEpochHistoryKeys = new Set<string>();
  let privateMessagesWatchdogTimeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
  let privateMessagesWatchdogRunPromise: Promise<void> | null = null;
  let privateMessagesWatchdogLastRecoveryAt = 0;
  let privateMessagesSubscriptionShouldBeActive = false;
  let privateMessagesEpochSubscriptionRefreshTimerId: ReturnType<typeof globalThis.setTimeout> | null = null;
  let pendingPrivateMessagesEpochSubscriptionRefreshOptions: SubscribePrivateMessagesOptions | null = null;
  let privateMessagesEpochSubscriptionRefreshQueue = Promise.resolve();
  const loggedInvalidGroupEpochConflictKeys = new Set<string>();
  let hasPrivateMessagesWatchdogOnlineListener = false;
  const privateMessagesWatchdogRelayConnectionStates = new Map<string, boolean>();
  let privateMessagesIngestQueue = Promise.resolve();
  let privateMessagesRestoreThrottleMs = 0;
  let privateMessagesUiRefreshQueue = Promise.resolve();
  let privateMessagesUiRefreshTimeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
  let shouldReloadChatsOnPrivateMessagesUiRefresh = false;
  let shouldReloadMessagesOnPrivateMessagesUiRefresh = false;
  let chatChecksQueue = Promise.resolve();
  let postPrivateMessagesEoseChecksQueue = Promise.resolve();
  let postPrivateMessagesEoseChecksTimeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
  let shouldRunPostPrivateMessagesEoseChecks = false;
  let chatChecksTimeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
  let shouldRunChatChecksForAllChats = false;
  const pendingChatCheckChatIds = new Set<string>();
  const authenticatedRelayUrls = new Set<string>();
  const pendingEventSinceState = {
    pendingEventSinceUpdate: 0
  };
  const startupRuntimeState = {
    startupDisplayShownAt: 0,
    startupDisplayTimer: null as ReturnType<typeof globalThis.setTimeout> | null,
    startupDisplayToken: 0
  };
  const developerTraceState = {
    developerTraceCounter: 0
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
    shouldApplyPrivateContactListEvent
  } = createTrackedContactStateRuntime();
  const {
    beginStartupStep,
    clearStartupDisplayTimer,
    completeStartupStep,
    createStartupBatchTracker,
    failStartupStep,
    getStartupStepSnapshot,
    resetStartupStepTracking
  } = createStartupRuntime({
    startupDisplay,
    startupState: startupRuntimeState,
    startupSteps,
    startupStepMinProgressMs: STARTUP_STEP_MIN_PROGRESS_MS
  });
  const {
    bumpDeveloperDiagnosticsVersion,
    bumpDeveloperTraceVersion,
    clearDeveloperTraceEntries,
    listDeveloperTraceEntries,
    logDeveloperTrace,
    setDeveloperDiagnosticsEnabled,
    toOptionalIsoTimestampFromUnix
  } = createDeveloperTraceRuntime({
    developerDiagnosticsEnabled,
    developerDiagnosticsStorageKey: DEVELOPER_DIAGNOSTICS_STORAGE_KEY,
    developerDiagnosticsVersion,
    developerTraceState,
    developerTraceVersion
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
    normalizeGroupIdentitySecretContent,
    normalizeTimestamp,
    readPrivateMessagesBackfillState,
    readPrivatePreferencesFromStorage,
    readStoredPrivateMessagesLastReceivedCreatedAt,
    resetEventSinceForFreshLogin,
    setStoredEventSince,
    sha256Hex,
    toComparableTimestamp,
    updateStoredEventSinceFromCreatedAt,
    updateStoredPrivateMessagesLastReceivedFromCreatedAt,
    writePrivateMessagesBackfillState,
    writePrivatePreferencesToStorage
  } = createStorageSessionRuntime({
    eventSince,
    getDefaultEventSince,
    getLoggedInSignerUser,
    isRestoringStartupState,
    ndk,
    normalizeEventId,
    pendingEventSinceState
  });

  relayStore.init();
  ensurePrivateMessagesWatchdog();

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
      epoch_privkey: epochSigner.privateKey
    };
  }

  function readFirstTagValue(
    tags: string[][],
    tagName: string
  ): string | null {
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

  function normalizeChatGroupEpochKeys(value: unknown): ChatGroupEpochKey[] {
    return normalizeChatGroupEpochKeysValue(value);
  }

  function resolveGroupChatEpochEntries(chat: Pick<ChatRow, 'meta' | 'type'>): ChatGroupEpochKey[] {
    return resolveGroupChatEpochEntriesValue(chat);
  }

  function resolveCurrentGroupChatEpochEntry(
    chat: Pick<ChatRow, 'meta' | 'type'>
  ): ChatGroupEpochKey | null {
    return resolveCurrentGroupChatEpochEntryValue(chat);
  }

  async function upsertGroupMemberTicketDelivery(
    groupPublicKey: string,
    delivery: GroupMemberTicketDelivery
  ): Promise<void> {
    const normalizedGroupPublicKey = inputSanitizerService.normalizeHexKey(groupPublicKey);
    if (!normalizedGroupPublicKey) {
      return;
    }

    const normalizedDeliveryEntries = normalizeGroupMemberTicketDeliveries([delivery]);
    const normalizedDelivery = normalizedDeliveryEntries[0] ?? null;
    if (!normalizedDelivery) {
      return;
    }

    await chatDataService.init();
    const existingChat = await chatDataService.getChatByPublicKey(normalizedGroupPublicKey);
    if (!existingChat) {
      return;
    }

    const existingDeliveries = normalizeGroupMemberTicketDeliveries(
      existingChat.meta?.[GROUP_MEMBER_TICKET_DELIVERIES_CHAT_META_KEY]
    );
    const nextDeliveries = mergeGroupMemberTicketDeliveries(
      existingDeliveries,
      normalizedDelivery
    );
    const nextMeta: ChatMetadata = {
      ...(existingChat.meta ?? {}),
      [GROUP_MEMBER_TICKET_DELIVERIES_CHAT_META_KEY]: nextDeliveries
    };

    await chatDataService.updateChat(normalizedGroupPublicKey, {
      meta: nextMeta
    });
  }

  async function appendRelayStatusesToGroupMemberTicketEvent(
    groupPublicKey: string,
    memberPublicKey: string,
    epochNumber: number,
    relayStatuses: MessageRelayStatus[],
    options: {
      event?: NostrEvent;
      direction?: NostrEventDirection;
      eventId?: string;
      createdAt?: string;
    } = {}
  ): Promise<void> {
    const normalizedGroupPublicKey = inputSanitizerService.normalizeHexKey(groupPublicKey);
    const normalizedMemberPublicKey = inputSanitizerService.normalizeHexKey(memberPublicKey);
    const normalizedEpochNumber = Number(epochNumber);
    const normalizedRelayStatuses = normalizeMessageRelayStatuses(relayStatuses);
    const normalizedEventId = normalizeEventId(
      options.eventId ?? options.event?.id ?? null
    );
    const createdAt =
      typeof options.createdAt === 'string' && options.createdAt.trim()
        ? options.createdAt.trim()
        : new Date().toISOString();

    if (
      !normalizedGroupPublicKey ||
      !normalizedMemberPublicKey ||
      !Number.isInteger(normalizedEpochNumber) ||
      normalizedEpochNumber < 0 ||
      !normalizedEventId
    ) {
      return;
    }

    await upsertGroupMemberTicketDelivery(normalizedGroupPublicKey, {
      member_public_key: normalizedMemberPublicKey,
      epoch_number: Math.floor(normalizedEpochNumber),
      event_id: normalizedEventId,
      created_at: createdAt
    });

    if (normalizedRelayStatuses.length === 0) {
      return;
    }

    await nostrEventDataService.appendRelayStatuses(normalizedEventId, normalizedRelayStatuses, {
      event: options.event
        ? {
            ...options.event,
            id: normalizedEventId
          }
        : undefined,
      direction: options.direction
    });
  }

  function findHigherKnownGroupEpochConflict(
    chat: Pick<ChatRow, 'meta' | 'type'> | null | undefined,
    incomingEpochNumber: number,
    incomingCreatedAt: string | null = null
  ): {
    higherEpochEntry: ChatGroupEpochKey;
    olderHigherEpochEntry: ChatGroupEpochKey | null;
  } | null {
    return findHigherKnownGroupEpochConflictValue(chat, incomingEpochNumber, incomingCreatedAt);
  }

  function findConflictingKnownGroupEpochNumber(
    chat: Pick<ChatRow, 'meta' | 'type'> | null | undefined,
    incomingEpochNumber: number,
    incomingEpochPublicKey: string | null | undefined
  ): ChatGroupEpochKey | null {
    return findConflictingKnownGroupEpochNumberValue(
      chat,
      incomingEpochNumber,
      incomingEpochPublicKey
    );
  }

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
      createdAt ?? ''
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
        createdAt: createdAt ?? null
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
      createdAt ?? ''
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
        createdAt: createdAt ?? null
      }
    );
  }

  function derivePublicKeyFromPrivateKey(privateKey: string): string | null {
    const normalizedPrivateKey = inputSanitizerService.normalizeHexKey(privateKey);
    if (!normalizedPrivateKey) {
      return null;
    }

    try {
      return inputSanitizerService.normalizeHexKey(new NDKPrivateKeySigner(normalizedPrivateKey).pubkey);
    } catch {
      return null;
    }
  }

  function readGiftWrapRecipientPubkey(event: Pick<NDKEvent, 'tags'>): string | null {
    const tags = Array.isArray(event.tags)
      ? event.tags.filter((tag): tag is string[] => Array.isArray(tag))
      : [];
    return readFirstTagValue(tags, 'p');
  }

  function isContactListedInPrivateContactList(
    contact: Pick<ContactRecord, 'meta'> | null | undefined
  ): boolean {
    return contact?.meta?.[PRIVATE_CONTACT_LIST_MEMBER_CONTACT_META_KEY] === true;
  }

  async function ensureContactListedInPrivateContactList(
    targetPubkeyHex: string,
    options: {
      fallbackName?: string;
      type?: 'user' | 'group';
    } = {}
  ): Promise<{
    contact: ContactRecord | null;
    didChange: boolean;
  }> {
    const normalizedTargetPubkey = inputSanitizerService.normalizeHexKey(targetPubkeyHex);
    if (!normalizedTargetPubkey) {
      return {
        contact: null,
        didChange: false
      };
    }

    await contactsService.init();
    const existingContact = await contactsService.getContactByPublicKey(normalizedTargetPubkey);
    const fallbackName =
      options.fallbackName?.trim() ||
      existingContact?.name?.trim() ||
      normalizedTargetPubkey.slice(0, 16);

    const nextMeta: ContactMetadata = {
      ...(existingContact?.meta ?? {}),
      [PRIVATE_CONTACT_LIST_MEMBER_CONTACT_META_KEY]: true
    };

    if (!existingContact) {
      const createdContact = await contactsService.createContact({
        public_key: normalizedTargetPubkey,
        ...(options.type ? { type: options.type } : {}),
        name: fallbackName,
        given_name: null,
        meta: nextMeta,
        relays: []
      });
      if (createdContact) {
        bumpContactListVersion();
      }
      return {
        contact: createdContact,
        didChange: Boolean(createdContact)
      };
    }

    const shouldUpdateType = options.type ? existingContact.type !== options.type : false;
    const shouldUpdateMeta =
      JSON.stringify(inputSanitizerService.normalizeContactMetadata(existingContact.meta ?? {})) !==
      JSON.stringify(inputSanitizerService.normalizeContactMetadata(nextMeta));

    if (!shouldUpdateType && !shouldUpdateMeta) {
      return {
        contact: existingContact,
        didChange: false
      };
    }

    const updatedContact = await contactsService.updateContact(existingContact.id, {
      ...(shouldUpdateType ? { type: options.type } : {}),
      ...(shouldUpdateMeta ? { meta: nextMeta } : {})
    });
    if (updatedContact) {
      bumpContactListVersion();
    }

    return {
      contact: updatedContact ?? existingContact,
      didChange: Boolean(updatedContact)
    };
  }

  async function reconcileAcceptedChatFromPrivateContactList(contactPublicKey: string): Promise<void> {
    const normalizedContactPublicKey = inputSanitizerService.normalizeHexKey(contactPublicKey);
    if (!normalizedContactPublicKey) {
      return;
    }

    await Promise.all([chatDataService.init(), chatStore.init()]);
    const existingChat = await chatDataService.getChatByPublicKey(normalizedContactPublicKey);
    if (!existingChat) {
      return;
    }

    const currentInboxState =
      existingChat.meta && typeof existingChat.meta.inbox_state === 'string'
        ? existingChat.meta.inbox_state.trim()
        : '';
    const acceptedAt =
      existingChat.meta && typeof existingChat.meta.accepted_at === 'string'
        ? existingChat.meta.accepted_at.trim()
        : '';
    if (currentInboxState === 'accepted' && acceptedAt) {
      return;
    }

    await chatStore.acceptChat(normalizedContactPublicKey, {
      acceptedAt: acceptedAt || new Date().toISOString()
    });
  }

  async function findGroupChatEpochContextByRecipientPubkey(epochPublicKey: string): Promise<{
    chat: ChatRow;
    epochEntry: ChatGroupEpochKey;
  } | null> {
    const normalizedEpochPublicKey = inputSanitizerService.normalizeHexKey(epochPublicKey);
    if (!normalizedEpochPublicKey) {
      return null;
    }

    await chatDataService.init();
    const chats = await chatDataService.listChats();
    for (const chat of chats) {
      if (chat.type !== 'group') {
        continue;
      }

      const epochEntry =
        resolveGroupChatEpochEntries(chat).find(
          (entry) => entry.epoch_public_key === normalizedEpochPublicKey
        ) ?? null;
      if (epochEntry) {
        return {
          chat,
          epochEntry
        };
      }
    }

    return null;
  }

  async function listPrivateMessageRecipientPubkeys(): Promise<string[]> {
    const loggedInPubkeyHex = getLoggedInPublicKeyHex();
    if (!loggedInPubkeyHex) {
      return [];
    }

    await chatDataService.init();
    const groupRecipientPubkeys = new Set<string>();
    const chats = await chatDataService.listChats();
    for (const chat of chats) {
      if (chat.type !== 'group') {
        continue;
      }

      const currentEpochEntry = resolveCurrentGroupChatEpochEntry(chat);
      const epochPublicKey = inputSanitizerService.normalizeHexKey(currentEpochEntry?.epoch_public_key ?? '');
      if (epochPublicKey && epochPublicKey !== loggedInPubkeyHex) {
        groupRecipientPubkeys.add(epochPublicKey);
      }
    }

    return [loggedInPubkeyHex, ...Array.from(groupRecipientPubkeys).sort((first, second) => first.localeCompare(second))];
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
      errorMessage: firstFailure?.detail?.trim() ?? null
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

  function buildAvatarFallback(value: string): string {
    return buildAvatarFallbackValue(value);
  }

  function resolveGroupDisplayName(groupPublicKey: string): string {
    return resolveGroupDisplayNameValue(groupPublicKey);
  }

  async function ensureGroupContactAndChat(
    groupPublicKey: string,
    encryptedPrivateKey: string,
    profile: {
      name?: string;
      about?: string;
    } = {}
  ): Promise<boolean> {
    const normalizedGroupPublicKey = inputSanitizerService.normalizeHexKey(groupPublicKey);
    const normalizedEncryptedPrivateKey =
      typeof encryptedPrivateKey === 'string' ? encryptedPrivateKey.trim() : '';
    const normalizedOwnerPublicKey = getLoggedInPublicKeyHex();
    const normalizedName = typeof profile.name === 'string' ? profile.name.trim() : '';
    const normalizedAbout = typeof profile.about === 'string' ? profile.about.trim() : '';
    if (!normalizedGroupPublicKey || !normalizedEncryptedPrivateKey || !normalizedOwnerPublicKey) {
      return false;
    }

    await Promise.all([contactsService.init(), chatDataService.init()]);

    let didChange = false;
    const fallbackName = normalizedName || resolveGroupDisplayName(normalizedGroupPublicKey);
    const existingContact = await contactsService.getContactByPublicKey(normalizedGroupPublicKey);
    const nextContactMeta: ContactMetadata = {
      ...(existingContact?.meta ?? {})
    };
    nextContactMeta[GROUP_PRIVATE_KEY_CONTACT_META_KEY] = normalizedEncryptedPrivateKey;
    nextContactMeta[GROUP_OWNER_PUBLIC_KEY_CONTACT_META_KEY] = normalizedOwnerPublicKey;
    if (normalizedName) {
      nextContactMeta.name = normalizedName;
    }
    if (normalizedAbout) {
      nextContactMeta.about = normalizedAbout;
    }

    if (!existingContact) {
      await contactsService.createContact({
        public_key: normalizedGroupPublicKey,
        type: 'group',
        name: fallbackName,
        meta: nextContactMeta,
        relays: []
      });
      didChange = true;
    } else {
      const shouldUpdateType = existingContact.type !== 'group';
      const shouldUpdateName = Boolean(normalizedName) && existingContact.name !== fallbackName;
      const shouldUpdateMeta =
        JSON.stringify(existingContact.meta ?? {}) !== JSON.stringify(nextContactMeta);

      if (shouldUpdateType || shouldUpdateName || shouldUpdateMeta) {
        await contactsService.updateContact(existingContact.id, {
          type: 'group',
          ...(shouldUpdateName ? { name: fallbackName } : {}),
          ...(shouldUpdateMeta ? { meta: nextContactMeta } : {})
        });
        didChange = true;
      }
    }

    const nextContact = await contactsService.getContactByPublicKey(normalizedGroupPublicKey);
    const groupName =
      (normalizedName || nextContact?.name?.trim() || existingContact?.name?.trim() || fallbackName);
    const existingChat = await chatDataService.getChatByPublicKey(normalizedGroupPublicKey);
    const existingChatMeta = existingChat?.meta ?? {};
    const {
      [GROUP_PRIVATE_KEY_CONTACT_META_KEY]: _groupPrivateKeyEncrypted,
      [GROUP_OWNER_PUBLIC_KEY_CONTACT_META_KEY]: _groupOwnerPublicKey,
      ...nextChatMeta
    } = existingChatMeta;

    if (!existingChat) {
      await chatDataService.createChat({
        public_key: normalizedGroupPublicKey,
        type: 'group',
        name: groupName,
        last_message: '',
        last_message_at: new Date().toISOString(),
        unread_count: 0,
        meta: {
          avatar: buildAvatarFallback(groupName),
          inbox_state: 'accepted',
          accepted_at: new Date().toISOString()
        }
      });
      didChange = true;
      return didChange;
    }
    const shouldUpdateType = existingChat.type !== 'group';
    const shouldUpdateMeta = JSON.stringify(existingChat.meta) !== JSON.stringify(nextChatMeta);
    const shouldUpdateName = existingChat.name !== groupName;
    if (shouldUpdateType || shouldUpdateMeta || shouldUpdateName) {
      await chatDataService.updateChat(normalizedGroupPublicKey, {
        type: 'group',
        ...(shouldUpdateName ? { name: groupName } : {}),
        meta: nextChatMeta
      });
      didChange = true;
    }

    return didChange;
  }

  async function ensureGroupIdentitySecretEpochState(
    groupContact: ContactRecord,
    seedRelayUrls: string[] = []
  ): Promise<{
    contact: ContactRecord;
    secret: GroupIdentitySecretContent;
  }> {
    const normalizedGroupPublicKey = inputSanitizerService.normalizeHexKey(groupContact.public_key);
    if (!normalizedGroupPublicKey || groupContact.type !== 'group') {
      throw new Error('Group contact not found.');
    }

    const encryptedGroupPrivateKey =
      groupContact.meta.group_private_key_encrypted?.trim() ?? '';
    if (!encryptedGroupPrivateKey) {
      throw new Error('Encrypted group private key not found.');
    }

    const decryptedSecret = await decryptGroupIdentitySecretContent(encryptedGroupPrivateKey);
    if (
      !decryptedSecret ||
      inputSanitizerService.normalizeHexKey(decryptedSecret.group_pubkey) !== normalizedGroupPublicKey
    ) {
      throw new Error('Failed to decrypt the group private key.');
    }

    if (
      Number.isInteger(decryptedSecret.epoch_number) &&
      Number(decryptedSecret.epoch_number) >= 0 &&
      inputSanitizerService.normalizeHexKey(decryptedSecret.epoch_privkey ?? '')
    ) {
      return {
        contact: groupContact,
        secret: {
          ...decryptedSecret,
          epoch_number: Math.floor(Number(decryptedSecret.epoch_number)),
          epoch_privkey: inputSanitizerService.normalizeHexKey(decryptedSecret.epoch_privkey ?? '') ?? undefined
        }
      };
    }

    const nextSecret: GroupIdentitySecretContent = {
      ...decryptedSecret,
      ...createInitialGroupEpochSecretState()
    };
    const nextEncryptedSecret = await encryptGroupIdentitySecretContent(nextSecret);
    const nextMeta: ContactMetadata = {
      ...(groupContact.meta ?? {}),
      [GROUP_PRIVATE_KEY_CONTACT_META_KEY]: nextEncryptedSecret
    };
    const updatedContact = await contactsService.updateContact(groupContact.id, {
      meta: nextMeta
    });
    if (!updatedContact) {
      throw new Error('Failed to persist initial group epoch state.');
    }

    bumpContactListVersion();
    try {
      await publishGroupIdentitySecret(normalizedGroupPublicKey, nextEncryptedSecret, seedRelayUrls);
    } catch (error) {
      console.warn('Failed to publish updated group epoch secret', error);
    }

    return {
      contact: updatedContact,
      secret: nextSecret
    };
  }

  async function persistIncomingGroupEpochTicket(
    groupPublicKey: string,
    epochNumber: number,
    epochPrivateKey: string,
    options: {
      fallbackName?: string;
      accepted?: boolean;
      invitationCreatedAt?: string;
      seedRelayUrls?: string[];
    } = {}
  ): Promise<void> {
    const normalizedGroupPublicKey = inputSanitizerService.normalizeHexKey(groupPublicKey);
    const normalizedEpochPrivateKey = inputSanitizerService.normalizeHexKey(epochPrivateKey);
    const normalizedEpochPublicKey = derivePublicKeyFromPrivateKey(epochPrivateKey);
    if (
      !normalizedGroupPublicKey ||
      !normalizedEpochPrivateKey ||
      !normalizedEpochPublicKey ||
      !Number.isInteger(epochNumber) ||
      epochNumber < 0
    ) {
      return;
    }

    await chatDataService.init();

    const existingChat = await chatDataService.getChatByPublicKey(normalizedGroupPublicKey);
    const existingGroupEpochKeys = normalizeChatGroupEpochKeys(
      existingChat?.meta?.[GROUP_EPOCH_KEYS_CHAT_META_KEY]
    );
    const previousEpochSignature = JSON.stringify(existingGroupEpochKeys);
    const invitationCreatedAt =
      typeof options.invitationCreatedAt === 'string' && options.invitationCreatedAt.trim()
        ? options.invitationCreatedAt.trim()
        : null;
    const conflictingEpochNumber = findConflictingKnownGroupEpochNumber(
      existingChat,
      epochNumber,
      normalizedEpochPublicKey
    );
    if (conflictingEpochNumber) {
      logConflictingIncomingEpochNumber(
        normalizedGroupPublicKey,
        epochNumber,
        normalizedEpochPublicKey,
        invitationCreatedAt,
        conflictingEpochNumber
      );
      return;
    }
    const higherEpochConflict = findHigherKnownGroupEpochConflict(
      existingChat,
      epochNumber,
      invitationCreatedAt
    );
    if (higherEpochConflict) {
      logInvalidIncomingEpochNumber(
        normalizedGroupPublicKey,
        epochNumber,
        normalizedEpochPublicKey,
        invitationCreatedAt,
        higherEpochConflict
      );
      return;
    }
    const existingEpochEntry =
      existingGroupEpochKeys.find(
        (entry) =>
          entry.epoch_number === epochNumber && entry.epoch_public_key === normalizedEpochPublicKey
      ) ?? null;
    const entriesByEpoch = new Map<number, ChatGroupEpochKey>(
      existingGroupEpochKeys.map((entry) => [entry.epoch_number, entry])
    );
    if (existingEpochEntry) {
      entriesByEpoch.set(epochNumber, {
        ...existingEpochEntry,
        ...(invitationCreatedAt ? { invitation_created_at: invitationCreatedAt } : {})
      });
    } else {
      const encryptedEpochPrivateKey = await encryptPrivateStringContent(normalizedEpochPrivateKey);
      entriesByEpoch.set(epochNumber, {
        epoch_number: epochNumber,
        epoch_public_key: normalizedEpochPublicKey,
        epoch_private_key_encrypted: encryptedEpochPrivateKey,
        ...(invitationCreatedAt ? { invitation_created_at: invitationCreatedAt } : {})
      });
    }

    const nextGroupEpochKeys = Array.from(entriesByEpoch.values()).sort(
      (first, second) => second.epoch_number - first.epoch_number
    );
    const nextEpochSignature = JSON.stringify(nextGroupEpochKeys);
    const didChangeEpochSet = previousEpochSignature !== nextEpochSignature;
    const currentEpochEntry = nextGroupEpochKeys[0] ?? null;
    const previousCurrentEpochPublicKey = inputSanitizerService.normalizeHexKey(
      typeof existingChat?.meta?.[GROUP_CURRENT_EPOCH_PUBLIC_KEY_CHAT_META_KEY] === 'string'
        ? String(existingChat.meta[GROUP_CURRENT_EPOCH_PUBLIC_KEY_CHAT_META_KEY])
        : existingGroupEpochKeys[0]?.epoch_public_key ?? ''
    );
    const nextCurrentEpochPublicKey = currentEpochEntry?.epoch_public_key ?? null;
    const fallbackName =
      typeof options.fallbackName === 'string' && options.fallbackName.trim()
        ? options.fallbackName.trim()
        : resolveGroupDisplayName(normalizedGroupPublicKey);
    const nextMeta: ChatMetadata = {
      ...(existingChat?.meta ?? {}),
      [GROUP_EPOCH_KEYS_CHAT_META_KEY]: nextGroupEpochKeys,
      [GROUP_CURRENT_EPOCH_PUBLIC_KEY_CHAT_META_KEY]: currentEpochEntry?.epoch_public_key ?? '',
      [GROUP_CURRENT_EPOCH_PRIVATE_KEY_ENCRYPTED_CHAT_META_KEY]:
        currentEpochEntry?.epoch_private_key_encrypted ?? '',
      [GROUP_CHAT_EPOCH_PUBLIC_KEY_META_KEY]: currentEpochEntry?.epoch_public_key ?? ''
    };

    if (!existingChat) {
      const createdAt = new Date().toISOString();
      await chatDataService.createChat({
        public_key: normalizedGroupPublicKey,
        type: 'group',
        name: fallbackName,
        last_message: '',
        last_message_at: createdAt,
        unread_count: 0,
        meta: {
          avatar: buildAvatarFallback(fallbackName),
          ...(options.accepted
            ? {
                inbox_state: 'accepted',
                accepted_at: createdAt
              }
            : {}),
          ...nextMeta
        }
      });
      queueEpochDrivenPrivateMessagesSubscriptionRefresh({
        seedRelayUrls: options.seedRelayUrls,
        sinceOverride: getPrivateMessagesEpochSwitchSince()
      });
      await useChatStore().reload();
      void restoreGroupEpochHistory(normalizedGroupPublicKey, normalizedEpochPublicKey);
      return;
    }

    const shouldUpdateType = existingChat.type !== 'group';
    const shouldUpdateName = existingChat.name !== fallbackName;
    const shouldUpdateMeta = JSON.stringify(existingChat.meta ?? {}) !== JSON.stringify(nextMeta);
    if (!shouldUpdateType && !shouldUpdateName && !shouldUpdateMeta) {
      return;
    }

    await chatDataService.updateChat(normalizedGroupPublicKey, {
      ...(shouldUpdateType ? { type: 'group' as const } : {}),
      ...(shouldUpdateName ? { name: fallbackName } : {}),
      ...(shouldUpdateMeta ? { meta: nextMeta } : {})
    });
    if (previousCurrentEpochPublicKey !== nextCurrentEpochPublicKey) {
      queueEpochDrivenPrivateMessagesSubscriptionRefresh({
        seedRelayUrls: options.seedRelayUrls,
        sinceOverride: getPrivateMessagesEpochSwitchSince()
      });
    }
    await useChatStore().reload();

    if (didChangeEpochSet) {
      void restoreGroupEpochHistory(normalizedGroupPublicKey, normalizedEpochPublicKey);
    }
  }

  function normalizeUniqueMemberPublicKeys(
    memberPublicKeys: string[],
    excludedPublicKeys: string[] = []
  ): string[] {
    const excludedPubkeySet = new Set(
      excludedPublicKeys
        .map((publicKey) => inputSanitizerService.normalizeHexKey(publicKey))
        .filter((publicKey): publicKey is string => Boolean(publicKey))
    );

    return Array.from(new Set(
      memberPublicKeys
        .map((memberPublicKey) => inputSanitizerService.normalizeHexKey(memberPublicKey))
        .filter((memberPublicKey): memberPublicKey is string => Boolean(memberPublicKey))
        .filter((memberPublicKey) => !excludedPubkeySet.has(memberPublicKey))
    ));
  }

  async function publishGroupEpochTickets(
    groupPublicKey: string,
    memberPublicKeys: string[],
    options: {
      rotateEpoch?: boolean;
      seedRelayUrls?: string[];
    } = {}
  ): Promise<PublishGroupMemberChangesResult> {
    const normalizedGroupPublicKey = inputSanitizerService.normalizeHexKey(groupPublicKey);
    const loggedInPubkeyHex = getLoggedInPublicKeyHex();
    if (!loggedInPubkeyHex) {
      throw new Error('Missing public key in localStorage. Login is required.');
    }

    if (!normalizedGroupPublicKey) {
      throw new Error('A valid group public key is required.');
    }

    await contactsService.init();
    const groupContact = await contactsService.getContactByPublicKey(normalizedGroupPublicKey);
    if (!groupContact || groupContact.type !== 'group') {
      throw new Error('Group contact not found.');
    }

    const normalizedOwnerPublicKey = inputSanitizerService.normalizeHexKey(
      groupContact.meta.owner_public_key ?? ''
    );
    if (!normalizedOwnerPublicKey || normalizedOwnerPublicKey !== loggedInPubkeyHex) {
      throw new Error('Only the owner can publish group membership changes.');
    }

    const seedRelayUrls = normalizeRelayStatusUrls([
      ...inputSanitizerService.normalizeStringArray(options.seedRelayUrls ?? []),
      ...getAppRelayUrls()
    ]);
    const shouldRotateEpoch = options.rotateEpoch === true;
    const { contact: currentGroupContact, secret } = await ensureGroupIdentitySecretEpochState(
      groupContact,
      seedRelayUrls
    );
    let epochNumber = Math.floor(Number(secret.epoch_number ?? -1));
    if (!Number.isInteger(epochNumber) || epochNumber < 0) {
      throw new Error('Missing current epoch state for this group.');
    }

    const publishedRelayUrls = new Set<string>();
    if (shouldRotateEpoch) {
      const nextEpochSigner = NDKPrivateKeySigner.generate();
      const nextEpochNumber = epochNumber + 1;
      if (!Number.isInteger(nextEpochNumber) || nextEpochNumber < 0) {
        throw new Error('Failed to generate the next group epoch.');
      }

      const nextSecret: GroupIdentitySecretContent = {
        ...secret,
        epoch_number: nextEpochNumber,
        epoch_privkey: nextEpochSigner.privateKey
      };
      const nextEncryptedSecret = await encryptGroupIdentitySecretContent(nextSecret);
      const updatedGroupContact = await contactsService.updateContact(currentGroupContact.id, {
        meta: {
          ...(currentGroupContact.meta ?? {}),
          [GROUP_PRIVATE_KEY_CONTACT_META_KEY]: nextEncryptedSecret
        }
      });
      if (!updatedGroupContact) {
        throw new Error('Failed to persist the new group epoch.');
      }

      await persistIncomingGroupEpochTicket(
        normalizedGroupPublicKey,
        nextEpochNumber,
        nextEpochSigner.privateKey,
        {
          fallbackName: updatedGroupContact.name,
          accepted: true,
          invitationCreatedAt: new Date().toISOString()
        }
      );

      try {
        const groupSecretSave = await publishGroupIdentitySecret(
          normalizedGroupPublicKey,
          nextEncryptedSecret,
          seedRelayUrls
        );
        for (const relayUrl of groupSecretSave.publishedRelayUrls) {
          publishedRelayUrls.add(relayUrl);
        }
      } catch (error) {
        console.warn('Failed to publish updated group identity secret after epoch rotation', error);
      }

      epochNumber = nextEpochNumber;
    }

    const normalizedMemberPubkeys = normalizeUniqueMemberPublicKeys(memberPublicKeys, [
      normalizedOwnerPublicKey
    ]);
    const normalizedTicketRecipientPubkeys = shouldRotateEpoch
      ? normalizeUniqueMemberPublicKeys([
          normalizedOwnerPublicKey,
          ...normalizedMemberPubkeys
        ])
      : normalizedMemberPubkeys;

    const failedMemberPubkeys: string[] = [];
    for (const memberPublicKey of normalizedTicketRecipientPubkeys) {
      try {
        const relaySaveStatus = await sendGroupEpochTicket(
          normalizedGroupPublicKey,
          memberPublicKey,
          seedRelayUrls
        );
        for (const relayUrl of relaySaveStatus.publishedRelayUrls) {
          publishedRelayUrls.add(relayUrl);
        }
      } catch (error) {
        failedMemberPubkeys.push(memberPublicKey);
        console.warn('Failed to publish group epoch ticket', {
          groupPublicKey: normalizedGroupPublicKey,
          memberPublicKey,
          error
        });
      }
    }

    return {
      epochNumber,
      createdNewEpoch: shouldRotateEpoch,
      attemptedMemberCount: normalizedTicketRecipientPubkeys.length,
      deliveredMemberCount: normalizedTicketRecipientPubkeys.length - failedMemberPubkeys.length,
      failedMemberPubkeys,
      publishedRelayUrls: Array.from(publishedRelayUrls.values())
    };
  }

  async function rotateGroupEpochAndSendTickets(
    groupPublicKey: string,
    memberPublicKeys: string[],
    seedRelayUrls: string[] = []
  ): Promise<RotateGroupEpochResult> {
    return publishGroupEpochTickets(groupPublicKey, memberPublicKeys, {
      rotateEpoch: true,
      seedRelayUrls
    });
  }

  async function publishGroupMemberChanges(
    groupPublicKey: string,
    memberPublicKeys: string[],
    seedRelayUrls: string[] = []
  ): Promise<PublishGroupMemberChangesResult> {
    const normalizedGroupPublicKey = inputSanitizerService.normalizeHexKey(groupPublicKey);
    const loggedInPubkeyHex = getLoggedInPublicKeyHex();
    if (!loggedInPubkeyHex) {
      throw new Error('Missing public key in localStorage. Login is required.');
    }

    if (!normalizedGroupPublicKey) {
      throw new Error('A valid group public key is required.');
    }

    await contactsService.init();
    const groupContact = await contactsService.getContactByPublicKey(normalizedGroupPublicKey);
    if (!groupContact || groupContact.type !== 'group') {
      throw new Error('Group contact not found.');
    }

    const normalizedOwnerPublicKey = inputSanitizerService.normalizeHexKey(
      groupContact.meta.owner_public_key ?? ''
    );
    if (!normalizedOwnerPublicKey || normalizedOwnerPublicKey !== loggedInPubkeyHex) {
      throw new Error('Only the owner can publish group membership changes.');
    }

    const currentMemberPubkeys = normalizeUniqueMemberPublicKeys(
      (groupContact.meta.group_members ?? []).map((member) => member.public_key),
      [normalizedOwnerPublicKey]
    );
    const nextMemberPubkeys = normalizeUniqueMemberPublicKeys(memberPublicKeys, [
      normalizedOwnerPublicKey
    ]);
    const nextMemberPubkeySet = new Set(nextMemberPubkeys);
    const currentMemberPubkeySet = new Set(currentMemberPubkeys);
    const hasRemovedMembers = currentMemberPubkeys.some(
      (memberPublicKey) => !nextMemberPubkeySet.has(memberPublicKey)
    );
    const addedMemberPubkeys = nextMemberPubkeys.filter(
      (memberPublicKey) => !currentMemberPubkeySet.has(memberPublicKey)
    );

    return publishGroupEpochTickets(
      normalizedGroupPublicKey,
      hasRemovedMembers ? nextMemberPubkeys : addedMemberPubkeys,
      {
      rotateEpoch: hasRemovedMembers,
      seedRelayUrls
      }
    );
  }

  async function sendGroupEpochTicket(
    groupPublicKey: string,
    memberPublicKey: string,
    seedRelayUrls: string[] = []
  ): Promise<RelaySaveStatus> {
    const normalizedGroupPublicKey = inputSanitizerService.normalizeHexKey(groupPublicKey);
    const normalizedMemberPublicKey = inputSanitizerService.normalizeHexKey(memberPublicKey);
    const loggedInPubkeyHex = getLoggedInPublicKeyHex();
    if (!loggedInPubkeyHex) {
      throw new Error('Missing public key in localStorage. Login is required.');
    }

    if (!normalizedGroupPublicKey || !normalizedMemberPublicKey) {
      throw new Error('A valid group public key and member public key are required.');
    }

    await contactsService.init();
    const groupContact = await contactsService.getContactByPublicKey(normalizedGroupPublicKey);
    if (!groupContact || groupContact.type !== 'group') {
      throw new Error('Group contact not found.');
    }

    const normalizedOwnerPublicKey = inputSanitizerService.normalizeHexKey(
      groupContact.meta.owner_public_key ?? ''
    );
    if (!normalizedOwnerPublicKey || normalizedOwnerPublicKey !== loggedInPubkeyHex) {
      throw new Error('Only the owner can send epoch tickets for this group.');
    }

    const { contact: updatedGroupContact, secret } = await ensureGroupIdentitySecretEpochState(
      groupContact,
      seedRelayUrls
    );
    const normalizedEpochPrivateKey = inputSanitizerService.normalizeHexKey(
      secret.epoch_privkey ?? ''
    );
    if (!normalizedEpochPrivateKey || !Number.isInteger(secret.epoch_number)) {
      throw new Error('Missing current epoch state for this group.');
    }

    const groupSigner = new NDKPrivateKeySigner(secret.group_privkey, ndk);
    const signerUser = await groupSigner.user();
    if (inputSanitizerService.normalizeHexKey(signerUser.pubkey) !== normalizedGroupPublicKey) {
      throw new Error('Decrypted group private key does not match the group public key.');
    }

    const relayUrls = resolveGroupPublishRelayUrls(updatedGroupContact.relays, seedRelayUrls);
    if (relayUrls.length === 0) {
      throw new Error('Cannot send epoch ticket without at least one group relay.');
    }

    const createdAt = Math.floor(Date.now() / 1000);
    const epochTicketEvent = new NDKEvent(ndk, {
      kind: 1014,
      created_at: createdAt,
      pubkey: normalizedGroupPublicKey,
      content: normalizedEpochPrivateKey,
      tags: [
        ['p', normalizedMemberPublicKey],
        ['epoch', String(Math.floor(Number(secret.epoch_number)))]
      ]
    });
    await epochTicketEvent.sign(groupSigner);

    const storedEpochTicketEvent = await toStoredNostrEvent(epochTicketEvent);
    const epochTicketEventId = normalizeEventId(
      storedEpochTicketEvent?.id ?? epochTicketEvent.id
    );
    const createdAtIso = toIsoTimestampFromUnix(createdAt);
    const epochNumber = Math.floor(Number(secret.epoch_number));

    if (epochTicketEventId && createdAtIso) {
      await appendRelayStatusesToGroupMemberTicketEvent(
        normalizedGroupPublicKey,
        normalizedMemberPublicKey,
        epochNumber,
        buildPendingOutboundRelayStatuses(relayUrls, 'recipient'),
        {
          event: storedEpochTicketEvent ?? undefined,
          direction: 'out',
          eventId: epochTicketEventId,
          createdAt: createdAtIso
        }
      );
    }

    let publishResult: RelayPublishStatusesResult | null = null;

    try {
      await ensureRelayConnections(relayUrls);
      const recipient = new NDKUser({ pubkey: normalizedMemberPublicKey });
      const giftWrapEvent = await giftWrapSignedEvent(epochTicketEvent, recipient, groupSigner);
      publishResult = await publishEventWithRelayStatuses(
        giftWrapEvent,
        relayUrls,
        'recipient'
      );
    } catch (error) {
      const failureDetail =
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : 'Failed to publish epoch ticket.';
      if (epochTicketEventId && createdAtIso) {
        await appendRelayStatusesToGroupMemberTicketEvent(
          normalizedGroupPublicKey,
          normalizedMemberPublicKey,
          epochNumber,
          buildFailedOutboundRelayStatuses(relayUrls, 'recipient', failureDetail),
          {
            event: storedEpochTicketEvent ?? undefined,
            direction: 'out',
            eventId: epochTicketEventId,
            createdAt: createdAtIso
          }
        );
      }
      throw error;
    }

    if (epochTicketEventId && createdAtIso) {
      await appendRelayStatusesToGroupMemberTicketEvent(
        normalizedGroupPublicKey,
        normalizedMemberPublicKey,
        epochNumber,
        publishResult.relayStatuses,
        {
          event: storedEpochTicketEvent ?? undefined,
          direction: 'out',
          eventId: epochTicketEventId,
          createdAt: createdAtIso
        }
      );
    }

    const relaySaveStatus = buildRelaySaveStatus(publishResult.relayStatuses);
    if (publishResult.error && !relaySaveStatus.errorMessage) {
      relaySaveStatus.errorMessage = publishResult.error.message;
    }

    if (
      publishResult.error &&
      !publishResult.relayStatuses.some(
        (entry) => entry.direction === 'outbound' && entry.status === 'published'
      )
    ) {
      throw publishResult.error;
    }

    void updatedGroupContact;
    return relaySaveStatus;
  }

  async function upsertIncomingGroupInviteRequestChat(
    groupPublicKey: string,
    createdAt: string,
    preview: Pick<ContactRecord, 'name' | 'meta'> | null = null
  ): Promise<void> {
    const normalizedGroupPublicKey = inputSanitizerService.normalizeHexKey(groupPublicKey);
    if (!normalizedGroupPublicKey) {
      return;
    }

    await Promise.all([chatDataService.init(), chatStore.init()]);

    const existingChat = await chatDataService.getChatByPublicKey(normalizedGroupPublicKey);
    const invitePlan = buildGroupInviteRequestPlanValue({
      groupPublicKey: normalizedGroupPublicKey,
      createdAt,
      existingChat,
      preview
    });
    if (!invitePlan) {
      return;
    }

    if (!existingChat) {
      await chatDataService.createChat({
        public_key: normalizedGroupPublicKey,
        type: 'group',
        name: invitePlan.nextName,
        last_message: GROUP_INVITE_REQUEST_MESSAGE,
        last_message_at: createdAt,
        unread_count: invitePlan.nextUnreadCount,
        meta: invitePlan.nextMeta
      });
      await chatStore.reload();
      return;
    }

    await chatDataService.updateChat(normalizedGroupPublicKey, {
      type: 'group',
      ...(existingChat.name !== invitePlan.nextName ? { name: invitePlan.nextName } : {}),
      meta: invitePlan.nextMeta
    });
    await chatDataService.updateChatPreview(
      normalizedGroupPublicKey,
      GROUP_INVITE_REQUEST_MESSAGE,
      createdAt,
      invitePlan.nextUnreadCount
    );
    await chatStore.reload();
  }

  async function ensureGroupInvitePubkeyIsContact(
    targetPubkeyHex: string,
    fallbackName = ''
  ): Promise<void> {
    const normalizedTargetPubkey = inputSanitizerService.normalizeHexKey(targetPubkeyHex);
    const loggedInPubkeyHex = getLoggedInPublicKeyHex();
    if (
      !normalizedTargetPubkey ||
      !loggedInPubkeyHex ||
      normalizedTargetPubkey === loggedInPubkeyHex
    ) {
      return;
    }

    await Promise.all([contactsService.init(), chatDataService.init()]);
    const initialName = fallbackName.trim() || resolveGroupDisplayName(normalizedTargetPubkey);
    await ensureContactStoredAsGroup(normalizedTargetPubkey, {
      fallbackName: initialName
    });
    await ensureContactListedInPrivateContactList(normalizedTargetPubkey, {
      fallbackName: initialName,
      type: 'group'
    });

    const existingChat = await chatDataService.getChatByPublicKey(normalizedTargetPubkey);
    if (existingChat) {
      const acceptedAt =
        typeof existingChat.meta?.accepted_at === 'string' && existingChat.meta.accepted_at.trim()
          ? existingChat.meta.accepted_at.trim()
          : new Date().toISOString();
      const nextChatMeta: ChatMetadata = {
        ...(existingChat.meta ?? {}),
        contact_name: initialName,
        inbox_state: 'accepted',
        accepted_at: acceptedAt
      };
      delete nextChatMeta[CHAT_REQUEST_TYPE_META_KEY];
      delete nextChatMeta[CHAT_REQUEST_MESSAGE_META_KEY];

      await chatDataService.updateChat(normalizedTargetPubkey, {
        type: 'group',
        ...(existingChat.name !== initialName ? { name: initialName } : {}),
        meta: nextChatMeta
      });
    }

    try {
      await subscribePrivateMessagesForLoggedInUser(true);
    } catch (error) {
      console.warn(
        'Failed to refresh private messages after accepting group invite',
        normalizedTargetPubkey,
        error
      );
    }

    try {
      await refreshGroupContactByPublicKey(normalizedTargetPubkey, initialName);
    } catch (error) {
      console.warn('Failed to refresh accepted group invite profile', normalizedTargetPubkey, error);
      await useChatStore().syncContactProfile(normalizedTargetPubkey);
    }

    bumpContactListVersion();
    await useChatStore().reload();

    try {
      await publishPrivateContactList(getAppRelayUrls());
    } catch (error) {
      console.warn('Failed to publish private contact list after accepting group invite', error);
    }
  }

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

  async function flushPrivateMessagesUiRefresh(): Promise<void> {
    const shouldReloadChats = shouldReloadChatsOnPrivateMessagesUiRefresh;
    const shouldReloadMessages = shouldReloadMessagesOnPrivateMessagesUiRefresh;
    shouldReloadChatsOnPrivateMessagesUiRefresh = false;
    shouldReloadMessagesOnPrivateMessagesUiRefresh = false;

    if (!shouldReloadChats && !shouldReloadMessages) {
      return;
    }

    try {
      const tasks: Promise<unknown>[] = [];

      if (shouldReloadChats) {
        tasks.push(chatStore.reload());
      }

      if (shouldReloadMessages) {
        const { useMessageStore } = await import('src/stores/messageStore');
        tasks.push(useMessageStore().reloadLoadedMessages());
      }

      await Promise.all(tasks);
    } catch (error) {
      console.error('Failed to flush private message UI refresh', error);
    }
  }

  function queuePrivateMessagesUiRefresh(options: QueuePrivateMessageUiRefreshOptions = {}): void {
    if (options.reloadChats) {
      shouldReloadChatsOnPrivateMessagesUiRefresh = true;
    }

    if (options.reloadMessages) {
      shouldReloadMessagesOnPrivateMessagesUiRefresh = true;
    }

    const throttleMs = normalizeThrottleMs(options.throttleMs);
    if (throttleMs <= 0) {
      privateMessagesUiRefreshQueue = privateMessagesUiRefreshQueue.then(() =>
        flushPrivateMessagesUiRefresh()
      );
      return;
    }

    if (privateMessagesUiRefreshTimeoutId !== null) {
      return;
    }

    privateMessagesUiRefreshTimeoutId = globalThis.setTimeout(() => {
      privateMessagesUiRefreshTimeoutId = null;
      privateMessagesUiRefreshQueue = privateMessagesUiRefreshQueue.then(() =>
        flushPrivateMessagesUiRefresh()
      );
    }, throttleMs);
  }

  function flushPrivateMessagesUiRefreshNow(): void {
    if (privateMessagesUiRefreshTimeoutId !== null) {
      globalThis.clearTimeout(privateMessagesUiRefreshTimeoutId);
      privateMessagesUiRefreshTimeoutId = null;
    }

    privateMessagesUiRefreshQueue = privateMessagesUiRefreshQueue.then(() =>
      flushPrivateMessagesUiRefresh()
    );
  }

  async function runPendingChatChecks(): Promise<void> {
    try {
      await chatDataService.init();
      let chatIds: string[] = [];

      if (shouldRunChatChecksForAllChats) {
        const chatRows = await chatDataService.listChats();
        chatIds = chatRows
          .map((row) => inputSanitizerService.normalizeHexKey(row.public_key))
          .filter((value): value is string => Boolean(value));
      } else {
        chatIds = Array.from(pendingChatCheckChatIds);
      }

      shouldRunChatChecksForAllChats = false;
      pendingChatCheckChatIds.clear();

      if (chatIds.length === 0) {
        return;
      }

      await chatStore.reload();
      const { useMessageStore } = await import('src/stores/messageStore');
      const messageStore = useMessageStore();

      for (const chatId of chatIds) {
        try {
          await messageStore.syncChatUnseenReactionCount(chatId);
        } catch (error) {
          console.warn('Failed to sync unseen reaction count during chat checks', chatId, error);
        }
      }

      await messageStore.reloadLoadedMessages();
    } catch (error) {
      console.error('Failed to run chat checks', error);
    }
  }

  function scheduleChatChecks(chatIds: string[] = [], options: { allChats?: boolean } = {}): void {
    if (options.allChats) {
      shouldRunChatChecksForAllChats = true;
      pendingChatCheckChatIds.clear();
    } else if (!shouldRunChatChecksForAllChats) {
      for (const chatId of chatIds) {
        const normalizedChatId = inputSanitizerService.normalizeHexKey(chatId);
        if (normalizedChatId) {
          pendingChatCheckChatIds.add(normalizedChatId);
        }
      }
    }

    if (chatChecksTimeoutId !== null) {
      return;
    }

    chatChecksTimeoutId = globalThis.setTimeout(() => {
      chatChecksTimeoutId = null;
      chatChecksQueue = chatChecksQueue.then(() => runPendingChatChecks());
    }, 0);
  }

  function schedulePostPrivateMessagesEoseChecks(): void {
    shouldRunPostPrivateMessagesEoseChecks = true;
    if (postPrivateMessagesEoseChecksTimeoutId !== null) {
      return;
    }

    postPrivateMessagesEoseChecksTimeoutId = globalThis.setTimeout(() => {
      postPrivateMessagesEoseChecksTimeoutId = null;
      if (!shouldRunPostPrivateMessagesEoseChecks) {
        return;
      }

      shouldRunPostPrivateMessagesEoseChecks = false;
      postPrivateMessagesEoseChecksQueue = postPrivateMessagesEoseChecksQueue
        .then(async () => {
          try {
            await privateMessagesIngestQueue.catch((error) => {
              console.error('Failed while draining private message ingest queue before EOSE checks', error);
            });

            await refreshDeveloperPendingQueues();
            const { useMessageStore } = await import('src/stores/messageStore');
            await useMessageStore().syncChatsReadStateFromSeenBoundary();
            scheduleChatChecks([], { allChats: true });
          } catch (error) {
            console.error('Failed to run post-DM EOSE checks', error);
          }
        })
        .catch((error) => {
          console.error('Failed to enqueue post-DM EOSE checks', error);
        });
    }, 0);
  }

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

  async function restoreStartupState(seedRelayUrls: string[] = []): Promise<void> {
    if (restoreStartupStatePromise) {
      return restoreStartupStatePromise;
    }

    ensureStoredEventSince();
    resetStartupStepTracking();

    const runStartupTask = async (
      errorMessage: string,
      task: () => Promise<void>
    ): Promise<void> => {
      try {
        await task();
      } catch (error) {
        console.error(errorMessage, error);
      }
    };

    isRestoringStartupState.value = true;
    restoreStartupStatePromise = (async () => {
      try {
        await runStartupTask('Failed to resolve stale relay statuses on startup', () =>
          resolveStalePendingOutboundMessageRelayStatuses()
        );
        await runStartupTask('Failed to sync logged-in contact on startup', () =>
          syncLoggedInContactProfile(seedRelayUrls)
        );
        await runStartupTask('Failed to restore My Relays on startup', () =>
          restoreMyRelayList(seedRelayUrls)
        );
        await runStartupTask('Failed to subscribe to My Relays updates on startup', () =>
          subscribeMyRelayListUpdates(seedRelayUrls)
        );
        await runStartupTask('Failed to restore private preferences on startup', () =>
          restorePrivatePreferences(seedRelayUrls)
        );
        await runStartupTask('Failed to restore private contact list on startup', () =>
          restorePrivateContactList(seedRelayUrls)
        );
        await runStartupTask('Failed to restore group identity secrets on startup', () =>
          restoreGroupIdentitySecrets(seedRelayUrls)
        );
        await runStartupTask('Failed to refresh group relay lists on startup', () =>
          refreshGroupRelayListsOnStartup(seedRelayUrls)
        );
        await runStartupTask('Failed to restore contact cursor state on startup', () =>
          restoreContactCursorState(seedRelayUrls)
        );
        await runStartupTask('Failed to subscribe to private contact list updates on startup', () =>
          subscribePrivateContactListUpdates(seedRelayUrls)
        );
        await runStartupTask('Failed to subscribe to private messages on startup', () =>
          subscribePrivateMessagesForLoggedInUser()
        );
        await runStartupTask('Failed to sync recent chat contacts on startup', () =>
          syncRecentChatContacts(seedRelayUrls)
        );
        await runStartupTask('Failed to subscribe to contact profile updates on startup', () =>
          subscribeContactProfileUpdates(seedRelayUrls)
        );
        await runStartupTask('Failed to subscribe to contact relay list updates on startup', () =>
          subscribeContactRelayListUpdates(seedRelayUrls)
        );
      } finally {
        isRestoringStartupState.value = false;
        flushPendingEventSinceUpdate();
        restoreStartupStatePromise = null;
      }
    })();

    return restoreStartupStatePromise;
  }

  function getStoredAuthMethod(): AuthMethod | null {
    if (!hasStorage()) {
      return null;
    }

    const stored = window.localStorage.getItem(AUTH_METHOD_STORAGE_KEY)?.trim().toLowerCase();
    if (stored === 'nsec' || stored === 'nip07') {
      return stored;
    }

    return getPrivateKeyHex() ? 'nsec' : null;
  }

  function getLoggedInPublicKeyHex(): string | null {
    if (!hasStorage()) {
      return null;
    }

    const stored = window.localStorage.getItem(PUBLIC_KEY_STORAGE_KEY)?.trim();
    if (!stored) {
      return null;
    }

    const fromHex = inputSanitizerService.normalizeHexKey(stored);
    if (fromHex) {
      return fromHex;
    }

    return validateNpub(stored).normalizedPubkey;
  }

  function hasNip07Extension(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof window.nostr?.getPublicKey === 'function' &&
      typeof window.nostr?.signEvent === 'function'
    );
  }

  function encodeNpub(pubkeyHex: string): string | null {
    try {
      return nip19.npubEncode(pubkeyHex);
    } catch {
      return null;
    }
  }

  function encodeNprofile(pubkeyHex: string): string | null {
    try {
      return nip19.nprofileEncode({
        pubkey: pubkeyHex
      });
    } catch {
      return null;
    }
  }

  function relaySignature(relays: string[]): string {
    return [...relays].sort((a, b) => a.localeCompare(b)).join('|');
  }

  function formatSubscriptionLogValue(value: string | null | undefined): string | null {
    const normalizedValue = value?.trim() ?? '';
    if (!normalizedValue) {
      return null;
    }

    if (normalizedValue.length <= 18) {
      return normalizedValue;
    }

    return `${normalizedValue.slice(0, 8)}...${normalizedValue.slice(-8)}`;
  }

  function buildSubscriptionRelayDetails(relayUrls: string[]): Record<string, unknown> {
    return {
      relayCount: relayUrls.length,
      relayUrls
    };
  }

  function buildSubscriptionEventDetails(event: Pick<NDKEvent, 'id' | 'kind' | 'created_at' | 'pubkey'>): Record<string, unknown> {
    return {
      eventId: formatSubscriptionLogValue(event.id),
      kind: event.kind ?? null,
      createdAt: event.created_at ?? null,
      author: formatSubscriptionLogValue(event.pubkey)
    };
  }

  function buildLoggedNostrEvent(
    event: Pick<NDKEvent, 'id' | 'kind' | 'created_at' | 'pubkey' | 'content' | 'tags'>,
    storedEvent: NostrEvent | null | undefined = null
  ): Record<string, unknown> {
    if (storedEvent) {
      return JSON.parse(JSON.stringify(storedEvent)) as Record<string, unknown>;
    }

    return {
      id: normalizeEventId(event.id ?? null) ?? event.id ?? null,
      kind: event.kind ?? null,
      created_at: Number.isInteger(event.created_at) ? Number(event.created_at) : null,
      pubkey: inputSanitizerService.normalizeHexKey(event.pubkey ?? '') ?? event.pubkey ?? null,
      content: typeof event.content === 'string' ? event.content : '',
      tags: Array.isArray(event.tags)
        ? event.tags
            .filter((tag): tag is string[] => Array.isArray(tag))
            .map((tag) => tag.map((value) => String(value ?? '')))
        : []
    };
  }

  async function buildTrackedContactSubscriptionTargetDetails(
    contactPubkeys: string[]
  ): Promise<Record<string, unknown>> {
    const normalizedContactPubkeys = Array.from(
      new Set(
        contactPubkeys
          .map((pubkey) => inputSanitizerService.normalizeHexKey(pubkey))
          .filter((pubkey): pubkey is string => Boolean(pubkey))
      )
    );
    if (normalizedContactPubkeys.length === 0) {
      return {
        userTargetCount: 0,
        groupTargetCount: 0,
        userTargetPubkeys: [],
        groupTargetPubkeys: []
      };
    }

    await Promise.all([contactsService.init(), chatDataService.init()]);
    const groupChatPubkeys = new Set(
      (await chatDataService.listChats())
        .filter((chat) => chat.type === 'group')
        .map((chat) => inputSanitizerService.normalizeHexKey(chat.public_key))
        .filter((pubkey): pubkey is string => Boolean(pubkey))
    );
    const contactsByPubkey = new Map(
      (await contactsService.listContacts())
        .map((contact) => {
          const normalizedPubkey = inputSanitizerService.normalizeHexKey(contact.public_key);
          return normalizedPubkey ? ([normalizedPubkey, contact] as const) : null;
        })
        .filter((entry): entry is readonly [string, ContactRecord] => Boolean(entry))
    );

    const userTargetPubkeys: string[] = [];
    const groupTargetPubkeys: string[] = [];

    for (const pubkey of normalizedContactPubkeys) {
      const formattedPubkey = formatSubscriptionLogValue(pubkey) ?? pubkey;
      if (groupChatPubkeys.has(pubkey) || contactsByPubkey.get(pubkey)?.type === 'group') {
        groupTargetPubkeys.push(formattedPubkey);
        continue;
      }

      userTargetPubkeys.push(formattedPubkey);
    }

    return {
      userTargetCount: userTargetPubkeys.length,
      groupTargetCount: groupTargetPubkeys.length,
      userTargetPubkeys,
      groupTargetPubkeys
    };
  }

  async function buildPrivateMessageSubscriptionTargetDetails(
    recipientPubkeys: string[],
    loggedInPubkeyHex: string | null
  ): Promise<Record<string, unknown>> {
    const normalizedLoggedInPubkey = inputSanitizerService.normalizeHexKey(loggedInPubkeyHex ?? '');
    const normalizedRecipientPubkeys = Array.from(
      new Set(
        recipientPubkeys
          .map((pubkey) => inputSanitizerService.normalizeHexKey(pubkey))
          .filter((pubkey): pubkey is string => Boolean(pubkey))
      )
    );
    const recipientSet = new Set(normalizedRecipientPubkeys);

    await chatDataService.init();
    const userRecipientPubkeys =
      normalizedLoggedInPubkey && recipientSet.has(normalizedLoggedInPubkey)
        ? [formatSubscriptionLogValue(normalizedLoggedInPubkey) ?? normalizedLoggedInPubkey]
        : [];
    const matchedEpochRecipientPubkeys = new Set<string>();
    const groupChatPubkeys = new Set<string>();
    const epochRecipients: Array<{
      groupChatPubkey: string;
      epochRecipientPubkey: string;
      epochNumber: number;
    }> = [];

    const chats = await chatDataService.listChats();
    for (const chat of chats) {
      if (chat.type !== 'group') {
        continue;
      }

      const normalizedGroupChatPubkey = inputSanitizerService.normalizeHexKey(chat.public_key);
      if (!normalizedGroupChatPubkey) {
        continue;
      }

      for (const entry of resolveGroupChatEpochEntries(chat)) {
        const normalizedEpochPubkey = inputSanitizerService.normalizeHexKey(entry.epoch_public_key);
        if (!normalizedEpochPubkey || !recipientSet.has(normalizedEpochPubkey)) {
          continue;
        }

        matchedEpochRecipientPubkeys.add(normalizedEpochPubkey);
        groupChatPubkeys.add(formatSubscriptionLogValue(normalizedGroupChatPubkey) ?? normalizedGroupChatPubkey);
        epochRecipients.push({
          groupChatPubkey: formatSubscriptionLogValue(normalizedGroupChatPubkey) ?? normalizedGroupChatPubkey,
          epochRecipientPubkey: formatSubscriptionLogValue(normalizedEpochPubkey) ?? normalizedEpochPubkey,
          epochNumber: entry.epoch_number
        });
      }
    }

    const unclassifiedRecipientPubkeys = normalizedRecipientPubkeys
      .filter(
        (pubkey) =>
          pubkey !== normalizedLoggedInPubkey && !matchedEpochRecipientPubkeys.has(pubkey)
      )
      .map((pubkey) => formatSubscriptionLogValue(pubkey) ?? pubkey);

    return {
      userRecipientCount: userRecipientPubkeys.length,
      groupChatCount: groupChatPubkeys.size,
      epochRecipientCount: epochRecipients.length,
      unclassifiedRecipientCount: unclassifiedRecipientPubkeys.length,
      userRecipientPubkeys,
      groupChatPubkeys: Array.from(groupChatPubkeys),
      epochRecipients,
      unclassifiedRecipientPubkeys
    };
  }

  function buildNostrReqFrame(
    subId: string,
    filters: NDKFilter | NDKFilter[]
  ): unknown[] {
    const normalizedFilters = Array.isArray(filters) ? filters : [filters];
    const serializedFilters = normalizedFilters.map((filter) =>
      JSON.parse(JSON.stringify(filter)) as Record<string, unknown>
    );

    return ['REQ', subId, ...serializedFilters];
  }

  function createLoggedSubscriptionSubId(label: string): string {
    nostrSubscriptionRequestCounter += 1;
    const normalizedLabel = label.trim().replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '') || 'subscription';
    return `${normalizedLabel}-${nostrSubscriptionRequestCounter.toString(36)}`;
  }

  function subscribeWithReqLogging(
    name: SubscriptionLogName,
    label: string,
    filters: NDKFilter | NDKFilter[],
    options: NDKSubscriptionOptions,
    details: Record<string, unknown> = {}
  ): ReturnType<typeof ndk.subscribe> {
    const subId = createLoggedSubscriptionSubId(label);
    const subscription = ndk.subscribe(filters, {
      ...options,
      subId
    });
    const reqFrame = buildNostrReqFrame(subId, subscription.filters);

    logDeveloperTrace('info', `subscription:${name}`, 'req', {
      subId,
      reqFrame,
      ...details
    });

    return subscription;
  }

  function logSubscription(
    name: SubscriptionLogName,
    phase: string,
    details: Record<string, unknown> = {}
  ): void {
    logDeveloperTrace('info', `subscription:${name}`, phase, details);
  }

  function buildFilterSinceDetails(since: number | undefined): Record<string, unknown> {
    const normalizedSince = Number.isInteger(since) ? Number(since) : null;
    return {
      since: normalizedSince,
      sinceIso:
        normalizedSince && normalizedSince > 0
          ? new Date(normalizedSince * 1000).toISOString()
          : null
    };
  }

  function buildFilterUntilDetails(until: number | undefined): Record<string, unknown> {
    const normalizedUntil = Number.isInteger(until) ? Number(until) : null;
    return {
      until: normalizedUntil,
      untilIso:
        normalizedUntil && normalizedUntil > 0
          ? new Date(normalizedUntil * 1000).toISOString()
          : null
    };
  }

  function buildInboundTraceDetails(options: {
    wrappedEvent?: Pick<NDKEvent, 'id' | 'kind' | 'created_at'> | null;
    rumorEvent?: Pick<NDKEvent, 'id' | 'kind' | 'created_at'> | null;
    loggedInPubkeyHex?: string | null;
    senderPubkeyHex?: string | null;
    chatPubkey?: string | null;
    targetEventId?: string | null;
    relayUrls?: string[];
    recipients?: string[];
  } = {}): Record<string, unknown> {
    const relayUrls = Array.isArray(options.relayUrls)
      ? options.relayUrls.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    const recipients = Array.isArray(options.recipients)
      ? options.recipients.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    const wrappedEventId =
      normalizeEventId(options.wrappedEvent?.id ?? null) ?? options.wrappedEvent?.id ?? null;
    const rumorEventId =
      normalizeEventId(options.rumorEvent?.id ?? null) ?? options.rumorEvent?.id ?? null;
    const createdAt = options.rumorEvent?.created_at ?? options.wrappedEvent?.created_at;
    const normalizedCreatedAt = Number.isInteger(createdAt) ? Number(createdAt) : null;

    return {
      wrappedEventId: formatSubscriptionLogValue(wrappedEventId),
      wrappedKind: options.wrappedEvent?.kind ?? null,
      rumorEventId: formatSubscriptionLogValue(rumorEventId),
      rumorKind: options.rumorEvent?.kind ?? null,
      createdAt: normalizedCreatedAt,
      createdAtIso:
        normalizedCreatedAt && normalizedCreatedAt > 0
          ? new Date(normalizedCreatedAt * 1000).toISOString()
          : null,
      senderPubkey: formatSubscriptionLogValue(options.senderPubkeyHex),
      loggedInPubkey: formatSubscriptionLogValue(options.loggedInPubkeyHex),
      chatPubkey: formatSubscriptionLogValue(options.chatPubkey),
      targetEventId: formatSubscriptionLogValue(options.targetEventId),
      relayCount: relayUrls.length,
      relayUrls,
      ...(recipients.length > 0
        ? {
            recipientCount: recipients.length,
            recipients: recipients.map((value) => formatSubscriptionLogValue(value))
          }
        : {})
    };
  }

  function logInboundEvent(stage: string, details: Record<string, unknown> = {}): void {
    logDeveloperTrace('info', 'inbound', stage, details);
  }

  function bumpContactListVersion(): void {
    contactListVersion.value += 1;
  }

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

  function deriveChatName(contact: ContactRecord | null, publicKey: string): string {
    const displayName = contact?.meta.display_name?.trim() ?? '';
    if (displayName) {
      return displayName;
    }

    const profileName = contact?.meta.name?.trim() ?? '';
    if (profileName) {
      return profileName;
    }

    const contactName = contact?.name?.trim() ?? '';
    if (contactName) {
      return contactName;
    }

    return publicKey.slice(0, 16);
  }

  function buildBrowserNotificationMessagePreview(messageText: string): string {
    const normalizedText = messageText.replace(/\s+/g, ' ').trim();
    if (!normalizedText) {
      return 'New message';
    }

    if (normalizedText.length <= 140) {
      return normalizedText;
    }

    return `${normalizedText.slice(0, 137)}...`;
  }

  function buildChatNotificationHref(chatPubkey: string): string | null {
    if (typeof window === 'undefined') {
      return null;
    }

    const normalizedBase = (() => {
      const base = process.env.VUE_ROUTER_BASE?.trim() || '/';
      return base.endsWith('/') ? base : `${base}/`;
    })();
    const encodedChatPubkey = encodeURIComponent(chatPubkey);

    if (process.env.VUE_ROUTER_MODE === 'hash') {
      return `${window.location.origin}${normalizedBase}#/chats/${encodedChatPubkey}`;
    }

    return `${window.location.origin}${normalizedBase}chats/${encodedChatPubkey}`;
  }

  function shouldSuppressIncomingMessageBrowserNotification(chatPubkey: string): boolean {
    if (isRestoringStartupState.value || !areBrowserNotificationsEnabled()) {
      return true;
    }

    if (typeof document === 'undefined') {
      return false;
    }

    return (
      document.visibilityState === 'visible' &&
      document.hasFocus() &&
      chatStore.visibleChatId === chatPubkey
    );
  }

  async function shouldNotifyForAcceptedChatOnly(
    chatPubkey: string,
    chatMeta: Record<string, unknown> | null | undefined
  ): Promise<boolean> {
    const inboxState =
      chatMeta && typeof chatMeta.inbox_state === 'string' ? chatMeta.inbox_state.trim() : '';
    if (inboxState === 'blocked') {
      return false;
    }

    if (inboxState === 'accepted') {
      return true;
    }

    const acceptedAt =
      chatMeta && typeof chatMeta.accepted_at === 'string' ? chatMeta.accepted_at.trim() : '';
    if (acceptedAt) {
      return true;
    }

    const lastOutgoingMessageAt =
      chatMeta && typeof chatMeta.last_outgoing_message_at === 'string'
        ? chatMeta.last_outgoing_message_at.trim()
        : '';
    if (lastOutgoingMessageAt) {
      return true;
    }

    const loggedInPubkeyHex = getLoggedInPublicKeyHex();
    if (!loggedInPubkeyHex) {
      return false;
    }

    try {
      const messageRows = await chatDataService.listMessages(chatPubkey);
      return messageRows.some(
        (messageRow) =>
          inputSanitizerService.normalizeHexKey(messageRow.author_public_key) === loggedInPubkeyHex
      );
    } catch (error) {
      console.warn(
        'Failed to confirm accepted-chat state for browser notification eligibility',
        error
      );
      return false;
    }
  }

  function showIncomingMessageBrowserNotification(options: {
    chatPubkey: string;
    title: string;
    messageText: string;
    iconUrl?: string;
  }): void {
    if (typeof window === 'undefined' || shouldSuppressIncomingMessageBrowserNotification(options.chatPubkey)) {
      return;
    }

    try {
      const notification = new window.Notification(options.title, {
        body: buildBrowserNotificationMessagePreview(options.messageText),
        ...(options.iconUrl ? { icon: options.iconUrl } : {})
      });

      notification.onclick = () => {
        notification.close();
        window.focus();

        const href = buildChatNotificationHref(options.chatPubkey);
        if (href) {
          window.location.assign(href);
        }
      };
    } catch (error) {
      console.warn('Failed to show browser notification for incoming message', error);
    }
  }

  function createDirectMessageRumorEvent(
    senderPubkey: string,
    recipientPubkey: string,
    message: string,
    createdAt: number,
    replyToEventId?: string | null
  ): NDKEvent {
    const tags: string[][] = [['p', recipientPubkey]];
    const normalizedReplyTargetEventId = normalizeEventId(replyToEventId);
    if (normalizedReplyTargetEventId) {
      tags.push(['e', normalizedReplyTargetEventId, '', 'reply']);
    }

    return new NDKEvent(ndk, {
      kind: NDKKind.PrivateDirectMessage,
      created_at: createdAt,
      pubkey: senderPubkey,
      content: message,
      tags
    });
  }

  function createReactionRumorEvent(
    senderPubkey: string,
    recipientPubkey: string,
    emoji: string,
    targetEventId: string,
    targetAuthorPubkey: string,
    targetKind: number,
    createdAt: number
  ): NDKEvent {
    return new NDKEvent(ndk, {
      kind: NDKKind.Reaction,
      created_at: createdAt,
      pubkey: senderPubkey,
      content: emoji,
      tags: [
        ['p', recipientPubkey],
        ['e', targetEventId],
        ['p', targetAuthorPubkey],
        ['k', String(targetKind)]
      ]
    });
  }

  function createEventDeletionRumorEvent(
    senderPubkey: string,
    recipientPubkey: string,
    targetEventId: string,
    targetKind: number,
    createdAt: number
  ): NDKEvent {
    return new NDKEvent(ndk, {
      kind: NDKKind.EventDeletion,
      created_at: createdAt,
      pubkey: senderPubkey,
      content: '',
      tags: [
        ['p', recipientPubkey],
        ['e', targetEventId],
        ['k', String(targetKind)]
      ]
    });
  }

  function createStoredSignedEvent(event: NostrEvent): NDKEvent | null {
    const pubkey = inputSanitizerService.normalizeHexKey(event.pubkey);
    if (!pubkey) {
      return null;
    }

    const tags = Array.isArray(event.tags)
      ? event.tags
          .filter((tag): tag is string[] => Array.isArray(tag))
          .map((tag) => tag.map((entry) => String(entry)))
      : [];

    return new NDKEvent(ndk, {
      kind: typeof event.kind === 'number' ? event.kind : NDKKind.PrivateDirectMessage,
      created_at: event.created_at,
      pubkey,
      content: event.content,
      tags,
      ...(event.id?.trim() ? { id: event.id.trim() } : {}),
      ...(event.sig?.trim() ? { sig: event.sig.trim() } : {})
    });
  }

  function createStoredDirectMessageRumorEvent(event: NostrEvent): NDKEvent | null {
    return createStoredSignedEvent(event);
  }

  function approximateGiftWrapNow(drift = 5): number {
    return Math.round(Date.now() / 1000 - Math.random() * 10 ** drift);
  }

  async function giftWrapSignedEvent(
    event: NDKEvent,
    recipient: NDKUser,
    signer: NDKSigner
  ): Promise<NDKEvent> {
    if (!event.sig) {
      throw new Error('Signed event is required before gift wrapping.');
    }

    const invitationProof = event.sig.trim();
    if (!invitationProof) {
      throw new Error('Signed event is missing a valid signature.');
    }

    const rumorPayload: NostrEvent = {
      created_at: event.created_at ?? Math.floor(Date.now() / 1000),
      content: event.content,
      tags: event.tags.map((tag) => [...tag]),
      kind: event.kind,
      pubkey: event.pubkey,
      ...(event.id?.trim() ? { id: event.id.trim() } : {})
    };

    const sealEvent = new NDKEvent(ndk, {
      kind: NDKKind.GiftWrapSeal,
      created_at: approximateGiftWrapNow(),
      pubkey: event.pubkey,
      content: JSON.stringify(rumorPayload),
      tags: [[INVITATION_PROOF_TAG, invitationProof]]
    });
    await sealEvent.encrypt(recipient, signer, 'nip44');
    await sealEvent.sign(signer);

    const wrapSigner = NDKPrivateKeySigner.generate();
    const giftWrapEvent = new NDKEvent(ndk, {
      kind: NDKKind.GiftWrap,
      created_at: approximateGiftWrapNow(),
      content: JSON.stringify(sealEvent.rawEvent()),
      tags: [['p', recipient.pubkey]]
    });
    await giftWrapEvent.encrypt(recipient, wrapSigner, 'nip44');
    await giftWrapEvent.sign(wrapSigner);

    return giftWrapEvent;
  }

  async function unwrapGiftWrapSealEvent(wrappedEvent: NDKEvent): Promise<NostrEvent | null> {
    const normalizedContent = wrappedEvent.content.trim();
    const wrapAuthorPubkey = inputSanitizerService.normalizeHexKey(wrappedEvent.pubkey ?? '');
    if (!normalizedContent || !wrapAuthorPubkey) {
      return null;
    }

    ndk.assertSigner();
    const wrapAuthor = new NDKUser({ pubkey: wrapAuthorPubkey });
    const decryptedContent = await ndk.signer.decrypt(wrapAuthor, normalizedContent, 'nip44');

    try {
      const rawSeal = JSON.parse(decryptedContent) as Partial<NostrEvent>;
      const sealEvent = new NDKEvent(ndk, rawSeal);
      if (!sealEvent.verifySignature(false)) {
        return null;
      }

      return await toStoredNostrEvent(sealEvent);
    } catch {
      return null;
    }
  }

  async function verifyIncomingGroupEpochTicket(
    rumorEvent: NDKEvent,
    sealEvent: NostrEvent | null
  ): Promise<{
    isValid: boolean;
    signedEvent: NostrEvent | null;
    epochNumber: number | null;
    epochPrivateKey: string | null;
  }> {
    const sealTags = Array.isArray(sealEvent?.tags)
      ? sealEvent.tags.filter((tag): tag is string[] => Array.isArray(tag))
      : [];
    const invitationProof = readFirstTagValue(sealTags, INVITATION_PROOF_TAG);
    const epochNumber = readEpochNumberTag(rumorEvent.tags);
    const epochPrivateKey = inputSanitizerService.normalizeHexKey(rumorEvent.content ?? '');
    if (!invitationProof || epochNumber === null || !epochPrivateKey) {
      return {
        isValid: false,
        signedEvent: null,
        epochNumber,
        epochPrivateKey
      };
    }

    const signedEvent = new NDKEvent(ndk, {
      created_at: rumorEvent.created_at,
      content: rumorEvent.content,
      tags: rumorEvent.tags.map((tag) => [...tag]),
      kind: rumorEvent.kind,
      pubkey: rumorEvent.pubkey,
      ...(rumorEvent.id?.trim() ? { id: rumorEvent.id.trim() } : {}),
      sig: invitationProof
    });
    const isValid = signedEvent.verifySignature(false) === true;

    return {
      isValid,
      signedEvent: isValid ? await toStoredNostrEvent(signedEvent) : null,
      epochNumber,
      epochPrivateKey
    };
  }

  async function resolveIncomingPrivateMessageRecipientContext(
    wrappedEvent: NDKEvent,
    loggedInPubkeyHex: string
  ): Promise<{
    recipientPubkey: string;
    unwrapSigner: NDKSigner;
    groupChatPublicKey: string | null;
  } | null> {
    const wrappedRecipientPubkey = inputSanitizerService.normalizeHexKey(
      readGiftWrapRecipientPubkey(wrappedEvent) ?? ''
    );
    if (!wrappedRecipientPubkey) {
      return null;
    }

    if (wrappedRecipientPubkey === loggedInPubkeyHex) {
      return {
        recipientPubkey: wrappedRecipientPubkey,
        unwrapSigner: await getOrCreateSigner(),
        groupChatPublicKey: null
      };
    }

    const groupEpochContext = await findGroupChatEpochContextByRecipientPubkey(wrappedRecipientPubkey);
    if (!groupEpochContext) {
      return null;
    }

    if (!groupEpochContext.epochEntry.epoch_private_key_encrypted) {
      return null;
    }

    const decryptedCurrentEpochPrivateKey = await decryptPrivateStringContent(
      groupEpochContext.epochEntry.epoch_private_key_encrypted
    );
    if (!decryptedCurrentEpochPrivateKey) {
      return null;
    }

    const derivedEpochPublicKey = derivePublicKeyFromPrivateKey(decryptedCurrentEpochPrivateKey);
    if (derivedEpochPublicKey !== wrappedRecipientPubkey) {
      return null;
    }

    return {
      recipientPubkey: wrappedRecipientPubkey,
      unwrapSigner: new NDKPrivateKeySigner(decryptedCurrentEpochPrivateKey, ndk),
      groupChatPublicKey: groupEpochContext.chat.public_key
    };
  }

  function readDirectMessageRecipientPubkey(event: NostrEvent): string | null {
    if (!Array.isArray(event.tags)) {
      return null;
    }

    for (const tag of event.tags) {
      if (!Array.isArray(tag) || tag[0] !== 'p') {
        continue;
      }

      const recipientPubkey = inputSanitizerService.normalizeHexKey(tag[1] ?? '');
      if (recipientPubkey) {
        return recipientPubkey;
      }
    }

    return null;
  }

  function readReactionTargetEventId(event: NDKEvent): string | null {
    return normalizeEventId(event.getMatchingTags('e')[0]?.[1] ?? '');
  }

  function readReplyTargetEventId(event: NDKEvent): string | null {
    const replyTag = event.getMatchingTags('e').find((tag) => {
      const marker = String(tag[3] ?? '').trim().toLowerCase();
      return marker === 'reply' && normalizeEventId(tag[1] ?? '');
    });
    if (replyTag) {
      return normalizeEventId(replyTag[1] ?? '');
    }

    return normalizeEventId(event.getMatchingTags('e')[0]?.[1] ?? '');
  }

  function readReactionTargetAuthorPubkey(event: NDKEvent): string | null {
    return inputSanitizerService.normalizeHexKey(event.getMatchingTags('p')[1]?.[1] ?? '');
  }

  function readDeletionTargetEntries(
    event: NDKEvent
  ): Array<{ eventId: string; kind: number | null }> {
    const eventIds = event
      .getMatchingTags('e')
      .map((tag) => normalizeEventId(tag[1] ?? ''))
      .filter((eventId): eventId is string => Boolean(eventId));
    if (eventIds.length === 0) {
      return [];
    }

    const kinds = event
      .getMatchingTags('k')
      .map((tag) => Number.parseInt(String(tag[1] ?? ''), 10))
      .filter((kind) => Number.isInteger(kind) && kind > 0);
    const fallbackKind = kinds.length === 1 ? kinds[0] : null;

    return eventIds.map((eventId, index) => ({
      eventId,
      kind: kinds[index] ?? fallbackKind
    }));
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

  async function getLoggedInSignerUser(): Promise<NDKUser> {
    const signer = await getOrCreateSigner();
    const user = await signer.user();
    user.ndk = ndk;
    return user;
  }

  function normalizeEventId(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim().toLowerCase();
    return trimmed || null;
  }

  function buildDeletedMessageMeta(
    deletedByPublicKey: string,
    deletedEventKind: number,
    deletedAt: string,
    deleteEventId?: string | null
  ): DeletedMessageMetadata {
    return {
      deletedAt,
      deletedByPublicKey,
      deletedEventKind,
      ...(normalizeEventId(deleteEventId) ? { deleteEventId: normalizeEventId(deleteEventId) } : {})
    };
  }

  async function toStoredNostrEvent(event: NDKEvent): Promise<NostrEvent | null> {
    try {
      const nostrEvent = await event.toNostrEvent();
      const eventId = normalizeEventId(nostrEvent.id ?? event.id);
      if (!eventId) {
        return null;
      }

      return {
        ...nostrEvent,
        id: eventId
      };
    } catch {
      const eventId = normalizeEventId(event.id);
      const pubkey = typeof event.pubkey === 'string' ? event.pubkey.trim() : '';
      if (!eventId || !pubkey) {
        return null;
      }

      const tags = Array.isArray(event.tags)
        ? event.tags
            .filter((tag): tag is string[] => Array.isArray(tag))
            .map((tag) => tag.map((entry) => String(entry)))
        : [];

      return {
        created_at: Number.isInteger(event.created_at)
          ? event.created_at
          : Math.floor(Date.now() / 1000),
        content: typeof event.content === 'string' ? event.content : '',
        tags,
        pubkey,
        id: eventId,
        ...(typeof event.kind === 'number' ? { kind: event.kind } : {})
      };
    }
  }

  async function refreshMessageInLiveState(messageId: number): Promise<void> {
    try {
      const { useMessageStore } = await import('src/stores/messageStore');
      await useMessageStore().refreshPersistedMessage(messageId);
    } catch (error) {
      console.error('Failed to sync persisted message into live state', error);
    }
  }

  async function appendRelayStatusesToMessageEvent(
    messageId: number,
    relayStatuses: MessageRelayStatus[],
    options: {
      event?: NostrEvent;
      direction?: NostrEventDirection;
      eventId?: string;
      uiThrottleMs?: number;
    } = {}
  ): Promise<void> {
    if (!Number.isInteger(messageId) || messageId <= 0) {
      logMessageRelayDiagnostics('skip', {
        reason: 'invalid-message-id',
        messageId,
        relayStatusCount: relayStatuses.length,
        eventId: formatSubscriptionLogValue(options.eventId ?? options.event?.id ?? null)
      });
      return;
    }

    if (relayStatuses.length === 0) {
      return;
    }

    const currentMessage = await chatDataService.getMessageById(messageId);
    if (!currentMessage) {
      logMessageRelayDiagnostics('skip', {
        reason: 'message-not-found',
        messageId,
        relayStatusCount: relayStatuses.length,
        eventId: formatSubscriptionLogValue(options.eventId ?? options.event?.id ?? null)
      });
      return;
    }

    const normalizedEventId = normalizeEventId(
      options.eventId ?? options.event?.id ?? currentMessage.event_id
    );
    if (!normalizedEventId) {
      logMessageRelayDiagnostics('skip', {
        reason: 'missing-event-id',
        messageId: currentMessage.id,
        relayStatusCount: relayStatuses.length,
        currentMessageEventId: formatSubscriptionLogValue(currentMessage.event_id),
        optionEventId: formatSubscriptionLogValue(options.eventId ?? options.event?.id ?? null)
      });
      return;
    }

    if (currentMessage.event_id !== normalizedEventId) {
      await chatDataService.updateMessageEventId(currentMessage.id, normalizedEventId);
    }

    await nostrEventDataService.appendRelayStatuses(normalizedEventId, relayStatuses, {
      event: options.event
        ? {
            ...options.event,
            id: normalizedEventId
          }
        : undefined,
      direction: options.direction
    });

    const uiThrottleMs = normalizeThrottleMs(options.uiThrottleMs);
    logMessageRelayDiagnostics('appended', {
      messageId: currentMessage.id,
      eventId: formatSubscriptionLogValue(normalizedEventId),
      relayStatusCount: relayStatuses.length,
      direction: options.direction ?? null,
      uiThrottleMs,
      refreshMode: uiThrottleMs > 0 ? 'queued-ui-refresh' : 'live-state-refresh'
    });
    if (uiThrottleMs > 0) {
      queuePrivateMessagesUiRefresh({
        throttleMs: uiThrottleMs,
        reloadMessages: true
      });
      return;
    }

    await refreshMessageInLiveState(currentMessage.id);
  }

  function buildInboundRelayStatuses(relayUrls: string[]): MessageRelayStatus[] {
    const updatedAt = new Date().toISOString();

    return normalizeRelayStatusUrls(relayUrls).map((relayUrl) => ({
      relay_url: relayUrl,
      direction: 'inbound',
      status: 'received',
      scope: 'subscription',
      updated_at: updatedAt
    }));
  }

  function buildOutboundRelayStatuses(
    relayUrls: string[],
    publishedRelayUrls: Set<string>,
    errorsByRelayUrl: Map<string, string>,
    scope: 'recipient' | 'self'
  ): MessageRelayStatus[] {
    const updatedAt = new Date().toISOString();

    return normalizeRelayStatusUrls(relayUrls).map((relayUrl) => {
      const isPublished = publishedRelayUrls.has(relayUrl);
      const detail = isPublished
        ? undefined
        : errorsByRelayUrl.get(relayUrl) ?? 'Relay did not acknowledge publish.';

      return {
        relay_url: relayUrl,
        direction: 'outbound',
        status: isPublished ? 'published' : 'failed',
        scope,
        updated_at: updatedAt,
        ...(detail ? { detail } : {})
      };
    });
  }

  function buildPendingOutboundRelayStatuses(
    relayUrls: string[],
    scope: 'recipient' | 'self'
  ): MessageRelayStatus[] {
    const updatedAt = new Date().toISOString();

    return normalizeRelayStatusUrls(relayUrls).map((relayUrl) => ({
      relay_url: relayUrl,
      direction: 'outbound',
      status: 'pending',
      scope,
      updated_at: updatedAt
    }));
  }

  function buildFailedOutboundRelayStatuses(
    relayUrls: string[],
    scope: 'recipient' | 'self',
    detail: string
  ): MessageRelayStatus[] {
    const normalizedRelayUrls = normalizeRelayStatusUrls(relayUrls);
    const normalizedDetail = detail.trim() || 'Failed to publish event.';
    const errorsByRelayUrl = new Map<string, string>();

    for (const relayUrl of normalizedRelayUrls) {
      errorsByRelayUrl.set(relayUrl, normalizedDetail);
    }

    return buildOutboundRelayStatuses(
      normalizedRelayUrls,
      new Set<string>(),
      errorsByRelayUrl,
      scope
    );
  }

  function extractRelayUrlsFromEvent(event: NDKEvent): string[] {
    return normalizeRelayStatusUrls([
      event.relay?.url ?? '',
      ...event.onRelays.map((relay) => relay.url)
    ]);
  }

  async function publishEventWithRelayStatuses(
    event: NDKEvent,
    relayUrls: string[],
    scope: 'recipient' | 'self'
  ): Promise<RelayPublishStatusesResult> {
    const normalizedRelayUrls = normalizeRelayStatusUrls(relayUrls);
    if (normalizedRelayUrls.length === 0) {
      return {
        relayStatuses: [],
        error: null
      };
    }

    const relaySet = NDKRelaySet.fromRelayUrls(normalizedRelayUrls, ndk);

    try {
      const publishedToRelays = await event.publish(relaySet);
      const publishedRelayUrls = new Set(
        Array.from(publishedToRelays, (relay) => normalizeRelayStatusUrl(relay.url)).filter(
          (relayUrl): relayUrl is string => Boolean(relayUrl)
        )
      );

      return {
        relayStatuses: buildOutboundRelayStatuses(
          normalizedRelayUrls,
          publishedRelayUrls,
          new Map<string, string>(),
          scope
        ),
        error: null
      };
    } catch (error) {
      const publishedRelayUrls = new Set<string>();
      const errorsByRelayUrl = new Map<string, string>();

      if (error instanceof NDKPublishError) {
        for (const relay of error.publishedToRelays) {
          const normalizedRelayUrl = normalizeRelayStatusUrl(relay.url);
          if (normalizedRelayUrl) {
            publishedRelayUrls.add(normalizedRelayUrl);
          }
        }

        error.errors.forEach((relayError, relay) => {
          const normalizedRelayUrl = normalizeRelayStatusUrl(relay.url);
          if (!normalizedRelayUrl) {
            return;
          }

          errorsByRelayUrl.set(
            normalizedRelayUrl,
            relayError instanceof Error ? relayError.message : String(relayError)
          );
        });
      } else if (error instanceof Error) {
        for (const relayUrl of normalizedRelayUrls) {
          errorsByRelayUrl.set(relayUrl, error.message);
        }
      }

      return {
        relayStatuses: buildOutboundRelayStatuses(
          normalizedRelayUrls,
          publishedRelayUrls,
          errorsByRelayUrl,
          scope
        ),
        error: error instanceof Error ? error : new Error('Failed to publish event.')
      };
    }
  }

  async function publishReplaceableEventWithRelayStatuses(
    event: NDKEvent,
    relayUrls: string[],
    scope: 'recipient' | 'self'
  ): Promise<RelayPublishStatusesResult> {
    const normalizedRelayUrls = normalizeRelayStatusUrls(relayUrls);
    if (normalizedRelayUrls.length === 0) {
      return {
        relayStatuses: [],
        error: null
      };
    }

    const relaySet = NDKRelaySet.fromRelayUrls(normalizedRelayUrls, ndk);

    try {
      const publishedToRelays = await event.publishReplaceable(relaySet);
      const publishedRelayUrls = new Set(
        Array.from(publishedToRelays, (relay) => normalizeRelayStatusUrl(relay.url)).filter(
          (relayUrl): relayUrl is string => Boolean(relayUrl)
        )
      );

      return {
        relayStatuses: buildOutboundRelayStatuses(
          normalizedRelayUrls,
          publishedRelayUrls,
          new Map<string, string>(),
          scope
        ),
        error: null
      };
    } catch (error) {
      const publishedRelayUrls = new Set<string>();
      const errorsByRelayUrl = new Map<string, string>();

      if (error instanceof NDKPublishError) {
        for (const relay of error.publishedToRelays) {
          const normalizedRelayUrl = normalizeRelayStatusUrl(relay.url);
          if (normalizedRelayUrl) {
            publishedRelayUrls.add(normalizedRelayUrl);
          }
        }

        error.errors.forEach((relayError, relay) => {
          const normalizedRelayUrl = normalizeRelayStatusUrl(relay.url);
          if (!normalizedRelayUrl) {
            return;
          }

          errorsByRelayUrl.set(
            normalizedRelayUrl,
            relayError instanceof Error ? relayError.message : String(relayError)
          );
        });
      } else if (error instanceof Error) {
        for (const relayUrl of normalizedRelayUrls) {
          errorsByRelayUrl.set(relayUrl, error.message);
        }
      }

      return {
        relayStatuses: buildOutboundRelayStatuses(
          normalizedRelayUrls,
          publishedRelayUrls,
          errorsByRelayUrl,
          scope
        ),
        error: error instanceof Error ? error : new Error('Failed to publish replaceable event.')
      };
    }
  }

  async function publishEventWithRelayStatuses(
    event: NDKEvent,
    relayUrls: string[],
    scope: 'recipient' | 'self'
  ): Promise<RelayPublishStatusesResult> {
    const normalizedRelayUrls = normalizeRelayStatusUrls(relayUrls);
    if (normalizedRelayUrls.length === 0) {
      return {
        relayStatuses: [],
        error: null
      };
    }

    const relaySet = NDKRelaySet.fromRelayUrls(normalizedRelayUrls, ndk);

    try {
      const publishedToRelays = await event.publish(relaySet);
      const publishedRelayUrls = new Set(
        Array.from(publishedToRelays, (relay) => normalizeRelayStatusUrl(relay.url)).filter(
          (relayUrl): relayUrl is string => Boolean(relayUrl)
        )
      );

      return {
        relayStatuses: buildOutboundRelayStatuses(
          normalizedRelayUrls,
          publishedRelayUrls,
          new Map<string, string>(),
          scope
        ),
        error: null
      };
    } catch (error) {
      const publishedRelayUrls = new Set<string>();
      const errorsByRelayUrl = new Map<string, string>();

      if (error instanceof NDKPublishError) {
        for (const relay of error.publishedToRelays) {
          const normalizedRelayUrl = normalizeRelayStatusUrl(relay.url);
          if (normalizedRelayUrl) {
            publishedRelayUrls.add(normalizedRelayUrl);
          }
        }

        error.errors.forEach((relayError, relay) => {
          const normalizedRelayUrl = normalizeRelayStatusUrl(relay.url);
          if (!normalizedRelayUrl) {
            return;
          }

          errorsByRelayUrl.set(
            normalizedRelayUrl,
            relayError instanceof Error ? relayError.message : String(relayError)
          );
        });
      } else if (error instanceof Error) {
        for (const relayUrl of normalizedRelayUrls) {
          errorsByRelayUrl.set(relayUrl, error.message);
        }
      }

      return {
        relayStatuses: buildOutboundRelayStatuses(
          normalizedRelayUrls,
          publishedRelayUrls,
          errorsByRelayUrl,
          scope
        ),
        error: error instanceof Error ? error : new Error('Failed to publish event.')
      };
    }
  }

  async function sendGiftWrappedRumor(
    recipientPublicKey: string,
    relays: string[],
    rumorKind: number,
    createRumorEvent: (
      senderPubkey: string,
      recipientPubkey: string,
      createdAt: number
    ) => NDKEvent,
    options: SendGiftWrappedRumorOptions = {}
  ): Promise<GiftWrappedRumorPublishResult> {
    const recipientInput = recipientPublicKey.trim();
    if (!recipientInput) {
      throw new Error('Recipient public key is required.');
    }

    let normalizedRecipientPubkey: string | null = null;
    if (isValidPubkey(recipientInput)) {
      normalizedRecipientPubkey = recipientInput.toLowerCase();
    } else {
      normalizedRecipientPubkey = validateNpub(recipientInput).normalizedPubkey;
    }

    if (!normalizedRecipientPubkey) {
      throw new Error('Recipient public key must be a valid hex pubkey or npub.');
    }

    const relayUrls = inputSanitizerService.normalizeStringArray(relays);
    if (relayUrls.length === 0) {
      throw new Error('Cannot send encrypted event without contact relays.');
    }
    await ensureRelayConnections(relayUrls);

    const signer = await getOrCreateSigner();
    const shouldPublishSelfCopy = options.publishSelfCopy !== false;
    const createdAt = toUnixTimestamp(options.createdAt);
    const recipient = new NDKUser({ pubkey: normalizedRecipientPubkey });
    const recipientRumorEvent = createRumorEvent(
      signer.pubkey,
      normalizedRecipientPubkey,
      createdAt
    );
    const recipientRumorNostrEvent = await toStoredNostrEvent(recipientRumorEvent);
    const rumorEventId = normalizeEventId(
      recipientRumorNostrEvent?.id ?? recipientRumorEvent.id
    );
    const selfRelayUrls = shouldPublishSelfCopy ? await resolveLoggedInPublishRelayUrls() : [];
    const persistOutboundRelayStatuses = async (
      relayStatuses: MessageRelayStatus[]
    ): Promise<void> => {
      if (!options.localMessageId || !rumorEventId || relayStatuses.length === 0) {
        return;
      }

      await appendRelayStatusesToMessageEvent(
        options.localMessageId,
        relayStatuses,
        {
          event: recipientRumorNostrEvent ?? undefined,
          direction: 'out',
          eventId: rumorEventId
        }
      );
    };
    const appendFailedOutboundRelayStatuses = async (
      relayUrlsToFail: string[],
      scope: 'recipient' | 'self',
      detail: string
    ): Promise<MessageRelayStatus[]> => {
      const failedRelayStatuses = buildFailedOutboundRelayStatuses(
        relayUrlsToFail,
        scope,
        detail
      );
      await persistOutboundRelayStatuses(failedRelayStatuses);
      return failedRelayStatuses;
    };
    let recipientRelayStatusesFinalized = false;
    let selfRelayStatusesFinalized = selfRelayUrls.length === 0;

    if (options.localMessageId && rumorEventId) {
      try {
        await persistOutboundRelayStatuses([
          ...buildPendingOutboundRelayStatuses(relayUrls, 'recipient'),
          ...buildPendingOutboundRelayStatuses(selfRelayUrls, 'self')
        ]);
      } catch (error) {
        console.warn('Failed to persist encrypted event details before publish', error);
      }
    }

    const combinedRelayStatuses: MessageRelayStatus[] = [];

    try {
      const recipientGiftWrapEvent = await giftWrap(recipientRumorEvent, recipient, signer, {
        rumorKind
      });
      const recipientPublishResult = await publishEventWithRelayStatuses(
        recipientGiftWrapEvent,
        relayUrls,
        'recipient'
      );
      combinedRelayStatuses.push(...recipientPublishResult.relayStatuses);
      await persistOutboundRelayStatuses(recipientPublishResult.relayStatuses);
      recipientRelayStatusesFinalized = true;

      if (recipientPublishResult.error) {
        const skippedSelfRelayStatuses = await appendFailedOutboundRelayStatuses(
          selfRelayUrls,
          'self',
          'Skipped because recipient relay publish failed.'
        );
        combinedRelayStatuses.push(...skippedSelfRelayStatuses);
        selfRelayStatusesFinalized = true;
        throw recipientPublishResult.error;
      }

      if (selfRelayUrls.length > 0) {
        try {
          await ensureRelayConnections(selfRelayUrls);
          const senderRecipient = new NDKUser({ pubkey: signer.pubkey });
          const selfRumorEvent = createRumorEvent(
            signer.pubkey,
            normalizedRecipientPubkey,
            createdAt
          );
          const selfGiftWrapEvent = await giftWrap(selfRumorEvent, senderRecipient, signer, {
            rumorKind
          });
          const selfPublishResult = await publishEventWithRelayStatuses(
            selfGiftWrapEvent,
            selfRelayUrls,
            'self'
          );
          combinedRelayStatuses.push(...selfPublishResult.relayStatuses);
          await persistOutboundRelayStatuses(selfPublishResult.relayStatuses);
          selfRelayStatusesFinalized = true;

          if (selfPublishResult.error) {
            console.warn('Failed to publish encrypted event self-copy', selfPublishResult.error);
          }
        } catch (error) {
          const selfFailureDetail =
            error instanceof Error && error.message.trim()
              ? error.message.trim()
              : 'Failed to publish encrypted event self-copy.';
          const failedSelfRelayStatuses = await appendFailedOutboundRelayStatuses(
            selfRelayUrls,
            'self',
            selfFailureDetail
          );
          combinedRelayStatuses.push(...failedSelfRelayStatuses);
          selfRelayStatusesFinalized = true;
          console.warn('Failed to publish encrypted event self-copy', error);
        }
      }

      return {
        giftWrapEvent: await recipientGiftWrapEvent.toNostrEvent(),
        rumorEvent: recipientRumorNostrEvent,
        rumorEventId,
        relayStatuses: combinedRelayStatuses
      };
    } catch (error) {
      const failureDetail =
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : 'Failed to publish encrypted event.';

      if (!recipientRelayStatusesFinalized) {
        await appendFailedOutboundRelayStatuses(relayUrls, 'recipient', failureDetail);
      }

      if (!selfRelayStatusesFinalized) {
        await appendFailedOutboundRelayStatuses(selfRelayUrls, 'self', failureDetail);
      }

      throw error;
    }
  }

  function queuePendingIncomingReaction(
    targetEventId: string,
    pendingReaction: PendingIncomingReaction
  ): void {
    const normalizedTargetEventId = normalizeEventId(targetEventId);
    if (!normalizedTargetEventId) {
      return;
    }

    const existingEntries = pendingIncomingReactions.get(normalizedTargetEventId) ?? [];
    const alreadyQueued = existingEntries.some((entry) => {
      return (
        entry.chatPublicKey === pendingReaction.chatPublicKey &&
        entry.targetAuthorPublicKey === pendingReaction.targetAuthorPublicKey &&
        entry.reaction.emoji === pendingReaction.reaction.emoji &&
        entry.reaction.reactorPublicKey === pendingReaction.reaction.reactorPublicKey
      );
    });
    if (alreadyQueued) {
      return;
    }

    pendingIncomingReactions.set(normalizedTargetEventId, [
      ...existingEntries,
      pendingReaction
    ]);
    bumpDeveloperDiagnosticsVersion();
  }

  function removePendingIncomingReaction(
    targetEventId: string,
    reactionEventId: string,
    reactorPublicKey: string
  ): void {
    const normalizedTargetEventId = normalizeEventId(targetEventId);
    const normalizedReactionEventId = normalizeEventId(reactionEventId);
    const normalizedReactorPublicKey = inputSanitizerService.normalizeHexKey(reactorPublicKey);
    if (!normalizedTargetEventId || !normalizedReactionEventId || !normalizedReactorPublicKey) {
      return;
    }

    const existingEntries = pendingIncomingReactions.get(normalizedTargetEventId) ?? [];
    if (existingEntries.length === 0) {
      return;
    }

    const remainingEntries = existingEntries.filter((entry) => {
      return !(
        normalizeEventId(entry.reaction.eventId) === normalizedReactionEventId &&
        entry.reaction.reactorPublicKey === normalizedReactorPublicKey
      );
    });

    if (remainingEntries.length > 0) {
      pendingIncomingReactions.set(normalizedTargetEventId, remainingEntries);
    } else {
      pendingIncomingReactions.delete(normalizedTargetEventId);
    }

    bumpDeveloperDiagnosticsVersion();
  }

  function queuePendingIncomingDeletion(
    targetEventId: string,
    pendingDeletion: PendingIncomingDeletion
  ): void {
    const normalizedTargetEventId = normalizeEventId(targetEventId);
    if (!normalizedTargetEventId) {
      return;
    }

    const existingEntries = pendingIncomingDeletions.get(normalizedTargetEventId) ?? [];
    const alreadyQueued = existingEntries.some((entry) => {
      return (
        entry.deletionAuthorPublicKey === pendingDeletion.deletionAuthorPublicKey &&
        entry.targetKind === pendingDeletion.targetKind
      );
    });
    if (alreadyQueued) {
      return;
    }

    pendingIncomingDeletions.set(normalizedTargetEventId, [
      ...existingEntries,
      pendingDeletion
    ]);
    bumpDeveloperDiagnosticsVersion();
  }

  async function syncChatUnseenReactionCount(chatPublicKey: string): Promise<void> {
    try {
      const { useMessageStore } = await import('src/stores/messageStore');
      await useMessageStore().syncChatUnseenReactionCount(chatPublicKey);
    } catch (error) {
      console.warn('Failed to synchronize unseen reaction count for chat', chatPublicKey, error);
    }
  }

  async function upsertReactionOnMessageRow(
    messageRow: MessageRow,
    pendingReaction: PendingIncomingReaction,
    options: {
      uiThrottleMs?: number;
    } = {}
  ): Promise<MessageRow | null> {
    const normalizedMessageChatPubkey = inputSanitizerService.normalizeHexKey(
      messageRow.chat_public_key
    );
    if (!normalizedMessageChatPubkey || normalizedMessageChatPubkey !== pendingReaction.chatPublicKey) {
      return null;
    }

    const normalizedMessageAuthorPubkey = inputSanitizerService.normalizeHexKey(
      messageRow.author_public_key
    );
    const loggedInPubkeyHex = getLoggedInPublicKeyHex();
    const shouldDefaultReactionAsViewed =
      loggedInPubkeyHex !== null &&
      normalizedMessageAuthorPubkey === loggedInPubkeyHex &&
      pendingReaction.reaction.reactorPublicKey === loggedInPubkeyHex;
    const defaultViewedByAuthorAt =
      pendingReaction.reaction.viewedByAuthorAt ??
      (shouldDefaultReactionAsViewed ? new Date().toISOString() : null);
    if (
      pendingReaction.targetAuthorPublicKey &&
      normalizedMessageAuthorPubkey !== pendingReaction.targetAuthorPublicKey
    ) {
      return null;
    }

    const currentReactions = normalizeMessageReactions(messageRow.meta.reactions);
    const existingReactionIndex = currentReactions.findIndex((reaction) => {
      const sameEventId =
        normalizeEventId(reaction.eventId) &&
        normalizeEventId(reaction.eventId) === normalizeEventId(pendingReaction.reaction.eventId);
      if (sameEventId) {
        return true;
      }

      return (
        reaction.emoji === pendingReaction.reaction.emoji &&
        reaction.reactorPublicKey === pendingReaction.reaction.reactorPublicKey
      );
    });
    if (existingReactionIndex >= 0) {
      const existingReaction = currentReactions[existingReactionIndex];
      const nextReaction: MessageReaction = {
        ...existingReaction,
        ...pendingReaction.reaction,
        createdAt:
          pendingReaction.reaction.createdAt ??
          existingReaction.createdAt ??
          null,
        eventId:
          normalizeEventId(pendingReaction.reaction.eventId) ??
          normalizeEventId(existingReaction.eventId) ??
          null,
        viewedByAuthorAt:
          pendingReaction.reaction.viewedByAuthorAt ??
          existingReaction.viewedByAuthorAt ??
          defaultViewedByAuthorAt
      };
      const isUnchanged =
        nextReaction.emoji === existingReaction.emoji &&
        nextReaction.name === existingReaction.name &&
        nextReaction.reactorPublicKey === existingReaction.reactorPublicKey &&
        nextReaction.createdAt === existingReaction.createdAt &&
        normalizeEventId(nextReaction.eventId) === normalizeEventId(existingReaction.eventId) &&
        nextReaction.viewedByAuthorAt === existingReaction.viewedByAuthorAt;
      if (isUnchanged) {
        return messageRow;
      }

      const nextReactions = [...currentReactions];
      nextReactions.splice(existingReactionIndex, 1, nextReaction);
      const updatedRow = await chatDataService.updateMessageMeta(
        messageRow.id,
        buildMetaWithReactions(messageRow.meta, nextReactions)
      );
      if (!updatedRow) {
        return null;
      }

      const uiThrottleMs = normalizeThrottleMs(options.uiThrottleMs);
      if (uiThrottleMs > 0) {
        await syncChatUnseenReactionCount(updatedRow.chat_public_key);
        queuePrivateMessagesUiRefresh({
          throttleMs: uiThrottleMs,
          reloadMessages: true
        });
        return updatedRow;
      }

      await refreshMessageInLiveState(updatedRow.id);
      await syncChatUnseenReactionCount(updatedRow.chat_public_key);
      return updatedRow;
    }

    if (
      pendingReaction.targetAuthorPublicKey &&
      normalizedMessageAuthorPubkey !== pendingReaction.targetAuthorPublicKey
    ) {
      return messageRow;
    }

    const updatedRow = await chatDataService.updateMessageMeta(
      messageRow.id,
      buildMetaWithReactions(messageRow.meta, [
        ...currentReactions,
        {
          ...pendingReaction.reaction,
          ...(defaultViewedByAuthorAt ? { viewedByAuthorAt: defaultViewedByAuthorAt } : {})
        }
      ])
    );
    if (!updatedRow) {
      return null;
    }

    const uiThrottleMs = normalizeThrottleMs(options.uiThrottleMs);
    if (uiThrottleMs > 0) {
      await syncChatUnseenReactionCount(updatedRow.chat_public_key);
      queuePrivateMessagesUiRefresh({
        throttleMs: uiThrottleMs,
        reloadMessages: true
      });
      return updatedRow;
    }

    await refreshMessageInLiveState(updatedRow.id);
    await syncChatUnseenReactionCount(updatedRow.chat_public_key);
    return updatedRow;
  }

  async function removeReactionByEventIdFromMessageRow(
    messageRow: MessageRow,
    reactionEventId: string,
    reactorPublicKey: string,
    reactionEmoji: string | null,
    options: {
      uiThrottleMs?: number;
    } = {}
  ): Promise<MessageRow | null> {
    const normalizedReactionEventId = normalizeEventId(reactionEventId);
    const normalizedReactorPublicKey = inputSanitizerService.normalizeHexKey(reactorPublicKey);
    if (!normalizedReactionEventId || !normalizedReactorPublicKey) {
      return null;
    }

    const currentReactions = normalizeMessageReactions(messageRow.meta.reactions);
    const nextReactions = currentReactions.filter((reaction) => {
      const sameEventId = normalizeEventId(reaction.eventId) === normalizedReactionEventId;
      if (sameEventId) {
        return false;
      }

      return !(
        normalizeEventId(reaction.eventId) === null &&
        reaction.reactorPublicKey === normalizedReactorPublicKey &&
        (!reactionEmoji || reaction.emoji === reactionEmoji)
      );
    });
    if (nextReactions.length === currentReactions.length) {
      return messageRow;
    }

    const updatedRow = await chatDataService.updateMessageMeta(
      messageRow.id,
      buildMetaWithReactions(messageRow.meta, nextReactions)
    );
    if (!updatedRow) {
      return null;
    }

    const uiThrottleMs = normalizeThrottleMs(options.uiThrottleMs);
    if (uiThrottleMs > 0) {
      await syncChatUnseenReactionCount(updatedRow.chat_public_key);
      queuePrivateMessagesUiRefresh({
        throttleMs: uiThrottleMs,
        reloadMessages: true
      });
      return updatedRow;
    }

    await refreshMessageInLiveState(updatedRow.id);
    await syncChatUnseenReactionCount(updatedRow.chat_public_key);
    return updatedRow;
  }

  async function markMessageRowDeleted(
    messageRow: MessageRow,
    deletedByPublicKey: string,
    deletedAt: string,
    deletedEventKind: number,
    deleteEventId: string | null,
    options: {
      uiThrottleMs?: number;
    } = {}
  ): Promise<MessageRow | null> {
    const normalizedDeletedByPublicKey = inputSanitizerService.normalizeHexKey(deletedByPublicKey);
    if (!normalizedDeletedByPublicKey) {
      return null;
    }

    const updatedRow = await chatDataService.updateMessageMeta(
      messageRow.id,
      {
        ...messageRow.meta,
        deleted: buildDeletedMessageMeta(
          normalizedDeletedByPublicKey,
          deletedEventKind,
          deletedAt,
          deleteEventId
        )
      }
    );
    if (!updatedRow) {
      return null;
    }

    const uiThrottleMs = normalizeThrottleMs(options.uiThrottleMs);
    if (uiThrottleMs > 0) {
      queuePrivateMessagesUiRefresh({
        throttleMs: uiThrottleMs,
        reloadMessages: true
      });
      return updatedRow;
    }

    await refreshMessageInLiveState(updatedRow.id);
    return updatedRow;
  }

  async function applyPendingIncomingReactionsForMessage(
    messageRow: MessageRow,
    options: {
      uiThrottleMs?: number;
    } = {}
  ): Promise<MessageRow> {
    const normalizedEventId = normalizeEventId(messageRow.event_id);
    if (!normalizedEventId) {
      return messageRow;
    }

    const pendingEntries = pendingIncomingReactions.get(normalizedEventId);
    if (!pendingEntries || pendingEntries.length === 0) {
      return messageRow;
    }

    let currentMessageRow = messageRow;
    const remainingEntries: PendingIncomingReaction[] = [];
    for (const pendingReaction of pendingEntries) {
      const updatedRow = await upsertReactionOnMessageRow(
        currentMessageRow,
        pendingReaction,
        options
      );
      if (!updatedRow) {
        remainingEntries.push(pendingReaction);
        continue;
      }

      currentMessageRow = updatedRow;
    }

    if (remainingEntries.length > 0) {
      pendingIncomingReactions.set(normalizedEventId, remainingEntries);
    } else {
      pendingIncomingReactions.delete(normalizedEventId);
    }

    return currentMessageRow;
  }

  function consumePendingIncomingDeletions(targetEventId: string): PendingIncomingDeletion[] {
    const normalizedTargetEventId = normalizeEventId(targetEventId);
    if (!normalizedTargetEventId) {
      return [];
    }

    const entries = pendingIncomingDeletions.get(normalizedTargetEventId) ?? [];
    pendingIncomingDeletions.delete(normalizedTargetEventId);
    if (entries.length > 0) {
      bumpDeveloperDiagnosticsVersion();
    }
    return entries;
  }

  async function applyPendingIncomingDeletionsForMessage(
    messageRow: MessageRow,
    options: {
      uiThrottleMs?: number;
    } = {}
  ): Promise<MessageRow> {
    const normalizedMessageEventId = normalizeEventId(messageRow.event_id);
    const normalizedMessageAuthorPublicKey = inputSanitizerService.normalizeHexKey(
      messageRow.author_public_key
    );
    if (!normalizedMessageEventId || !normalizedMessageAuthorPublicKey) {
      return messageRow;
    }

    const pendingDeletions = consumePendingIncomingDeletions(normalizedMessageEventId);
    if (pendingDeletions.length === 0) {
      return messageRow;
    }

    let currentMessageRow = messageRow;
    for (const pendingDeletion of pendingDeletions) {
      if (
        pendingDeletion.deletionAuthorPublicKey !== normalizedMessageAuthorPublicKey ||
        (pendingDeletion.targetKind !== null &&
          pendingDeletion.targetKind !== NDKKind.PrivateDirectMessage)
      ) {
        continue;
      }

      const updatedRow = await markMessageRowDeleted(
        currentMessageRow,
        pendingDeletion.deletionAuthorPublicKey,
        pendingDeletion.deletedAt,
        NDKKind.PrivateDirectMessage,
        pendingDeletion.deleteEventId,
        options
      );
      if (updatedRow) {
        currentMessageRow = updatedRow;
      }
    }

    return currentMessageRow;
  }

  function consumePendingIncomingDeletionForReaction(
    reactionEventId: string,
    reactorPublicKey: string
  ): PendingIncomingDeletion | null {
    const normalizedReactionEventId = normalizeEventId(reactionEventId);
    const normalizedReactorPublicKey = inputSanitizerService.normalizeHexKey(reactorPublicKey);
    if (!normalizedReactionEventId || !normalizedReactorPublicKey) {
      return null;
    }

    const pendingDeletions = consumePendingIncomingDeletions(normalizedReactionEventId);
    return (
      pendingDeletions.find((entry) => {
        return (
          entry.deletionAuthorPublicKey === normalizedReactorPublicKey &&
          (entry.targetKind === null || entry.targetKind === NDKKind.Reaction)
        );
      }) ?? null
    );
  }

  async function processIncomingReactionRumorEvent(
    rumorEvent: NDKEvent,
    chatPubkey: string,
    senderPubkeyHex: string,
    options: {
      uiThrottleMs?: number;
      direction: NostrEventDirection;
      rumorNostrEvent: NostrEvent | null;
      relayStatuses: MessageRelayStatus[];
    }
  ): Promise<void> {
    const reactionEmoji = rumorEvent.content.trim();
    const targetEventId = readReactionTargetEventId(rumorEvent);
    const targetAuthorPublicKey = readReactionTargetAuthorPubkey(rumorEvent);
    const reactionEventId = normalizeEventId(options.rumorNostrEvent?.id ?? rumorEvent.id);
    const relayUrls = normalizeRelayStatusUrls(options.relayStatuses.map((entry) => entry.relay_url));
    if (!reactionEmoji || !targetEventId) {
      logInboundEvent('reaction-drop', {
        reason: 'missing-reaction-data',
        hasReactionEmoji: Boolean(reactionEmoji),
        hasTargetEventId: Boolean(targetEventId),
        ...buildInboundTraceDetails({
          rumorEvent,
          senderPubkeyHex,
          chatPubkey,
          targetEventId,
          relayUrls
        })
      });
      return;
    }

    await Promise.all([chatDataService.init(), nostrEventDataService.init()]);

    if (options.rumorNostrEvent && reactionEventId) {
      await nostrEventDataService.upsertEvent({
        event: options.rumorNostrEvent,
        direction: options.direction,
        relay_statuses: options.relayStatuses
      });
    }

    if (reactionEventId) {
      const pendingDeletion = consumePendingIncomingDeletionForReaction(
        reactionEventId,
        senderPubkeyHex
      );
      if (pendingDeletion) {
        logInboundEvent('reaction-drop', {
          reason: 'pending-deletion-match',
          deleteEventId: formatSubscriptionLogValue(pendingDeletion.deleteEventId),
          ...buildInboundTraceDetails({
            rumorEvent,
            senderPubkeyHex,
            chatPubkey,
            targetEventId,
            relayUrls
          })
        });
        await nostrEventDataService.deleteEventsByIds([reactionEventId]);
        return;
      }
    }

    const pendingReaction: PendingIncomingReaction = {
      chatPublicKey: chatPubkey,
      targetAuthorPublicKey,
      reaction: {
        emoji: reactionEmoji,
        name: getEmojiEntryByValue(reactionEmoji)?.label ?? reactionEmoji,
        reactorPublicKey: senderPubkeyHex,
        createdAt: toIsoTimestampFromUnix(rumorEvent.created_at),
        ...(
          (() => {
            const loggedInPubkeyHex = getLoggedInPublicKeyHex();
            if (
              loggedInPubkeyHex &&
              targetAuthorPublicKey === loggedInPubkeyHex &&
              senderPubkeyHex === loggedInPubkeyHex
            ) {
              return { viewedByAuthorAt: toIsoTimestampFromUnix(rumorEvent.created_at) };
            }

            return {};
          })()
        ),
        ...(reactionEventId ? { eventId: reactionEventId } : {})
      }
    };

    const targetMessage = await chatDataService.getMessageByEventId(targetEventId);
    if (!targetMessage) {
      logInboundEvent('reaction-pending', {
        reason: 'target-message-missing',
        ...buildInboundTraceDetails({
          rumorEvent,
          senderPubkeyHex,
          chatPubkey,
          targetEventId,
          relayUrls
        })
      });
      queuePendingIncomingReaction(targetEventId, pendingReaction);
      return;
    }

    await upsertReactionOnMessageRow(targetMessage, pendingReaction, options);
    logInboundEvent('reaction-applied', {
      messageId: targetMessage.id,
      targetMessageEventId: formatSubscriptionLogValue(targetMessage.event_id),
      ...buildInboundTraceDetails({
        rumorEvent,
        senderPubkeyHex,
        chatPubkey,
        targetEventId,
        relayUrls
      })
    });
  }

  async function buildReplyPreviewFromTargetEvent(
    targetEventId: string,
    chatPubkey: string,
    loggedInPubkeyHex: string,
    contact?: ContactRecord | null
  ): Promise<MessageReplyPreview> {
    const normalizedTargetEventId = normalizeEventId(targetEventId);
    if (!normalizedTargetEventId) {
      return {
        messageId: '',
        text: UNKNOWN_REPLY_MESSAGE_TEXT,
        sender: 'them',
        authorName: 'Unknown',
        authorPublicKey: '',
        sentAt: '',
        eventId: null
      };
    }

    const targetMessage = await chatDataService.getMessageByEventId(normalizedTargetEventId);
    if (!targetMessage) {
      return {
        messageId: normalizedTargetEventId,
        text: UNKNOWN_REPLY_MESSAGE_TEXT,
        sender: 'them',
        authorName: 'Unknown',
        authorPublicKey: '',
        sentAt: '',
        eventId: normalizedTargetEventId
      };
    }

    const targetAuthorPublicKey =
      inputSanitizerService.normalizeHexKey(targetMessage.author_public_key) ?? '';
    const isOwnTargetMessage = targetAuthorPublicKey === loggedInPubkeyHex;
    const replyContact =
      contact === undefined ? await contactsService.getContactByPublicKey(chatPubkey) : contact;

    return {
      messageId: String(targetMessage.id),
      text: targetMessage.message.trim() || UNKNOWN_REPLY_MESSAGE_TEXT,
      sender: isOwnTargetMessage ? 'me' : 'them',
      authorName: isOwnTargetMessage ? 'You' : deriveChatName(replyContact, chatPubkey),
      authorPublicKey: targetAuthorPublicKey,
      sentAt: targetMessage.created_at,
      eventId: normalizedTargetEventId
    };
  }

  async function processIncomingReactionDeletion(
    reactionEventId: string,
    deletionAuthorPublicKey: string,
    options: {
      uiThrottleMs?: number;
    } = {}
  ): Promise<boolean> {
    await Promise.all([chatDataService.init(), nostrEventDataService.init()]);

    const normalizedReactionEventId = normalizeEventId(reactionEventId);
    const normalizedDeletionAuthorPublicKey = inputSanitizerService.normalizeHexKey(
      deletionAuthorPublicKey
    );
    if (!normalizedReactionEventId || !normalizedDeletionAuthorPublicKey) {
      return true;
    }

    const storedReactionEvent = await nostrEventDataService.getEventById(normalizedReactionEventId);
    if (storedReactionEvent) {
      const reactionAuthorPublicKey = inputSanitizerService.normalizeHexKey(
        storedReactionEvent.event.pubkey
      );
      if (
        reactionAuthorPublicKey &&
        reactionAuthorPublicKey !== normalizedDeletionAuthorPublicKey
      ) {
        return true;
      }
    }

    let targetMessage = await chatDataService.findMessageByReactionEventId(normalizedReactionEventId);
    const reactionEmoji = storedReactionEvent?.event.content.trim() || null;
    if (!targetMessage && storedReactionEvent) {
      const reactionEvent = new NDKEvent(ndk, storedReactionEvent.event);
      const targetMessageEventId = readReactionTargetEventId(reactionEvent);
      if (targetMessageEventId) {
        targetMessage = await chatDataService.getMessageByEventId(targetMessageEventId);
      }
    }

    if (!targetMessage) {
      if (storedReactionEvent) {
        const reactionEvent = new NDKEvent(ndk, storedReactionEvent.event);
        const targetMessageEventId = readReactionTargetEventId(reactionEvent);
        if (targetMessageEventId) {
          removePendingIncomingReaction(
            targetMessageEventId,
            normalizedReactionEventId,
            normalizedDeletionAuthorPublicKey
          );
        }

        await nostrEventDataService.deleteEventsByIds([normalizedReactionEventId]);
        return true;
      }

      return false;
    }

    const matchingReaction = normalizeMessageReactions(targetMessage.meta.reactions).find((reaction) => {
      return normalizeEventId(reaction.eventId) === normalizedReactionEventId;
    });
    if (
      matchingReaction &&
      matchingReaction.reactorPublicKey !== normalizedDeletionAuthorPublicKey
    ) {
      return true;
    }

    await removeReactionByEventIdFromMessageRow(
      targetMessage,
      normalizedReactionEventId,
      normalizedDeletionAuthorPublicKey,
      reactionEmoji,
      options
    );
    await nostrEventDataService.deleteEventsByIds([normalizedReactionEventId]);
    return true;
  }

  async function processIncomingMessageDeletion(
    messageEventId: string,
    deletionAuthorPublicKey: string,
    deleteEventId: string | null,
    deletedAt: string,
    targetKind: number,
    options: {
      uiThrottleMs?: number;
    } = {}
  ): Promise<boolean> {
    await chatDataService.init();

    const targetMessage = await chatDataService.getMessageByEventId(messageEventId);
    if (!targetMessage) {
      return false;
    }

    const normalizedMessageAuthorPublicKey = inputSanitizerService.normalizeHexKey(
      targetMessage.author_public_key
    );
    const normalizedDeletionAuthorPublicKey = inputSanitizerService.normalizeHexKey(
      deletionAuthorPublicKey
    );
    if (
      !normalizedMessageAuthorPublicKey ||
      !normalizedDeletionAuthorPublicKey ||
      normalizedMessageAuthorPublicKey !== normalizedDeletionAuthorPublicKey
    ) {
      return true;
    }

    await markMessageRowDeleted(
      targetMessage,
      normalizedDeletionAuthorPublicKey,
      deletedAt,
      targetKind,
      deleteEventId,
      options
    );
    return true;
  }

  async function processIncomingDeletionRumorEvent(
    rumorEvent: NDKEvent,
    senderPubkeyHex: string,
    options: {
      uiThrottleMs?: number;
    } = {}
  ): Promise<void> {
    await Promise.all([chatDataService.init(), nostrEventDataService.init()]);

    const deleteEventId = normalizeEventId(rumorEvent.id);
    const deletedAt = toIsoTimestampFromUnix(rumorEvent.created_at);
    const deletionTargets = readDeletionTargetEntries(rumorEvent);
    if (deletionTargets.length === 0) {
      return;
    }

    for (const target of deletionTargets) {
      const targetKind = target.kind ?? null;
      let handled = false;

      if (targetKind === NDKKind.Reaction) {
        handled = await processIncomingReactionDeletion(target.eventId, senderPubkeyHex, options);
      } else if (targetKind === NDKKind.PrivateDirectMessage) {
        handled = await processIncomingMessageDeletion(
          target.eventId,
          senderPubkeyHex,
          deleteEventId,
          deletedAt,
          NDKKind.PrivateDirectMessage,
          options
        );
      } else {
        const matchingMessage = await chatDataService.getMessageByEventId(target.eventId);
        if (matchingMessage) {
          handled = await processIncomingMessageDeletion(
            target.eventId,
            senderPubkeyHex,
            deleteEventId,
            deletedAt,
            NDKKind.PrivateDirectMessage,
            options
          );
        } else {
          handled = await processIncomingReactionDeletion(target.eventId, senderPubkeyHex, options);
        }
      }

      if (!handled) {
        queuePendingIncomingDeletion(target.eventId, {
          deletionAuthorPublicKey: senderPubkeyHex,
          deleteEventId,
          deletedAt,
          targetKind
        });
      }
    }
  }

  function buildUpdatedContactMeta(
    existingMeta: ContactMetadata | undefined,
    profile: NDKUserProfile | null,
    resolvedNpub: string | null,
    resolvedNprofile: string | null
  ): ContactMetadata {
    return buildUpdatedContactMetaValue(existingMeta, profile, resolvedNpub, resolvedNprofile);
  }

  function buildIdentifierFallbacks(
    pubkeyHex: string,
    existingMeta?: ContactMetadata
  ): string[] {
    return buildIdentifierFallbacksValue(pubkeyHex, existingMeta);
  }

  function relayEntriesFromRelayList(relayList: NDKRelayList | null | undefined): ContactRelay[] {
    return relayEntriesFromRelayListValue(relayList);
  }

  function contactRelayListsEqual(
    first: ContactRelay[] | undefined,
    second: ContactRelay[] | undefined
  ): boolean {
    return contactRelayListsEqualValue(first, second);
  }

  function contactMetadataEqual(
    first: ContactMetadata | undefined,
    second: ContactMetadata | undefined
  ): boolean {
    return contactMetadataEqualValue(first, second);
  }

  function shouldPreserveExistingGroupRelays(
    contact: Pick<ContactRecord, 'type' | 'public_key' | 'relays'> | null | undefined,
    nextRelayEntries: ContactRelay[] | undefined
  ): boolean {
    return shouldPreserveExistingGroupRelaysValue(contact, nextRelayEntries);
  }
  const {
    buildPrivateContactListTags,
    decryptPrivateContactListContent,
    encryptPrivateContactListTags,
    extractContactProfileEventStateFromProfile,
    fetchContactRelayList,
    getAppRelayUrls,
    listTrackedContactPubkeys,
    normalizeWritableRelayUrls,
    parseContactProfileEvent,
    refreshContactRelayList,
    refreshGroupRelayListsOnStartup,
    resolveContactRelayListReadRelayUrls,
    resolveGroupPublishRelayUrls,
    resolveLoggedInPublishRelayUrls,
    resolveLoggedInReadRelayUrls,
    resolvePrivateContactListPublishRelayUrls,
    resolvePrivateContactListReadRelayUrls,
    resolvePrivateMessageReadRelayUrls,
    resolveTrackedContactReadRelayUrls
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
    updateStoredEventSinceFromCreatedAt
  });

  function queueContactRelayListSubscriptionRefresh(
    seedRelayUrls: string[] = [],
    force = false
  ): void {
    void subscribeContactRelayListUpdates(seedRelayUrls, force).catch((error) => {
      console.warn('Failed to refresh contact relay list subscription', error);
    });
  }

  function queueContactProfileSubscriptionRefresh(
    seedRelayUrls: string[] = [],
    force = false
  ): void {
    void subscribeContactProfileUpdates(seedRelayUrls, force).catch((error) => {
      console.warn('Failed to refresh contact profile subscription', error);
    });
  }

  function queuePrivateMessagesSubscriptionRefresh(
    force = false,
    options: SubscribePrivateMessagesOptions = {}
  ): void {
    void subscribePrivateMessagesForLoggedInUser(force, options).catch((error) => {
      console.warn('Failed to refresh private messages subscription', error);
    });
  }

  function mergeSubscribePrivateMessagesOptions(
    first: SubscribePrivateMessagesOptions,
    second: SubscribePrivateMessagesOptions
  ): SubscribePrivateMessagesOptions {
    const mergedSeedRelayUrls = normalizeRelayStatusUrls([
      ...inputSanitizerService.normalizeStringArray(first.seedRelayUrls ?? []),
      ...inputSanitizerService.normalizeStringArray(second.seedRelayUrls ?? [])
    ]);
    const firstSinceOverride =
      Number.isInteger(first.sinceOverride) && Number(first.sinceOverride) >= 0
        ? Math.floor(Number(first.sinceOverride))
        : null;
    const secondSinceOverride =
      Number.isInteger(second.sinceOverride) && Number(second.sinceOverride) >= 0
        ? Math.floor(Number(second.sinceOverride))
        : null;
    const mergedSinceOverride =
      firstSinceOverride === null
        ? secondSinceOverride
        : secondSinceOverride === null
          ? firstSinceOverride
          : Math.min(firstSinceOverride, secondSinceOverride);
    const mergedRestoreThrottleMs = Math.max(
      normalizeThrottleMs(first.restoreThrottleMs),
      normalizeThrottleMs(second.restoreThrottleMs)
    );

    return {
      ...(mergedRestoreThrottleMs > 0 ? { restoreThrottleMs: mergedRestoreThrottleMs } : {}),
      ...(mergedSeedRelayUrls.length > 0 ? { seedRelayUrls: mergedSeedRelayUrls } : {}),
      ...(mergedSinceOverride !== null ? { sinceOverride: mergedSinceOverride } : {}),
      ...(first.startupTrackStep === true || second.startupTrackStep === true
        ? { startupTrackStep: true }
        : {})
    };
  }

  function queueEpochDrivenPrivateMessagesSubscriptionRefresh(
    options: SubscribePrivateMessagesOptions = {}
  ): void {
    pendingPrivateMessagesEpochSubscriptionRefreshOptions =
      pendingPrivateMessagesEpochSubscriptionRefreshOptions === null
        ? mergeSubscribePrivateMessagesOptions({}, options)
        : mergeSubscribePrivateMessagesOptions(
            pendingPrivateMessagesEpochSubscriptionRefreshOptions,
            options
          );

    if (privateMessagesEpochSubscriptionRefreshTimerId !== null) {
      globalThis.clearTimeout(privateMessagesEpochSubscriptionRefreshTimerId);
    }

    privateMessagesEpochSubscriptionRefreshTimerId = globalThis.setTimeout(() => {
      privateMessagesEpochSubscriptionRefreshTimerId = null;
      const refreshOptions = pendingPrivateMessagesEpochSubscriptionRefreshOptions ?? {};
      pendingPrivateMessagesEpochSubscriptionRefreshOptions = null;
      privateMessagesEpochSubscriptionRefreshQueue = privateMessagesEpochSubscriptionRefreshQueue
        .then(() => subscribePrivateMessagesForLoggedInUser(true, refreshOptions))
        .catch((error) => {
          console.warn('Failed to refresh private message subscription after epoch ticket update', error);
        });
    }, PRIVATE_MESSAGES_EPOCH_SUBSCRIPTION_REFRESH_DEBOUNCE_MS);
  }

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

    privateMessagesWatchdogTimeoutId = globalThis.setTimeout(() => {
      privateMessagesWatchdogTimeoutId = null;
      void runPrivateMessagesWatchdog();
    }, Math.max(0, Math.floor(delayMs)));
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

  function isBrowserOfflineForPrivateMessagesWatchdog(): boolean {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
  }

  async function recoverPrivateMessagesSubscriptionFromWatchdog(
    reason: string,
    details: Record<string, unknown> = {}
  ): Promise<void> {
    const now = Date.now();
    if (now - privateMessagesWatchdogLastRecoveryAt < PRIVATE_MESSAGES_WATCHDOG_RECOVERY_COOLDOWN_MS) {
      logSubscription('private-messages', 'watchdog-recover-skipped', {
        reason,
        cooldownMs: PRIVATE_MESSAGES_WATCHDOG_RECOVERY_COOLDOWN_MS,
        ...details
      });
      return;
    }

    privateMessagesWatchdogLastRecoveryAt = now;
    logSubscription('private-messages', 'watchdog-recover', {
      reason,
      ...details
    });
    await subscribePrivateMessagesForLoggedInUser(true, {
      restoreThrottleMs: PRIVATE_MESSAGES_STARTUP_RESTORE_THROTTLE_MS
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
        if (!privateMessagesSubscription || !privateMessagesSubscriptionSignature || relayUrls.length === 0) {
          if (browserOffline) {
            return;
          }

          await recoverPrivateMessagesSubscriptionFromWatchdog('subscription-missing', {
            hasSubscription: Boolean(privateMessagesSubscription),
            hasSignature: Boolean(privateMessagesSubscriptionSignature),
            relayCount: relayUrls.length
          });
          return;
        }

        const relayStatesBefore = new Map<string, boolean>();
        for (const relayUrl of relayUrls) {
          const relay = ndk.pool.getRelay(normalizeRelayUrl(relayUrl), false);
          relayStatesBefore.set(relayUrl, Boolean(relay?.connected));
        }

        const disconnectedRelayUrls = relayUrls.filter((relayUrl) => !relayStatesBefore.get(relayUrl));
        if (disconnectedRelayUrls.length > 0 && !browserOffline) {
          const shouldLogReconnectAttempt = disconnectedRelayUrls.some(
            (relayUrl) => privateMessagesWatchdogRelayConnectionStates.get(relayUrl) !== false
          );
          if (shouldLogReconnectAttempt) {
            logSubscription('private-messages', 'watchdog-reconnect-relays', {
              disconnectedRelayUrls,
              ...buildSubscriptionRelayDetails(relayUrls)
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
          return after && ((!before && disconnectedRelayUrls.includes(relayUrl)) || previous === false);
        });

        syncPrivateMessagesWatchdogRelayConnectionStates(relayUrls);

        if (reconnectedRelayUrls.length > 0) {
          await recoverPrivateMessagesSubscriptionFromWatchdog('relay-reconnected', {
            reconnectedRelayUrls,
            ...buildSubscriptionRelayDetails(relayUrls)
          });
        }
      } catch (error) {
        console.warn('Private messages watchdog failed', error);
        logSubscription('private-messages', 'watchdog-error', {
          error
        });
      } finally {
        privateMessagesWatchdogRunPromise = null;
        queuePrivateMessagesWatchdog(PRIVATE_MESSAGES_WATCHDOG_INTERVAL_MS);
      }
    })();

    return privateMessagesWatchdogRunPromise;
  }

  function queueTrackedContactSubscriptionsRefresh(
    seedRelayUrls: string[] = [],
    force = false
  ): void {
    queueContactProfileSubscriptionRefresh(seedRelayUrls, force);
    queueContactRelayListSubscriptionRefresh(seedRelayUrls, force);
    queuePrivateMessagesSubscriptionRefresh(force, { seedRelayUrls });
  }

  async function applyContactProfileEvent(event: NDKEvent): Promise<void> {
    if (!shouldApplyContactProfileEvent(event)) {
      return;
    }

    const normalizedPubkey = inputSanitizerService.normalizeHexKey(event.pubkey);
    if (!normalizedPubkey || normalizedPubkey === getLoggedInPublicKeyHex()) {
      return;
    }

    const nextProfile = parseContactProfileEvent(event);
    if (!nextProfile) {
      return;
    }

    const nextEventState = buildContactProfileEventState(event);
    await contactsService.init();
    const existingContact = await contactsService.getContactByPublicKey(normalizedPubkey);
    if (!existingContact) {
      markContactProfileEventApplied(normalizedPubkey, nextEventState);
      return;
    }

    const nextMeta = buildUpdatedContactMeta(
      existingContact.meta,
      nextProfile,
      existingContact.meta.npub?.trim() || encodeNpub(normalizedPubkey) || '',
      existingContact.meta.nprofile?.trim() || encodeNprofile(normalizedPubkey) || ''
    );
    const nextName =
      nextMeta.display_name?.trim() ||
      nextMeta.name?.trim() ||
      existingContact.name?.trim() ||
      normalizedPubkey.slice(0, 16);

    if (existingContact.name === nextName && contactMetadataEqual(existingContact.meta, nextMeta)) {
      markContactProfileEventApplied(normalizedPubkey, nextEventState);
      return;
    }

    const updatedContact = await contactsService.updateContact(existingContact.id, {
      name: nextName,
      meta: nextMeta
    });
    if (!updatedContact) {
      return;
    }

    await chatStore.syncContactProfile(normalizedPubkey);
    markContactProfileEventApplied(normalizedPubkey, nextEventState);
    bumpContactListVersion();
  }

  function queueContactProfileEventApplication(event: NDKEvent): void {
    contactProfileApplyQueue = contactProfileApplyQueue
      .then(() => applyContactProfileEvent(event))
      .catch((error) => {
        console.error('Failed to process contact profile event', error);
      });
  }

  async function applyContactRelayListEvent(event: NDKEvent): Promise<void> {
    if (!shouldApplyContactRelayListEvent(event)) {
      return;
    }

    const normalizedPubkey = inputSanitizerService.normalizeHexKey(event.pubkey);
    if (!normalizedPubkey || normalizedPubkey === getLoggedInPublicKeyHex()) {
      return;
    }

    const nextEventState = buildContactRelayListEventState(event);
    const relayList = NDKRelayList.from(event);
    const nextRelayEntries = relayEntriesFromRelayList(relayList);

    await contactsService.init();
    const existingContact = await contactsService.getContactByPublicKey(normalizedPubkey);
    if (!existingContact) {
      markContactRelayListEventApplied(normalizedPubkey, nextEventState);
      return;
    }

    if (shouldPreserveExistingGroupRelays(existingContact, nextRelayEntries)) {
      console.warn('Ignoring empty group relay list event to preserve stored relays', {
        pubkey: normalizedPubkey,
        eventId: event.id ?? null,
        existingRelayCount: existingContact.relays.length
      });
      markContactRelayListEventApplied(normalizedPubkey, nextEventState);
      return;
    }

    if (contactRelayListsEqual(existingContact.relays, nextRelayEntries)) {
      markContactRelayListEventApplied(normalizedPubkey, nextEventState);
      return;
    }

    const updatedContact = await contactsService.updateContact(existingContact.id, {
      relays: nextRelayEntries
    });
    if (!updatedContact) {
      return;
    }

    markContactRelayListEventApplied(normalizedPubkey, nextEventState);
    bumpContactListVersion();
  }

  function queueContactRelayListEventApplication(event: NDKEvent): void {
    contactRelayListApplyQueue = contactRelayListApplyQueue
      .then(() => applyContactRelayListEvent(event))
      .catch((error) => {
        console.error('Failed to process contact relay list event', error);
      });
  }

  const {
    ensureContactStoredAsGroup,
    ensureRespondedPubkeyIsContact,
    fetchContactPreviewByPublicKey,
    queueBackgroundGroupContactRefresh,
    refreshContactByPublicKey,
    refreshGroupContactByPublicKey,
    resolveUserByIdentifiers
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
    shouldPreserveExistingGroupRelays
  });

  const {
    applyContactCursorStateToContact,
    buildChatMetaWithUnseenReactionCount,
    compareContactCursorState,
    createGroupChat,
    fetchContactCursorEvents,
    fetchGroupIdentitySecretEvents,
    publishContactCursor,
    publishGroupIdentitySecret,
    publishPrivatePreferences,
    restoreContactCursorState,
    restoreGroupIdentitySecrets,
    restorePrivatePreferences,
    scheduleContactCursorPublish
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
    writePrivatePreferencesToStorage
  });

  async function applyPrivateContactListPubkeys(pubkeys: string[]): Promise<void> {
    const loggedInPubkeyHex = getLoggedInPublicKeyHex();
    await Promise.all([contactsService.init(), chatDataService.init(), chatStore.init()]);
    const shouldTrackStartupSteps =
      isRestoringStartupState.value ||
      getStartupStepSnapshot('private-contact-list').status === 'in_progress';
    const profileTracker = shouldTrackStartupSteps
      ? createStartupBatchTracker('private-contact-profiles')
      : null;
    const relayTracker = shouldTrackStartupSteps
      ? createStartupBatchTracker('private-contact-relays')
      : null;

    const nextPubkeys = new Set(
      pubkeys.filter((pubkey) => !loggedInPubkeyHex || pubkey !== loggedInPubkeyHex)
    );
    const existingContacts = await contactsService.listContacts();

    for (const contact of existingContacts) {
      const normalizedPubkey = inputSanitizerService.normalizeHexKey(contact.public_key);
      if (!normalizedPubkey || normalizedPubkey === loggedInPubkeyHex) {
        continue;
      }

      if (nextPubkeys.has(normalizedPubkey)) {
        continue;
      }

      await contactsService.deleteContact(contact.id);
    }

    for (const pubkeyHex of nextPubkeys) {
      const existingContact = await contactsService.getContactByPublicKey(pubkeyHex);
      const ensuredContactResult = await ensureContactListedInPrivateContactList(pubkeyHex, {
        fallbackName: existingContact?.name?.trim() || pubkeyHex.slice(0, 16)
      });
      const fallbackName =
        ensuredContactResult.contact?.name?.trim() ||
        existingContact?.name?.trim() ||
        pubkeyHex.slice(0, 16);
      try {
        await refreshContactByPublicKey(pubkeyHex, fallbackName, {
          onProfileFetchStart: () => {
            profileTracker?.beginItem();
          },
          onProfileFetchEnd: (error) => {
            profileTracker?.finishItem(error ?? undefined);
          },
          onRelayFetchStart: () => {
            relayTracker?.beginItem();
          },
          onRelayFetchEnd: (error) => {
            relayTracker?.finishItem(error ?? undefined);
          }
        });
      } catch (error) {
        profileTracker?.finishItem(error);
        relayTracker?.finishItem(error);
        console.warn('Failed to refresh private contact list profile', pubkeyHex, error);
      }

      await reconcileAcceptedChatFromPrivateContactList(pubkeyHex);
    }

    profileTracker?.seal();
    relayTracker?.seal();

    bumpContactListVersion();
    queueTrackedContactSubscriptionsRefresh();
  }

  async function applyPrivateContactListEvent(event: NDKEvent): Promise<void> {
    if (!shouldApplyPrivateContactListEvent(event)) {
      return;
    }

    const pubkeys = await decryptPrivateContactListContent(event.content);
    await applyPrivateContactListPubkeys(pubkeys);
    markPrivateContactListEventApplied(event);
  }

  function queuePrivateContactListEventApplication(event: NDKEvent): void {
    privateContactListApplyQueue = privateContactListApplyQueue
      .then(() => applyPrivateContactListEvent(event))
      .catch((error) => {
        console.error('Failed to process private contact list event', error);
      });
  }

  async function refreshAllStoredContacts(): Promise<{
    totalCount: number;
    refreshedCount: number;
    failedCount: number;
    cursorContactCount: number;
    cursorAppliedCount: number;
    cursorUiReloaded: boolean;
  }> {
    await contactsService.init();
    const storedContacts = await contactsService.listContacts();
    console.log('Starting stored contacts refresh after DM startup EOSE', {
      contactCount: storedContacts.length
    });
    if (storedContacts.length === 0) {
      return {
        totalCount: 0,
        refreshedCount: 0,
        failedCount: 0,
        cursorContactCount: 0,
        cursorAppliedCount: 0,
        cursorUiReloaded: false
      };
    }

    let refreshedCount = 0;
    let failedCount = 0;

    for (const contact of storedContacts) {
      const fallbackName = contact.name.trim() || contact.public_key.slice(0, 16);
      try {
        await refreshContactByPublicKey(contact.public_key, fallbackName);
        refreshedCount += 1;
      } catch (error) {
        failedCount += 1;
        console.warn('Failed to refresh stored contact after DM startup EOSE', contact.public_key, error);
      }
    }

    const refreshedContacts = await contactsService.listContacts();
    let cursorAppliedCount = 0;
    let cursorUiReloaded = false;
    if (readPrivatePreferencesFromStorage() && refreshedContacts.length > 0) {
      console.log('Starting per-contact cursor data refresh after DM startup EOSE', {
        contactCount: refreshedContacts.length
      });
      const cursorsByDTag = await fetchContactCursorEvents(refreshedContacts);
      for (const contact of refreshedContacts) {
        const contactDTag = await deriveContactCursorDTag(contact.public_key);
        if (!contactDTag) {
          continue;
        }

        const cursor = cursorsByDTag.get(contactDTag);
        if (!cursor) {
          continue;
        }

        if (await applyContactCursorStateToContact(contact, cursor)) {
          cursorAppliedCount += 1;
        }
      }

      if (cursorAppliedCount > 0) {
        console.log('Starting UI refresh after per-contact cursor data refresh', {
          cursorAppliedCount
        });
        await Promise.all([
          chatStore.reload(),
          import('src/stores/messageStore').then(({ useMessageStore }) =>
            useMessageStore().reloadLoadedMessages()
          )
        ]);
        cursorUiReloaded = true;
      }
    }

    bumpContactListVersion();

    return {
      totalCount: storedContacts.length,
      refreshedCount,
      failedCount,
      cursorContactCount: refreshedContacts.length,
      cursorAppliedCount,
      cursorUiReloaded
    };
  }

  function bumpRelayStatusVersion(): void {
    relayStatusVersion.value += 1;
  }

  function getRelayStatusName(status: number): string {
    return NDKRelayStatus[status] ?? 'UNKNOWN';
  }

  function buildRelayConnectionStatsSnapshot(
    stats: NDKRelayConnectionStats | undefined
  ): Pick<
    DeveloperRelaySnapshot,
    'attempts' | 'success' | 'connectedAt' | 'nextReconnectAt' | 'validationRatio' | 'lastDurationMs'
  > {
    if (!stats) {
      return {
        attempts: null,
        success: null,
        connectedAt: null,
        nextReconnectAt: null,
        validationRatio: null,
        lastDurationMs: null
      };
    }

    return {
      attempts: stats.attempts,
      success: stats.success,
      connectedAt: stats.connectedAt ?? null,
      nextReconnectAt: stats.nextReconnectAt ?? null,
      validationRatio: stats.validationRatio ?? null,
      lastDurationMs:
        stats.durations.length > 0 ? stats.durations[stats.durations.length - 1] : null
    };
  }

  function buildRelaySnapshot(relay: NDKRelay | null | undefined): DeveloperRelaySnapshot {
    if (!relay) {
      return {
        present: false,
        url: null,
        connected: false,
        status: null,
        statusName: null,
        attempts: null,
        success: null,
        connectedAt: null,
        nextReconnectAt: null,
        validationRatio: null,
        lastDurationMs: null
      };
    }

    return {
      present: true,
      url: relay.url,
      connected: relay.connected,
      status: relay.status,
      statusName: getRelayStatusName(relay.status),
      ...buildRelayConnectionStatsSnapshot(relay.connectionStats)
    };
  }

  function getRelaySnapshots(relayUrls: string[]): DeveloperRelaySnapshot[] {
    return relayUrls.map((relayUrl) => {
      const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
      return buildRelaySnapshot(ndk.pool.getRelay(normalizedRelayUrl, false));
    });
  }

  function logRelayLifecycle(eventName: string, relay: NDKRelay): void {
    logDeveloperTrace('info', 'relay', eventName, {
      ...buildRelaySnapshot(relay),
      pool: ndk.pool.stats()
    });
  }

  function logMessageRelayDiagnostics(
    phase: string,
    details: Record<string, unknown>,
    level: DeveloperTraceLevel = 'info'
  ): void {
    logDeveloperTrace(level, 'message-relays', phase, details);
  }

  function setRelayConnectivityStatus(
    relay: NDKRelay,
    status: NDKRelayStatus
  ): void {
    const connectivity = relay.connectivity as unknown as {
      _status?: NDKRelayStatus;
    };
    connectivity._status = status;
  }

  ndk.relayAuthDefaultPolicy = async (relay, challenge) => {
    if (authenticatedRelayUrls.has(relay.url)) {
      setRelayConnectivityStatus(relay, NDKRelayStatus.AUTHENTICATED);
      logDeveloperTrace('info', 'relay', 'auth-skip-already-authenticated', {
        ...buildRelaySnapshot(relay),
        challengeLength: challenge.length
      });
      relay.emit('authed');
      return false;
    }

    try {
      await getOrCreateSigner();
      return true;
    } catch (error) {
      logDeveloperTrace('warn', 'relay', 'auth-skip-missing-signer', {
        ...buildRelaySnapshot(relay),
        challengeLength: challenge.length,
        error
      });
      relay.disconnect();
      return false;
    }
  };

  function ensureRelayStatusListeners(): void {
    if (hasRelayStatusListeners) {
      return;
    }

    ndk.pool.on('relay:connecting', (relay) => {
      authenticatedRelayUrls.delete(relay.url);
      bumpRelayStatusVersion();
      logRelayLifecycle('connecting', relay);
    });
    ndk.pool.on('relay:connect', (relay) => {
      authenticatedRelayUrls.delete(relay.url);
      bumpRelayStatusVersion();
      logRelayLifecycle('connect', relay);
      if (privateMessagesSubscriptionRelayUrls.value.includes(relay.url)) {
        queuePrivateMessagesWatchdog(0);
      }
    });
    ndk.pool.on('relay:ready', (relay) => {
      bumpRelayStatusVersion();
      logRelayLifecycle('ready', relay);
    });
    ndk.pool.on('relay:disconnect', (relay) => {
      authenticatedRelayUrls.delete(relay.url);
      bumpRelayStatusVersion();
      logRelayLifecycle('disconnect', relay);
      if (privateMessagesSubscriptionRelayUrls.value.includes(relay.url)) {
        privateMessagesWatchdogRelayConnectionStates.set(relay.url, false);
        queuePrivateMessagesWatchdog(0);
      }
    });
    ndk.pool.on('relay:auth', (relay, challenge) => {
      bumpRelayStatusVersion();
      logDeveloperTrace('info', 'relay', 'auth-requested', {
        ...buildRelaySnapshot(relay),
        challengeLength: challenge.length
      });
    });
    ndk.pool.on('relay:authed', (relay) => {
      authenticatedRelayUrls.add(relay.url);
      bumpRelayStatusVersion();
      logDeveloperTrace('info', 'relay', 'authed', buildRelaySnapshot(relay));
    });
    ndk.pool.on('flapping', (relay) => {
      bumpRelayStatusVersion();
      logRelayLifecycle('flapping', relay);
    });
    hasRelayStatusListeners = true;
  }

  function ensureRelayAuthFailureListener(relay: NDKRelay | null | undefined): void {
    if (!relay || relayAuthFailureListenerUrls.has(relay.url)) {
      return;
    }

    relay.on('auth:failed', (error) => {
      const errorMessage = error instanceof Error ? error.message : String(error ?? '');
      if (errorMessage.toLowerCase().includes('already authenticated')) {
        authenticatedRelayUrls.add(relay.url);
        setRelayConnectivityStatus(relay, NDKRelayStatus.AUTHENTICATED);
        bumpRelayStatusVersion();
        logDeveloperTrace('info', 'relay', 'auth-failed-already-authenticated', {
          ...buildRelaySnapshot(relay),
          error: errorMessage
        });
        relay.emit('authed');
        return;
      }

      authenticatedRelayUrls.delete(relay.url);
      bumpRelayStatusVersion();
      logDeveloperTrace('warn', 'relay', 'auth-failed', {
        ...buildRelaySnapshot(relay),
        error
      });
    });
    relayAuthFailureListenerUrls.add(relay.url);
  }

  async function getOrCreateSigner(): Promise<NDKSigner> {
    const authMethod = getStoredAuthMethod();
    const loggedInPubkeyHex = getLoggedInPublicKeyHex();
    if (!authMethod || !loggedInPubkeyHex) {
      throw new Error('Missing signer session. Login is required.');
    }

    const sessionKey = `${authMethod}:${loggedInPubkeyHex}`;
    if (!cachedSigner || cachedSignerSessionKey !== sessionKey) {
      if (authMethod === 'nip07') {
        if (!hasNip07Extension()) {
          throw new Error('No NIP-07 extension detected. Install or enable one to continue.');
        }

        cachedSigner = new NDKNip07Signer(undefined, ndk);
      } else {
        const privateKeyHex = getPrivateKeyHex();
        if (!privateKeyHex) {
          throw new Error('Missing private key for local signer. Login is required.');
        }

        cachedSigner = new NDKPrivateKeySigner(privateKeyHex, ndk);
      }

      cachedSignerSessionKey = sessionKey;
    }

    ndk.signer = cachedSigner;
    const user = await cachedSigner.blockUntilReady();
    user.ndk = ndk;
    const signerPubkey = inputSanitizerService.normalizeHexKey(user.pubkey ?? cachedSigner.pubkey);
    if (!signerPubkey) {
      throw new Error('Signer did not provide a valid public key.');
    }

    if (signerPubkey !== loggedInPubkeyHex) {
      throw new Error(
        authMethod === 'nip07'
          ? 'The connected NIP-07 extension account does not match the current login.'
          : 'The stored signer does not match the current login.'
      );
    }

    return cachedSigner;
  }

  async function ensureRelayConnections(relayUrls: string[]): Promise<void> {
    ensureRelayStatusListeners();

    const relaysToReconnect = new Map<string, Promise<void>>();

    for (const relayUrl of relayUrls) {
      const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
      if (configuredRelayUrls.has(normalizedRelayUrl)) {
        const existingRelay = ndk.pool.getRelay(normalizedRelayUrl, false);
        const reconnectPromise = connectRelayForEnsureRelayConnections(
          existingRelay,
          normalizedRelayUrl,
          'reconnect'
        );
        if (reconnectPromise) {
          relaysToReconnect.set(normalizedRelayUrl, reconnectPromise);
        }
        continue;
      }

      ndk.addExplicitRelay(normalizedRelayUrl, undefined, true);
      configuredRelayUrls.add(normalizedRelayUrl);
      const addedRelay = ndk.pool.getRelay(normalizedRelayUrl, false);
      const connectPromise = connectRelayForEnsureRelayConnections(
        addedRelay,
        normalizedRelayUrl,
        'connect'
      );
      if (connectPromise) {
        relaysToReconnect.set(normalizedRelayUrl, connectPromise);
      }
      bumpRelayStatusVersion();
    }

    if (hasActivatedPool) {
      if (relaysToReconnect.size > 0) {
        await Promise.all(relaysToReconnect.values());
        bumpRelayStatusVersion();
      }
      return;
    }

    if (!connectPromise) {
      connectPromise = ndk
        .connect(INITIAL_CONNECT_TIMEOUT_MS)
        .then(() => {
          hasActivatedPool = true;
        })
        .finally(() => {
          connectPromise = null;
        });
    }

    await connectPromise;
    bumpRelayStatusVersion();
  }

  function connectRelayForEnsureRelayConnections(
    relay: NDKRelay | null | undefined,
    normalizedRelayUrl: string,
    mode: 'connect' | 'reconnect'
  ): Promise<void> | null {
    ensureRelayAuthFailureListener(relay);
    if (!relay || relay.connected || relay.status !== NDKRelayStatus.DISCONNECTED) {
      return null;
    }

    const pendingConnectPromise = relayConnectPromises.get(normalizedRelayUrl);
    if (pendingConnectPromise) {
      return pendingConnectPromise;
    }

    const cooldownUntil = relayConnectFailureCooldownUntilByUrl.get(normalizedRelayUrl) ?? 0;
    if (cooldownUntil > Date.now()) {
      return null;
    }

    logDeveloperTrace(
      'info',
      'relay-connect',
      mode === 'reconnect' ? 'reconnecting configured relay' : 'connecting new explicit relay',
      {
        reason: 'ensureRelayConnections',
        ...buildRelaySnapshot(relay)
      }
    );

    const connectPromise = relay
      .connect(INITIAL_CONNECT_TIMEOUT_MS)
      .catch((error) => {
        relayConnectFailureCooldownUntilByUrl.set(
          normalizedRelayUrl,
          Date.now() + RELAY_CONNECT_FAILURE_COOLDOWN_MS
        );
        console.warn(
          mode === 'reconnect' ? 'Failed to reconnect relay' : 'Failed to connect relay',
          normalizedRelayUrl,
          {
            cooldownMs: RELAY_CONNECT_FAILURE_COOLDOWN_MS,
            error,
            relay: buildRelaySnapshot(relay)
          }
        );
      })
      .finally(() => {
        relayConnectPromises.delete(normalizedRelayUrl);
      });

    relayConnectPromises.set(normalizedRelayUrl, connectPromise);
    return connectPromise;
  }

  function getRelayConnectionState(relayUrl: string): RelayConnectionState {
    const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
    const relay = ndk.pool.relays.get(normalizedRelayUrl);
    if (!relay) {
      return 'issue';
    }

    return relay.connected ? 'connected' : 'issue';
  }

  async function fetchRelayNip11Info(
    relayUrl: string,
    force = false
  ): Promise<NDKRelayInformation> {
    const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
    const relay = ndk.pool.getRelay(normalizedRelayUrl, false);
    return relay.fetchInfo(force);
  }

  async function publishUserMetadata(
    metadata: PublishUserMetadataInput,
    relayUrls: string[]
  ): Promise<void> {
    const relayList = inputSanitizerService.normalizeStringArray(relayUrls);
    if (relayList.length === 0) {
      throw new Error('Cannot publish profile without at least one relay.');
    }

    await ensureRelayConnections(relayList);

    const signer = await getOrCreateSigner();
    const user = await signer.user();
    user.ndk = ndk;
    user.profile = metadata as NDKUserProfile;
    await user.publish();
  }

  async function publishGroupMetadata(
    groupPublicKey: string,
    metadata: PublishUserMetadataInput,
    seedRelayUrls: string[] = []
  ): Promise<void> {
    const normalizedGroupPublicKey = inputSanitizerService.normalizeHexKey(groupPublicKey);
    const loggedInPubkeyHex = getLoggedInPublicKeyHex();
    if (!loggedInPubkeyHex) {
      throw new Error('Missing public key in localStorage. Login is required.');
    }

    if (!normalizedGroupPublicKey) {
      throw new Error('A valid group public key is required.');
    }

    await contactsService.init();
    const groupContact = await contactsService.getContactByPublicKey(normalizedGroupPublicKey);
    if (!groupContact || groupContact.type !== 'group') {
      throw new Error('Group contact not found.');
    }

    const normalizedOwnerPublicKey = inputSanitizerService.normalizeHexKey(
      groupContact.meta.owner_public_key ?? ''
    );
    if (!normalizedOwnerPublicKey || normalizedOwnerPublicKey !== loggedInPubkeyHex) {
      throw new Error('Only the owner can publish this group profile.');
    }

    const encryptedGroupPrivateKey = groupContact.meta.group_private_key_encrypted?.trim() ?? '';
    if (!encryptedGroupPrivateKey) {
      throw new Error('Encrypted group private key not found.');
    }

    const decryptedSecret = await decryptGroupIdentitySecretContent(encryptedGroupPrivateKey);
    if (
      !decryptedSecret ||
      inputSanitizerService.normalizeHexKey(decryptedSecret.group_pubkey) !== normalizedGroupPublicKey
    ) {
      throw new Error('Failed to decrypt the group private key.');
    }

    const relayUrls = resolveGroupPublishRelayUrls(groupContact.relays, seedRelayUrls);
    if (relayUrls.length === 0) {
      throw new Error('Cannot publish group profile without at least one group relay.');
    }

    await ensureRelayConnections(relayUrls);

    const groupSigner = new NDKPrivateKeySigner(decryptedSecret.group_privkey, ndk);
    const signerUser = await groupSigner.user();
    if (inputSanitizerService.normalizeHexKey(signerUser.pubkey) !== normalizedGroupPublicKey) {
      throw new Error('Decrypted group private key does not match the group public key.');
    }

    const metadataEvent = new NDKEvent(ndk, {
      kind: NDKKind.Metadata,
      created_at: Math.floor(Date.now() / 1000),
      content: JSON.stringify(metadata)
    } as NostrEvent);
    await metadataEvent.sign(groupSigner);

    const publishResult = await publishEventWithRelayStatuses(metadataEvent, relayUrls, 'self');
    if (
      publishResult.relayStatuses.some(
        (entry) => entry.direction === 'outbound' && entry.status === 'published'
      )
    ) {
      updateStoredEventSinceFromCreatedAt(metadataEvent.created_at);
      return;
    }

    throw publishResult.error ?? new Error('Failed to publish group profile metadata.');
  }

  async function publishMyRelayList(
    relayEntries: RelayListMetadataEntry[],
    publishRelayUrls: string[] = []
  ): Promise<void> {
    const normalizedRelayEntries = inputSanitizerService.normalizeRelayListMetadataEntries(relayEntries);
    const relayUrls = await resolveLoggedInPublishRelayUrls([
      ...publishRelayUrls,
      ...normalizedRelayEntries.map((relay) => relay.url)
    ]);
    if (relayUrls.length === 0) {
      throw new Error('Cannot publish relay list without at least one publish relay.');
    }

    await ensureRelayConnections(relayUrls);
    await getOrCreateSigner();

    const relayListEvent = new NDKRelayList(ndk);
    relayListEvent.content = '';
    relayListEvent.tags = [];
    relayListEvent.bothRelayUrls = normalizedRelayEntries
      .filter((relay) => relay.read && relay.write)
      .map((relay) => relay.url);
    relayListEvent.readRelayUrls = normalizedRelayEntries
      .filter((relay) => relay.read && !relay.write)
      .map((relay) => relay.url);
    relayListEvent.writeRelayUrls = normalizedRelayEntries
      .filter((relay) => !relay.read && relay.write)
      .map((relay) => relay.url);

    const relaySet = NDKRelaySet.fromRelayUrls(relayUrls, ndk);
    await relayListEvent.publishReplaceable(relaySet);
    updateStoredEventSinceFromCreatedAt(relayListEvent.created_at);
  }

  async function publishGroupRelayList(
    groupPublicKey: string,
    relayEntries: RelayListMetadataEntry[],
    publishRelayUrls: string[] = []
  ): Promise<RelaySaveStatus> {
    const normalizedGroupPublicKey = inputSanitizerService.normalizeHexKey(groupPublicKey);
    const loggedInPubkeyHex = getLoggedInPublicKeyHex();
    if (!loggedInPubkeyHex) {
      throw new Error('Missing public key in localStorage. Login is required.');
    }

    if (!normalizedGroupPublicKey) {
      throw new Error('A valid group public key is required.');
    }

    await contactsService.init();
    const groupContact = await contactsService.getContactByPublicKey(normalizedGroupPublicKey);
    if (!groupContact || groupContact.type !== 'group') {
      throw new Error('Group contact not found.');
    }

    const normalizedOwnerPublicKey = inputSanitizerService.normalizeHexKey(
      groupContact.meta.owner_public_key ?? ''
    );
    if (!normalizedOwnerPublicKey || normalizedOwnerPublicKey !== loggedInPubkeyHex) {
      throw new Error('Only the owner can publish the group relay list.');
    }

    const encryptedGroupPrivateKey =
      groupContact.meta.group_private_key_encrypted?.trim() ?? '';
    if (!encryptedGroupPrivateKey) {
      throw new Error('Encrypted group private key not found.');
    }

    const decryptedSecret = await decryptGroupIdentitySecretContent(encryptedGroupPrivateKey);
    if (
      !decryptedSecret ||
      inputSanitizerService.normalizeHexKey(decryptedSecret.group_pubkey) !== normalizedGroupPublicKey
    ) {
      throw new Error('Failed to decrypt the group private key.');
    }

    const normalizedRelayEntries = inputSanitizerService.normalizeRelayListMetadataEntries(relayEntries);
    const relayUrls = normalizeRelayStatusUrls([
      ...inputSanitizerService.normalizeStringArray(publishRelayUrls),
      ...normalizedRelayEntries.map((relay) => relay.url)
    ]);
    if (relayUrls.length === 0) {
      throw new Error('Cannot publish group relay list without at least one group relay.');
    }

    await ensureRelayConnections(relayUrls);

    const groupSigner = new NDKPrivateKeySigner(decryptedSecret.group_privkey, ndk);
    const signerUser = await groupSigner.user();
    if (inputSanitizerService.normalizeHexKey(signerUser.pubkey) !== normalizedGroupPublicKey) {
      throw new Error('Decrypted group private key does not match the group public key.');
    }

    const relayListEvent = new NDKRelayList(ndk);
    relayListEvent.pubkey = normalizedGroupPublicKey;
    relayListEvent.created_at = Math.floor(Date.now() / 1000);
    relayListEvent.content = '';
    relayListEvent.tags = [];
    relayListEvent.bothRelayUrls = normalizedRelayEntries
      .filter((relay) => relay.read && relay.write)
      .map((relay) => relay.url);
    relayListEvent.readRelayUrls = normalizedRelayEntries
      .filter((relay) => relay.read && !relay.write)
      .map((relay) => relay.url);
    relayListEvent.writeRelayUrls = normalizedRelayEntries
      .filter((relay) => !relay.read && relay.write)
      .map((relay) => relay.url);
    await relayListEvent.sign(groupSigner);

    const publishResult = await publishEventWithRelayStatuses(relayListEvent, relayUrls, 'self');
    const relaySaveStatus = buildRelaySaveStatus(publishResult.relayStatuses);
    if (publishResult.error && !relaySaveStatus.errorMessage) {
      relaySaveStatus.errorMessage = publishResult.error.message;
    }

    if (relaySaveStatus.publishedRelayUrls.length > 0) {
      updateStoredEventSinceFromCreatedAt(relayListEvent.created_at);
    }

    return relaySaveStatus;
  }

  async function updateLoggedInUserRelayList(
    relayEntries: RelayListMetadataEntry[]
  ): Promise<void> {
    const loggedInPubkeyHex = getLoggedInPublicKeyHex();
    if (!loggedInPubkeyHex) {
      return;
    }

    const normalizedRelayEntries = inputSanitizerService.normalizeRelayListMetadataEntries(relayEntries);
    await contactsService.init();

    const existingContact = await contactsService.getContactByPublicKey(loggedInPubkeyHex);
    if (!existingContact) {
      await contactsService.createContact({
        public_key: loggedInPubkeyHex,
        name: loggedInPubkeyHex.slice(0, 16),
        given_name: null,
        meta: {},
        relays: normalizedRelayEntries
      });
      try {
        await subscribePrivateMessagesForLoggedInUser(true);
      } catch (error) {
        console.warn('Failed to subscribe to private messages', error);
      }
      queueTrackedContactSubscriptionsRefresh();
      return;
    }

    await contactsService.updateContact(existingContact.id, {
      relays: normalizedRelayEntries
    });
    await subscribePrivateMessagesForLoggedInUser(true);
    queueTrackedContactSubscriptionsRefresh();
  }

  async function fetchMyRelayListEntries(seedRelayUrls: string[] = []): Promise<ContactRelay[] | null> {
    const loggedInPubkeyHex = getLoggedInPublicKeyHex();
    if (!loggedInPubkeyHex || !getStoredAuthMethod()) {
      return null;
    }

    const relayUrls = await resolveLoggedInReadRelayUrls(seedRelayUrls);
    if (relayUrls.length === 0) {
      return null;
    }

    await ensureRelayConnections(relayUrls);

    const signer = await getOrCreateSigner();
    const user = await signer.user();
    user.ndk = ndk;

    const relaySet = NDKRelaySet.fromRelayUrls(relayUrls, ndk);
    const relayListEvent = await ndk.fetchEvent(
      {
        kinds: [NDKKind.RelayList],
        authors: [user.pubkey],
        since: getFilterSince()
      },
      {
        cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY
      },
      relaySet
    );
    if (!relayListEvent) {
      return null;
    }

    updateStoredEventSinceFromCreatedAt(relayListEvent.created_at);

    const parsedRelayList = NDKRelayList.from(
      relayListEvent instanceof NDKEvent ? relayListEvent : new NDKEvent(ndk, relayListEvent)
    );

    return relayEntriesFromRelayList(parsedRelayList);
  }

  async function applyMyRelayListEntries(relayEntries: RelayListMetadataEntry[]): Promise<void> {
    const normalizedRelayEntries = inputSanitizerService.normalizeRelayListMetadataEntries(relayEntries);
    const nip65RelayStore = useNip65RelayStore();
    nip65RelayStore.init();
    nip65RelayStore.replaceRelayEntries(normalizedRelayEntries);
    await updateLoggedInUserRelayList(normalizedRelayEntries);
  }

  async function restoreMyRelayList(seedRelayUrls: string[] = []): Promise<void> {
    if (restoreMyRelayListPromise) {
      return restoreMyRelayListPromise;
    }

    beginStartupStep('my-relay-list');
    restoreMyRelayListPromise = (async () => {
      try {
        const relayEntries = await fetchMyRelayListEntries(seedRelayUrls);
        if (relayEntries === null) {
          completeStartupStep('my-relay-list');
          return;
        }

        await applyMyRelayListEntries(relayEntries);
        completeStartupStep('my-relay-list');
      } catch (error) {
        failStartupStep('my-relay-list', error);
        throw error;
      }
    })().finally(() => {
      restoreMyRelayListPromise = null;
    });

    return restoreMyRelayListPromise;
  }

  function stopMyRelayListSubscription(reason = 'replace'): void {
    if (myRelayListSubscription) {
      logSubscription('my-relay-list', 'stop', {
        reason,
        signature: myRelayListSubscriptionSignature || null
      });
      myRelayListSubscription.stop();
      myRelayListSubscription = null;
    }

    myRelayListSubscriptionSignature = '';
  }

  async function subscribeMyRelayListUpdates(
    seedRelayUrls: string[] = [],
    force = false
  ): Promise<void> {
    const loggedInPubkeyHex = getLoggedInPublicKeyHex();
    if (!loggedInPubkeyHex) {
      stopMyRelayListSubscription('missing-login');
      return;
    }

    const relayUrls = await resolveLoggedInReadRelayUrls(seedRelayUrls);
    if (relayUrls.length === 0) {
      stopMyRelayListSubscription('no-relays');
      return;
    }

    const signature = `${loggedInPubkeyHex}:${relaySignature(relayUrls)}`;
    if (!force && myRelayListSubscription && myRelayListSubscriptionSignature === signature) {
      logSubscription('my-relay-list', 'skip', {
        reason: 'already-active',
        signature,
        pubkey: formatSubscriptionLogValue(loggedInPubkeyHex),
        ...buildSubscriptionRelayDetails(relayUrls)
      });
      return;
    }

    logSubscription('my-relay-list', 'prepare', {
      force,
      signature,
      pubkey: formatSubscriptionLogValue(loggedInPubkeyHex),
      since: getFilterSince(),
      ...buildSubscriptionRelayDetails(relayUrls),
      relaySnapshots: getRelaySnapshots(relayUrls)
    });

    await ensureRelayConnections(relayUrls);
    await getLoggedInSignerUser();
    stopMyRelayListSubscription();

    logSubscription('my-relay-list', 'start', {
      force,
      signature,
      pubkey: formatSubscriptionLogValue(loggedInPubkeyHex),
      subscriptionTargetType: 'user',
      userTargetCount: 1,
      userTargetPubkeys: [formatSubscriptionLogValue(loggedInPubkeyHex)],
      since: getFilterSince(),
      ...buildSubscriptionRelayDetails(relayUrls),
      relaySnapshots: getRelaySnapshots(relayUrls)
    });

    const relaySet = NDKRelaySet.fromRelayUrls(relayUrls, ndk);
    const myRelayListFilters: NDKFilter = {
      kinds: [NDKKind.RelayList],
      authors: [loggedInPubkeyHex],
      since: getFilterSince()
    };
    myRelayListSubscription = subscribeWithReqLogging(
      'my-relay-list',
      'my-relay-list',
      myRelayListFilters,
      {
        relaySet,
        cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
        onEvent: (event) => {
          const wrappedEvent = event instanceof NDKEvent ? event : new NDKEvent(ndk, event);
          logSubscription('my-relay-list', 'event', {
            signature,
            ...buildSubscriptionEventDetails(wrappedEvent),
            ...buildSubscriptionRelayDetails(extractRelayUrlsFromEvent(wrappedEvent))
          });
          updateStoredEventSinceFromCreatedAt(wrappedEvent.created_at);
          myRelayListApplyQueue = myRelayListApplyQueue
            .then(async () => {
              const relayList = NDKRelayList.from(wrappedEvent);
              await applyMyRelayListEntries(relayEntriesFromRelayList(relayList));
            })
            .catch((error) => {
              console.error('Failed to process my relay list event', error);
            });
        },
        onEose: () => {
          logSubscription('my-relay-list', 'eose', {
            signature
          });
        }
      },
      {
        signature,
        ...buildSubscriptionRelayDetails(relayUrls)
      }
    );
    myRelayListSubscriptionSignature = signature;

    logSubscription('my-relay-list', 'active', {
      signature,
      pubkey: formatSubscriptionLogValue(loggedInPubkeyHex),
      ...buildSubscriptionRelayDetails(relayUrls),
      relaySnapshots: getRelaySnapshots(relayUrls)
    });
  }

  async function publishPrivateContactList(seedRelayUrls: string[] = []): Promise<void> {
    try {
      const loggedInPubkeyHex = getLoggedInPublicKeyHex();
      if (!loggedInPubkeyHex) {
        throw new Error('Missing public key in localStorage. Login is required.');
      }

      const relayUrls = await resolvePrivateContactListPublishRelayUrls(seedRelayUrls);
      if (relayUrls.length === 0) {
        throw new Error('Cannot publish private contact list without at least one relay.');
      }

      await ensureRelayConnections(relayUrls);

      await contactsService.init();
      const contacts = await contactsService.listContacts();
      const pubkeys = contacts
        .map((contact) => inputSanitizerService.normalizeHexKey(contact.public_key))
        .filter(
          (pubkey): pubkey is string => Boolean(pubkey) && pubkey !== loggedInPubkeyHex
        );
      const user = await getLoggedInSignerUser();

      const listEvent = new NDKEvent(ndk, {
        kind: NDKKind.FollowSet,
        created_at: Math.floor(Date.now() / 1000),
        pubkey: user.pubkey,
        content: await encryptPrivateContactListTags(buildPrivateContactListTags(pubkeys)),
        tags: [
          ['d', PRIVATE_CONTACT_LIST_D_TAG],
          ['title', PRIVATE_CONTACT_LIST_TITLE]
        ]
      });

      const relaySet = NDKRelaySet.fromRelayUrls(relayUrls, ndk);
      await listEvent.publishReplaceable(relaySet);
      updateStoredEventSinceFromCreatedAt(listEvent.created_at);
      markPrivateContactListEventApplied(listEvent);
    } finally {
      queueTrackedContactSubscriptionsRefresh(seedRelayUrls);
    }
  }

  async function restorePrivateContactList(seedRelayUrls: string[] = []): Promise<void> {
    if (restorePrivateContactListPromise) {
      return restorePrivateContactListPromise;
    }

    beginStartupStep('private-contact-list');
    restorePrivateContactListPromise = (async () => {
      try {
        const loggedInPubkeyHex = getLoggedInPublicKeyHex();
        if (!loggedInPubkeyHex) {
          completeStartupStep('private-contact-list');
          return;
        }

        const relayUrls = await resolvePrivateContactListReadRelayUrls(seedRelayUrls);
        if (relayUrls.length === 0) {
          completeStartupStep('private-contact-list');
          return;
        }

        await ensureRelayConnections(relayUrls);
        await getLoggedInSignerUser();

        const relaySet = NDKRelaySet.fromRelayUrls(relayUrls, ndk);
        const listEvent = await ndk.fetchEvent(
          {
            kinds: [NDKKind.FollowSet],
            authors: [loggedInPubkeyHex],
            '#d': [PRIVATE_CONTACT_LIST_D_TAG],
            since: getFilterSince()
          },
          {
            cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY
          },
          relaySet
        );
        if (!listEvent) {
          completeStartupStep('private-contact-list');
          return;
        }

        updateStoredEventSinceFromCreatedAt(listEvent.created_at);

        await applyPrivateContactListEvent(
          listEvent instanceof NDKEvent ? listEvent : new NDKEvent(ndk, listEvent)
        );
        completeStartupStep('private-contact-list');
      } catch (error) {
        failStartupStep('private-contact-list', error);
        throw error;
      }
    })().finally(() => {
      restorePrivateContactListPromise = null;
    });

    return restorePrivateContactListPromise;
  }

  function stopPrivateContactListSubscription(reason = 'replace'): void {
    if (privateContactListSubscription) {
      logSubscription('private-contact-list', 'stop', {
        reason,
        signature: privateContactListSubscriptionSignature || null
      });
      privateContactListSubscription.stop();
      privateContactListSubscription = null;
    }

    privateContactListSubscriptionSignature = '';
  }

  async function subscribePrivateContactListUpdates(
    seedRelayUrls: string[] = [],
    force = false
  ): Promise<void> {
    const loggedInPubkeyHex = getLoggedInPublicKeyHex();
    if (!loggedInPubkeyHex) {
      stopPrivateContactListSubscription('missing-login');
      return;
    }

    const relayUrls = await resolvePrivateContactListReadRelayUrls(seedRelayUrls);
    if (relayUrls.length === 0) {
      stopPrivateContactListSubscription('no-relays');
      return;
    }

    const signature = `${loggedInPubkeyHex}:${relaySignature(relayUrls)}`;
    if (!force && privateContactListSubscription && privateContactListSubscriptionSignature === signature) {
      logSubscription('private-contact-list', 'skip', {
        reason: 'already-active',
        signature,
        pubkey: formatSubscriptionLogValue(loggedInPubkeyHex),
        ...buildSubscriptionRelayDetails(relayUrls)
      });
      return;
    }

    logSubscription('private-contact-list', 'prepare', {
      force,
      signature,
      pubkey: formatSubscriptionLogValue(loggedInPubkeyHex),
      since: getFilterSince(),
      ...buildSubscriptionRelayDetails(relayUrls)
    });

    await ensureRelayConnections(relayUrls);
    await getLoggedInSignerUser();
    stopPrivateContactListSubscription();

    logSubscription('private-contact-list', 'start', {
      force,
      signature,
      pubkey: formatSubscriptionLogValue(loggedInPubkeyHex),
      subscriptionTargetType: 'user',
      userTargetCount: 1,
      userTargetPubkeys: [formatSubscriptionLogValue(loggedInPubkeyHex)],
      since: getFilterSince(),
      ...buildSubscriptionRelayDetails(relayUrls)
    });

    const relaySet = NDKRelaySet.fromRelayUrls(relayUrls, ndk);
    const privateContactListFilters: NDKFilter = {
      kinds: [NDKKind.FollowSet],
      authors: [loggedInPubkeyHex],
      '#d': [PRIVATE_CONTACT_LIST_D_TAG],
      since: getFilterSince()
    };
    privateContactListSubscription = subscribeWithReqLogging(
      'private-contact-list',
      'private-contact-list',
      privateContactListFilters,
      {
        relaySet,
        cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
        onEvent: (event) => {
          const wrappedEvent = event instanceof NDKEvent ? event : new NDKEvent(ndk, event);
          logSubscription('private-contact-list', 'event', {
            signature,
            ...buildSubscriptionEventDetails(wrappedEvent),
            ...buildSubscriptionRelayDetails(extractRelayUrlsFromEvent(wrappedEvent))
          });
          updateStoredEventSinceFromCreatedAt(wrappedEvent.created_at);
          queuePrivateContactListEventApplication(wrappedEvent);
        },
        onEose: () => {
          logSubscription('private-contact-list', 'eose', {
            signature
          });
        }
      },
      {
        signature,
        ...buildSubscriptionRelayDetails(relayUrls)
      }
    );
    privateContactListSubscriptionSignature = signature;

    logSubscription('private-contact-list', 'active', {
      signature,
      pubkey: formatSubscriptionLogValue(loggedInPubkeyHex),
      ...buildSubscriptionRelayDetails(relayUrls)
    });
  }

  function stopContactProfileSubscription(reason = 'replace'): void {
    if (contactProfileSubscription) {
      logSubscription('contact-profile', 'stop', {
        reason,
        signature: contactProfileSubscriptionSignature || null
      });
      contactProfileSubscription.stop();
      contactProfileSubscription = null;
    }

    contactProfileSubscriptionSignature = '';
  }

  async function subscribeContactProfileUpdates(
    seedRelayUrls: string[] = [],
    force = false
  ): Promise<void> {
    const loggedInPubkeyHex = getLoggedInPublicKeyHex();
    if (!loggedInPubkeyHex) {
      pruneTrackedContactProfileEventState([]);
      stopContactProfileSubscription('missing-login');
      return;
    }

    const relayUrls = await resolveTrackedContactReadRelayUrls(seedRelayUrls);
    if (relayUrls.length === 0) {
      stopContactProfileSubscription('no-relays');
      return;
    }

    const contactPubkeys = await listTrackedContactPubkeys();
    pruneTrackedContactProfileEventState(contactPubkeys);
    if (contactPubkeys.length === 0) {
      stopContactProfileSubscription('no-contacts');
      return;
    }

    const signature = `${relaySignature(relayUrls)}:${contactPubkeys.join(',')}`;
    if (!force && contactProfileSubscription && contactProfileSubscriptionSignature === signature) {
      logSubscription('contact-profile', 'skip', {
        reason: 'already-active',
        signature,
        ...buildSubscriptionRelayDetails(relayUrls),
        recipientCount: contactPubkeys.length,
        recipients: contactPubkeys.map((value) => formatSubscriptionLogValue(value))
      });
      return;
    }

    logSubscription('contact-profile', 'prepare', {
      force,
      signature,
      since: getFilterSince(),
      ...buildSubscriptionRelayDetails(relayUrls),
      recipientCount: contactPubkeys.length,
      recipients: contactPubkeys.map((value) => formatSubscriptionLogValue(value))
    });

    await ensureRelayConnections(relayUrls);
    await getLoggedInSignerUser();
    stopContactProfileSubscription();
    const contactProfileTargetDetails = await buildTrackedContactSubscriptionTargetDetails(contactPubkeys);

    logSubscription('contact-profile', 'start', {
      force,
      signature,
      since: getFilterSince(),
      ...buildSubscriptionRelayDetails(relayUrls),
      recipientCount: contactPubkeys.length,
      recipients: contactPubkeys.map((value) => formatSubscriptionLogValue(value)),
      ...contactProfileTargetDetails
    });

    const relaySet = NDKRelaySet.fromRelayUrls(relayUrls, ndk);
    const contactProfileFilters: NDKFilter = {
      kinds: [NDKKind.Metadata],
      authors: contactPubkeys,
      since: getFilterSince()
    };
    contactProfileSubscription = subscribeWithReqLogging(
      'contact-profile',
      'contact-profile',
      contactProfileFilters,
      {
        relaySet,
        cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
        onEvent: (event) => {
          const wrappedEvent = event instanceof NDKEvent ? event : new NDKEvent(ndk, event);
          logSubscription('contact-profile', 'event', {
            signature,
            ...buildSubscriptionEventDetails(wrappedEvent),
            ...buildSubscriptionRelayDetails(extractRelayUrlsFromEvent(wrappedEvent))
          });
          updateStoredEventSinceFromCreatedAt(wrappedEvent.created_at);
          queueContactProfileEventApplication(wrappedEvent);
        },
        onEose: () => {
          logSubscription('contact-profile', 'eose', {
            signature
          });
        }
      },
      {
        signature,
        ...buildSubscriptionRelayDetails(relayUrls)
      }
    );
    contactProfileSubscriptionSignature = signature;

    logSubscription('contact-profile', 'active', {
      signature,
      ...buildSubscriptionRelayDetails(relayUrls),
      recipientCount: contactPubkeys.length,
      recipients: contactPubkeys.map((value) => formatSubscriptionLogValue(value))
    });
  }

  function stopContactRelayListSubscription(reason = 'replace'): void {
    if (contactRelayListSubscription) {
      logSubscription('contact-relay-list', 'stop', {
        reason,
        signature: contactRelayListSubscriptionSignature || null
      });
      contactRelayListSubscription.stop();
      contactRelayListSubscription = null;
    }

    contactRelayListSubscriptionSignature = '';
  }

  async function subscribeContactRelayListUpdates(
    seedRelayUrls: string[] = [],
    force = false
  ): Promise<void> {
    const loggedInPubkeyHex = getLoggedInPublicKeyHex();
    if (!loggedInPubkeyHex) {
      pruneTrackedContactRelayListEventState([]);
      stopContactRelayListSubscription('missing-login');
      return;
    }

    const relayUrls = await resolveTrackedContactReadRelayUrls(seedRelayUrls);
    if (relayUrls.length === 0) {
      stopContactRelayListSubscription('no-relays');
      return;
    }

    const contactPubkeys = await listTrackedContactPubkeys();
    pruneTrackedContactRelayListEventState(contactPubkeys);
    if (contactPubkeys.length === 0) {
      stopContactRelayListSubscription('no-contacts');
      return;
    }

    const signature = `${relaySignature(relayUrls)}:${contactPubkeys.join(',')}`;
    if (!force && contactRelayListSubscription && contactRelayListSubscriptionSignature === signature) {
      logSubscription('contact-relay-list', 'skip', {
        reason: 'already-active',
        signature,
        ...buildSubscriptionRelayDetails(relayUrls),
        recipientCount: contactPubkeys.length,
        recipients: contactPubkeys.map((value) => formatSubscriptionLogValue(value))
      });
      return;
    }

    logSubscription('contact-relay-list', 'prepare', {
      force,
      signature,
      since: getFilterSince(),
      ...buildSubscriptionRelayDetails(relayUrls),
      recipientCount: contactPubkeys.length,
      recipients: contactPubkeys.map((value) => formatSubscriptionLogValue(value))
    });

    await ensureRelayConnections(relayUrls);
    await getLoggedInSignerUser();
    stopContactRelayListSubscription();
    const contactRelayTargetDetails = await buildTrackedContactSubscriptionTargetDetails(contactPubkeys);

    logSubscription('contact-relay-list', 'start', {
      force,
      signature,
      since: getFilterSince(),
      ...buildSubscriptionRelayDetails(relayUrls),
      recipientCount: contactPubkeys.length,
      recipients: contactPubkeys.map((value) => formatSubscriptionLogValue(value)),
      ...contactRelayTargetDetails
    });

    const relaySet = NDKRelaySet.fromRelayUrls(relayUrls, ndk);
    const contactRelayListFilters: NDKFilter = {
      kinds: [NDKKind.RelayList],
      authors: contactPubkeys,
      since: getFilterSince()
    };
    contactRelayListSubscription = subscribeWithReqLogging(
      'contact-relay-list',
      'contact-relay-list',
      contactRelayListFilters,
      {
        relaySet,
        cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
        onEvent: (event) => {
          const wrappedEvent = event instanceof NDKEvent ? event : new NDKEvent(ndk, event);
          logSubscription('contact-relay-list', 'event', {
            signature,
            ...buildSubscriptionEventDetails(wrappedEvent),
            ...buildSubscriptionRelayDetails(extractRelayUrlsFromEvent(wrappedEvent))
          });
          updateStoredEventSinceFromCreatedAt(wrappedEvent.created_at);
          queueContactRelayListEventApplication(wrappedEvent);
        },
        onEose: () => {
          logSubscription('contact-relay-list', 'eose', {
            signature
          });
        }
      },
      {
        signature,
        ...buildSubscriptionRelayDetails(relayUrls)
      }
    );
    contactRelayListSubscriptionSignature = signature;

    logSubscription('contact-relay-list', 'active', {
      signature,
      ...buildSubscriptionRelayDetails(relayUrls),
      recipientCount: contactPubkeys.length,
      recipients: contactPubkeys.map((value) => formatSubscriptionLogValue(value))
    });
  }

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
      let subscription: ReturnType<typeof ndk.subscribe> | null = null;

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
      let subscription: ReturnType<typeof ndk.subscribe> | null = null;

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

    await privateMessagesIngestQueue;
  }

  async function restoreGroupEpochHistory(
    groupPublicKey: string,
    epochPublicKey: string,
    options: {
      force?: boolean;
    } = {}
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

  function stopPrivateMessagesSubscription(reason = 'replace'): void {
    stopPrivateMessagesBackfill(reason);

    if (privateMessagesSubscription) {
      logSubscription('private-messages', 'stop', {
        reason,
        signature: privateMessagesSubscriptionSignature || null
      });
      privateMessagesSubscription.stop();
      privateMessagesSubscription = null;
    }

    if (privateMessagesUiRefreshTimeoutId !== null) {
      globalThis.clearTimeout(privateMessagesUiRefreshTimeoutId);
      privateMessagesUiRefreshTimeoutId = null;
    }

    privateMessagesWatchdogRelayConnectionStates.clear();
    privateMessagesSubscriptionSignature = '';
    privateMessagesRestoreThrottleMs = 0;
    shouldReloadChatsOnPrivateMessagesUiRefresh = false;
    shouldReloadMessagesOnPrivateMessagesUiRefresh = false;
    privateMessagesSubscriptionRelayUrls.value = [];
    privateMessagesSubscriptionSince.value = null;
    bumpDeveloperDiagnosticsVersion();
  }

  function queuePrivateMessageIngestion(
    wrappedEvent: NDKEvent,
    loggedInPubkeyHex: string,
    options: {
      uiThrottleMs?: number;
    } = {}
  ): void {
    const uiThrottleMs =
      typeof options.uiThrottleMs === 'number'
        ? normalizeThrottleMs(options.uiThrottleMs)
        : privateMessagesRestoreThrottleMs;

    privateMessagesIngestQueue = privateMessagesIngestQueue
      .then(() =>
        processIncomingPrivateMessage(wrappedEvent, loggedInPubkeyHex, {
          uiThrottleMs
        })
      )
      .catch((error) => {
        console.error('Failed to process incoming private message', error);
      });
  }

  async function processIncomingPrivateMessage(
    wrappedEvent: NDKEvent,
    loggedInPubkeyHex: string,
    options: {
      uiThrottleMs?: number;
    } = {}
  ): Promise<void> {
    const wrappedRelayUrls = extractRelayUrlsFromEvent(wrappedEvent);
    if (wrappedEvent.kind !== NDKKind.GiftWrap) {
      logInboundEvent('drop', {
        reason: 'unsupported-wrapper-kind',
        ...buildInboundTraceDetails({
          wrappedEvent,
          loggedInPubkeyHex,
          relayUrls: wrappedRelayUrls
        })
      });
      return;
    }

    const recipientContext = await resolveIncomingPrivateMessageRecipientContext(
      wrappedEvent,
      loggedInPubkeyHex
    );
    if (!recipientContext) {
      logInboundEvent('drop', {
        reason: 'unknown-recipient-context',
        ...buildInboundTraceDetails({
          wrappedEvent,
          loggedInPubkeyHex,
          relayUrls: wrappedRelayUrls
        })
      });
      return;
    }

    let rumorEvent: NDKEvent;
    try {
      rumorEvent = await giftUnwrap(wrappedEvent, undefined, recipientContext.unwrapSigner);
    } catch (error) {
      logDeveloperTrace('warn', 'inbound', 'unwrap-failed', {
        error,
        reason: 'unwrap-failed',
        ...buildInboundTraceDetails({
          wrappedEvent,
          loggedInPubkeyHex,
          relayUrls: wrappedRelayUrls
        })
      });
      return;
    }

    const senderPubkeyHex = inputSanitizerService.normalizeHexKey(rumorEvent.pubkey ?? '');
    if (!senderPubkeyHex) {
      logInboundEvent('drop', {
        reason: 'invalid-sender-pubkey',
        ...buildInboundTraceDetails({
          wrappedEvent,
          rumorEvent,
          loggedInPubkeyHex,
          relayUrls: wrappedRelayUrls
        })
      });
      return;
    }

    const recipients = rumorEvent
      .getMatchingTags('p')
      .map((tag) => inputSanitizerService.normalizeHexKey(tag[1] ?? ''))
      .filter((value): value is string => Boolean(value));
    const isSelfSentMessage = senderPubkeyHex === loggedInPubkeyHex;
    if (!isSelfSentMessage && !recipients.includes(recipientContext.recipientPubkey)) {
      logInboundEvent('drop', {
        reason: 'recipient-mismatch',
        ...buildInboundTraceDetails({
          wrappedEvent,
          rumorEvent,
          loggedInPubkeyHex,
          senderPubkeyHex,
          relayUrls: wrappedRelayUrls,
          recipients
        })
      });
      return;
    }

    let resolvedGroupEpochContext: Awaited<ReturnType<typeof findGroupChatEpochContextByRecipientPubkey>> =
      recipientContext.groupChatPublicKey
        ? await findGroupChatEpochContextByRecipientPubkey(recipientContext.recipientPubkey)
        : null;
    let resolvedGroupChatPublicKey =
      resolvedGroupEpochContext?.chat.public_key ?? recipientContext.groupChatPublicKey;
    if (!resolvedGroupChatPublicKey) {
      for (const recipientPubkey of recipients) {
        const matchingGroupChatContext =
          await findGroupChatEpochContextByRecipientPubkey(recipientPubkey);
        if (matchingGroupChatContext) {
          resolvedGroupEpochContext = matchingGroupChatContext;
          resolvedGroupChatPublicKey = matchingGroupChatContext.chat.public_key;
          break;
        }
      }
    }

    const chatPubkey = resolvedGroupChatPublicKey
      ? resolvedGroupChatPublicKey
      : isSelfSentMessage
        ? recipients.find((pubkey) => pubkey !== loggedInPubkeyHex) ??
          (recipients.includes(loggedInPubkeyHex) ? loggedInPubkeyHex : null)
        : senderPubkeyHex;
    if (!chatPubkey) {
      logInboundEvent('drop', {
        reason: 'missing-chat-pubkey',
        isSelfSentMessage,
        ...buildInboundTraceDetails({
          wrappedEvent,
          rumorEvent,
          loggedInPubkeyHex,
          senderPubkeyHex,
          relayUrls: wrappedRelayUrls,
          recipients
        })
      });
      return;
    }

    const uiThrottleMs = normalizeThrottleMs(options.uiThrottleMs);

    const rumorNostrEvent = await toStoredNostrEvent(rumorEvent);
    const loggedRumorEvent = buildLoggedNostrEvent(rumorEvent, rumorNostrEvent);
    const receivedRelayStatuses = buildInboundRelayStatuses(wrappedRelayUrls);
    const direction: NostrEventDirection = isSelfSentMessage ? 'out' : 'in';
    const replyTargetEventId = readReplyTargetEventId(rumorEvent);

    logSubscription('private-messages', 'rumor', {
      wrappedEventId: formatSubscriptionLogValue(wrappedEvent.id),
      chatPubkey: formatSubscriptionLogValue(chatPubkey),
      direction,
      recipientCount: recipients.length,
      ...buildSubscriptionEventDetails(rumorEvent)
    });

    if (rumorEvent.kind === NDKKind.EventDeletion) {
      logInboundEvent('route', {
        route: 'deletion',
        direction,
        ...buildInboundTraceDetails({
          wrappedEvent,
          rumorEvent,
          loggedInPubkeyHex,
          senderPubkeyHex,
          chatPubkey,
          relayUrls: wrappedRelayUrls,
          recipients
        })
      });
      await processIncomingDeletionRumorEvent(rumorEvent, senderPubkeyHex, {
        uiThrottleMs
      });
      return;
    }

    if (rumorEvent.kind === NDKKind.Reaction) {
      logInboundEvent('route', {
        route: 'reaction',
        direction,
        ...buildInboundTraceDetails({
          wrappedEvent,
          rumorEvent,
          loggedInPubkeyHex,
          senderPubkeyHex,
          chatPubkey,
          relayUrls: wrappedRelayUrls,
          recipients
        })
      });
      await processIncomingReactionRumorEvent(
        rumorEvent,
        chatPubkey,
        senderPubkeyHex,
        {
          uiThrottleMs,
          direction,
          rumorNostrEvent,
          relayStatuses: receivedRelayStatuses
        }
      );
      return;
    }

    if (rumorEvent.kind === 1014) {
      const loggedEvent = rumorNostrEvent ?? (await toStoredNostrEvent(rumorEvent)) ?? rumorEvent;
      const loggedSealEvent = await unwrapGiftWrapSealEvent(wrappedEvent);

      const verificationResult = await verifyIncomingGroupEpochTicket(rumorEvent, loggedSealEvent);
      if (!verificationResult.isValid) {
        return;
      }
      const epochNumber = verificationResult.epochNumber ?? 0;
      const epochPublicKey = derivePublicKeyFromPrivateKey(verificationResult.epochPrivateKey ?? '');

      await contactsService.init();
      await chatDataService.init();
      const senderContact = await contactsService.getContactByPublicKey(senderPubkeyHex);
      const existingGroupChat = await chatDataService.getChatByPublicKey(senderPubkeyHex);
      const incomingEpochCreatedAt = toIsoTimestampFromUnix(rumorEvent.created_at);
      const conflictingEpochNumber = findConflictingKnownGroupEpochNumber(
        existingGroupChat,
        epochNumber,
        epochPublicKey
      );
      if (conflictingEpochNumber) {
        logConflictingIncomingEpochNumber(
          senderPubkeyHex,
          epochNumber,
          epochPublicKey,
          incomingEpochCreatedAt,
          conflictingEpochNumber
        );
        logInboundEvent('drop', {
          reason: 'conflicting-epoch-public-key',
          epochNumber,
          epochPublicKey: formatSubscriptionLogValue(epochPublicKey),
          conflictingEpochPublicKey: formatSubscriptionLogValue(
            conflictingEpochNumber.epoch_public_key
          ),
          conflictingEpochCreatedAt: conflictingEpochNumber.invitation_created_at ?? null,
          createdAt: incomingEpochCreatedAt,
          ...buildInboundTraceDetails({
            wrappedEvent,
            rumorEvent,
            loggedInPubkeyHex,
            senderPubkeyHex,
            chatPubkey: senderPubkeyHex,
            relayUrls: wrappedRelayUrls,
            recipients
          })
        });
        return;
      }
      const higherEpochConflict = findHigherKnownGroupEpochConflict(
        existingGroupChat,
        epochNumber,
        incomingEpochCreatedAt
      );
      if (higherEpochConflict) {
        logInvalidIncomingEpochNumber(
          senderPubkeyHex,
          epochNumber,
          epochPublicKey,
          incomingEpochCreatedAt,
          higherEpochConflict
        );
        logInboundEvent('drop', {
          reason: 'invalid-epoch-number',
          epochNumber,
          higherEpochNumber: higherEpochConflict.higherEpochEntry.epoch_number,
          higherEpochPublicKey: formatSubscriptionLogValue(
            higherEpochConflict.higherEpochEntry.epoch_public_key
          ),
          higherEpochCreatedAt:
            higherEpochConflict.olderHigherEpochEntry?.invitation_created_at ??
            higherEpochConflict.higherEpochEntry.invitation_created_at ??
            null,
          createdAt: incomingEpochCreatedAt,
          ...buildInboundTraceDetails({
            wrappedEvent,
            rumorEvent,
            loggedInPubkeyHex,
            senderPubkeyHex,
            chatPubkey: senderPubkeyHex,
            relayUrls: wrappedRelayUrls,
            recipients
          })
        });
        return;
      }
      const wasAcceptedGroup =
        resolveIncomingChatInboxStateValue({
          chat: existingGroupChat,
          isAcceptedContact: isContactListedInPrivateContactList(senderContact)
        }) === 'accepted';
      const fallbackGroupName =
        senderContact?.meta?.display_name?.trim() ||
        senderContact?.meta?.name?.trim() ||
        senderContact?.name?.trim() ||
        existingGroupChat?.meta?.contact_name?.trim() ||
        existingGroupChat?.name?.trim() ||
        resolveGroupDisplayName(senderPubkeyHex);

      logInboundEvent('epoch-ticket-received', {
        direction,
        epochNumber,
        epochPublicKey: formatSubscriptionLogValue(epochPublicKey),
        acceptedGroup: wasAcceptedGroup,
        groupName: fallbackGroupName,
        deliveryRecipientPubkey: formatSubscriptionLogValue(recipientContext.recipientPubkey),
        signedEventId: formatSubscriptionLogValue(verificationResult.signedEvent?.id ?? loggedEvent.id ?? null),
        ...buildInboundTraceDetails({
          wrappedEvent,
          rumorEvent,
          loggedInPubkeyHex,
          senderPubkeyHex,
          chatPubkey: senderPubkeyHex,
          relayUrls: wrappedRelayUrls,
          recipients
        })
      });

      await persistIncomingGroupEpochTicket(
        senderPubkeyHex,
        epochNumber,
        verificationResult.epochPrivateKey ?? '',
        {
          fallbackName: fallbackGroupName,
          accepted: wasAcceptedGroup,
          invitationCreatedAt: incomingEpochCreatedAt,
          seedRelayUrls: wrappedRelayUrls
        }
      );
      queueBackgroundGroupContactRefresh(senderPubkeyHex, fallbackGroupName);

      if (!wasAcceptedGroup) {
        await upsertIncomingGroupInviteRequestChat(
          senderPubkeyHex,
          toIsoTimestampFromUnix(rumorEvent.created_at),
          senderContact
            ? {
                name: senderContact.name,
                meta: senderContact.meta
              }
            : {
                name: fallbackGroupName,
                meta: {}
              }
        );
      }

      const epochNoticeMessage = await chatDataService.createMessage({
        chat_public_key: senderPubkeyHex,
        author_public_key: senderPubkeyHex,
        message: `Epoch ${epochNumber}`,
        created_at: incomingEpochCreatedAt,
        event_id: verificationResult.signedEvent?.id ?? loggedEvent.id ?? null,
        meta: {
          source: 'nostr',
          kind: 1014,
          group_epoch_notice: {
            epochNumber
          }
        }
      });
      if (!epochNoticeMessage) {
        return;
      }

      if (uiThrottleMs > 0) {
        queuePrivateMessagesUiRefresh({
          throttleMs: uiThrottleMs,
          reloadMessages: true
        });
        return;
      }

      try {
        const { useMessageStore } = await import('src/stores/messageStore');
        await useMessageStore().upsertPersistedMessage(epochNoticeMessage);
      } catch (error) {
        console.error('Failed to sync incoming epoch notice into live state', error);
      }
      return;
    }

    if (rumorEvent.kind !== NDKKind.PrivateDirectMessage) {
      logInboundEvent('drop', {
        reason: 'unsupported-rumor-kind',
        direction,
        ...buildInboundTraceDetails({
          wrappedEvent,
          rumorEvent,
          loggedInPubkeyHex,
          senderPubkeyHex,
          chatPubkey,
          relayUrls: wrappedRelayUrls,
          recipients
        })
      });
      return;
    }

    const messageText = rumorEvent.content.trim();
    if (!messageText) {
      logInboundEvent('drop', {
        reason: 'empty-content',
        direction,
        ...buildInboundTraceDetails({
          wrappedEvent,
          rumorEvent,
          loggedInPubkeyHex,
          senderPubkeyHex,
          chatPubkey,
          relayUrls: wrappedRelayUrls,
          recipients
        })
      });
      return;
    }

    await Promise.all([chatDataService.init(), contactsService.init(), nostrEventDataService.init()]);

    const rumorEventId = normalizeEventId(rumorNostrEvent?.id ?? rumorEvent.id);
    if (rumorEventId) {
      const existingMessage = await chatDataService.getMessageByEventId(rumorEventId);
      if (existingMessage) {
        await appendRelayStatusesToMessageEvent(
          existingMessage.id,
          receivedRelayStatuses,
          {
            event: rumorNostrEvent ?? undefined,
            direction,
            eventId: rumorEventId,
            uiThrottleMs
          }
        );
        let updatedExistingMessage = await applyPendingIncomingReactionsForMessage(existingMessage, {
          uiThrottleMs
        });
        updatedExistingMessage = await applyPendingIncomingDeletionsForMessage(updatedExistingMessage, {
          uiThrottleMs
        });
        logInboundEvent('message-persisted', {
          persistence: 'duplicate-existing-message',
          direction,
          messageId: updatedExistingMessage.id,
          uiThrottleMs,
          ...buildInboundTraceDetails({
            wrappedEvent,
            rumorEvent,
            loggedInPubkeyHex,
            senderPubkeyHex,
            chatPubkey,
            relayUrls: wrappedRelayUrls,
            recipients
          })
        });
        return;
      }
    }

    const createdAt = toIsoTimestampFromUnix(rumorEvent.created_at);
    const contact = await contactsService.getContactByPublicKey(chatPubkey);
    const isAcceptedContact = isContactListedInPrivateContactList(contact);
    const existingChat = await chatDataService.getChatByPublicKey(chatPubkey);
    const incomingChatInboxState = resolveIncomingChatInboxStateValue({
      chat: existingChat,
      isAcceptedContact
    });
    const createdChat =
      existingChat
        ? null
        : await chatDataService.createChat({
            public_key: chatPubkey,
            ...(recipientContext.groupChatPublicKey ? { type: 'group' as const } : {}),
            name: deriveChatName(contact, chatPubkey),
            last_message: '',
            last_message_at: createdAt,
            unread_count: 0,
            meta: {
              ...(contact?.meta.picture ? { picture: contact.meta.picture } : {}),
              ...(incomingChatInboxState === 'accepted'
                ? {
                    inbox_state: 'accepted',
                    accepted_at: createdAt
                  }
                : {})
            }
          });
    let chat =
      existingChat ??
      createdChat ??
      (await chatDataService.getChatByPublicKey(chatPubkey));
    if (!chat) {
      logInboundEvent('drop', {
        reason: 'chat-create-failed',
        direction,
        ...buildInboundTraceDetails({
          wrappedEvent,
          rumorEvent,
          loggedInPubkeyHex,
          senderPubkeyHex,
          chatPubkey,
          relayUrls: wrappedRelayUrls,
          recipients
        })
      });
      return;
    }

    if (incomingChatInboxState === 'accepted') {
      const currentInboxState =
        chat.meta && typeof chat.meta.inbox_state === 'string' ? chat.meta.inbox_state.trim() : '';
      const currentAcceptedAt =
        chat.meta && typeof chat.meta.accepted_at === 'string' ? chat.meta.accepted_at.trim() : '';
      if (currentInboxState !== 'accepted' || !currentAcceptedAt) {
        await chatStore.acceptChat(chat.public_key, {
          acceptedAt: currentAcceptedAt || createdAt
        });
        chat = (await chatDataService.getChatByPublicKey(chat.public_key)) ?? chat;
      }
    }

    const isBlockedChat = incomingChatInboxState === 'blocked';
    const contactLastSeenIncomingActivityAt = normalizeTimestamp(
      isPlainRecord(contact?.meta) ? contact.meta.last_seen_incoming_activity_at : null
    );
    const chatLastSeenReceivedActivityAt = normalizeTimestamp(
      isPlainRecord(chat.meta) ? chat.meta[LAST_SEEN_RECEIVED_ACTIVITY_AT_META_KEY] : null
    );
    const effectiveLastSeenIncomingActivityAt =
      toComparableTimestamp(contactLastSeenIncomingActivityAt) >=
      toComparableTimestamp(chatLastSeenReceivedActivityAt)
        ? contactLastSeenIncomingActivityAt
        : chatLastSeenReceivedActivityAt;
    const replyPreview = replyTargetEventId
      ? await buildReplyPreviewFromTargetEvent(
          replyTargetEventId,
          chatPubkey,
          loggedInPubkeyHex,
          contact
        )
      : null;
    const createdMessage = await chatDataService.createMessage({
      chat_public_key: chat.public_key,
      author_public_key: senderPubkeyHex,
      message: messageText,
      created_at: createdAt,
      event_id: rumorEventId,
      meta: {
        source: 'nostr',
        kind: NDKKind.PrivateDirectMessage,
        wrapper_event_id: wrappedEvent.id ?? '',
        ...(replyPreview ? { reply: replyPreview } : {})
      }
    });
    if (!createdMessage) {
      logInboundEvent('drop', {
        reason: 'message-create-failed',
        direction,
        ...buildInboundTraceDetails({
          wrappedEvent,
          rumorEvent,
          loggedInPubkeyHex,
          senderPubkeyHex,
          chatPubkey,
          relayUrls: wrappedRelayUrls,
          recipients
        })
      });
      return;
    }

    await chatStore.recordIncomingActivity(chat.public_key, createdAt);
    let nextMessageRow = await applyPendingIncomingReactionsForMessage(
      createdMessage,
      {
        uiThrottleMs
      }
    );
    nextMessageRow = await applyPendingIncomingDeletionsForMessage(nextMessageRow, {
      uiThrottleMs
    });

    if (rumorNostrEvent) {
      await nostrEventDataService.upsertEvent({
        event: rumorNostrEvent,
        direction,
        relay_statuses: receivedRelayStatuses
      });
    }

    const currentUnreadCount = Math.max(0, Number(chat.unread_count ?? 0));
    const shouldIncrementUnreadCount =
      !isSelfSentMessage &&
      !isBlockedChat &&
      chatStore.visibleChatId !== chat.public_key &&
      toComparableTimestamp(createdAt) >
        toComparableTimestamp(effectiveLastSeenIncomingActivityAt);
    const nextUnreadCount = isSelfSentMessage
      ? currentUnreadCount
      : isBlockedChat || chatStore.visibleChatId === chat.public_key
        ? 0
        : shouldIncrementUnreadCount
          ? currentUnreadCount + 1
          : currentUnreadCount;
    const shouldUpdateChatPreview =
      toComparableTimestamp(createdAt) >= toComparableTimestamp(chat.last_message_at);
    const currentGroupEpochEntry = resolvedGroupChatPublicKey
      ? resolveCurrentGroupChatEpochEntry(chat)
      : null;
    const hasValidInvitation = Boolean(resolvedGroupEpochContext?.epochEntry);
    const invitationCreatedAt = resolvedGroupEpochContext?.epochEntry?.invitation_created_at ?? null;
    const isCurrentEpochRecipient =
      Boolean(currentGroupEpochEntry?.epoch_public_key) &&
      currentGroupEpochEntry?.epoch_public_key === resolvedGroupEpochContext?.epochEntry?.epoch_public_key;

    if (shouldUpdateChatPreview) {
      await chatDataService.updateChatPreview(
        chat.public_key,
        messageText,
        createdAt,
        nextUnreadCount
      );
    } else if (nextUnreadCount !== currentUnreadCount) {
      await chatDataService.updateChatUnreadCount(chat.public_key, nextUnreadCount);
    }

    logInboundEvent('private-message-received', {
      direction,
      messageId: createdMessage.id,
      messageLength: messageText.length,
      isGroupMessage: Boolean(resolvedGroupChatPublicKey),
      rumor: loggedRumorEvent,
      ...(resolvedGroupChatPublicKey
        ? {
            groupChatPubkey: formatSubscriptionLogValue(resolvedGroupChatPublicKey),
            epochRecipientPubkey: formatSubscriptionLogValue(recipientContext.recipientPubkey),
            hasValidInvitation,
            invitationCreatedAt,
            isCurrentEpochRecipient
          }
        : {}),
      ...buildInboundTraceDetails({
        wrappedEvent,
        rumorEvent,
        loggedInPubkeyHex,
        senderPubkeyHex,
        chatPubkey,
        relayUrls: wrappedRelayUrls,
        recipients
      })
    });

    logInboundEvent('message-persisted', {
      persistence: 'created',
      direction,
      messageId: nextMessageRow.id,
      chatId: chat.id,
      effectiveLastSeenIncomingActivityAt,
      unreadCount: nextUnreadCount,
      updatedPreview: shouldUpdateChatPreview,
      uiThrottleMs,
      ...buildInboundTraceDetails({
        wrappedEvent,
        rumorEvent,
        loggedInPubkeyHex,
        senderPubkeyHex,
        chatPubkey,
        relayUrls: wrappedRelayUrls,
        recipients
      })
    });

    if (resolvedGroupChatPublicKey) {
      logInboundEvent('group-message-received', {
        direction,
        messageId: nextMessageRow.id,
        messageLength: messageText.length,
        groupChatPubkey: formatSubscriptionLogValue(resolvedGroupChatPublicKey),
        epochRecipientPubkey: formatSubscriptionLogValue(recipientContext.recipientPubkey),
        authorPubkey: formatSubscriptionLogValue(senderPubkeyHex),
        hasValidInvitation,
        invitationCreatedAt,
        isCurrentEpochRecipient,
        rumor: loggedRumorEvent,
        ...buildInboundTraceDetails({
          wrappedEvent,
          rumorEvent,
          loggedInPubkeyHex,
          senderPubkeyHex,
          chatPubkey: resolvedGroupChatPublicKey,
          relayUrls: wrappedRelayUrls,
          recipients
        })
      });
    }

    if (
      !isSelfSentMessage &&
      !isBlockedChat &&
      (await shouldNotifyForAcceptedChatOnly(chat.public_key, chat.meta ?? {}))
    ) {
      showIncomingMessageBrowserNotification({
        chatPubkey: chat.public_key,
        title: deriveChatName(contact, chatPubkey),
        messageText,
        iconUrl: contact?.meta.picture?.trim() || undefined
      });
    }

    if (uiThrottleMs > 0) {
      queuePrivateMessagesUiRefresh({
        throttleMs: uiThrottleMs,
        reloadChats: true,
        reloadMessages: true
      });
      return;
    }

    try {
      if (shouldUpdateChatPreview) {
        chatStore.applyIncomingMessage({
          publicKey: chat.public_key,
          fallbackName: deriveChatName(contact, chatPubkey),
          messageText,
          at: createdAt,
          unreadCount: nextUnreadCount,
          meta: {
            ...(chat.meta ?? {}),
            ...(contact?.meta.picture ? { picture: contact.meta.picture } : {})
          }
        });
      } else if (nextUnreadCount !== currentUnreadCount) {
        await chatStore.setUnreadCount(chat.public_key, nextUnreadCount);
      }

      const { useMessageStore } = await import('src/stores/messageStore');
      await useMessageStore().upsertPersistedMessage(nextMessageRow);
    } catch (error) {
      console.error('Failed to sync incoming private message into live state', error);
    }
  }

  async function subscribePrivateMessagesForLoggedInUser(
    force = false,
    options: SubscribePrivateMessagesOptions = {}
  ): Promise<void> {
    const hasActiveStartupTracking = getStartupStepSnapshot('private-message-events').status === 'in_progress';
    const shouldTrackStartupStep = options.startupTrackStep === true || hasActiveStartupTracking;
    const shouldRunStartupBackfill =
      !Number.isInteger(options.sinceOverride) &&
      (options.startupTrackStep === true || hasActiveStartupTracking || isRestoringStartupState.value);
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
        authMethod: authMethod ?? null
      });
      stopPrivateMessagesSubscription('missing-login');
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
          authMethod
        });
        stopPrivateMessagesSubscription('no-relays');
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
          authMethod
        });
        stopPrivateMessagesSubscription('no-recipients');
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
      if (
        hasMatchingActiveSubscription &&
        (!force || !requiresBroaderSinceWindow)
      ) {
        privateMessagesRestoreThrottleMs = Math.max(
          privateMessagesRestoreThrottleMs,
          normalizeThrottleMs(options.restoreThrottleMs)
        );
        syncPrivateMessagesWatchdogRelayConnectionStates(relayUrls);
        logSubscription('private-messages', 'skip', {
          reason: force ? 'already-active-force-no-change' : 'already-active',
          signature,
          pubkey: formatSubscriptionLogValue(loggedInPubkeyHex),
          authMethod,
          recipientCount: recipientPubkeys.length,
          recipients: recipientPubkeys.map((value) => formatSubscriptionLogValue(value)),
          requestedSince: filterSince,
          currentSince: currentSubscriptionSince,
          ...buildSubscriptionRelayDetails(relayUrls)
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
        ...buildSubscriptionRelayDetails(relayUrls)
      });

      await ensureRelayConnections(relayUrls);
      await getOrCreateSigner();
      stopPrivateMessagesSubscription();
      privateMessagesRestoreThrottleMs = normalizeThrottleMs(options.restoreThrottleMs);
      const relaySnapshots = getRelaySnapshots(relayUrls);
      const disconnectedRelayUrls = relayUrls.filter((relayUrl) => {
        const relay = ndk.pool.getRelay(normalizeRelayUrl(relayUrl), false);
        return !relay || !relay.connected;
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
          relaySnapshots
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
        restoreThrottleMs: privateMessagesRestoreThrottleMs,
        relaySnapshots,
        ...buildSubscriptionRelayDetails(relayUrls),
        ...privateMessageTargetDetails
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
        since: filterSince
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
              ...buildSubscriptionRelayDetails(extractRelayUrlsFromEvent(wrappedEvent))
            });
            privateMessagesSubscriptionLastEventSeenAt.value = new Date().toISOString();
            privateMessagesSubscriptionLastEventId.value =
              normalizeEventId(wrappedEvent.id) ?? wrappedEvent.id ?? null;
            privateMessagesSubscriptionLastEventCreatedAt.value =
              Number.isInteger(wrappedEvent.created_at) ? Number(wrappedEvent.created_at) : null;
            bumpDeveloperDiagnosticsVersion();
            updateStoredPrivateMessagesLastReceivedFromCreatedAt(wrappedEvent.created_at);
            updateStoredEventSinceFromCreatedAt(wrappedEvent.created_at);
            queuePrivateMessageIngestion(wrappedEvent, loggedInPubkeyHex);
          },
          onEose: () => {
            logSubscription('private-messages', 'eose', {
              signature,
              restoreThrottleMs: privateMessagesRestoreThrottleMs
            });
            privateMessagesSubscriptionLastEoseAt.value = new Date().toISOString();
            bumpDeveloperDiagnosticsVersion();
            privateMessagesRestoreThrottleMs = 0;
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
                    ...contactRefreshSummary
                  });
                } catch (error) {
                  console.warn('Failed to refresh contacts after private messages startup EOSE', error);
                  logSubscription('private-messages', 'contacts-refresh-after-eose-error', {
                    signature,
                    error
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
          }
        },
        {
          signature,
          ...buildFilterSinceDetails(filterSince),
          ...buildSubscriptionRelayDetails(relayUrls),
          ...privateMessageTargetDetails
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
        restoreThrottleMs: privateMessagesRestoreThrottleMs,
        relaySnapshots,
        ...buildSubscriptionRelayDetails(relayUrls)
      });
    } catch (error) {
      if (shouldTrackStartupStep) {
        failStartupStep('private-message-events', error);
      }
      throw error;
    }
  }

  async function fetchMyRelayList(relayUrls: string[]): Promise<string[]> {
    const relayEntries = await fetchMyRelayListEntries(relayUrls);
    if (relayEntries === null) {
      return [];
    }

    return relayEntries.map((relay) => relay.url);
  }

  async function syncLoggedInContactProfile(relayUrls: string[]): Promise<void> {
    if (syncLoggedInContactProfilePromise) {
      return syncLoggedInContactProfilePromise;
    }

    syncLoggedInContactProfilePromise = (async () => {
      const loggedInPubkeyHex = getLoggedInPublicKeyHex();
      if (!loggedInPubkeyHex) {
        return;
      }

      const activeRelays = inputSanitizerService.normalizeStringArray(relayUrls);
      if (activeRelays.length > 0) {
        try {
          await ensureRelayConnections(activeRelays);
        } catch (error) {
          console.warn('Failed to connect relays before profile sync', error);
        }
      }

      const profileTracker = createStartupBatchTracker('logged-in-profile');
      const relayTracker = createStartupBatchTracker('logged-in-relays');
      try {
        await refreshContactByPublicKey(loggedInPubkeyHex, '', {
          onProfileFetchStart: () => {
            profileTracker.beginItem();
          },
          onProfileFetchEnd: (error) => {
            profileTracker.finishItem(error ?? undefined);
          },
          onRelayFetchStart: () => {
            relayTracker.beginItem();
          },
          onRelayFetchEnd: (error) => {
            relayTracker.finishItem(error ?? undefined);
          }
        });
      } catch (error) {
        profileTracker.finishItem(error);
        relayTracker.finishItem(error);
        console.warn('Failed to refresh logged-in contact profile', error);
      } finally {
        profileTracker.seal();
        relayTracker.seal();
      }

      await subscribePrivateMessagesForLoggedInUser(true, {
        restoreThrottleMs: PRIVATE_MESSAGES_STARTUP_RESTORE_THROTTLE_MS,
        startupTrackStep: true
      });
    })().finally(() => {
      syncLoggedInContactProfilePromise = null;
    });

    return syncLoggedInContactProfilePromise;
  }

  async function syncRecentChatContacts(relayUrls: string[]): Promise<void> {
    if (syncRecentChatContactsPromise) {
      return syncRecentChatContactsPromise;
    }

    syncRecentChatContactsPromise = (async () => {
      const profileTracker = createStartupBatchTracker('recent-chat-profiles');
      const relayTracker = createStartupBatchTracker('recent-chat-relays');
      try {
        const activeRelays = inputSanitizerService.normalizeStringArray(relayUrls);
        if (activeRelays.length > 0) {
          try {
            await ensureRelayConnections(activeRelays);
          } catch (error) {
            console.warn('Failed to connect relays before syncing recent chat contacts', error);
          }
        }

        await Promise.all([chatDataService.init(), contactsService.init()]);
        const recentChats = await chatDataService.listChats();
        if (recentChats.length === 0) {
          return;
        }

        const loggedInPubkeyHex = getLoggedInPublicKeyHex();
        const recentPublicKeys = new Set<string>();

        for (const chat of recentChats) {
          const normalizedPubkey = inputSanitizerService.normalizeHexKey(chat.public_key);
          if (!normalizedPubkey) {
            continue;
          }

          if (loggedInPubkeyHex && normalizedPubkey === loggedInPubkeyHex) {
            continue;
          }

          recentPublicKeys.add(normalizedPubkey);
        }

        if (recentPublicKeys.size === 0) {
          return;
        }

        for (const pubkeyHex of recentPublicKeys) {
          const existingContact = await contactsService.getContactByPublicKey(pubkeyHex);
          if (!existingContact) {
            continue;
          }

          const matchingChat = recentChats.find(
            (chat) => inputSanitizerService.normalizeHexKey(chat.public_key) === pubkeyHex
          );
          const fallbackName = existingContact.name.trim() || matchingChat?.name?.trim() || '';
          try {
            await refreshContactByPublicKey(pubkeyHex, fallbackName, {
              onProfileFetchStart: () => {
                profileTracker.beginItem();
              },
              onProfileFetchEnd: (error) => {
                profileTracker.finishItem(error ?? undefined);
              },
              onRelayFetchStart: () => {
                relayTracker.beginItem();
              },
              onRelayFetchEnd: (error) => {
                relayTracker.finishItem(error ?? undefined);
              }
            });
          } catch (error) {
            profileTracker.finishItem(error);
            relayTracker.finishItem(error);
            console.warn('Failed to refresh recent chat contact profile', pubkeyHex, error);
          }
        }
      } finally {
        profileTracker.seal();
        relayTracker.seal();
      }
    })().finally(() => {
      syncRecentChatContactsPromise = null;
    });

    return syncRecentChatContactsPromise;
  }

  function getPrivateKeyHex(): string | null {
    if (!hasStorage()) {
      return null;
    }

    const stored = window.localStorage.getItem(PRIVATE_KEY_STORAGE_KEY);
    if (!stored) {
      return null;
    }

    return inputSanitizerService.normalizeHexKey(stored);
  }

  function setStoredAuthSession(authMethod: AuthMethod, pubkeyHex: string, privateKeyHex?: string): void {
    if (!hasStorage()) {
      return;
    }

    window.localStorage.setItem(AUTH_METHOD_STORAGE_KEY, authMethod);
    window.localStorage.setItem(PUBLIC_KEY_STORAGE_KEY, pubkeyHex);

    if (authMethod === 'nsec' && privateKeyHex) {
      window.localStorage.setItem(PRIVATE_KEY_STORAGE_KEY, privateKeyHex);
      return;
    }

    window.localStorage.removeItem(PRIVATE_KEY_STORAGE_KEY);
  }

  function savePrivateKeyHex(hexPrivateKey: string): boolean {
    const normalized = inputSanitizerService.normalizeHexKey(hexPrivateKey);
    if (!normalized || !hasStorage()) {
      return false;
    }

    const signer = new NDKPrivateKeySigner(normalized, ndk);
    clearPrivateKey();
    resetEventSinceForFreshLogin();
    setStoredAuthSession('nsec', signer.pubkey, normalized);
    cachedSigner = signer;
    cachedSignerSessionKey = `nsec:${signer.pubkey}`;
    ndk.signer = signer;
    return true;
  }

  async function loginWithExtension(): Promise<string> {
    if (!hasNip07Extension()) {
      throw new Error('No NIP-07 extension detected. Install or enable one to continue.');
    }

    const signer = new NDKNip07Signer(undefined, ndk);
    const user = await signer.blockUntilReady();
    user.ndk = ndk;
    const pubkeyHex = inputSanitizerService.normalizeHexKey(user.pubkey ?? signer.pubkey);
    if (!pubkeyHex) {
      throw new Error('Failed to read a valid public key from the NIP-07 extension.');
    }

    clearPrivateKey();
    resetEventSinceForFreshLogin();
    setStoredAuthSession('nip07', pubkeyHex);
    cachedSigner = signer;
    cachedSignerSessionKey = `nip07:${pubkeyHex}`;
    ndk.signer = signer;
    return pubkeyHex;
  }

  function clearPrivateKey(): void {
    cachedSigner = null;
    cachedSignerSessionKey = null;
    ndk.signer = undefined;
    privateMessagesWatchdogLastRecoveryAt = 0;
    privateMessagesSubscriptionShouldBeActive = false;
    privateMessagesWatchdogRelayConnectionStates.clear();
    resetStartupStepTracking();
    pendingIncomingReactions.clear();
    pendingIncomingDeletions.clear();
    pendingContactCursorPublishStates.clear();
    pendingContactCursorPublishTimers.forEach((timerId) => {
      globalThis.clearTimeout(timerId);
    });
    pendingContactCursorPublishTimers.clear();
    resetTrackedContactEventState();
    privateMessagesSubscriptionStartedAt.value = null;
    privateMessagesSubscriptionLastEventSeenAt.value = null;
    privateMessagesSubscriptionLastEventId.value = null;
    privateMessagesSubscriptionLastEventCreatedAt.value = null;
    privateMessagesSubscriptionLastEoseAt.value = null;
    void clearDeveloperTraceEntries().catch((error) => {
      console.error('Failed to clear developer trace entries.', error);
    });
    stopContactProfileSubscription();
    stopContactRelayListSubscription();
    stopMyRelayListSubscription();
    stopPrivateContactListSubscription();
    stopPrivateMessagesSubscription();
    if (privateMessagesEpochSubscriptionRefreshTimerId !== null) {
      globalThis.clearTimeout(privateMessagesEpochSubscriptionRefreshTimerId);
      privateMessagesEpochSubscriptionRefreshTimerId = null;
    }
    pendingPrivateMessagesEpochSubscriptionRefreshOptions = null;
    privateMessagesEpochSubscriptionRefreshQueue = Promise.resolve();
    loggedInvalidGroupEpochConflictKeys.clear();
    if (chatChecksTimeoutId !== null) {
      globalThis.clearTimeout(chatChecksTimeoutId);
      chatChecksTimeoutId = null;
    }
    if (postPrivateMessagesEoseChecksTimeoutId !== null) {
      globalThis.clearTimeout(postPrivateMessagesEoseChecksTimeoutId);
      postPrivateMessagesEoseChecksTimeoutId = null;
    }
    shouldRunChatChecksForAllChats = false;
    shouldRunPostPrivateMessagesEoseChecks = false;
    pendingChatCheckChatIds.clear();
    authenticatedRelayUrls.clear();
    contactProfileApplyQueue = Promise.resolve();
    contactRelayListApplyQueue = Promise.resolve();
    chatChecksQueue = Promise.resolve();
    postPrivateMessagesEoseChecksQueue = Promise.resolve();
    clearStoredPrivateMessagesLastReceivedCreatedAt();
    clearPrivateMessagesBackfillState();
    chatStore.clearAllComposerDrafts();
    bumpDeveloperDiagnosticsVersion();

    if (!hasStorage()) {
      return;
    }

    window.localStorage.removeItem(AUTH_METHOD_STORAGE_KEY);
    window.localStorage.removeItem(PRIVATE_KEY_STORAGE_KEY);
    window.localStorage.removeItem(PUBLIC_KEY_STORAGE_KEY);
    clearPrivatePreferencesStorage();
  }

  async function logout(): Promise<void> {
    clearPrivateKey();
    eventSince.value = 0;
    pendingEventSinceState.pendingEventSinceUpdate = 0;
    isRestoringStartupState.value = false;
    restoreStartupStatePromise = null;
    restoreMyRelayListPromise = null;
    syncLoggedInContactProfilePromise = null;
    restorePrivateContactListPromise = null;
    restoreRuntimeState.restorePrivatePreferencesPromise = null;
    restoreRuntimeState.restoreGroupIdentitySecretsPromise = null;
    restoreRuntimeState.restoreContactCursorStatePromise = null;
    syncRecentChatContactsPromise = null;
    contactProfileApplyQueue = Promise.resolve();
    contactRelayListApplyQueue = Promise.resolve();
    myRelayListApplyQueue = Promise.resolve();
    privateContactListApplyQueue = Promise.resolve();
    privateMessagesIngestQueue = Promise.resolve();
    privateMessagesUiRefreshQueue = Promise.resolve();
    configuredRelayUrls.clear();
    relayConnectPromises.clear();
    relayConnectFailureCooldownUntilByUrl.clear();
    groupContactRefreshPromises.clear();
    backgroundGroupContactRefreshStartedAt.clear();
    pendingPrivateMessagesEpochSubscriptionRefreshOptions = null;
    privateMessagesEpochSubscriptionRefreshQueue = Promise.resolve();
    loggedInvalidGroupEpochConflictKeys.clear();
    contactListVersion.value = 0;
    relayStatusVersion.value += 1;

    if (hasStorage()) {
      window.localStorage.removeItem(EVENT_SINCE_STORAGE_KEY);
      window.localStorage.removeItem(DEVELOPER_DIAGNOSTICS_STORAGE_KEY);
      for (const storageKey of RELAY_STORAGE_KEYS) {
        window.localStorage.removeItem(storageKey);
      }
    }

    clearDarkModePreference();
    clearPanelOpacityPreference();
    clearBrowserNotificationsPreference();

    await Promise.all([
      chatDataService.clearAllData(),
      contactsService.clearAllData(),
      nostrEventDataService.clearAllData(),
      imageCacheService.clearAllData()
    ]);
  }
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
    validatePrivateKey
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
    savePrivateKeyHex,
    sendGiftWrappedRumor,
    toIsoTimestampFromUnix
  });

  const {
    getDeveloperDiagnosticsSnapshot,
    reconnectAllDeveloperRelays,
    reconnectDeveloperRelay,
    refreshDeveloperPendingQueues,
    refreshPrivateMessages,
    restartPrivateMessagesDiagnosticsSubscription
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
    getPrivateMessagesSubscription: () => privateMessagesSubscription,
    getPrivateMessagesSubscriptionSignature: () => privateMessagesSubscriptionSignature,
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
    subscribePrivateMessagesForLoggedInUser,
    toOptionalIsoTimestampFromUnix
  });

  return {
    clearPrivateKey,
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
    refreshContactRelayList,
    getDeveloperDiagnosticsSnapshot,
    getNip05Data,
    hasNip07Extension,
    getLoggedInPublicKeyHex,
    getPrivateKeyHex,
    refreshDeveloperPendingQueues,
    refreshPrivateMessages,
    getRelayConnectionState,
    isRestoringStartupState,
    listDeveloperTraceEntries,
    loginWithExtension,
    logout,
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
    restoreMyRelayList,
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
    savePrivateKeyHex,
    subscribeMyRelayListUpdates,
    subscribePrivateContactListUpdates,
    subscribePrivateMessagesForLoggedInUser,
    updateLoggedInUserRelayList,
    setDeveloperDiagnosticsEnabled,
    syncLoggedInContactProfile,
    syncRecentChatContacts,
    startupDisplay,
    startupSteps,
    validatePrivateKey,
    validateNpub,
    validateNsec
  };
});
