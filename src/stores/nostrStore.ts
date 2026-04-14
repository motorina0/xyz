import NDK, {
  type NDKEvent,
  NDKPrivateKeySigner,
  type NDKSigner,
  type NDKUser,
  type NostrEvent,
  nip19,
  normalizeRelayUrl,
} from '@nostr-dev-kit/ndk';
import { defineStore } from 'pinia';
import { type ChatRow, chatDataService } from 'src/services/chatDataService';
import { contactsService } from 'src/services/contactsService';
import {
  inputSanitizerService,
  type NpubValidationResult,
  type NsecValidationResult,
  type PrivateKeyValidationResult,
} from 'src/services/inputSanitizerService';
import { nostrEventDataService } from 'src/services/nostrEventDataService';
import { useChatStore } from 'src/stores/chatStore';
import { useNip65RelayStore } from 'src/stores/nip65RelayStore';
import { createAuthSessionRuntime } from 'src/stores/nostr/authSessionRuntime';
import {
  AUTH_METHOD_STORAGE_KEY,
  DEFAULT_EVENT_SINCE_LOOKBACK_SECONDS,
  DEVELOPER_DIAGNOSTICS_STORAGE_KEY,
  INITIAL_CONNECT_TIMEOUT_MS,
  LAST_SEEN_RECEIVED_ACTIVITY_AT_META_KEY,
  PRIVATE_CONTACT_LIST_MEMBER_CONTACT_META_KEY,
  PRIVATE_MESSAGES_EPOCH_SUBSCRIPTION_REFRESH_DEBOUNCE_MS,
  PUBLIC_KEY_STORAGE_KEY,
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
import { createPrivateMessagesBackfillRuntime } from 'src/stores/nostr/privateMessagesBackfillRuntime';
import { createPrivateMessagesIngestRuntime } from 'src/stores/nostr/privateMessagesIngestRuntime';
import { createPrivateMessagesSubscriptionRuntime } from 'src/stores/nostr/privateMessagesSubscriptionRuntime';
import { createPrivateMessagesUiRuntime } from 'src/stores/nostr/privateMessagesUiRuntime';
import { createPrivateStateRuntime } from 'src/stores/nostr/privateStateRuntime';
import { createRelayConnectionRuntime } from 'src/stores/nostr/relayConnectionRuntime';
import { createRelayPublishRuntime } from 'src/stores/nostr/relayPublishRuntime';
import { hasStorage } from 'src/stores/nostr/shared';
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
  AuthMethod,
  ContactCursorState,
  GroupIdentitySecretContent,
  MessageRow,
  PendingIncomingDeletion,
  PendingIncomingReaction,
  PrivatePreferences,
  PublishGroupMemberChangesResult,
  RelaySaveStatus,
  RotateGroupEpochResult,
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
import type {
  ChatGroupEpochKey,
  MessageRelayStatus,
  MessageReplyPreview,
  NostrEventDirection,
} from 'src/types/chat';
import type { ContactMetadata, ContactRecord } from 'src/types/contact';
import { clearBrowserNotificationsPreference } from 'src/utils/browserNotificationPreference';
import { clearDarkModePreference, clearPanelOpacityPreference } from 'src/utils/themeStorage';
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
  let isPrivateMessagesSubscriptionRelayTrackedRuntime: (relayUrl: string) => boolean = () => false;
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

  function derivePublicKeyFromPrivateKey(privateKey: string): string | null {
    const normalizedPrivateKey = inputSanitizerService.normalizeHexKey(privateKey);
    if (!normalizedPrivateKey) {
      return null;
    }

    try {
      return inputSanitizerService.normalizeHexKey(
        new NDKPrivateKeySigner(normalizedPrivateKey).pubkey
      );
    } catch {
      return null;
    }
  }

  const isContactListedInPrivateContactList = isContactListedInPrivateContactListValue;

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
        didChange: false,
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
      [PRIVATE_CONTACT_LIST_MEMBER_CONTACT_META_KEY]: true,
    };

    if (!existingContact) {
      const createdContact = await contactsService.createContact({
        public_key: normalizedTargetPubkey,
        ...(options.type ? { type: options.type } : {}),
        name: fallbackName,
        given_name: null,
        meta: nextMeta,
        relays: [],
      });
      if (createdContact) {
        bumpContactListVersion();
      }
      return {
        contact: createdContact,
        didChange: Boolean(createdContact),
      };
    }

    const shouldUpdateType = options.type ? existingContact.type !== options.type : false;
    const shouldUpdateMeta =
      JSON.stringify(inputSanitizerService.normalizeContactMetadata(existingContact.meta ?? {})) !==
      JSON.stringify(inputSanitizerService.normalizeContactMetadata(nextMeta));

    if (!shouldUpdateType && !shouldUpdateMeta) {
      return {
        contact: existingContact,
        didChange: false,
      };
    }

    const updatedContact = await contactsService.updateContact(existingContact.id, {
      ...(shouldUpdateType ? { type: options.type } : {}),
      ...(shouldUpdateMeta ? { meta: nextMeta } : {}),
    });
    if (updatedContact) {
      bumpContactListVersion();
    }

    return {
      contact: updatedContact ?? existingContact,
      didChange: Boolean(updatedContact),
    };
  }

  async function reconcileAcceptedChatFromPrivateContactList(
    contactPublicKey: string
  ): Promise<void> {
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
      acceptedAt: acceptedAt || new Date().toISOString(),
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

  async function rotateGroupEpochAndSendTickets(
    groupPublicKey: string,
    memberPublicKeys: string[],
    seedRelayUrls: string[] = []
  ): Promise<RotateGroupEpochResult> {
    return rotateGroupEpochAndSendTicketsRuntime(groupPublicKey, memberPublicKeys, seedRelayUrls);
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
        pubkey: pubkeyHex,
      });
    } catch {
      return null;
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

  async function getLoggedInSignerUser(): Promise<NDKUser> {
    const signer = await getOrCreateSigner();
    const user = await signer.user();
    user.ndk = ndk;
    return user;
  }

  function normalizeEventId(value: unknown): string | null {
    return normalizeEventIdRuntime(value);
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

  const buildUpdatedContactMeta = buildUpdatedContactMetaValue;
  const buildIdentifierFallbacks = buildIdentifierFallbacksValue;
  const relayEntriesFromRelayList = relayEntriesFromRelayListValue;
  const contactRelayListsEqual = contactRelayListsEqualValue;
  const contactMetadataEqual = contactMetadataEqualValue;
  const shouldPreserveExistingGroupRelays = shouldPreserveExistingGroupRelaysValue;

  const {
    ensureRelayConnections,
    fetchRelayNip11Info,
    getOrCreateSigner: getOrCreateSignerRuntime,
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
    },
  });

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
      subscribePrivateMessagesForLoggedInUser(force, options),
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
    subscribePrivateMessagesForLoggedInUser,
    subscribeWithReqLogging,
    updateStoredEventSinceFromCreatedAt,
  });

  function ensurePrivateMessagesWatchdog(): void {
    ensurePrivateMessagesWatchdogRuntime();
  }

  async function subscribePrivateMessagesForLoggedInUser(
    force = false,
    options: SubscribePrivateMessagesOptions = {}
  ): Promise<void> {
    return subscribePrivateMessagesForLoggedInUserRuntime(force, options);
  }

  const {
    appendRelayStatusesToGroupMemberTicketEvent: appendRelayStatusesToGroupMemberTicketEventRuntime,
    ensureGroupContactAndChat: ensureGroupContactAndChatRuntime,
    ensureGroupIdentitySecretEpochState: ensureGroupIdentitySecretEpochStateRuntime,
    findGroupChatEpochContextByRecipientPubkey: findGroupChatEpochContextByRecipientPubkeyRuntime,
    listPrivateMessageRecipientPubkeys: listPrivateMessageRecipientPubkeysRuntime,
    persistIncomingGroupEpochTicket: persistIncomingGroupEpochTicketRuntime,
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

  const {
    publishGroupMemberChanges: publishGroupMemberChangesRuntime,
    rotateGroupEpochAndSendTickets: rotateGroupEpochAndSendTicketsRuntime,
    sendGroupEpochTicket: sendGroupEpochTicketRuntime,
  } = createGroupEpochPublishRuntime({
    appendRelayStatusesToGroupMemberTicketEvent: appendRelayStatusesToGroupMemberTicketEventRuntime,
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
    toStoredNostrEvent,
  });

  const {
    applyPendingIncomingDeletionsForMessage: applyPendingIncomingDeletionsForMessageRuntime,
    applyPendingIncomingReactionsForMessage: applyPendingIncomingReactionsForMessageRuntime,
    buildReplyPreviewFromTargetEvent: buildReplyPreviewFromTargetEventRuntime,
    processIncomingDeletionRumorEvent: processIncomingDeletionRumorEventRuntime,
    processIncomingReactionDeletion: processIncomingReactionDeletionRuntime,
    processIncomingReactionRumorEvent: processIncomingReactionRumorEventRuntime,
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
    queuePrivateMessageIngestion: queuePrivateMessageIngestionImpl,
    resetPrivateMessagesIngestRuntimeState: resetPrivateMessagesIngestRuntimeStateImpl,
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
    ensureGroupInvitePubkeyIsContact: ensureGroupInvitePubkeyIsContactImpl,
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
    subscribePrivateMessagesForLoggedInUser,
  });
  ensureGroupInvitePubkeyIsContactRuntime = ensureGroupInvitePubkeyIsContactImpl;
  upsertIncomingGroupInviteRequestChatRuntime = upsertIncomingGroupInviteRequestChatImpl;

  const {
    applyContactCursorStateToContact,

    createGroupChat,
    fetchContactCursorEvents,

    publishGroupIdentitySecret: publishGroupIdentitySecretImpl,
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
  const {
    refreshAllStoredContacts: refreshAllStoredContactsImpl,
    restoreStartupState: restoreStartupStateRuntime,
    syncLoggedInContactProfile: syncLoggedInContactProfileRuntime,
    syncRecentChatContacts: syncRecentChatContactsRuntime,
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
    subscribePrivateMessagesForLoggedInUser,
  });
  refreshAllStoredContactsRuntime = refreshAllStoredContactsImpl;

  function bumpRelayStatusVersion(): void {
    relayStatusVersion.value += 1;
  }

  function stopPrivateMessagesBackfill(reason = 'replace'): void {
    stopPrivateMessagesBackfillRuntime(reason);
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
    savePrivateKeyHex: savePrivateKeyHexImpl,
  } = createAuthSessionRuntime({
    authenticatedRelayUrls,
    backgroundGroupContactRefreshStartedAt,
    bumpDeveloperDiagnosticsVersion,
    chatStoreClearAllComposerDrafts: chatStore.clearAllComposerDrafts,
    clearBrowserNotificationsPreference,
    clearDarkModePreference,
    clearDeveloperTraceEntries,
    clearNip65RelayStoreState: nip65RelayStore.clear,
    clearPanelOpacityPreference,
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
    stopPrivateMessagesSubscription,
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
    savePrivateKeyHex,
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
    subscribePrivateMessagesForLoggedInUser,
    toOptionalIsoTimestampFromUnix,
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
    validateNsec,
  };
});
