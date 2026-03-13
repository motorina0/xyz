import { defineStore } from 'pinia';
import { ref } from 'vue';
import NDK, {
  NDKEvent,
  NDKKind,
  NDKNip07Signer,
  NDKPublishError,
  NDKPrivateKeySigner,
  NDKRelayAuthPolicies,
  type NDKRelay,
  type NDKRelayConnectionStats,
  NDKRelayList,
  NDKSubscriptionCacheUsage,
  type NDKSigner,
  type NDKUserProfile,
  type NDKRelayInformation,
  NDKRelayStatus,
  NDKRelaySet,
  NDKUser,
  giftUnwrap,
  giftWrap,
  getRelayListForUser,
  isValidNip05,
  isValidPubkey,
  nip19,
  normalizeRelayUrl,
  type NostrEvent
} from '@nostr-dev-kit/ndk';
import { getEmojiEntryByValue } from 'src/data/topEmojis';
import { chatDataService } from 'src/services/chatDataService';
import { contactsService } from 'src/services/contactsService';
import {
  developerTraceDataService,
  type DeveloperTraceEntry,
  type DeveloperTraceLevel
} from 'src/services/developerTraceDataService';
import { imageCacheService } from 'src/services/imageCacheService';
import { nostrEventDataService } from 'src/services/nostrEventDataService';
import {
  inputSanitizerService,
  type PrivateKeyValidationResult,
  type NpubValidationResult,
  type NsecValidationResult
} from 'src/services/inputSanitizerService';
import { useChatStore } from 'src/stores/chatStore';
import { useNip65RelayStore } from 'src/stores/nip65RelayStore';
import { useRelayStore } from 'src/stores/relayStore';
import type {
  DeletedMessageMetadata,
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
import {
  areBrowserNotificationsEnabled,
  clearBrowserNotificationsPreference
} from 'src/utils/browserNotificationPreference';
import { clearDarkModePreference, clearPanelOpacityPreference } from 'src/utils/themeStorage';

export type {
  DeveloperTraceEntry,
  DeveloperTraceLevel
} from 'src/services/developerTraceDataService';

export interface NostrIdentifierResolutionResult {
  isValid: boolean;
  normalizedPubkey: string | null;
  resolvedName: string | null;
  relays: string[];
  identifierType: 'pubkey' | 'nip05' | null;
  error: 'invalid' | 'nip05_unresolved' | null;
}

export type NostrNpubValidationResult = NpubValidationResult;
export type NostrNsecValidationResult = NsecValidationResult;
export type NostrPrivateKeyValidationResult = PrivateKeyValidationResult;

export interface NostrNip05DataResult {
  isValid: boolean;
  normalizedPubkey: string | null;
  name: string | null;
  relays: string[];
  error: 'invalid' | 'nip05_unresolved' | null;
}

export type RelayConnectionState = 'connected' | 'issue';

export interface PublishUserMetadataInput {
  [key: string]: unknown;
  name?: string;
  about?: string;
  picture?: string;
  display_name?: string;
  website?: string;
  banner?: string;
  bot?: boolean;
  birthday?: {
    year?: number;
    month?: number;
    day?: number;
  };
}

export interface RelayListMetadataEntry {
  url: string;
  read?: boolean;
  write?: boolean;
}

export type AuthMethod = 'nsec' | 'nip07';

interface SendGiftWrappedRumorOptions {
  localMessageId?: number;
  createdAt?: string;
}

interface SendDirectMessageOptions extends SendGiftWrappedRumorOptions {
  replyToEventId?: string | null;
}

interface SendDirectMessageReactionOptions {
  createdAt?: string;
  targetKind?: number;
}

interface SendDirectMessageDeletionOptions {
  createdAt?: string;
}

interface RelayPublishStatusesResult {
  relayStatuses: MessageRelayStatus[];
  error: Error | null;
}

interface GiftWrappedRumorPublishResult {
  giftWrapEvent: NostrEvent;
  rumorEvent: NostrEvent | null;
  rumorEventId: string | null;
  relayStatuses: MessageRelayStatus[];
}

interface SubscribePrivateMessagesOptions {
  restoreThrottleMs?: number;
  sinceOverride?: number;
  startupTrackStep?: boolean;
}

interface QueuePrivateMessageUiRefreshOptions {
  throttleMs?: number;
  reloadChats?: boolean;
  reloadMessages?: boolean;
}

interface PendingIncomingReaction {
  chatPublicKey: string;
  targetAuthorPublicKey: string | null;
  reaction: MessageReaction;
}

interface PendingIncomingDeletion {
  deletionAuthorPublicKey: string;
  deleteEventId: string | null;
  deletedAt: string;
  targetKind: number | null;
}

type SubscriptionLogName = 'my-relay-list' | 'private-contact-list' | 'private-messages';

interface PrivatePreferences {
  contactSecret: string;
  [key: string]: unknown;
}

interface ContactCursorContent {
  version: string;
  last_seen_incoming_activity_at: string;
  last_seen_incoming_activity_event_id: string | null;
}

interface ContactCursorState {
  at: string;
  eventId: string | null;
}

export interface DeveloperRelaySnapshot {
  present: boolean;
  url: string | null;
  connected: boolean;
  status: number | null;
  statusName: string | null;
  attempts: number | null;
  success: number | null;
  connectedAt: number | null;
  nextReconnectAt: number | null;
  validationRatio: number | null;
  lastDurationMs: number | null;
}

export interface DeveloperRelayRow extends DeveloperRelaySnapshot {
  inReadSet: boolean;
  inPublishSet: boolean;
  inPrivateMessagesSubscription: boolean;
  isConfigured: boolean;
}

export interface DeveloperPendingReactionSnapshot {
  targetEventId: string;
  count: number;
  entries: Array<{
    chatPublicKey: string;
    targetAuthorPublicKey: string | null;
    emoji: string;
    reactorPublicKey: string;
    createdAt: string;
    eventId: string | null;
  }>;
}

export interface DeveloperPendingDeletionSnapshot {
  targetEventId: string;
  count: number;
  entries: Array<{
    deletionAuthorPublicKey: string;
    deleteEventId: string | null;
    deletedAt: string;
    targetKind: number | null;
  }>;
}

export interface DeveloperPrivateMessagesSubscriptionSnapshot {
  active: boolean;
  signature: string | null;
  relayUrls: string[];
  relaySnapshots: DeveloperRelaySnapshot[];
  since: number | null;
  sinceIso: string | null;
  restoreThrottleMs: number;
  startedAt: string | null;
  lastEventSeenAt: string | null;
  lastEventId: string | null;
  lastEventCreatedAt: number | null;
  lastEventCreatedAtIso: string | null;
  lastEoseAt: string | null;
}

export interface DeveloperSessionSnapshot {
  loggedInPubkey: string | null;
  authMethod: AuthMethod | null;
  eventSince: number;
  eventSinceIso: string | null;
  filterSince: number;
  filterSinceIso: string | null;
  isRestoringStartupState: boolean;
  hasNip07Extension: boolean;
  appRelayUrls: string[];
  myRelayEntries: ContactRelay[];
  effectiveReadRelayUrls: string[];
  effectivePublishRelayUrls: string[];
  configuredRelayUrls: string[];
}

export interface DeveloperDiagnosticsSnapshot {
  session: DeveloperSessionSnapshot;
  privateMessagesSubscription: DeveloperPrivateMessagesSubscriptionSnapshot;
  relayRows: DeveloperRelayRow[];
  pendingReactions: DeveloperPendingReactionSnapshot[];
  pendingDeletions: DeveloperPendingDeletionSnapshot[];
}

export interface DeveloperPendingQueueRefreshSummary {
  initialTargetCount: number;
  initialEntryCount: number;
  remainingTargetCount: number;
  remainingEntryCount: number;
}

const STARTUP_STEP_DEFINITIONS = [
  { id: 'logged-in-profile', order: 1, label: 'Logged-in user profile/contact metadata' },
  { id: 'logged-in-relays', order: 2, label: 'Logged-in user relay list' },
  { id: 'my-relay-list', order: 3, label: 'My NIP-65 relay list' },
  { id: 'private-preferences', order: 4, label: 'Encrypted private preferences' },
  { id: 'private-contact-list', order: 5, label: 'Encrypted private contact list' },
  { id: 'private-contact-profiles', order: 6, label: 'Private contact profile metadata' },
  { id: 'private-contact-relays', order: 7, label: 'Private contact relay lists' },
  { id: 'contact-cursor-data', order: 8, label: 'Per-contact cursor data' },
  { id: 'private-message-events', order: 9, label: 'Private message events' },
  { id: 'recent-chat-profiles', order: 10, label: 'Recent chat contact profiles' },
  { id: 'recent-chat-relays', order: 11, label: 'Recent chat contact relay lists' }
] as const;

export type StartupStepId = (typeof STARTUP_STEP_DEFINITIONS)[number]['id'];
export type StartupStepStatus = 'pending' | 'in_progress' | 'success' | 'error';

export interface StartupStepSnapshot {
  id: StartupStepId;
  order: number;
  label: string;
  status: StartupStepStatus;
  startedAt: number | null;
  completedAt: number | null;
  durationMs: number | null;
  errorMessage: string | null;
}

export interface StartupDisplaySnapshot {
  stepId: StartupStepId | null;
  label: string | null;
  status: StartupStepStatus | null;
  showProgress: boolean;
}

interface ContactRefreshLifecycle {
  onProfileFetchStart?: () => void;
  onProfileFetchEnd?: (error: unknown | null) => void;
  onRelayFetchStart?: () => void;
  onRelayFetchEnd?: (error: unknown | null) => void;
}

const PRIVATE_KEY_STORAGE_KEY = 'nsec';
const PUBLIC_KEY_STORAGE_KEY = 'npub';
const AUTH_METHOD_STORAGE_KEY = 'auth-method';
const EVENT_SINCE_STORAGE_KEY = 'nostr-event-since';
const PRIVATE_PREFERENCES_STORAGE_KEY = 'privatePreferences';
const DEVELOPER_DIAGNOSTICS_STORAGE_KEY = 'developer-diagnostics-enabled';
const RELAY_STORAGE_KEYS = ['relays', 'nip65_relays'] as const;
const PRIVATE_CONTACT_LIST_D_TAG = 'xyz:contacts';
const PRIVATE_CONTACT_LIST_TITLE = 'Contacts';
const PRIVATE_PREFERENCES_KIND = 30078;
const PRIVATE_PREFERENCES_D_TAG = '1';
const CONTACT_CURSOR_VERSION = '0.1';
const CONTACT_CURSOR_PUBLISH_DELAY_MS = 5000;
const CONTACT_CURSOR_FETCH_BATCH_SIZE = 100;
const LAST_SEEN_RECEIVED_ACTIVITY_AT_META_KEY = 'last_seen_received_activity_at';
const PRIVATE_MESSAGES_STARTUP_RESTORE_THROTTLE_MS = 2000;
const DEFAULT_EVENT_SINCE_LOOKBACK_SECONDS = 90 * 24 * 60 * 60;
const EVENT_FILTER_LOOKBACK_SECONDS = 24 * 60 * 60;
const UNKNOWN_REPLY_MESSAGE_TEXT = 'Unkown message.';
const STARTUP_STEP_MIN_PROGRESS_MS = 500;

function createInitialStartupStepSnapshots(): StartupStepSnapshot[] {
  return STARTUP_STEP_DEFINITIONS.map((step) => ({
    ...step,
    status: 'pending',
    startedAt: null,
    completedAt: null,
    durationMs: null,
    errorMessage: null
  }));
}

function hasStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type MessageRow = Awaited<ReturnType<typeof chatDataService.listMessages>>[number];

export const useNostrStore = defineStore('nostrStore', () => {
  const ndk = new NDK();
  ndk.relayAuthDefaultPolicy = NDKRelayAuthPolicies.signIn({ ndk });
  const chatStore = useChatStore();
  const INITIAL_CONNECT_TIMEOUT_MS = 3000;
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
  const developerDiagnosticsEnabled = ref(readDeveloperDiagnosticsEnabled());
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
  let developerTraceCounter = 0;
  const configuredRelayUrls = new Set<string>();
  let connectPromise: Promise<void> | null = null;
  let hasActivatedPool = false;
  let hasRelayStatusListeners = false;
  const relayAuthFailureListenerUrls = new Set<string>();
  let restoreStartupStatePromise: Promise<void> | null = null;
  let restoreMyRelayListPromise: Promise<void> | null = null;
  let syncLoggedInContactProfilePromise: Promise<void> | null = null;
  let restorePrivateContactListPromise: Promise<void> | null = null;
  let restorePrivatePreferencesPromise: Promise<void> | null = null;
  let restoreContactCursorStatePromise: Promise<void> | null = null;
  let syncRecentChatContactsPromise: Promise<void> | null = null;
  const pendingIncomingReactions = new Map<string, PendingIncomingReaction[]>();
  const pendingIncomingDeletions = new Map<string, PendingIncomingDeletion[]>();
  const pendingContactCursorPublishTimers = new Map<string, ReturnType<typeof globalThis.setTimeout>>();
  const pendingContactCursorPublishStates = new Map<string, ContactCursorState>();
  let myRelayListSubscription: ReturnType<typeof ndk.subscribe> | null = null;
  let myRelayListSubscriptionSignature = '';
  let myRelayListApplyQueue = Promise.resolve();
  let privateContactListSubscription: ReturnType<typeof ndk.subscribe> | null = null;
  let privateContactListSubscriptionSignature = '';
  let privateContactListApplyQueue = Promise.resolve();
  let lastPrivateContactListCreatedAt = 0;
  let lastPrivateContactListEventId = '';
  let privateMessagesSubscription: ReturnType<typeof ndk.subscribe> | null = null;
  let privateMessagesSubscriptionSignature = '';
  let privateMessagesIngestQueue = Promise.resolve();
  let privateMessagesRestoreThrottleMs = 0;
  let privateMessagesUiRefreshQueue = Promise.resolve();
  let privateMessagesUiRefreshTimeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
  let shouldReloadChatsOnPrivateMessagesUiRefresh = false;
  let shouldReloadMessagesOnPrivateMessagesUiRefresh = false;
  let pendingEventSinceUpdate = 0;
  let startupDisplayTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  let startupDisplayToken = 0;
  let startupDisplayShownAt = 0;

  function clearStartupDisplayTimer(): void {
    if (startupDisplayTimer !== null) {
      globalThis.clearTimeout(startupDisplayTimer);
      startupDisplayTimer = null;
    }
  }

  function getStartupStepSnapshot(stepId: StartupStepId): StartupStepSnapshot {
    const step = startupSteps.value.find((entry) => entry.id === stepId);
    if (!step) {
      throw new Error(`Unknown startup step: ${stepId}`);
    }

    return step;
  }

  function showStartupStepProgress(stepId: StartupStepId): void {
    const step = getStartupStepSnapshot(stepId);
    startupDisplayToken += 1;
    startupDisplayShownAt = Date.now();
    clearStartupDisplayTimer();
    startupDisplay.value = {
      stepId,
      label: step.label,
      status: 'in_progress',
      showProgress: true
    };
  }

  function finalizeStartupStepDisplay(stepId: StartupStepId, status: 'success' | 'error'): void {
    const step = getStartupStepSnapshot(stepId);
    if (startupDisplay.value.stepId !== stepId) {
      return;
    }

    const displayToken = ++startupDisplayToken;
    const applyFinalState = () => {
      if (displayToken !== startupDisplayToken) {
        return;
      }

      startupDisplay.value = {
        stepId,
        label: step.label,
        status,
        showProgress: false
      };
      startupDisplayTimer = null;
    };

    const elapsedMs = startupDisplayShownAt > 0 ? Date.now() - startupDisplayShownAt : 0;
    const remainingProgressMs = Math.max(STARTUP_STEP_MIN_PROGRESS_MS - elapsedMs, 0);
    clearStartupDisplayTimer();

    if (remainingProgressMs > 0) {
      startupDisplayTimer = globalThis.setTimeout(applyFinalState, remainingProgressMs);
      return;
    }

    applyFinalState();
  }

  function beginStartupStep(stepId: StartupStepId): void {
    const step = getStartupStepSnapshot(stepId);
    if (step.status === 'in_progress') {
      return;
    }

    const now = Date.now();
    step.status = 'in_progress';
    step.startedAt = now;
    step.completedAt = null;
    step.durationMs = null;
    step.errorMessage = null;
    showStartupStepProgress(stepId);
  }

  function completeStartupStep(stepId: StartupStepId): void {
    const step = getStartupStepSnapshot(stepId);
    const now = Date.now();
    if (step.startedAt === null) {
      step.startedAt = now;
    }

    step.status = 'success';
    step.completedAt = now;
    step.durationMs = Math.max(0, now - step.startedAt);
    step.errorMessage = null;
    finalizeStartupStepDisplay(stepId, 'success');
  }

  function failStartupStep(stepId: StartupStepId, error: unknown): void {
    const step = getStartupStepSnapshot(stepId);
    const now = Date.now();
    if (step.startedAt === null) {
      step.startedAt = now;
    }

    step.status = 'error';
    step.completedAt = now;
    step.durationMs = Math.max(0, now - step.startedAt);
    step.errorMessage = error instanceof Error ? error.message : String(error);
    finalizeStartupStepDisplay(stepId, 'error');
  }

  function resetStartupStepTracking(): void {
    clearStartupDisplayTimer();
    startupDisplayToken += 1;
    startupDisplayShownAt = 0;
    startupSteps.value = createInitialStartupStepSnapshots();
    startupDisplay.value = {
      stepId: null,
      label: null,
      status: null,
      showProgress: false
    };
  }

  function createStartupBatchTracker(stepId: StartupStepId): {
    beginItem: () => void;
    finishItem: (error?: unknown) => void;
    seal: () => void;
  } {
    let started = false;
    let sealed = false;
    let inFlightCount = 0;

    const maybeComplete = () => {
      if (!sealed || inFlightCount > 0) {
        return;
      }

      const step = getStartupStepSnapshot(stepId);
      if (step.status === 'in_progress') {
        completeStartupStep(stepId);
      }
    };

    return {
      beginItem() {
        if (!started) {
          beginStartupStep(stepId);
          started = true;
        }
        inFlightCount += 1;
      },
      finishItem(error?: unknown) {
        if (!started) {
          beginStartupStep(stepId);
          started = true;
        }

        inFlightCount = Math.max(0, inFlightCount - 1);
        if (error) {
          failStartupStep(stepId, error);
          return;
        }

        maybeComplete();
      },
      seal() {
        sealed = true;
        if (!started) {
          beginStartupStep(stepId);
          completeStartupStep(stepId);
          return;
        }

        maybeComplete();
      }
    };
  }

  function normalizeThrottleMs(value: number | undefined): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      return 0;
    }

    return Math.floor(value);
  }

  function getDefaultEventSince(): number {
    return Math.max(0, Math.floor(Date.now() / 1000) - DEFAULT_EVENT_SINCE_LOOKBACK_SECONDS);
  }

  function readDeveloperDiagnosticsEnabled(): boolean {
    if (!hasStorage()) {
      return true;
    }

    return window.localStorage.getItem(DEVELOPER_DIAGNOSTICS_STORAGE_KEY) !== '0';
  }

  function setDeveloperDiagnosticsEnabled(enabled: boolean): void {
    developerDiagnosticsEnabled.value = enabled;

    if (hasStorage()) {
      window.localStorage.setItem(DEVELOPER_DIAGNOSTICS_STORAGE_KEY, enabled ? '1' : '0');
    }

    if (!enabled) {
      void clearDeveloperTraceEntries().catch((error) => {
        console.error('Failed to clear developer trace entries.', error);
      });
    }

    developerDiagnosticsVersion.value += 1;
  }

  function bumpDeveloperDiagnosticsVersion(): void {
    developerDiagnosticsVersion.value += 1;
  }

  function bumpDeveloperTraceVersion(): void {
    developerTraceVersion.value += 1;
  }

  function toOptionalIsoTimestampFromUnix(value: number | null | undefined): string | null {
    if (!Number.isInteger(value) || Number(value) <= 0) {
      return null;
    }

    return new Date(Number(value) * 1000).toISOString();
  }

  function serializeDeveloperTraceValue(value: unknown, depth = 0): unknown {
    if (depth > 4) {
      return '[max-depth]';
    }

    if (
      value === null ||
      value === undefined ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value ?? null;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack ?? null
      };
    }

    if (Array.isArray(value)) {
      return value.slice(0, 30).map((entry) => serializeDeveloperTraceValue(entry, depth + 1));
    }

    if (typeof value === 'object') {
      const result: Record<string, unknown> = {};

      for (const [key, entryValue] of Object.entries(value as Record<string, unknown>).slice(0, 50)) {
        result[key] = serializeDeveloperTraceValue(entryValue, depth + 1);
      }

      return result;
    }

    return String(value);
  }

  function normalizeDeveloperTraceDetails(details: Record<string, unknown>): Record<string, unknown> {
    const normalized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(details)) {
      normalized[key] = serializeDeveloperTraceValue(value);
    }

    return normalized;
  }

  function logDeveloperTrace(
    level: DeveloperTraceLevel,
    scope: string,
    phase: string,
    details: Record<string, unknown> = {}
  ): void {
    if (!developerDiagnosticsEnabled.value) {
      return;
    }

    developerTraceCounter += 1;
    const entry: DeveloperTraceEntry = {
      id: `${Date.now()}-${developerTraceCounter}`,
      timestamp: new Date().toISOString(),
      level,
      scope,
      phase,
      details: normalizeDeveloperTraceDetails(details)
    };

    void developerTraceDataService
      .appendEntry(entry)
      .then(() => {
        bumpDeveloperTraceVersion();
      })
      .catch((error) => {
        console.error('Failed to persist developer trace entry.', error);
      });
  }

  async function listDeveloperTraceEntries(): Promise<DeveloperTraceEntry[]> {
    return developerTraceDataService.listEntries();
  }

  async function clearDeveloperTraceEntries(): Promise<void> {
    await developerTraceDataService.clearEntries();
    bumpDeveloperTraceVersion();
  }

  function setStoredEventSince(value: number): number {
    const normalizedValue =
      Number.isInteger(value) && Number(value) > 0 ? Math.floor(Number(value)) : getDefaultEventSince();
    eventSince.value = normalizedValue;

    if (hasStorage()) {
      window.localStorage.setItem(EVENT_SINCE_STORAGE_KEY, String(normalizedValue));
    }

    return normalizedValue;
  }

  function ensureStoredEventSince(): number {
    if (eventSince.value > 0) {
      return eventSince.value;
    }

    if (hasStorage()) {
      const storedValue = Number.parseInt(
        window.localStorage.getItem(EVENT_SINCE_STORAGE_KEY) ?? '',
        10
      );
      if (Number.isInteger(storedValue) && storedValue > 0) {
        eventSince.value = storedValue;
        return storedValue;
      }
    }

    const defaultSince = getDefaultEventSince();
    eventSince.value = defaultSince;
    return defaultSince;
  }

  function getFilterSince(): number {
    return Math.max(0, ensureStoredEventSince() - EVENT_FILTER_LOOKBACK_SECONDS);
  }

  function updateStoredEventSinceFromCreatedAt(value: unknown): void {
    const createdAt = Number(value);
    if (!Number.isInteger(createdAt) || createdAt <= 0) {
      return;
    }

    if (createdAt <= ensureStoredEventSince()) {
      return;
    }

    if (isRestoringStartupState.value) {
      pendingEventSinceUpdate = Math.max(pendingEventSinceUpdate, createdAt);
      return;
    }

    setStoredEventSince(createdAt);
  }

  function flushPendingEventSinceUpdate(): void {
    const nextSince = Math.max(ensureStoredEventSince(), pendingEventSinceUpdate);
    pendingEventSinceUpdate = 0;
    setStoredEventSince(nextSince);
  }

  function resetEventSinceForFreshLogin(): void {
    eventSince.value = getDefaultEventSince();
    pendingEventSinceUpdate = 0;

    if (hasStorage()) {
      window.localStorage.removeItem(EVENT_SINCE_STORAGE_KEY);
    }
  }

  function toComparableTimestamp(value: string | null | undefined): number {
    if (typeof value !== 'string' || !value.trim()) {
      return 0;
    }

    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function normalizeTimestamp(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    return normalized || null;
  }

  function normalizePrivatePreferences(value: unknown): PrivatePreferences | null {
    if (!isPlainRecord(value)) {
      return null;
    }

    const normalizedContactSecret = inputSanitizerService.normalizeHexKey(value.contactSecret);
    if (!normalizedContactSecret) {
      return null;
    }

    return {
      ...value,
      contactSecret: normalizedContactSecret
    };
  }

  function readPrivatePreferencesFromStorage(): PrivatePreferences | null {
    if (!hasStorage()) {
      return null;
    }

    const stored = window.localStorage.getItem(PRIVATE_PREFERENCES_STORAGE_KEY)?.trim();
    if (!stored) {
      return null;
    }

    try {
      return normalizePrivatePreferences(JSON.parse(stored));
    } catch {
      return null;
    }
  }

  function writePrivatePreferencesToStorage(preferences: PrivatePreferences): void {
    if (!hasStorage()) {
      return;
    }

    window.localStorage.setItem(
      PRIVATE_PREFERENCES_STORAGE_KEY,
      JSON.stringify(preferences)
    );
  }

  function clearPrivatePreferencesStorage(): void {
    if (!hasStorage()) {
      return;
    }

    window.localStorage.removeItem(PRIVATE_PREFERENCES_STORAGE_KEY);
  }

  async function sha256Hex(value: string): Promise<string> {
    const digest = await globalThis.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(value)
    );
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  function buildFreshPrivatePreferences(existing: Record<string, unknown> = {}): PrivatePreferences {
    return {
      ...existing,
      contactSecret: NDKPrivateKeySigner.generate().privateKey
    };
  }

  function normalizeContactCursorContent(value: unknown): ContactCursorContent | null {
    if (!isPlainRecord(value)) {
      return null;
    }

    const version = typeof value.version === 'string' ? value.version.trim() : '';
    const lastSeenIncomingActivityAt = normalizeTimestamp(value.last_seen_incoming_activity_at);
    const lastSeenIncomingActivityEventId = normalizeEventId(
      value.last_seen_incoming_activity_event_id
    );

    if (!version || !lastSeenIncomingActivityAt) {
      return null;
    }

    return {
      version,
      last_seen_incoming_activity_at: lastSeenIncomingActivityAt,
      last_seen_incoming_activity_event_id: lastSeenIncomingActivityEventId
    };
  }

  async function encryptPrivatePreferencesContent(preferences: PrivatePreferences): Promise<string> {
    const user = await getLoggedInSignerUser();
    ndk.assertSigner();
    return ndk.signer.encrypt(user, JSON.stringify(preferences), 'nip44');
  }

  async function decryptPrivatePreferencesContent(content: string): Promise<PrivatePreferences | null> {
    const normalizedContent = content.trim();
    if (!normalizedContent) {
      return null;
    }

    const user = await getLoggedInSignerUser();
    ndk.assertSigner();
    const decryptedContent = await ndk.signer.decrypt(user, normalizedContent, 'nip44');

    try {
      return normalizePrivatePreferences(JSON.parse(decryptedContent));
    } catch {
      return null;
    }
  }

  async function encryptContactCursorContent(cursor: ContactCursorState): Promise<string> {
    const user = await getLoggedInSignerUser();
    ndk.assertSigner();
    return ndk.signer.encrypt(
      user,
      JSON.stringify({
        version: CONTACT_CURSOR_VERSION,
        last_seen_incoming_activity_at: cursor.at,
        last_seen_incoming_activity_event_id: cursor.eventId
      }),
      'nip44'
    );
  }

  async function decryptContactCursorContent(content: string): Promise<ContactCursorContent | null> {
    const normalizedContent = content.trim();
    if (!normalizedContent) {
      return null;
    }

    const user = await getLoggedInSignerUser();
    ndk.assertSigner();
    const decryptedContent = await ndk.signer.decrypt(user, normalizedContent, 'nip44');

    try {
      return normalizeContactCursorContent(JSON.parse(decryptedContent));
    } catch {
      return null;
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

  function createStoredDirectMessageRumorEvent(event: NostrEvent): NDKEvent | null {
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
      ...(event.id?.trim() ? { id: event.id.trim() } : {})
    });
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
    const uniqueRelayUrls = new Set<string>();
    for (const relayUrl of relayUrls) {
      const normalizedRelayUrl = normalizeRelayStatusUrl(relayUrl);
      if (normalizedRelayUrl) {
        uniqueRelayUrls.add(normalizedRelayUrl);
      }
    }

    return Array.from(uniqueRelayUrls);
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
    const selfRelayUrls = await resolveLoggedInPublishRelayUrls();
    if (options.localMessageId && rumorEventId) {
      try {
        await appendRelayStatusesToMessageEvent(
          options.localMessageId,
          [
            ...buildPendingOutboundRelayStatuses(relayUrls, 'recipient'),
            ...buildPendingOutboundRelayStatuses(selfRelayUrls, 'self')
          ],
          {
            event: recipientRumorNostrEvent ?? undefined,
            direction: 'out',
            eventId: rumorEventId
          }
        );
      } catch (error) {
        console.warn('Failed to persist encrypted event details before publish', error);
      }
    }

    const recipientGiftWrapEvent = await giftWrap(recipientRumorEvent, recipient, signer, {
      rumorKind
    });
    const recipientPublishResult = await publishEventWithRelayStatuses(
      recipientGiftWrapEvent,
      relayUrls,
      'recipient'
    );
    const combinedRelayStatuses = [...recipientPublishResult.relayStatuses];
    if (options.localMessageId) {
      await appendRelayStatusesToMessageEvent(
        options.localMessageId,
        recipientPublishResult.relayStatuses,
        {
          event: recipientRumorNostrEvent ?? undefined,
          direction: 'out',
          eventId: rumorEventId ?? undefined
        }
      );
    }
    if (recipientPublishResult.error) {
      throw recipientPublishResult.error;
    }

    if (selfRelayUrls.length > 0) {
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
      if (options.localMessageId) {
        await appendRelayStatusesToMessageEvent(
          options.localMessageId,
          selfPublishResult.relayStatuses,
          {
            event: recipientRumorNostrEvent ?? undefined,
            direction: 'out',
            eventId: rumorEventId ?? undefined
          }
        );
      }
      if (selfPublishResult.error) {
        console.warn('Failed to publish encrypted event self-copy', selfPublishResult.error);
      }
    }

    return {
      giftWrapEvent: await recipientGiftWrapEvent.toNostrEvent(),
      rumorEvent: recipientRumorNostrEvent,
      rumorEventId,
      relayStatuses: combinedRelayStatuses
    };
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

  function readProfileField(
    profile: NDKUserProfile | null,
    keys: string[],
    fallback = ''
  ): string | undefined {
    for (const key of keys) {
      const rawValue = profile?.[key];
      if (typeof rawValue !== 'string') {
        continue;
      }

      const normalized = rawValue.trim();
      if (normalized) {
        return normalized;
      }
    }

    const normalizedFallback = fallback.trim();
    return normalizedFallback || undefined;
  }

  function buildUpdatedContactMeta(
    existingMeta: ContactMetadata | undefined,
    profile: NDKUserProfile | null,
    resolvedNpub: string | null,
    resolvedNprofile: string | null
  ): ContactMetadata {
    const meta: ContactMetadata = {
      ...(existingMeta ?? {})
    };

    const nextName = readProfileField(profile, ['name'], meta.name ?? '');
    const nextAbout = readProfileField(profile, ['about', 'bio'], meta.about ?? '');
    const nextPicture = readProfileField(profile, ['picture', 'image'], meta.picture ?? '');
    const nextNip05 = readProfileField(profile, ['nip05'], meta.nip05 ?? '');
    const nextLud06 = readProfileField(profile, ['lud06'], meta.lud06 ?? '');
    const nextLud16 = readProfileField(profile, ['lud16'], meta.lud16 ?? '');
    const nextDisplayName = readProfileField(profile, ['displayName', 'display_name'], meta.display_name ?? '');
    const nextWebsite = readProfileField(profile, ['website'], meta.website ?? '');
    const nextBanner = readProfileField(profile, ['banner'], meta.banner ?? '');

    if (nextName) {
      meta.name = nextName;
    }

    if (nextAbout) {
      meta.about = nextAbout;
    }

    if (nextPicture) {
      meta.picture = nextPicture;
    }

    if (nextNip05) {
      meta.nip05 = nextNip05;
    }

    if (nextLud06) {
      meta.lud06 = nextLud06;
    }

    if (nextLud16) {
      meta.lud16 = nextLud16;
    }

    if (nextDisplayName) {
      meta.display_name = nextDisplayName;
    }

    if (nextWebsite) {
      meta.website = nextWebsite;
    }

    if (nextBanner) {
      meta.banner = nextBanner;
    }

    if (resolvedNpub?.trim()) {
      meta.npub = resolvedNpub.trim();
    }

    if (resolvedNprofile?.trim()) {
      meta.nprofile = resolvedNprofile.trim();
    }

    return meta;
  }

  function buildIdentifierFallbacks(
    pubkeyHex: string,
    existingMeta?: ContactMetadata
  ): string[] {
    const nip05Identifier = existingMeta?.nip05?.trim() ?? '';
    const nprofileIdentifier = existingMeta?.nprofile?.trim() || encodeNprofile(pubkeyHex) || '';
    const npubIdentifier = existingMeta?.npub?.trim() || encodeNpub(pubkeyHex) || '';
    const hexIdentifier = pubkeyHex;

    return [nip05Identifier, npubIdentifier, hexIdentifier, nprofileIdentifier]
      .map((identifier) => identifier.trim())
      .filter(
        (identifier, index, list) => identifier.length > 0 && list.indexOf(identifier) === index
      );
  }

  function relayEntriesFromRelayList(relayList: NDKRelayList | null | undefined): ContactRelay[] {
    if (!relayList) {
      return [];
    }

    return inputSanitizerService.normalizeRelayListMetadataEntries([
      ...Array.from(relayList.readRelayUrls ?? [], (relay) => ({
        url: String(relay),
        read: true,
        write: false
      })),
      ...Array.from(relayList.writeRelayUrls ?? [], (relay) => ({
        url: String(relay),
        read: false,
        write: true
      })),
      ...Array.from(relayList.bothRelayUrls ?? [], (relay) => ({
        url: String(relay),
        read: true,
        write: true
      }))
    ]);
  }

  async function fetchContactRelayEntries(pubkeyHex: string): Promise<ContactRelay[]> {
    const relayList = await getRelayListForUser(pubkeyHex, ndk);
    return relayEntriesFromRelayList(relayList);
  }

  function normalizeWritableRelayUrls(relays: ContactRelay[] | undefined): string[] {
    if (!Array.isArray(relays)) {
      return [];
    }

    const uniqueRelays = new Set<string>();
    for (const relay of relays) {
      if (!relay || relay.write === false) {
        continue;
      }

      const relayUrl = typeof relay.url === 'string' ? relay.url.trim() : '';
      if (!relayUrl) {
        continue;
      }

      try {
        uniqueRelays.add(normalizeRelayUrl(relayUrl));
      } catch {
        continue;
      }
    }

    return Array.from(uniqueRelays);
  }

  function getAppRelayUrls(): string[] {
    const relayStore = useRelayStore();
    relayStore.init();
    return normalizeRelayStatusUrls(relayStore.relays);
  }

  async function resolveLoggedInReadRelayUrls(seedRelayUrls: string[] = []): Promise<string[]> {
    const appRelayUrls = getAppRelayUrls();
    const relayUrls =
      appRelayUrls.length > 0 ? appRelayUrls : normalizeRelayStatusUrls(seedRelayUrls);
    const loggedInPubkeyHex = getLoggedInPublicKeyHex();
    if (!loggedInPubkeyHex) {
      return relayUrls;
    }

    await contactsService.init();
    const loggedInContact = await contactsService.getContactByPublicKey(loggedInPubkeyHex);

    return normalizeRelayStatusUrls([
      ...relayUrls,
      ...inputSanitizerService.normalizeReadableRelayUrls(loggedInContact?.relays)
    ]);
  }

  async function resolveLoggedInPublishRelayUrls(seedRelayUrls: string[] = []): Promise<string[]> {
    const relayUrls = inputSanitizerService.normalizeStringArray(seedRelayUrls);
    const loggedInPubkeyHex = getLoggedInPublicKeyHex();
    if (!loggedInPubkeyHex) {
      return relayUrls;
    }

    await contactsService.init();
    const loggedInContact = await contactsService.getContactByPublicKey(loggedInPubkeyHex);

    return inputSanitizerService.normalizeStringArray([
      ...relayUrls,
      ...normalizeWritableRelayUrls(loggedInContact?.relays)
    ]);
  }

  async function resolvePrivateContactListReadRelayUrls(seedRelayUrls: string[] = []): Promise<string[]> {
    return resolveLoggedInReadRelayUrls(seedRelayUrls);
  }

  async function resolvePrivateContactListPublishRelayUrls(seedRelayUrls: string[] = []): Promise<string[]> {
    return resolveLoggedInPublishRelayUrls(seedRelayUrls);
  }

  async function getLoggedInSignerUser(): Promise<NDKUser> {
    const signer = await getOrCreateSigner();
    const user = await signer.user();
    user.ndk = ndk;
    return user;
  }

  function buildPrivateContactListTags(pubkeys: string[]): string[][] {
    return pubkeys
      .map((pubkey) => inputSanitizerService.normalizeHexKey(pubkey))
      .filter((pubkey): pubkey is string => Boolean(pubkey))
      .filter((pubkey, index, list) => list.indexOf(pubkey) === index)
      .map((pubkey) => ['p', pubkey]);
  }

  function parsePrivateContactListPubkeys(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const pubkeys = value
      .map((entry) => {
        if (!Array.isArray(entry) || entry[0] !== 'p') {
          return null;
        }

        return inputSanitizerService.normalizeHexKey(String(entry[1] ?? ''));
      })
      .filter((pubkey): pubkey is string => Boolean(pubkey));

    return pubkeys.filter((pubkey, index, list) => list.indexOf(pubkey) === index);
  }

  async function encryptPrivateContactListTags(tags: string[][]): Promise<string> {
    const user = await getLoggedInSignerUser();
    ndk.assertSigner();

    return ndk.signer.encrypt(user, JSON.stringify(tags), 'nip44');
  }

  async function decryptPrivateContactListContent(content: string): Promise<string[]> {
    const normalizedContent = content.trim();
    if (!normalizedContent) {
      return [];
    }

    const user = await getLoggedInSignerUser();
    ndk.assertSigner();

    const decryptedContent = await ndk.signer.decrypt(user, normalizedContent, 'nip44');
    let parsed: unknown;

    try {
      parsed = JSON.parse(decryptedContent);
    } catch {
      return [];
    }

    return parsePrivateContactListPubkeys(parsed);
  }

  function shouldApplyPrivateContactListEvent(event: NDKEvent): boolean {
    const createdAt = Number(event.created_at ?? 0);
    if (createdAt > lastPrivateContactListCreatedAt) {
      return true;
    }

    if (createdAt < lastPrivateContactListCreatedAt) {
      return false;
    }

    const eventId = event.id?.trim() ?? '';
    if (!eventId) {
      return lastPrivateContactListEventId.length === 0;
    }

    return eventId !== lastPrivateContactListEventId;
  }

  function markPrivateContactListEventApplied(event: Pick<NDKEvent, 'created_at' | 'id'>): void {
    lastPrivateContactListCreatedAt = Number(event.created_at ?? 0);
    lastPrivateContactListEventId = event.id?.trim() ?? '';
  }

  function compareContactCursorState(
    first: ContactCursorState | ContactCursorContent | null | undefined,
    second: ContactCursorState | ContactCursorContent | null | undefined
  ): number {
    const firstTimestamp =
      first && 'last_seen_incoming_activity_at' in first
        ? first.last_seen_incoming_activity_at
        : first?.at;
    const secondTimestamp =
      second && 'last_seen_incoming_activity_at' in second
        ? second.last_seen_incoming_activity_at
        : second?.at;
    const byTimestamp =
      toComparableTimestamp(firstTimestamp) - toComparableTimestamp(secondTimestamp);
    if (byTimestamp !== 0) {
      return byTimestamp;
    }

    const firstEventId = normalizeEventId(
      first && 'last_seen_incoming_activity_event_id' in first
        ? first.last_seen_incoming_activity_event_id
        : first?.eventId
    ) ?? '';
    const secondEventId = normalizeEventId(
      second && 'last_seen_incoming_activity_event_id' in second
        ? second.last_seen_incoming_activity_event_id
        : second?.eventId
    ) ?? '';

    return firstEventId.localeCompare(secondEventId);
  }

  function buildChatMetaWithUnseenReactionCount(
    meta: Record<string, unknown>,
    unseenReactionCount: number
  ): Record<string, unknown> {
    const normalizedCount = Math.max(0, Math.floor(Number(unseenReactionCount) || 0));
    const nextMeta = { ...meta };

    if (normalizedCount > 0) {
      nextMeta.unseen_reaction_count = normalizedCount;
    } else {
      delete nextMeta.unseen_reaction_count;
    }

    return nextMeta;
  }

  async function publishPrivatePreferences(
    preferences: PrivatePreferences,
    seedRelayUrls: string[] = []
  ): Promise<void> {
    const loggedInPubkeyHex = getLoggedInPublicKeyHex();
    if (!loggedInPubkeyHex) {
      throw new Error('Missing public key in localStorage. Login is required.');
    }

    const relayUrls = await resolveLoggedInPublishRelayUrls(seedRelayUrls);
    if (relayUrls.length === 0) {
      throw new Error('Cannot publish private preferences without at least one relay.');
    }

    await ensureRelayConnections(relayUrls);
    const user = await getLoggedInSignerUser();

    const preferencesEvent = new NDKEvent(ndk, {
      kind: PRIVATE_PREFERENCES_KIND,
      created_at: Math.floor(Date.now() / 1000),
      pubkey: user.pubkey,
      content: await encryptPrivatePreferencesContent(preferences),
      tags: [['d', PRIVATE_PREFERENCES_D_TAG]]
    });

    const relaySet = NDKRelaySet.fromRelayUrls(relayUrls, ndk);
    await preferencesEvent.publishReplaceable(relaySet);
    updateStoredEventSinceFromCreatedAt(preferencesEvent.created_at);
  }

  async function restorePrivatePreferences(seedRelayUrls: string[] = []): Promise<void> {
    if (restorePrivatePreferencesPromise) {
      return restorePrivatePreferencesPromise;
    }

    beginStartupStep('private-preferences');
    restorePrivatePreferencesPromise = (async () => {
      try {
        const loggedInPubkeyHex = getLoggedInPublicKeyHex();
        if (!loggedInPubkeyHex) {
          completeStartupStep('private-preferences');
          return;
        }

        const relayUrls = await resolveLoggedInReadRelayUrls(seedRelayUrls);
        if (relayUrls.length === 0) {
          completeStartupStep('private-preferences');
          return;
        }

        await ensureRelayConnections(relayUrls);
        await getLoggedInSignerUser();

        const relaySet = NDKRelaySet.fromRelayUrls(relayUrls, ndk);
        const preferencesEvent = await ndk.fetchEvent(
          {
            kinds: [PRIVATE_PREFERENCES_KIND],
            authors: [loggedInPubkeyHex],
            '#d': [PRIVATE_PREFERENCES_D_TAG]
          },
          {
            cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY
          },
          relaySet
        );
        if (!preferencesEvent) {
          completeStartupStep('private-preferences');
          return;
        }

        updateStoredEventSinceFromCreatedAt(preferencesEvent.created_at);
        let decryptedPreferences: PrivatePreferences | null = null;
        try {
          decryptedPreferences = await decryptPrivatePreferencesContent(preferencesEvent.content);
        } catch (error) {
          console.warn('Failed to decrypt private preferences event', error);
          failStartupStep('private-preferences', error);
          return;
        }
        if (!decryptedPreferences) {
          completeStartupStep('private-preferences');
          return;
        }

        writePrivatePreferencesToStorage(decryptedPreferences);
        completeStartupStep('private-preferences');
      } catch (error) {
        failStartupStep('private-preferences', error);
        throw error;
      }
    })().finally(() => {
      restorePrivatePreferencesPromise = null;
    });

    return restorePrivatePreferencesPromise;
  }

  async function fetchContactCursorEvents(
    contacts: ContactRecord[],
    seedRelayUrls: string[] = []
  ): Promise<Map<string, ContactCursorContent>> {
    const contactDTagEntries = await Promise.all(
      contacts.map(async (contact) => {
        const dTag = await deriveContactCursorDTag(contact.public_key);
        return dTag ? ([dTag, contact.public_key] as const) : null;
      })
    );

    const normalizedContactDTags = contactDTagEntries
      .filter((entry): entry is readonly [string, string] => Boolean(entry))
      .map(([dTag]) => dTag);
    if (normalizedContactDTags.length === 0) {
      return new Map<string, ContactCursorContent>();
    }

    const loggedInPubkeyHex = getLoggedInPublicKeyHex();
    if (!loggedInPubkeyHex) {
      return new Map<string, ContactCursorContent>();
    }

    const relayUrls = await resolveLoggedInReadRelayUrls(seedRelayUrls);
    if (relayUrls.length === 0) {
      return new Map<string, ContactCursorContent>();
    }

    await ensureRelayConnections(relayUrls);
    await getLoggedInSignerUser();

    const relaySet = NDKRelaySet.fromRelayUrls(relayUrls, ndk);
    const eventsByDTag = new Map<string, ContactCursorContent>();

    for (const dTagBatch of chunkValues(normalizedContactDTags, CONTACT_CURSOR_FETCH_BATCH_SIZE)) {
      const events = await ndk.fetchEvents(
        {
          kinds: [PRIVATE_PREFERENCES_KIND],
          authors: [loggedInPubkeyHex],
          '#d': dTagBatch
        },
        {
          cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY
        },
        relaySet
      );

      for (const event of events) {
        updateStoredEventSinceFromCreatedAt(event.created_at);
        const eventDTag = event.getMatchingTags('d')[0]?.[1]?.trim();
        if (!eventDTag) {
          continue;
        }

        let cursorContent: ContactCursorContent | null = null;
        try {
          cursorContent = await decryptContactCursorContent(event.content);
        } catch (error) {
          console.warn('Failed to decrypt contact cursor event', eventDTag, error);
          continue;
        }
        if (!cursorContent) {
          continue;
        }

        const existingCursor = eventsByDTag.get(eventDTag);
        if (existingCursor && compareContactCursorState(existingCursor, cursorContent) >= 0) {
          continue;
        }

        eventsByDTag.set(eventDTag, cursorContent);
      }
    }

    return eventsByDTag;
  }

  async function applyContactCursorStateToContact(
    contact: ContactRecord,
    cursor: ContactCursorContent
  ): Promise<boolean> {
    const normalizedContactPubkey = inputSanitizerService.normalizeHexKey(contact.public_key);
    const loggedInPubkeyHex = getLoggedInPublicKeyHex();
    if (!normalizedContactPubkey || !loggedInPubkeyHex) {
      return false;
    }

    let didChange = false;
    const nextContactMeta: ContactMetadata = {
      ...(contact.meta ?? {}),
      last_seen_incoming_activity_at: cursor.last_seen_incoming_activity_at
    };
    if (cursor.last_seen_incoming_activity_event_id) {
      nextContactMeta.last_seen_incoming_activity_event_id =
        cursor.last_seen_incoming_activity_event_id;
    } else {
      delete nextContactMeta.last_seen_incoming_activity_event_id;
    }

    if (
      contact.meta.last_seen_incoming_activity_at !== nextContactMeta.last_seen_incoming_activity_at ||
      (contact.meta.last_seen_incoming_activity_event_id ?? null) !==
        (nextContactMeta.last_seen_incoming_activity_event_id ?? null)
    ) {
      await contactsService.updateContact(contact.id, {
        meta: nextContactMeta
      });
      didChange = true;
    }

    const chatRow = await chatDataService.getChatByPublicKey(normalizedContactPubkey);
    if (!chatRow) {
      return didChange;
    }

    const messageRows = await chatDataService.listMessages(normalizedContactPubkey);
    const cursorTimestamp = toComparableTimestamp(cursor.last_seen_incoming_activity_at);
    const nextUnreadMessageCount = messageRows.reduce((count, messageRow) => {
      if (
        inputSanitizerService.normalizeHexKey(messageRow.author_public_key) === loggedInPubkeyHex
      ) {
        return count;
      }

      return count + (toComparableTimestamp(messageRow.created_at) > cursorTimestamp ? 1 : 0);
    }, 0);

    let nextUnseenReactionCount = 0;
    for (const messageRow of messageRows) {
      if (
        inputSanitizerService.normalizeHexKey(messageRow.author_public_key) !== loggedInPubkeyHex
      ) {
        continue;
      }

      const currentReactions = normalizeMessageReactions(messageRow.meta.reactions);
      const nextReactions = currentReactions.map((reaction) => {
        const normalizedReactionAt = normalizeTimestamp(reaction.createdAt);
        if (
          !normalizedReactionAt ||
          inputSanitizerService.normalizeHexKey(reaction.reactorPublicKey) === loggedInPubkeyHex
        ) {
          return reaction;
        }

        if (toComparableTimestamp(normalizedReactionAt) <= cursorTimestamp) {
          if (reaction.viewedByAuthorAt) {
            return reaction;
          }

          return {
            ...reaction,
            viewedByAuthorAt: cursor.last_seen_incoming_activity_at
          };
        }

        if (!reaction.viewedByAuthorAt) {
          return reaction;
        }

        const { viewedByAuthorAt: _viewedByAuthorAt, ...reactionWithoutViewedAt } = reaction;
        return reactionWithoutViewedAt;
      });

      nextUnseenReactionCount += countUnseenReactionsForAuthor(nextReactions, loggedInPubkeyHex);

      const didChangeReactions =
        currentReactions.length !== nextReactions.length ||
        currentReactions.some((reaction, index) => {
          const nextReaction = nextReactions[index];
          return nextReaction ? !areMessageReactionsEqual(reaction, nextReaction) : true;
        });
      if (!didChangeReactions) {
        continue;
      }

      await chatDataService.updateMessageMeta(
        messageRow.id,
        buildMetaWithReactions(messageRow.meta, nextReactions)
      );
      didChange = true;
    }

    const nextChatMeta = buildChatMetaWithUnseenReactionCount(
      {
        ...chatRow.meta,
        [LAST_SEEN_RECEIVED_ACTIVITY_AT_META_KEY]: cursor.last_seen_incoming_activity_at
      },
      nextUnseenReactionCount
    );

    if (
      JSON.stringify(chatRow.meta) !== JSON.stringify(nextChatMeta)
    ) {
      await chatDataService.updateChatMeta(normalizedContactPubkey, nextChatMeta);
      didChange = true;
    }

    if (Number(chatRow.unread_count ?? 0) !== nextUnreadMessageCount) {
      await chatDataService.updateChatUnreadCount(normalizedContactPubkey, nextUnreadMessageCount);
      didChange = true;
    }

    return didChange;
  }

  async function restoreContactCursorState(seedRelayUrls: string[] = []): Promise<void> {
    if (restoreContactCursorStatePromise) {
      return restoreContactCursorStatePromise;
    }

    beginStartupStep('contact-cursor-data');
    restoreContactCursorStatePromise = (async () => {
      try {
        if (!readPrivatePreferencesFromStorage()) {
          const privatePreferencesStep = getStartupStepSnapshot('private-preferences');
          if (privatePreferencesStep.status === 'pending') {
            await restorePrivatePreferences(seedRelayUrls);
          }
        }

        if (!readPrivatePreferencesFromStorage()) {
          completeStartupStep('contact-cursor-data');
          return;
        }

        await contactsService.init();
        const contacts = await contactsService.listContacts();
        if (contacts.length === 0) {
          completeStartupStep('contact-cursor-data');
          return;
        }

        const cursorsByDTag = await fetchContactCursorEvents(contacts, seedRelayUrls);
        if (cursorsByDTag.size === 0) {
          completeStartupStep('contact-cursor-data');
          return;
        }

        let didApplyCursorState = false;
        for (const contact of contacts) {
          const contactDTag = await deriveContactCursorDTag(contact.public_key);
          if (!contactDTag) {
            continue;
          }

          const cursor = cursorsByDTag.get(contactDTag);
          if (!cursor) {
            continue;
          }

          didApplyCursorState =
            (await applyContactCursorStateToContact(contact, cursor)) || didApplyCursorState;
        }

        if (!didApplyCursorState) {
          completeStartupStep('contact-cursor-data');
          return;
        }

        await Promise.all([
          chatStore.reload(),
          import('src/stores/messageStore').then(({ useMessageStore }) =>
            useMessageStore().reloadLoadedMessages()
          )
        ]);
        completeStartupStep('contact-cursor-data');
      } catch (error) {
        failStartupStep('contact-cursor-data', error);
        throw error;
      }
    })().finally(() => {
      restoreContactCursorStatePromise = null;
    });

    return restoreContactCursorStatePromise;
  }

  async function publishContactCursor(
    contactPublicKey: string,
    cursor: ContactCursorState,
    seedRelayUrls: string[] = []
  ): Promise<void> {
    const normalizedContactPublicKey = inputSanitizerService.normalizeHexKey(contactPublicKey);
    if (!normalizedContactPublicKey || !normalizeTimestamp(cursor.at)) {
      return;
    }

    const preferences = await ensurePrivatePreferences({
      publishIfCreated: true
    });
    const dTag = await sha256Hex(`${preferences.contactSecret}${normalizedContactPublicKey}`);
    const relayUrls = await resolveLoggedInPublishRelayUrls(seedRelayUrls);
    if (relayUrls.length === 0) {
      throw new Error('Cannot publish contact cursor without at least one relay.');
    }

    await ensureRelayConnections(relayUrls);
    const user = await getLoggedInSignerUser();

    const cursorEvent = new NDKEvent(ndk, {
      kind: PRIVATE_PREFERENCES_KIND,
      created_at: Math.floor(Date.now() / 1000),
      pubkey: user.pubkey,
      content: await encryptContactCursorContent(cursor),
      tags: [['d', dTag]]
    });

    const relaySet = NDKRelaySet.fromRelayUrls(relayUrls, ndk);
    await cursorEvent.publishReplaceable(relaySet);
    updateStoredEventSinceFromCreatedAt(cursorEvent.created_at);
  }

  function scheduleContactCursorPublish(
    contactPublicKey: string,
    cursor: ContactCursorState
  ): void {
    const normalizedContactPublicKey = inputSanitizerService.normalizeHexKey(contactPublicKey);
    const normalizedCursorAt = normalizeTimestamp(cursor.at);
    if (!normalizedContactPublicKey || !normalizedCursorAt) {
      return;
    }

    const nextCursorState: ContactCursorState = {
      at: normalizedCursorAt,
      eventId: normalizeEventId(cursor.eventId)
    };
    const pendingCursor = pendingContactCursorPublishStates.get(normalizedContactPublicKey);
    if (pendingCursor && compareContactCursorState(pendingCursor, nextCursorState) >= 0) {
      return;
    }

    pendingContactCursorPublishStates.set(normalizedContactPublicKey, nextCursorState);

    const existingTimer = pendingContactCursorPublishTimers.get(normalizedContactPublicKey);
    if (existingTimer) {
      globalThis.clearTimeout(existingTimer);
    }

    const nextTimer = globalThis.setTimeout(() => {
      pendingContactCursorPublishTimers.delete(normalizedContactPublicKey);
      const cursorToPublish = pendingContactCursorPublishStates.get(normalizedContactPublicKey);
      pendingContactCursorPublishStates.delete(normalizedContactPublicKey);
      if (!cursorToPublish) {
        return;
      }

      void publishContactCursor(normalizedContactPublicKey, cursorToPublish).catch((error) => {
        console.error('Failed to publish contact cursor event', normalizedContactPublicKey, error);
      });
    }, CONTACT_CURSOR_PUBLISH_DELAY_MS);

    pendingContactCursorPublishTimers.set(normalizedContactPublicKey, nextTimer);
  }

  async function applyPrivateContactListPubkeys(pubkeys: string[]): Promise<void> {
    const loggedInPubkeyHex = getLoggedInPublicKeyHex();
    await contactsService.init();
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
      if (!existingContact) {
        await contactsService.createContact({
          public_key: pubkeyHex,
          name: pubkeyHex.slice(0, 16),
          given_name: null,
          meta: {},
          relays: []
        });
      }

      const fallbackName = existingContact?.name?.trim() || pubkeyHex.slice(0, 16);
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
    }

    profileTracker?.seal();
    relayTracker?.seal();

    bumpContactListVersion();
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

  async function resolveUserByIdentifiers(
    identifiers: string[],
    expectedPubkeyHex: string
  ): Promise<NDKUser | undefined> {
    for (const identifier of identifiers) {
      try {
        const user = await ndk.fetchUser(identifier, true);
        if (!user) {
          continue;
        }

        const resolvedPubkey = inputSanitizerService.normalizeHexKey(user.pubkey);
        if (!resolvedPubkey || resolvedPubkey !== expectedPubkeyHex) {
          continue;
        }

        return user;
      } catch {
        continue;
      }
    }

    return undefined;
  }

  async function refreshContactByPublicKey(
    targetPubkeyHex: string,
    fallbackName = '',
    lifecycle: ContactRefreshLifecycle = {}
  ): Promise<void> {
    const normalizedTargetPubkey = inputSanitizerService.normalizeHexKey(targetPubkeyHex);
    if (!normalizedTargetPubkey) {
      return;
    }

    await contactsService.init();
    const existingContact = await contactsService.getContactByPublicKey(normalizedTargetPubkey);
    const identifiers = buildIdentifierFallbacks(normalizedTargetPubkey, existingContact?.meta);
    const resolvedUser = await resolveUserByIdentifiers(identifiers, normalizedTargetPubkey);
    if (!resolvedUser) {
      return;
    }

    let fetchedProfile: NDKUserProfile | null = null;
    let profileError: unknown | null = null;
    lifecycle.onProfileFetchStart?.();
    try {
      fetchedProfile = await resolvedUser.fetchProfile();
    } catch (error) {
      profileError = error;
      console.warn('Failed to fetch profile metadata for contact', normalizedTargetPubkey, error);
    } finally {
      lifecycle.onProfileFetchEnd?.(profileError);
    }

    let resolvedNpub = existingContact?.meta.npub?.trim() ?? '';
    if (!resolvedNpub) {
      try {
        resolvedNpub = resolvedUser.npub;
      } catch {
        resolvedNpub = '';
      }
    }

    let resolvedNprofile = existingContact?.meta.nprofile?.trim() ?? '';
    if (!resolvedNprofile) {
      try {
        resolvedNprofile = resolvedUser.nprofile;
      } catch {
        resolvedNprofile = '';
      }
    }

    const nextMeta = buildUpdatedContactMeta(
      existingContact?.meta,
      fetchedProfile,
      resolvedNpub,
      resolvedNprofile
    );

    const fallbackContactName = fallbackName.trim() || normalizedTargetPubkey.slice(0, 16);
    const nextName =
      nextMeta.display_name?.trim() ||
      nextMeta.name?.trim() ||
      existingContact?.name?.trim() ||
      fallbackContactName;

    let explicitRelayEntries: ContactRelay[] = [];
    let relayError: unknown | null = null;
    lifecycle.onRelayFetchStart?.();
    try {
      explicitRelayEntries = await fetchContactRelayEntries(normalizedTargetPubkey);
    } catch (error) {
      relayError = error;
      console.warn('Failed to fetch relay list for contact', normalizedTargetPubkey, error);
    } finally {
      lifecycle.onRelayFetchEnd?.(relayError);
    }
    const fallbackRelayEntries = inputSanitizerService.normalizeRelayEntriesFromUrls(
      resolvedUser.relayUrls ?? []
    );
    const nextRelays =
      explicitRelayEntries.length > 0
        ? explicitRelayEntries
        : fallbackRelayEntries.length > 0
          ? fallbackRelayEntries
          : existingContact?.relays ?? [];

    const chatStore = useChatStore();
    if (existingContact) {
      await contactsService.updateContact(existingContact.id, {
        name: nextName,
        meta: nextMeta,
        relays: nextRelays
      });
      await chatStore.syncContactProfile(normalizedTargetPubkey);
      return;
    }

    await contactsService.createContact({
      public_key: normalizedTargetPubkey,
      name: nextName,
      given_name: null,
      meta: nextMeta,
      relays: nextRelays
    });
    await chatStore.syncContactProfile(normalizedTargetPubkey);
  }

  async function ensureRespondedPubkeyIsContact(
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

    await contactsService.init();
    const existingContact = await contactsService.getContactByPublicKey(normalizedTargetPubkey);
    if (existingContact) {
      return;
    }

    const initialName = fallbackName.trim() || normalizedTargetPubkey.slice(0, 16);
    const createdContact = await contactsService.createContact({
      public_key: normalizedTargetPubkey,
      name: initialName,
      given_name: null,
      meta: {},
      relays: []
    });
    if (!createdContact) {
      return;
    }

    await useChatStore().syncContactProfile(normalizedTargetPubkey);

    try {
      await refreshContactByPublicKey(normalizedTargetPubkey, initialName);
    } catch (error) {
      console.warn('Failed to refresh responded contact profile', normalizedTargetPubkey, error);
    }

    bumpContactListVersion();

    try {
      await publishPrivateContactList(getAppRelayUrls());
    } catch (error) {
      console.warn('Failed to publish private contact list after adding responded contact', normalizedTargetPubkey, error);
    }
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

  function ensureRelayStatusListeners(): void {
    if (hasRelayStatusListeners) {
      return;
    }

    ndk.pool.on('relay:connecting', (relay) => {
      bumpRelayStatusVersion();
      logRelayLifecycle('connecting', relay);
    });
    ndk.pool.on('relay:connect', (relay) => {
      bumpRelayStatusVersion();
      logRelayLifecycle('connect', relay);
    });
    ndk.pool.on('relay:ready', (relay) => {
      bumpRelayStatusVersion();
      logRelayLifecycle('ready', relay);
    });
    ndk.pool.on('relay:disconnect', (relay) => {
      bumpRelayStatusVersion();
      logRelayLifecycle('disconnect', relay);
    });
    ndk.pool.on('relay:auth', (relay, challenge) => {
      bumpRelayStatusVersion();
      logDeveloperTrace('info', 'relay', 'auth-requested', {
        ...buildRelaySnapshot(relay),
        challengeLength: challenge.length
      });
    });
    ndk.pool.on('relay:authed', (relay) => {
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
        ensureRelayAuthFailureListener(existingRelay);
        if (existingRelay && !existingRelay.connected) {
          logDeveloperTrace('info', 'relay-connect', 'reconnecting configured relay', {
            reason: 'ensureRelayConnections',
            ...buildRelaySnapshot(existingRelay)
          });
          relaysToReconnect.set(
            normalizedRelayUrl,
            existingRelay.connect(INITIAL_CONNECT_TIMEOUT_MS).catch((error) => {
              console.warn('Failed to reconnect relay', normalizedRelayUrl, {
                error,
                relay: buildRelaySnapshot(existingRelay)
              });
            })
          );
        }
        continue;
      }

      ndk.addExplicitRelay(normalizedRelayUrl, undefined, true);
      configuredRelayUrls.add(normalizedRelayUrl);
      const addedRelay = ndk.pool.getRelay(normalizedRelayUrl, false);
      ensureRelayAuthFailureListener(addedRelay);
      if (addedRelay && !addedRelay.connected) {
        logDeveloperTrace('info', 'relay-connect', 'connecting new explicit relay', {
          reason: 'ensureRelayConnections',
          ...buildRelaySnapshot(addedRelay)
        });
        relaysToReconnect.set(
          normalizedRelayUrl,
          addedRelay.connect(INITIAL_CONNECT_TIMEOUT_MS).catch((error) => {
            console.warn('Failed to connect relay', normalizedRelayUrl, {
              error,
              relay: buildRelaySnapshot(addedRelay)
            });
          })
        );
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
      return;
    }

    await contactsService.updateContact(existingContact.id, {
      relays: normalizedRelayEntries
    });
    await subscribePrivateMessagesForLoggedInUser(true);
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
      since: getFilterSince(),
      ...buildSubscriptionRelayDetails(relayUrls),
      relaySnapshots: getRelaySnapshots(relayUrls)
    });

    const relaySet = NDKRelaySet.fromRelayUrls(relayUrls, ndk);
    myRelayListSubscription = ndk.subscribe(
      {
        kinds: [NDKKind.RelayList],
        authors: [loggedInPubkeyHex],
        since: getFilterSince()
      },
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
      since: getFilterSince(),
      ...buildSubscriptionRelayDetails(relayUrls)
    });

    const relaySet = NDKRelaySet.fromRelayUrls(relayUrls, ndk);
    privateContactListSubscription = ndk.subscribe(
      {
        kinds: [NDKKind.FollowSet],
        authors: [loggedInPubkeyHex],
        '#d': [PRIVATE_CONTACT_LIST_D_TAG],
        since: getFilterSince()
      },
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
      }
    );
    privateContactListSubscriptionSignature = signature;

    logSubscription('private-contact-list', 'active', {
      signature,
      pubkey: formatSubscriptionLogValue(loggedInPubkeyHex),
      ...buildSubscriptionRelayDetails(relayUrls)
    });
  }

  function stopPrivateMessagesSubscription(reason = 'replace'): void {
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
    loggedInPubkeyHex: string
  ): void {
    const uiThrottleMs = privateMessagesRestoreThrottleMs;

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

    let rumorEvent: NDKEvent;
    try {
      rumorEvent = await giftUnwrap(wrappedEvent);
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
    if (!isSelfSentMessage && !recipients.includes(loggedInPubkeyHex)) {
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

    const chatPubkey = isSelfSentMessage
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

    const contact = await contactsService.getContactByPublicKey(chatPubkey);
    const existingChat = await chatDataService.getChatByPublicKey(chatPubkey);
    const createdChat =
      existingChat
        ? null
        : await chatDataService.createChat({
            public_key: chatPubkey,
            name: deriveChatName(contact, chatPubkey),
            last_message: '',
            last_message_at: toIsoTimestampFromUnix(rumorEvent.created_at),
            unread_count: 0,
            meta: {
              ...(contact?.meta.picture ? { picture: contact.meta.picture } : {})
            }
          });
    const chat =
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

    const createdAt = toIsoTimestampFromUnix(rumorEvent.created_at);
    const isBlockedChat = chat.meta?.inbox_state === 'blocked';
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

    const nextUnreadCount = isSelfSentMessage
      ? Number(chat.unread_count ?? 0)
      : isBlockedChat
        ? 0
      : chatStore.visibleChatId === chat.public_key
        ? 0
        : Number(chat.unread_count ?? 0) + 1;

    await chatDataService.updateChatPreview(
      chat.public_key,
      messageText,
      createdAt,
      nextUnreadCount
    );

    logInboundEvent('message-persisted', {
      persistence: 'created',
      direction,
      messageId: nextMessageRow.id,
      chatId: chat.id,
      unreadCount: nextUnreadCount,
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
    if (options.startupTrackStep === true) {
      beginStartupStep('private-message-events');
    }

    const loggedInPubkeyHex = getLoggedInPublicKeyHex();
    const authMethod = getStoredAuthMethod();

    if (!loggedInPubkeyHex || !authMethod) {
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
      await contactsService.init();
      const relayUrls = await resolveLoggedInReadRelayUrls();
      if (relayUrls.length === 0) {
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
      const signature = `${loggedInPubkeyHex}:${relaySignature(relayUrls)}`;
      const filterSince =
        Number.isInteger(options.sinceOverride) && Number(options.sinceOverride) >= 0
          ? Math.floor(Number(options.sinceOverride))
          : getFilterSince();
      if (!force && privateMessagesSubscription && privateMessagesSubscriptionSignature === signature) {
        logSubscription('private-messages', 'skip', {
          reason: 'already-active',
          signature,
          pubkey: formatSubscriptionLogValue(loggedInPubkeyHex),
          authMethod,
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
        ...buildFilterSinceDetails(filterSince),
        restoreThrottleMs: privateMessagesRestoreThrottleMs,
        relaySnapshots,
        ...buildSubscriptionRelayDetails(relayUrls)
      });

      privateMessagesSubscriptionRelayUrls.value = [...relayUrls];
      privateMessagesSubscriptionSince.value = filterSince;
      privateMessagesSubscriptionStartedAt.value = new Date().toISOString();
      privateMessagesSubscriptionLastEoseAt.value = null;
      bumpDeveloperDiagnosticsVersion();

      const relaySet = NDKRelaySet.fromRelayUrls(relayUrls, ndk);
      privateMessagesSubscription = ndk.subscribe(
        {
          kinds: [NDKKind.GiftWrap],
          '#p': [loggedInPubkeyHex],
          since: filterSince
        },
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
            if (shouldTrackStartupStep) {
              completeStartupStep('private-message-events');
            }
          }
        }
      );
      privateMessagesSubscriptionSignature = signature;

      logSubscription('private-messages', 'active', {
        signature,
        pubkey: formatSubscriptionLogValue(loggedInPubkeyHex),
        authMethod,
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
    resetStartupStepTracking();
    pendingIncomingReactions.clear();
    pendingIncomingDeletions.clear();
    pendingContactCursorPublishStates.clear();
    pendingContactCursorPublishTimers.forEach((timerId) => {
      globalThis.clearTimeout(timerId);
    });
    pendingContactCursorPublishTimers.clear();
    lastPrivateContactListCreatedAt = 0;
    lastPrivateContactListEventId = '';
    privateMessagesSubscriptionStartedAt.value = null;
    privateMessagesSubscriptionLastEventSeenAt.value = null;
    privateMessagesSubscriptionLastEventId.value = null;
    privateMessagesSubscriptionLastEventCreatedAt.value = null;
    privateMessagesSubscriptionLastEoseAt.value = null;
    void clearDeveloperTraceEntries().catch((error) => {
      console.error('Failed to clear developer trace entries.', error);
    });
    stopMyRelayListSubscription();
    stopPrivateContactListSubscription();
    stopPrivateMessagesSubscription();
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
    pendingEventSinceUpdate = 0;
    isRestoringStartupState.value = false;
    restoreStartupStatePromise = null;
    restoreMyRelayListPromise = null;
    syncLoggedInContactProfilePromise = null;
    restorePrivateContactListPromise = null;
    restorePrivatePreferencesPromise = null;
    restoreContactCursorStatePromise = null;
    syncRecentChatContactsPromise = null;
    myRelayListApplyQueue = Promise.resolve();
    privateContactListApplyQueue = Promise.resolve();
    privateMessagesIngestQueue = Promise.resolve();
    privateMessagesUiRefreshQueue = Promise.resolve();
    configuredRelayUrls.clear();
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

  function validateNsec(input: string): NostrNsecValidationResult {
    return inputSanitizerService.validateNsec(input);
  }

  function validatePrivateKey(input: string): NostrPrivateKeyValidationResult {
    return inputSanitizerService.validatePrivateKey(input);
  }

  function savePrivateKeyFromNsec(input: string): NostrNsecValidationResult {
    const validation = validateNsec(input);
    if (!validation.isValid || !validation.hexPrivateKey) {
      return validation;
    }

    savePrivateKeyHex(validation.hexPrivateKey);
    return validation;
  }

  function savePrivateKey(input: string): NostrPrivateKeyValidationResult {
    const validation = validatePrivateKey(input);
    if (!validation.isValid || !validation.hexPrivateKey) {
      return validation;
    }

    savePrivateKeyHex(validation.hexPrivateKey);
    return validation;
  }

  function validateNpub(input: string): NostrNpubValidationResult {
    return inputSanitizerService.validateNpub(input);
  }

  async function getNip05Data(identifier: string): Promise<NostrNip05DataResult> {
    const value = identifier.trim();
    if (!value || !isValidNip05(value)) {
      return {
        isValid: false,
        normalizedPubkey: null,
        name: null,
        relays: [],
        error: 'invalid'
      };
    }

    try {
      const user = await NDKUser.fromNip05(value, ndk, true);
      const normalizedPubkey = user?.pubkey?.toLowerCase() ?? null;

      if (!normalizedPubkey || !isValidPubkey(normalizedPubkey)) {
        return {
          isValid: false,
          normalizedPubkey: null,
          name: null,
          relays: [],
          error: 'nip05_unresolved'
        };
      }

      const relays = inputSanitizerService.normalizeStringArray(user?.relayUrls ?? []);

      return {
        isValid: true,
        normalizedPubkey,
        name: user?.profile?.name?.trim() || inputSanitizerService.extractNip05Name(value),
        relays,
        error: null
      };
    } catch {
      return {
        isValid: false,
        normalizedPubkey: null,
        name: null,
        relays: [],
        error: 'nip05_unresolved'
      };
    }
  }

  async function resolveIdentifier(input: string): Promise<NostrIdentifierResolutionResult> {
    const value = input.trim();
    if (!value) {
      return {
        isValid: false,
        normalizedPubkey: null,
        resolvedName: null,
        relays: [],
        identifierType: null,
        error: 'invalid'
      };
    }

    if (value.includes('@')) {
      const nip05Data = await getNip05Data(value);
      return {
        isValid: nip05Data.isValid,
        normalizedPubkey: nip05Data.normalizedPubkey,
        resolvedName: nip05Data.name,
        relays: nip05Data.relays,
        identifierType: 'nip05',
        error: nip05Data.error
      };
    }

    if (isValidPubkey(value)) {
      return {
        isValid: true,
        normalizedPubkey: value.toLowerCase(),
        resolvedName: null,
        relays: [],
        identifierType: 'pubkey',
        error: null
      };
    }

    const npubValidation = validateNpub(value);
    return {
      isValid: npubValidation.isValid,
      normalizedPubkey: npubValidation.normalizedPubkey,
      resolvedName: null,
      relays: [],
      identifierType: 'pubkey',
      error: npubValidation.isValid ? null : 'invalid'
    };
  }

  async function sendDirectMessage(
    recipientPublicKey: string,
    textMessage: string,
    relays: string[],
    options: SendDirectMessageOptions = {}
  ): Promise<NostrEvent> {
    const message = textMessage.trim();
    if (!message) {
      throw new Error('Message cannot be empty.');
    }

    const replyTargetEventId = normalizeEventId(options.replyToEventId);

    const publishResult = await sendGiftWrappedRumor(
      recipientPublicKey,
      relays,
      NDKKind.PrivateDirectMessage,
      (senderPubkey, normalizedRecipientPubkey, createdAt) => {
        return createDirectMessageRumorEvent(
          senderPubkey,
          normalizedRecipientPubkey,
          message,
          createdAt,
          replyTargetEventId
        );
      },
      options
    );
    return publishResult.giftWrapEvent;
  }

  async function sendDirectMessageReaction(
    recipientPublicKey: string,
    emoji: string,
    targetEventId: string,
    targetAuthorPublicKey: string,
    relays: string[],
    options: SendDirectMessageReactionOptions = {}
  ): Promise<NostrEvent | null> {
    const normalizedEmoji = emoji.trim();
    const normalizedTargetEventId = normalizeEventId(targetEventId);
    const normalizedTargetAuthorPublicKey = inputSanitizerService.normalizeHexKey(
      targetAuthorPublicKey
    );
    if (!normalizedEmoji) {
      throw new Error('Reaction emoji is required.');
    }

    if (!normalizedTargetEventId) {
      throw new Error('Reaction target event id is required.');
    }

    if (!normalizedTargetAuthorPublicKey) {
      throw new Error('Reaction target author public key is required.');
    }

    const targetKind =
      Number.isInteger(options.targetKind) && Number(options.targetKind) > 0
        ? Number(options.targetKind)
        : NDKKind.PrivateDirectMessage;

    const publishResult = await sendGiftWrappedRumor(
      recipientPublicKey,
      relays,
      NDKKind.Reaction,
      (senderPubkey, normalizedRecipientPubkey, createdAt) => {
        return createReactionRumorEvent(
          senderPubkey,
          normalizedRecipientPubkey,
          normalizedEmoji,
          normalizedTargetEventId,
          normalizedTargetAuthorPublicKey,
          targetKind,
          createdAt
        );
      },
      {
        createdAt: options.createdAt
      }
    );
    if (publishResult.rumorEvent) {
      await nostrEventDataService.upsertEvent({
        event: publishResult.rumorEvent,
        direction: 'out',
        relay_statuses: publishResult.relayStatuses
      });
    }

    return publishResult.rumorEvent;
  }

  async function sendDirectMessageDeletion(
    recipientPublicKey: string,
    targetEventId: string,
    targetKind: number,
    relays: string[],
    options: SendDirectMessageDeletionOptions = {}
  ): Promise<NostrEvent | null> {
    const normalizedTargetEventId = normalizeEventId(targetEventId);
    if (!normalizedTargetEventId) {
      throw new Error('Deletion target event id is required.');
    }

    if (!Number.isInteger(targetKind) || Number(targetKind) <= 0) {
      throw new Error('Deletion target kind is required.');
    }

    const publishResult = await sendGiftWrappedRumor(
      recipientPublicKey,
      relays,
      NDKKind.EventDeletion,
      (senderPubkey, normalizedRecipientPubkey, createdAt) => {
        return createEventDeletionRumorEvent(
          senderPubkey,
          normalizedRecipientPubkey,
          normalizedTargetEventId,
          Number(targetKind),
          createdAt
        );
      },
      {
        createdAt: options.createdAt
      }
    );

    return publishResult.rumorEvent;
  }

  async function retryDirectMessageRelay(
    messageId: number,
    relayUrl: string,
    scope: 'recipient' | 'self'
  ): Promise<void> {
    const normalizedMessageId = Number(messageId);
    const normalizedRelayUrl = normalizeRelayStatusUrl(relayUrl);
    if (
      !Number.isInteger(normalizedMessageId) ||
      normalizedMessageId <= 0 ||
      !normalizedRelayUrl ||
      (scope !== 'recipient' && scope !== 'self')
    ) {
      throw new Error('Invalid relay retry input.');
    }

    await Promise.all([chatDataService.init(), nostrEventDataService.init()]);

    const message = await chatDataService.getMessageById(normalizedMessageId);
    if (!message?.event_id) {
      throw new Error('Message is missing a persisted event id.');
    }

    const storedEvent = await nostrEventDataService.getEventById(message.event_id);
    if (!storedEvent || storedEvent.direction !== 'out') {
      throw new Error('No outbound nostr event found for this message.');
    }

    const rumorEvent = createStoredDirectMessageRumorEvent(storedEvent.event);
    if (!rumorEvent) {
      throw new Error('Failed to rebuild the direct message event for retry.');
    }

    const signer = await getOrCreateSigner();
    const recipientPubkey = readDirectMessageRecipientPubkey(storedEvent.event);
    if (!recipientPubkey) {
      throw new Error('Stored direct message event is missing a recipient.');
    }

    await appendRelayStatusesToMessageEvent(
      normalizedMessageId,
      buildPendingOutboundRelayStatuses([normalizedRelayUrl], scope),
      {
        event: storedEvent.event,
        direction: 'out',
        eventId: message.event_id
      }
    );

    await ensureRelayConnections([normalizedRelayUrl]);
    const recipient =
      scope === 'self'
        ? new NDKUser({ pubkey: signer.pubkey })
        : new NDKUser({ pubkey: recipientPubkey });
    const giftWrapEvent = await giftWrap(rumorEvent, recipient, signer, {
      rumorKind: NDKKind.PrivateDirectMessage
    });
    const publishResult = await publishEventWithRelayStatuses(
      giftWrapEvent,
      [normalizedRelayUrl],
      scope
    );

    await appendRelayStatusesToMessageEvent(
      normalizedMessageId,
      publishResult.relayStatuses,
      {
        event: storedEvent.event,
        direction: 'out',
        eventId: message.event_id
      }
    );

    if (publishResult.error) {
      const failedRelayStatus = publishResult.relayStatuses.find(
        (relayStatus) =>
          relayStatus.relay_url === normalizedRelayUrl && relayStatus.status === 'failed'
      );
      const detail = failedRelayStatus?.detail?.trim();
      if (detail) {
        throw new Error(detail);
      }

      throw publishResult.error;
    }
  }

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
          eventId: normalizeEventId(entry.reaction.eventId) ?? null
        }))
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
          targetKind: entry.targetKind
        }))
      }))
      .sort((first, second) => second.count - first.count);
  }

  function getPendingDeveloperQueueTargetEventIds(): string[] {
    return Array.from(
      new Set([
        ...pendingIncomingReactions.keys(),
        ...pendingIncomingDeletions.keys()
      ])
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
    await Promise.all([chatDataService.init(), nostrEventDataService.init()]);

    const initialTargetCount = getPendingDeveloperQueueTargetEventIds().length;
    const initialEntryCount = getPendingDeveloperQueueEntryCount();
    if (initialEntryCount === 0) {
      return {
        initialTargetCount,
        initialEntryCount,
        remainingTargetCount: 0,
        remainingEntryCount: 0
      };
    }

    const didChange = await applyPendingQueuesForStoredTargets(
      getPendingDeveloperQueueTargetEventIds(),
      {
        uiThrottleMs: PRIVATE_MESSAGES_STARTUP_RESTORE_THROTTLE_MS
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
      remainingEntryCount: getPendingDeveloperQueueEntryCount()
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
    const privateMessagesRelayUrls = normalizeRelayStatusUrls(privateMessagesSubscriptionRelayUrls.value);
    const relayRows = normalizeRelayStatusUrls([
      ...appRelayUrls,
      ...effectiveReadRelayUrls,
      ...effectivePublishRelayUrls,
      ...privateMessagesRelayUrls,
      ...configuredRelayList
    ]).map((relayUrl) => {
      const normalizedRelayUrl = normalizeRelayUrl(relayUrl);
      const snapshot = buildRelaySnapshot(ndk.pool.getRelay(normalizedRelayUrl, false));

      return {
        ...snapshot,
        url: normalizedRelayUrl,
        inReadSet: effectiveReadRelayUrls.includes(normalizedRelayUrl),
        inPublishSet: effectivePublishRelayUrls.includes(normalizedRelayUrl),
        inPrivateMessagesSubscription: privateMessagesRelayUrls.includes(normalizedRelayUrl),
        isConfigured: configuredRelayUrls.has(normalizedRelayUrl)
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
        configuredRelayUrls: configuredRelayList
      },
      privateMessagesSubscription: {
        active: Boolean(privateMessagesSubscription),
        signature: privateMessagesSubscriptionSignature || null,
        relayUrls: privateMessagesRelayUrls,
        relaySnapshots: getRelaySnapshots(privateMessagesRelayUrls),
        since: privateMessagesSubscriptionSince.value,
        sinceIso: toOptionalIsoTimestampFromUnix(privateMessagesSubscriptionSince.value),
        restoreThrottleMs: privateMessagesRestoreThrottleMs,
        startedAt: privateMessagesSubscriptionStartedAt.value,
        lastEventSeenAt: privateMessagesSubscriptionLastEventSeenAt.value,
        lastEventId: privateMessagesSubscriptionLastEventId.value,
        lastEventCreatedAt: privateMessagesSubscriptionLastEventCreatedAt.value,
        lastEventCreatedAtIso: toOptionalIsoTimestampFromUnix(
          privateMessagesSubscriptionLastEventCreatedAt.value
        ),
        lastEoseAt: privateMessagesSubscriptionLastEoseAt.value
      },
      relayRows,
      pendingReactions: buildPendingReactionDiagnostics(),
      pendingDeletions: buildPendingDeletionDiagnostics()
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
    const relayUrls = snapshot.relayRows.map((entry) => entry.url).filter((value): value is string => Boolean(value));
    if (relayUrls.length === 0) {
      return;
    }

    await ensureRelayConnections(relayUrls);
    bumpDeveloperDiagnosticsVersion();
  }

  async function restartPrivateMessagesDiagnosticsSubscription(
    options: {
      lookbackMinutes?: number;
    } = {}
  ): Promise<void> {
    const lookbackMinutes =
      typeof options.lookbackMinutes === 'number' && Number.isFinite(options.lookbackMinutes)
        ? Math.max(1, Math.floor(options.lookbackMinutes))
        : 0;

    await subscribePrivateMessagesForLoggedInUser(true, {
      restoreThrottleMs: PRIVATE_MESSAGES_STARTUP_RESTORE_THROTTLE_MS,
      sinceOverride:
        lookbackMinutes > 0
          ? Math.max(0, Math.floor(Date.now() / 1000) - lookbackMinutes * 60)
          : undefined
    });
    bumpDeveloperDiagnosticsVersion();
  }

  return {
    clearPrivateKey,
    clearDeveloperTraceEntries,
    contactListVersion,
    developerDiagnosticsEnabled,
    developerDiagnosticsVersion,
    developerTraceVersion,
    encodeNpub,
    ensureRelayConnections,
    fetchRelayNip11Info,
    fetchMyRelayList,
    getDeveloperDiagnosticsSnapshot,
    getNip05Data,
    hasNip07Extension,
    getLoggedInPublicKeyHex,
    getPrivateKeyHex,
    refreshDeveloperPendingQueues,
    getRelayConnectionState,
    isRestoringStartupState,
    listDeveloperTraceEntries,
    loginWithExtension,
    logout,
    publishPrivateContactList,
    publishUserMetadata,
    publishMyRelayList,
    relayStatusVersion,
    resolveIdentifier,
    ensureRespondedPubkeyIsContact,
    refreshContactByPublicKey,
    restoreContactCursorState,
    restoreMyRelayList,
    restorePrivateContactList,
    restorePrivatePreferences,
    restoreStartupState,
    reconnectAllDeveloperRelays,
    reconnectDeveloperRelay,
    restartPrivateMessagesDiagnosticsSubscription,
    retryDirectMessageRelay,
    scheduleContactCursorPublish,
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
