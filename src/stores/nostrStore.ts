import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import NDK, {
  NDKEvent,
  NDKKind,
  NDKPublishError,
  NDKPrivateKeySigner,
  type NDKRelay,
  NDKRelayList,
  type NDKSigner,
  type NDKUserProfile,
  type NDKRelayInformation,
  NDKRelaySet,
  NDKUser,
  isValidNip05,
  isValidPubkey,
  nip19,
  normalizeRelayUrl,
  type NostrEvent
} from '@nostr-dev-kit/ndk';
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
  CONTACT_CURSOR_FETCH_BATCH_SIZE,
  CONTACT_CURSOR_PUBLISH_DELAY_MS,
  CONTACT_CURSOR_VERSION,
  DEFAULT_EVENT_SINCE_LOOKBACK_SECONDS,
  DEVELOPER_DIAGNOSTICS_STORAGE_KEY,
  EVENT_FILTER_LOOKBACK_SECONDS,
  GROUP_CHAT_EPOCH_PUBLIC_KEY_META_KEY,
  GROUP_CURRENT_EPOCH_PRIVATE_KEY_ENCRYPTED_CHAT_META_KEY,
  GROUP_CURRENT_EPOCH_PUBLIC_KEY_CHAT_META_KEY,
  GROUP_EPOCH_KEYS_CHAT_META_KEY,
  GROUP_IDENTITY_SECRET_TAG,
  GROUP_IDENTITY_SECRET_VERSION,
  GROUP_MEMBER_TICKET_DELIVERIES_CHAT_META_KEY,
  GROUP_OWNER_PUBLIC_KEY_CONTACT_META_KEY,
  GROUP_PRIVATE_KEY_CONTACT_META_KEY,
  INITIAL_CONNECT_TIMEOUT_MS,
  LAST_SEEN_RECEIVED_ACTIVITY_AT_META_KEY,
  PRIVATE_CONTACT_LIST_MEMBER_CONTACT_META_KEY,
  PRIVATE_MESSAGES_EPOCH_SUBSCRIPTION_REFRESH_DEBOUNCE_MS,
  PRIVATE_MESSAGES_LAST_RECEIVED_EVENT_STORAGE_KEY,
  PRIVATE_PREFERENCES_D_TAG,
  PRIVATE_PREFERENCES_KIND,
  PRIVATE_PREFERENCES_STORAGE_KEY,
  PUBLIC_KEY_STORAGE_KEY,
  RELAY_CONNECT_FAILURE_COOLDOWN_MS,
  STARTUP_STEP_MIN_PROGRESS_MS
} from 'src/stores/nostr/constants';
import {
  createDeveloperTraceRuntime,
  readDeveloperDiagnosticsEnabledFromStorage
} from 'src/stores/nostr/developerTrace';
import { createDeveloperRelayRuntime } from 'src/stores/nostr/developerRelayRuntime';
import { createAuthSessionRuntime } from 'src/stores/nostr/authSessionRuntime';
import { createDeveloperDiagnosticsRuntime } from 'src/stores/nostr/developerDiagnostics';
import { createMessageEventRuntime } from 'src/stores/nostr/messageEventRuntime';
import { createMessageMutationRuntime } from 'src/stores/nostr/messageMutationRuntime';
import { createMessageRelayRuntime } from 'src/stores/nostr/messageRelayRuntime';
import { createSubscriptionLoggingRuntime } from 'src/stores/nostr/subscriptionLoggingRuntime';
import { createStartupContactSyncRuntime } from 'src/stores/nostr/startupContactSyncRuntime';
import { createGroupInviteRuntime } from 'src/stores/nostr/groupInviteRuntime';
import { createGroupEpochPublishRuntime } from 'src/stores/nostr/groupEpochPublishRuntime';
import { createGroupEpochStateRuntime } from 'src/stores/nostr/groupEpochStateRuntime';
import { createContactProfileRuntime } from 'src/stores/nostr/contactProfileRuntime';
import { createContactRelayRuntime } from 'src/stores/nostr/contactRelayRuntime';
import { createContactSubscriptionsRuntime } from 'src/stores/nostr/contactSubscriptionsRuntime';
import { createMyRelayListRuntime } from 'src/stores/nostr/myRelayListRuntime';
import { createPrivateMessagesBackfillRuntime } from 'src/stores/nostr/privateMessagesBackfillRuntime';
import { createPrivateMessagesIngestRuntime } from 'src/stores/nostr/privateMessagesIngestRuntime';
import { createPrivateContactListRuntime } from 'src/stores/nostr/privateContactListRuntime';
import { createPrivateMessagesSubscriptionRuntime } from 'src/stores/nostr/privateMessagesSubscriptionRuntime';
import { createPrivateMessagesUiRuntime } from 'src/stores/nostr/privateMessagesUiRuntime';
import { createRelayConnectionRuntime } from 'src/stores/nostr/relayConnectionRuntime';
import { createRelayPublishRuntime } from 'src/stores/nostr/relayPublishRuntime';
import { hasStorage, isPlainRecord } from 'src/stores/nostr/shared';
import { createPrivateStateRuntime } from 'src/stores/nostr/privateStateRuntime';
import { createStorageSessionRuntime } from 'src/stores/nostr/storageSession';
import { createStartupRuntime } from 'src/stores/nostr/startupRuntime';
import { createTrackedContactStateRuntime } from 'src/stores/nostr/trackedContactStateRuntime';
import { createUserActions } from 'src/stores/nostr/userActions';
import {
  buildAvatarFallbackValue,
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
  RelayConnectionState,
  RelayListMetadataEntry,
  RelayPublishStatusesResult,
  RelaySaveStatus,
  RotateGroupEpochResult,
  SendDirectMessageDeletionOptions,
  SendDirectMessageOptions,
  SendDirectMessageReactionOptions,
  SendGiftWrappedRumorOptions,
  SubscribePrivateMessagesOptions
} from 'src/stores/nostr/types';
import { useChatStore } from 'src/stores/chatStore';
import { useRelayStore } from 'src/stores/relayStore';
import type {
  ChatGroupEpochKey,
  GroupMemberTicketDelivery,
  MessageReplyPreview,
  MessageRelayStatus,
  NostrEventDirection
} from 'src/types/chat';
import type { ContactMetadata, ContactRecord, ContactRelay } from 'src/types/contact';
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
  const pendingContactCursorPublishTimers = new Map<string, ReturnType<typeof globalThis.setTimeout>>();
  const pendingContactCursorPublishStates = new Map<string, ContactCursorState>();
  const restoreRuntimeState = {
    restoreContactCursorStatePromise: null as Promise<void> | null,
    restoreGroupIdentitySecretsPromise: null as Promise<void> | null,
    restorePrivatePreferencesPromise: null as Promise<void> | null
  };
  let privateMessagesEpochSubscriptionRefreshTimerId: ReturnType<typeof globalThis.setTimeout> | null = null;
  let pendingPrivateMessagesEpochSubscriptionRefreshOptions: SubscribePrivateMessagesOptions | null = null;
  let privateMessagesEpochSubscriptionRefreshQueue = Promise.resolve();
  const loggedInvalidGroupEpochConflictKeys = new Set<string>();
  let privateMessagesRestoreThrottleMs = 0;
  let getPrivateMessagesIngestQueueRuntime: () => Promise<void> = () => Promise.resolve();
  let queuePrivateMessageIngestionRuntime: (
    wrappedEvent: NDKEvent,
    loggedInPubkeyHex: string,
    options?: {
      uiThrottleMs?: number;
    }
  ) => void = () => {
    throw new Error('Private messages ingest runtime is not initialized.');
  };
  let resetPrivateMessagesIngestRuntimeState: () => void = () => {};
  let subscribePrivateMessagesForLoggedInUserRuntime: (
    force?: boolean,
    options?: SubscribePrivateMessagesOptions
  ) => Promise<void> = async () => {
    throw new Error('Private messages subscription runtime is not initialized.');
  };
  let ensurePrivateMessagesWatchdogRuntime: () => void = () => {};
  let isPrivateMessagesSubscriptionRelayTrackedRuntime: (relayUrl: string) => boolean = () =>
    false;
  let markPrivateMessagesWatchdogRelayDisconnectedRuntime: (relayUrl: string) => void = () => {};
  let queuePrivateMessagesWatchdogRuntime: (delayMs?: number) => void = () => {};
  let getPrivateKeyHexRuntime: () => string | null = () => {
    throw new Error('Auth session runtime is not initialized.');
  };
  let savePrivateKeyHexRuntime: (hexPrivateKey: string) => boolean = () => {
    throw new Error('Auth session runtime is not initialized.');
  };
  let loginWithExtensionRuntime: () => Promise<string> = async () => {
    throw new Error('Auth session runtime is not initialized.');
  };
  let clearPrivateKeyRuntime: () => void = () => {
    throw new Error('Auth session runtime is not initialized.');
  };
  let logoutRuntime: () => Promise<void> = async () => {
    throw new Error('Auth session runtime is not initialized.');
  };
  let refreshAllStoredContactsRuntime: () => Promise<Record<string, unknown>> = async () => {
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
  let upsertIncomingGroupInviteRequestChatRuntime: (
    groupPublicKey: string,
    createdAt: string,
    preview?: Pick<ContactRecord, 'name' | 'meta'> | null
  ) => Promise<void> = async () => {
    throw new Error('Group invite runtime is not initialized.');
  };
  let ensureGroupInvitePubkeyIsContactRuntime: (
    targetPubkeyHex: string,
    fallbackName?: string
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
    buildRelaySnapshot,
    getRelaySnapshots,
    logMessageRelayDiagnostics,
    logRelayLifecycle
  } = createDeveloperRelayRuntime({
    logDeveloperTrace,
    ndk
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
    return upsertGroupMemberTicketDeliveryRuntime(groupPublicKey, delivery);
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
    return appendRelayStatusesToGroupMemberTicketEventRuntime(
      groupPublicKey,
      memberPublicKey,
      epochNumber,
      relayStatuses,
      options
    );
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
    return findGroupChatEpochContextByRecipientPubkeyRuntime(epochPublicKey);
  }

  async function listPrivateMessageRecipientPubkeys(): Promise<string[]> {
    return listPrivateMessageRecipientPubkeysRuntime();
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
    return ensureGroupContactAndChatRuntime(groupPublicKey, encryptedPrivateKey, profile);
  }

  async function ensureGroupIdentitySecretEpochState(
    groupContact: ContactRecord,
    seedRelayUrls: string[] = []
  ): Promise<{
    contact: ContactRecord;
    secret: GroupIdentitySecretContent;
  }> {
    return ensureGroupIdentitySecretEpochStateRuntime(groupContact, seedRelayUrls);
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
    return persistIncomingGroupEpochTicketRuntime(
      groupPublicKey,
      epochNumber,
      epochPrivateKey,
      options
    );
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
    return publishGroupEpochTicketsRuntime(groupPublicKey, memberPublicKeys, options);
  }

  async function rotateGroupEpochAndSendTickets(
    groupPublicKey: string,
    memberPublicKeys: string[],
    seedRelayUrls: string[] = []
  ): Promise<RotateGroupEpochResult> {
    return rotateGroupEpochAndSendTicketsRuntime(
      groupPublicKey,
      memberPublicKeys,
      seedRelayUrls
    );
  }

  async function publishGroupMemberChanges(
    groupPublicKey: string,
    memberPublicKeys: string[],
    seedRelayUrls: string[] = []
  ): Promise<PublishGroupMemberChangesResult> {
    return publishGroupMemberChangesRuntime(groupPublicKey, memberPublicKeys, seedRelayUrls);
  }

  async function sendGroupEpochTicket(
    groupPublicKey: string,
    memberPublicKey: string,
    seedRelayUrls: string[] = []
  ): Promise<RelaySaveStatus> {
    return sendGroupEpochTicketRuntime(groupPublicKey, memberPublicKey, seedRelayUrls);
  }

  async function upsertIncomingGroupInviteRequestChat(
    groupPublicKey: string,
    createdAt: string,
    preview: Pick<ContactRecord, 'name' | 'meta'> | null = null
  ): Promise<void> {
    return upsertIncomingGroupInviteRequestChatRuntime(groupPublicKey, createdAt, preview);
  }

  async function ensureGroupInvitePubkeyIsContact(
    targetPubkeyHex: string,
    fallbackName = ''
  ): Promise<void> {
    return ensureGroupInvitePubkeyIsContactRuntime(targetPubkeyHex, fallbackName);
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
  let refreshDeveloperPendingQueuesRuntime: () => Promise<void> = async () => {};

  const {
    clearPrivateMessagesUiRefreshState,
    flushPrivateMessagesUiRefreshNow,
    queuePrivateMessagesUiRefresh,
    resetPrivateMessagesUiRuntimeState,
    scheduleChatChecks,
    schedulePostPrivateMessagesEoseChecks
  } = createPrivateMessagesUiRuntime({
    chatStore,
    normalizeThrottleMs,
    refreshDeveloperPendingQueues: () => refreshDeveloperPendingQueuesRuntime(),
    waitForPrivateMessagesIngestQueue: () =>
      getPrivateMessagesIngestQueueRuntime().catch((error) => {
        console.error('Failed while draining private message ingest queue before EOSE checks', error);
      })
  });
  const {
    createDirectMessageRumorEvent: createDirectMessageRumorEventRuntime,
    createEventDeletionRumorEvent: createEventDeletionRumorEventRuntime,
    createReactionRumorEvent: createReactionRumorEventRuntime,
    createStoredDirectMessageRumorEvent: createStoredDirectMessageRumorEventRuntime,
    createStoredSignedEvent: createStoredSignedEventRuntime,
    giftWrapSignedEvent: giftWrapSignedEventRuntime,
    normalizeEventId: normalizeEventIdRuntime,
    readDeletionTargetEntries: readDeletionTargetEntriesRuntime,
    readDirectMessageRecipientPubkey: readDirectMessageRecipientPubkeyRuntime,
    readReactionTargetAuthorPubkey: readReactionTargetAuthorPubkeyRuntime,
    readReactionTargetEventId: readReactionTargetEventIdRuntime,
    readReplyTargetEventId: readReplyTargetEventIdRuntime,
    resolveIncomingPrivateMessageRecipientContext:
      resolveIncomingPrivateMessageRecipientContextRuntime,
    toStoredNostrEvent: toStoredNostrEventRuntime,
    unwrapGiftWrapSealEvent: unwrapGiftWrapSealEventRuntime,
    verifyIncomingGroupEpochTicket: verifyIncomingGroupEpochTicketRuntime
  } = createMessageEventRuntime({
    decryptPrivateStringContent,
    derivePublicKeyFromPrivateKey,
    findGroupChatEpochContextByRecipientPubkey,
    getOrCreateSigner,
    ndk,
    readEpochNumberTag,
    readFirstTagValue
  });
  const {
    appendRelayStatusesToMessageEvent: appendRelayStatusesToMessageEventRuntime,
    buildInboundRelayStatuses: buildInboundRelayStatusesRuntime,
    consumePendingIncomingDeletions: consumePendingIncomingDeletionsRuntime,
    consumePendingIncomingReactions: consumePendingIncomingReactionsRuntime,
    queuePendingIncomingDeletion: queuePendingIncomingDeletionRuntime,
    queuePendingIncomingReaction: queuePendingIncomingReactionRuntime,
    refreshMessageInLiveState: refreshMessageInLiveStateRuntime,
    removePendingIncomingReaction: removePendingIncomingReactionRuntime
  } = createMessageRelayRuntime({
    bumpDeveloperDiagnosticsVersion,
    formatSubscriptionLogValue,
    logMessageRelayDiagnostics,
    normalizeEventId,
    normalizeRelayStatusUrls,
    normalizeThrottleMs,
    pendingIncomingDeletions,
    pendingIncomingReactions,
    queuePrivateMessagesUiRefresh
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

  const {
    buildFilterSinceDetails: buildFilterSinceDetailsRuntime,
    buildFilterUntilDetails: buildFilterUntilDetailsRuntime,
    buildLoggedNostrEvent: buildLoggedNostrEventRuntime,
    buildPrivateMessageSubscriptionTargetDetails:
      buildPrivateMessageSubscriptionTargetDetailsRuntime,
    buildSubscriptionEventDetails: buildSubscriptionEventDetailsRuntime,
    buildSubscriptionRelayDetails: buildSubscriptionRelayDetailsRuntime,
    buildTrackedContactSubscriptionTargetDetails:
      buildTrackedContactSubscriptionTargetDetailsRuntime,
    formatSubscriptionLogValue: formatSubscriptionLogValueRuntime,
    relaySignature: relaySignatureRuntime,
    subscribeWithReqLogging: subscribeWithReqLoggingRuntime
  } = createSubscriptionLoggingRuntime({
    logDeveloperTrace,
    ndk,
    normalizeEventId,
    resolveGroupChatEpochEntries
  });

  function relaySignature(relays: string[]): string {
    return relaySignatureRuntime(relays);
  }

  function formatSubscriptionLogValue(value: string | null | undefined): string | null {
    return formatSubscriptionLogValueRuntime(value);
  }

  function buildSubscriptionRelayDetails(relayUrls: string[]): Record<string, unknown> {
    return buildSubscriptionRelayDetailsRuntime(relayUrls);
  }

  function buildSubscriptionEventDetails(
    event: Pick<NDKEvent, 'id' | 'kind' | 'created_at' | 'pubkey'>
  ): Record<string, unknown> {
    return buildSubscriptionEventDetailsRuntime(event);
  }

  function buildLoggedNostrEvent(
    event: Pick<NDKEvent, 'id' | 'kind' | 'created_at' | 'pubkey' | 'content' | 'tags'>,
    storedEvent: NostrEvent | null | undefined = null
  ): Record<string, unknown> {
    return buildLoggedNostrEventRuntime(event, storedEvent);
  }

  async function buildTrackedContactSubscriptionTargetDetails(
    contactPubkeys: string[]
  ): Promise<Record<string, unknown>> {
    return buildTrackedContactSubscriptionTargetDetailsRuntime(contactPubkeys);
  }

  async function buildPrivateMessageSubscriptionTargetDetails(
    recipientPubkeys: string[],
    loggedInPubkeyHex: string | null
  ): Promise<Record<string, unknown>> {
    return buildPrivateMessageSubscriptionTargetDetailsRuntime(
      recipientPubkeys,
      loggedInPubkeyHex
    );
  }

  function subscribeWithReqLogging(
    ...args: Parameters<typeof subscribeWithReqLoggingRuntime>
  ): ReturnType<typeof subscribeWithReqLoggingRuntime> {
    return subscribeWithReqLoggingRuntime(...args);
  }

  function logSubscription(name: string, phase: string, details: Record<string, unknown> = {}): void {
    logDeveloperTrace('info', `subscription:${name}`, phase, details);
  }

  function buildFilterSinceDetails(since: number | undefined): Record<string, unknown> {
    return buildFilterSinceDetailsRuntime(since);
  }

  function buildFilterUntilDetails(until: number | undefined): Record<string, unknown> {
    return buildFilterUntilDetailsRuntime(until);
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
    return createDirectMessageRumorEventRuntime(
      senderPubkey,
      recipientPubkey,
      message,
      createdAt,
      replyToEventId
    );
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
    return createReactionRumorEventRuntime(
      senderPubkey,
      recipientPubkey,
      emoji,
      targetEventId,
      targetAuthorPubkey,
      targetKind,
      createdAt
    );
  }

  function createEventDeletionRumorEvent(
    senderPubkey: string,
    recipientPubkey: string,
    targetEventId: string,
    targetKind: number,
    createdAt: number
  ): NDKEvent {
    return createEventDeletionRumorEventRuntime(
      senderPubkey,
      recipientPubkey,
      targetEventId,
      targetKind,
      createdAt
    );
  }

  function createStoredSignedEvent(event: NostrEvent): NDKEvent | null {
    return createStoredSignedEventRuntime(event);
  }

  function createStoredDirectMessageRumorEvent(event: NostrEvent): NDKEvent | null {
    return createStoredDirectMessageRumorEventRuntime(event);
  }

  async function giftWrapSignedEvent(
    event: NDKEvent,
    recipient: NDKUser,
    signer: NDKSigner
  ): Promise<NDKEvent> {
    return giftWrapSignedEventRuntime(event, recipient, signer);
  }

  async function unwrapGiftWrapSealEvent(wrappedEvent: NDKEvent): Promise<NostrEvent | null> {
    return unwrapGiftWrapSealEventRuntime(wrappedEvent);
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
    return verifyIncomingGroupEpochTicketRuntime(rumorEvent, sealEvent);
  }

  async function resolveIncomingPrivateMessageRecipientContext(
    wrappedEvent: NDKEvent,
    loggedInPubkeyHex: string
  ): Promise<{
    recipientPubkey: string;
    unwrapSigner: NDKSigner;
    groupChatPublicKey: string | null;
  } | null> {
    return resolveIncomingPrivateMessageRecipientContextRuntime(wrappedEvent, loggedInPubkeyHex);
  }

  function readDirectMessageRecipientPubkey(event: NostrEvent): string | null {
    return readDirectMessageRecipientPubkeyRuntime(event);
  }

  function readReactionTargetEventId(event: NDKEvent): string | null {
    return readReactionTargetEventIdRuntime(event);
  }

  function readReplyTargetEventId(event: NDKEvent): string | null {
    return readReplyTargetEventIdRuntime(event);
  }

  function readReactionTargetAuthorPubkey(event: NDKEvent): string | null {
    return readReactionTargetAuthorPubkeyRuntime(event);
  }

  function readDeletionTargetEntries(
    event: NDKEvent
  ): Array<{ eventId: string; kind: number | null }> {
    return readDeletionTargetEntriesRuntime(event);
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
    return normalizeEventIdRuntime(value);
  }

  async function toStoredNostrEvent(event: NDKEvent): Promise<NostrEvent | null> {
    return toStoredNostrEventRuntime(event);
  }

  async function refreshMessageInLiveState(messageId: number): Promise<void> {
    return refreshMessageInLiveStateRuntime(messageId);
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
    return appendRelayStatusesToMessageEventRuntime(messageId, relayStatuses, options);
  }

  function buildInboundRelayStatuses(relayUrls: string[]): MessageRelayStatus[] {
    return buildInboundRelayStatusesRuntime(relayUrls);
  }

  function buildPendingOutboundRelayStatuses(
    relayUrls: string[],
    scope: 'recipient' | 'self'
  ): MessageRelayStatus[] {
    return buildPendingOutboundRelayStatusesRuntime(relayUrls, scope);
  }

  function buildFailedOutboundRelayStatuses(
    relayUrls: string[],
    scope: 'recipient' | 'self',
    detail: string
  ): MessageRelayStatus[] {
    return buildFailedOutboundRelayStatusesRuntime(relayUrls, scope, detail);
  }

  function extractRelayUrlsFromEvent(event: NDKEvent): string[] {
    return extractRelayUrlsFromEventRuntime(event);
  }

  async function publishEventWithRelayStatuses(
    event: NDKEvent,
    relayUrls: string[],
    scope: 'recipient' | 'self'
  ): Promise<RelayPublishStatusesResult> {
    return publishEventWithRelayStatusesRuntime(event, relayUrls, scope);
  }

  async function publishReplaceableEventWithRelayStatuses(
    event: NDKEvent,
    relayUrls: string[],
    scope: 'recipient' | 'self'
  ): Promise<RelayPublishStatusesResult> {
    return publishReplaceableEventWithRelayStatusesRuntime(event, relayUrls, scope);
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
    return sendGiftWrappedRumorRuntime(
      recipientPublicKey,
      relays,
      rumorKind,
      createRumorEvent,
      options
    );
  }

  async function applyPendingIncomingReactionsForMessage(
    messageRow: MessageRow,
    options: {
      uiThrottleMs?: number;
    } = {}
  ): Promise<MessageRow> {
    return applyPendingIncomingReactionsForMessageRuntime(messageRow, options);
  }

  async function applyPendingIncomingDeletionsForMessage(
    messageRow: MessageRow,
    options: {
      uiThrottleMs?: number;
    } = {}
  ): Promise<MessageRow> {
    return applyPendingIncomingDeletionsForMessageRuntime(messageRow, options);
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
    return processIncomingReactionRumorEventRuntime(
      rumorEvent,
      chatPubkey,
      senderPubkeyHex,
      options
    );
  }

  async function buildReplyPreviewFromTargetEvent(
    targetEventId: string,
    chatPubkey: string,
    loggedInPubkeyHex: string,
    contact?: ContactRecord | null
  ): Promise<MessageReplyPreview> {
    return buildReplyPreviewFromTargetEventRuntime(
      targetEventId,
      chatPubkey,
      loggedInPubkeyHex,
      contact
    );
  }

  async function processIncomingReactionDeletion(
    reactionEventId: string,
    deletionAuthorPublicKey: string,
    options: {
      uiThrottleMs?: number;
    } = {}
  ): Promise<boolean> {
    return processIncomingReactionDeletionRuntime(
      reactionEventId,
      deletionAuthorPublicKey,
      options
    );
  }

  async function processIncomingDeletionRumorEvent(
    rumorEvent: NDKEvent,
    senderPubkeyHex: string,
    options: {
      uiThrottleMs?: number;
    } = {}
  ): Promise<void> {
    return processIncomingDeletionRumorEventRuntime(rumorEvent, senderPubkeyHex, options);
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
    ensureRelayConnections: ensureRelayConnectionsRuntime,
    fetchRelayNip11Info: fetchRelayNip11InfoRuntime,
    getOrCreateSigner: getOrCreateSignerRuntime,
    getRelayConnectionState: getRelayConnectionStateRuntime
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
    getPrivateKeyHex,
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
    }
  });
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

  const {
    buildFailedOutboundRelayStatuses: buildFailedOutboundRelayStatusesRuntime,
    buildPendingOutboundRelayStatuses: buildPendingOutboundRelayStatusesRuntime,
    extractRelayUrlsFromEvent: extractRelayUrlsFromEventRuntime,
    publishEventWithRelayStatuses: publishEventWithRelayStatusesRuntime,
    publishGroupMetadata: publishGroupMetadataRuntime,
    publishGroupRelayList: publishGroupRelayListRuntime,
    publishReplaceableEventWithRelayStatuses: publishReplaceableEventWithRelayStatusesRuntime,
    publishUserMetadata: publishUserMetadataRuntime,
    sendGiftWrappedRumor: sendGiftWrappedRumorRuntime
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
    updateStoredEventSinceFromCreatedAt
  });

  const {
    applyMyRelayListEntries,
    fetchMyRelayListEntries,
    publishMyRelayList,
    resetMyRelayListRuntimeState,
    restoreMyRelayList,
    stopMyRelayListSubscription,
    subscribeMyRelayListUpdates,
    updateLoggedInUserRelayList
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
    subscribePrivateMessagesForLoggedInUser,
    subscribeWithReqLogging,
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

  function ensurePrivateMessagesWatchdog(): void {
    ensurePrivateMessagesWatchdogRuntime();
  }

  async function subscribePrivateMessagesForLoggedInUser(
    force = false,
    options: SubscribePrivateMessagesOptions = {}
  ): Promise<void> {
    return subscribePrivateMessagesForLoggedInUserRuntime(force, options);
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

  const {
    appendRelayStatusesToGroupMemberTicketEvent: appendRelayStatusesToGroupMemberTicketEventRuntime,
    ensureGroupContactAndChat: ensureGroupContactAndChatRuntime,
    ensureGroupIdentitySecretEpochState: ensureGroupIdentitySecretEpochStateRuntime,
    findGroupChatEpochContextByRecipientPubkey:
      findGroupChatEpochContextByRecipientPubkeyRuntime,
    listPrivateMessageRecipientPubkeys: listPrivateMessageRecipientPubkeysRuntime,
    persistIncomingGroupEpochTicket: persistIncomingGroupEpochTicketRuntime,
    upsertGroupMemberTicketDelivery: upsertGroupMemberTicketDeliveryRuntime
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
      restoreGroupEpochHistoryRuntime(groupPublicKey, epochPublicKey, options)
  });

  const {
    publishGroupEpochTickets: publishGroupEpochTicketsRuntime,
    publishGroupMemberChanges: publishGroupMemberChangesRuntime,
    rotateGroupEpochAndSendTickets: rotateGroupEpochAndSendTicketsRuntime,
    sendGroupEpochTicket: sendGroupEpochTicketRuntime
  } = createGroupEpochPublishRuntime({
    appendRelayStatusesToGroupMemberTicketEvent:
      appendRelayStatusesToGroupMemberTicketEventRuntime,
    buildFailedOutboundRelayStatuses,
    buildPendingOutboundRelayStatuses,
    buildRelaySaveStatus,
    encryptGroupIdentitySecretContent,
    ensureGroupIdentitySecretEpochState: ensureGroupIdentitySecretEpochStateRuntime,
    ensureRelayConnections,
    getAppRelayUrls,
    getLoggedInPublicKeyHex,
    giftWrapSignedEvent,
    ndk,
    normalizeEventId,
    persistIncomingGroupEpochTicket: persistIncomingGroupEpochTicketRuntime,
    publishEventWithRelayStatuses,
    publishGroupIdentitySecret: (groupPublicKey, encryptedPrivateKey, seedRelayUrls = []) =>
      publishGroupIdentitySecretRuntime(groupPublicKey, encryptedPrivateKey, seedRelayUrls),
    toIsoTimestampFromUnix,
    toStoredNostrEvent
  });

  const {
    applyPendingIncomingDeletionsForMessage: applyPendingIncomingDeletionsForMessageRuntime,
    applyPendingIncomingReactionsForMessage: applyPendingIncomingReactionsForMessageRuntime,
    buildReplyPreviewFromTargetEvent: buildReplyPreviewFromTargetEventRuntime,
    processIncomingDeletionRumorEvent: processIncomingDeletionRumorEventRuntime,
    processIncomingReactionDeletion: processIncomingReactionDeletionRuntime,
    processIncomingReactionRumorEvent: processIncomingReactionRumorEventRuntime
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
    consumePendingIncomingReactions: consumePendingIncomingReactionsRuntime
  });

  const {
    getPrivateMessagesIngestQueue,
    queuePrivateMessageIngestion: queuePrivateMessageIngestionImpl,
    resetPrivateMessagesIngestRuntimeState: resetPrivateMessagesIngestRuntimeStateImpl
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
    verifyIncomingGroupEpochTicket
  });
  getPrivateMessagesIngestQueueRuntime = getPrivateMessagesIngestQueue;
  queuePrivateMessageIngestionRuntime = queuePrivateMessageIngestionImpl;
  resetPrivateMessagesIngestRuntimeState = resetPrivateMessagesIngestRuntimeStateImpl;

  const {
    ensurePrivateMessagesWatchdog: ensurePrivateMessagesWatchdogImpl,
    getPrivateMessagesSubscription,
    getPrivateMessagesSubscriptionSignature,
    isPrivateMessagesSubscriptionRelayTracked,
    markPrivateMessagesWatchdogRelayDisconnected,
    queuePrivateMessagesWatchdog,
    resetPrivateMessagesSubscriptionRuntimeState,
    stopPrivateMessagesLiveSubscription,
    subscribePrivateMessagesForLoggedInUser: subscribePrivateMessagesForLoggedInUserImpl
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
    startPrivateMessagesStartupBackfill: (loggedInPubkeyHex, recipientPubkeys, relayUrls, liveSince) => {
      startPrivateMessagesStartupBackfillRuntime(
        loggedInPubkeyHex,
        recipientPubkeys,
        relayUrls,
        liveSince
      );
    },
    subscribeWithReqLogging,
    updateStoredEventSinceFromCreatedAt,
    updateStoredPrivateMessagesLastReceivedFromCreatedAt
  });
  ensurePrivateMessagesWatchdogRuntime = ensurePrivateMessagesWatchdogImpl;
  isPrivateMessagesSubscriptionRelayTrackedRuntime = isPrivateMessagesSubscriptionRelayTracked;
  markPrivateMessagesWatchdogRelayDisconnectedRuntime =
    markPrivateMessagesWatchdogRelayDisconnected;
  queuePrivateMessagesWatchdogRuntime = queuePrivateMessagesWatchdog;
  subscribePrivateMessagesForLoggedInUserRuntime = subscribePrivateMessagesForLoggedInUserImpl;
  ensurePrivateMessagesWatchdog();

  const {
    restoreGroupEpochHistory: restoreGroupEpochHistoryImpl,
    startPrivateMessagesStartupBackfill: startPrivateMessagesStartupBackfillImpl,
    stopPrivateMessagesBackfill: stopPrivateMessagesBackfillImpl
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
    writePrivateMessagesBackfillState
  });
  restoreGroupEpochHistoryRuntime = restoreGroupEpochHistoryImpl;
  startPrivateMessagesStartupBackfillRuntime = startPrivateMessagesStartupBackfillImpl;
  stopPrivateMessagesBackfillRuntime = stopPrivateMessagesBackfillImpl;

  const {
    resetContactSubscriptionsRuntimeState,
    subscribeContactProfileUpdates,
    subscribeContactRelayListUpdates
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
    updateStoredEventSinceFromCreatedAt
  });

  function queueTrackedContactSubscriptionsRefresh(
    seedRelayUrls: string[] = [],
    force = false
  ): void {
    queueContactProfileSubscriptionRefresh(seedRelayUrls, force);
    queueContactRelayListSubscriptionRefresh(seedRelayUrls, force);
    queuePrivateMessagesSubscriptionRefresh(force, { seedRelayUrls });
  }

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
    subscribePrivateContactListUpdates
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
    updateStoredEventSinceFromCreatedAt
  });

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
  refreshContactByPublicKeyRuntime = refreshContactByPublicKey;
  queueBackgroundGroupContactRefreshRuntime = queueBackgroundGroupContactRefresh;

  const {
    ensureGroupInvitePubkeyIsContact: ensureGroupInvitePubkeyIsContactImpl,
    upsertIncomingGroupInviteRequestChat: upsertIncomingGroupInviteRequestChatImpl
  } = createGroupInviteRuntime({
    bumpContactListVersion,
    chatStore,
    ensureContactListedInPrivateContactList,
    ensureContactStoredAsGroup,
    getAppRelayUrls,
    getLoggedInPublicKeyHex,
    publishPrivateContactList,
    refreshGroupContactByPublicKey,
    subscribePrivateMessagesForLoggedInUser
  });
  ensureGroupInvitePubkeyIsContactRuntime = ensureGroupInvitePubkeyIsContactImpl;
  upsertIncomingGroupInviteRequestChatRuntime = upsertIncomingGroupInviteRequestChatImpl;

  const {
    applyContactCursorStateToContact,
    buildChatMetaWithUnseenReactionCount,
    compareContactCursorState,
    createGroupChat,
    fetchContactCursorEvents,
    fetchGroupIdentitySecretEvents,
    publishContactCursor,
    publishGroupIdentitySecret: publishGroupIdentitySecretImpl,
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
  publishGroupIdentitySecretRuntime = publishGroupIdentitySecretImpl;
  const {
    refreshAllStoredContacts: refreshAllStoredContactsImpl,
    restoreStartupState: restoreStartupStateRuntime,
    syncLoggedInContactProfile: syncLoggedInContactProfileRuntime,
    syncRecentChatContacts: syncRecentChatContactsRuntime
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
    subscribePrivateMessagesForLoggedInUser
  });
  refreshAllStoredContactsRuntime = refreshAllStoredContactsImpl;

  function bumpRelayStatusVersion(): void {
    relayStatusVersion.value += 1;
  }

  async function getOrCreateSigner(): Promise<NDKSigner> {
    return getOrCreateSignerRuntime();
  }

  async function ensureRelayConnections(relayUrls: string[]): Promise<void> {
    return ensureRelayConnectionsRuntime(relayUrls);
  }

  function getRelayConnectionState(relayUrl: string): RelayConnectionState {
    return getRelayConnectionStateRuntime(relayUrl);
  }

  async function fetchRelayNip11Info(
    relayUrl: string,
    force = false
  ): Promise<NDKRelayInformation> {
    return fetchRelayNip11InfoRuntime(relayUrl, force);
  }

  async function publishUserMetadata(
    metadata: PublishUserMetadataInput,
    relayUrls: string[]
  ): Promise<void> {
    return publishUserMetadataRuntime(metadata, relayUrls);
  }

  async function publishGroupMetadata(
    groupPublicKey: string,
    metadata: PublishUserMetadataInput,
    seedRelayUrls: string[] = []
  ): Promise<void> {
    return publishGroupMetadataRuntime(groupPublicKey, metadata, seedRelayUrls);
  }

  async function publishGroupRelayList(
    groupPublicKey: string,
    relayEntries: RelayListMetadataEntry[],
    publishRelayUrls: string[] = []
  ): Promise<RelaySaveStatus> {
    return publishGroupRelayListRuntime(groupPublicKey, relayEntries, publishRelayUrls);
  }

  function stopPrivateMessagesBackfill(reason = 'replace'): void {
    stopPrivateMessagesBackfillRuntime(reason);
  }

  async function restoreGroupEpochHistory(
    groupPublicKey: string,
    epochPublicKey: string,
    options: {
      force?: boolean;
      seedRelayUrls?: string[];
    } = {}
  ): Promise<void> {
    return restoreGroupEpochHistoryRuntime(groupPublicKey, epochPublicKey, options);
  }

  function stopPrivateMessagesSubscription(reason = 'replace'): void {
    stopPrivateMessagesBackfill(reason);
    stopPrivateMessagesLiveSubscription(reason);
  }

  function queuePrivateMessageIngestion(
    wrappedEvent: NDKEvent,
    loggedInPubkeyHex: string,
    options: {
      uiThrottleMs?: number;
    } = {}
  ): void {
    queuePrivateMessageIngestionRuntime(wrappedEvent, loggedInPubkeyHex, options);
  }

  async function fetchMyRelayList(relayUrls: string[]): Promise<string[]> {
    const relayEntries = await fetchMyRelayListEntries(relayUrls);
    if (relayEntries === null) {
      return [];
    }

    return relayEntries.map((relay) => relay.url);
  }

  async function restoreStartupState(seedRelayUrls: string[] = []): Promise<void> {
    return restoreStartupStateRuntime(seedRelayUrls);
  }

  async function syncLoggedInContactProfile(relayUrls: string[]): Promise<void> {
    return syncLoggedInContactProfileRuntime(relayUrls);
  }

  async function syncRecentChatContacts(relayUrls: string[]): Promise<void> {
    return syncRecentChatContactsRuntime(relayUrls);
  }

  const {
    clearPrivateKey: clearPrivateKeyImpl,
    getPrivateKeyHex: getPrivateKeyHexImpl,
    loginWithExtension: loginWithExtensionImpl,
    logout: logoutImpl,
    savePrivateKeyHex: savePrivateKeyHexImpl
  } = createAuthSessionRuntime({
    authenticatedRelayUrls,
    backgroundGroupContactRefreshStartedAt,
    bumpDeveloperDiagnosticsVersion,
    chatStoreClearAllComposerDrafts: () => {
      chatStore.clearAllComposerDrafts();
    },
    clearBrowserNotificationsPreference,
    clearDarkModePreference,
    clearDeveloperTraceEntries,
    clearPanelOpacityPreference,
    clearPrivateMessagesBackfillState,
    clearPrivatePreferencesStorage,
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
    stopPrivateMessagesSubscription
  });
  getPrivateKeyHexRuntime = getPrivateKeyHexImpl;
  savePrivateKeyHexRuntime = savePrivateKeyHexImpl;
  loginWithExtensionRuntime = loginWithExtensionImpl;
  clearPrivateKeyRuntime = clearPrivateKeyImpl;
  logoutRuntime = logoutImpl;

  function getPrivateKeyHex(): string | null {
    return getPrivateKeyHexRuntime();
  }

  function savePrivateKeyHex(hexPrivateKey: string): boolean {
    return savePrivateKeyHexRuntime(hexPrivateKey);
  }

  async function loginWithExtension(): Promise<string> {
    return loginWithExtensionRuntime();
  }

  function clearPrivateKey(): void {
    clearPrivateKeyRuntime();
  }

  async function logout(): Promise<void> {
    return logoutRuntime();
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
    subscribePrivateMessagesForLoggedInUser,
    toOptionalIsoTimestampFromUnix
  });
  refreshDeveloperPendingQueuesRuntime = refreshDeveloperPendingQueues;

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
