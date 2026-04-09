import { NDKNip07Signer, NDKPrivateKeySigner, type NDKSigner, type NDK } from '@nostr-dev-kit/ndk';
import type { Ref } from 'vue';
import { chatDataService } from 'src/services/chatDataService';
import { contactsService } from 'src/services/contactsService';
import { imageCacheService } from 'src/services/imageCacheService';
import { nostrEventDataService } from 'src/services/nostrEventDataService';
import { inputSanitizerService } from 'src/services/inputSanitizerService';
import {
  AUTH_METHOD_STORAGE_KEY,
  DEVELOPER_DIAGNOSTICS_STORAGE_KEY,
  EVENT_SINCE_STORAGE_KEY,
  PRIVATE_KEY_STORAGE_KEY,
  PUBLIC_KEY_STORAGE_KEY,
  RELAY_STORAGE_KEYS
} from 'src/stores/nostr/constants';
import { hasStorage } from 'src/stores/nostr/shared';
import type { AuthMethod, SubscribePrivateMessagesOptions } from 'src/stores/nostr/types';

interface RestoreRuntimeState {
  restoreContactCursorStatePromise: Promise<void> | null;
  restoreGroupIdentitySecretsPromise: Promise<void> | null;
  restorePrivatePreferencesPromise: Promise<void> | null;
}

interface AuthSessionRuntimeDeps {
  authenticatedRelayUrls: { clear: () => void };
  backgroundGroupContactRefreshStartedAt: { clear: () => void };
  bumpDeveloperDiagnosticsVersion: () => void;
  chatStoreClearAllComposerDrafts: () => void;
  clearBrowserNotificationsPreference: () => void;
  clearDarkModePreference: () => void;
  clearDeveloperTraceEntries: () => Promise<void>;
  clearPanelOpacityPreference: () => void;
  clearPrivateMessagesBackfillState: () => void;
  clearPrivatePreferencesStorage: () => void;
  clearStoredPrivateMessagesLastReceivedCreatedAt: () => void;
  configuredRelayUrls: { clear: () => void };
  contactListVersion: Ref<number>;
  eventSince: Ref<number>;
  getPrivateMessagesEpochSubscriptionRefreshTimerId: () => ReturnType<
    typeof globalThis.setTimeout
  > | null;
  groupContactRefreshPromises: { clear: () => void };
  hasNip07Extension: () => boolean;
  isRestoringStartupState: Ref<boolean>;
  loggedInvalidGroupEpochConflictKeys: { clear: () => void };
  ndk: NDK;
  pendingContactCursorPublishStates: { clear: () => void };
  pendingContactCursorPublishTimers: Map<
    string,
    ReturnType<typeof globalThis.setTimeout>
  >;
  pendingEventSinceState: {
    pendingEventSinceUpdate: number;
  };
  pendingIncomingDeletions: { clear: () => void };
  pendingIncomingReactions: { clear: () => void };
  relayConnectFailureCooldownUntilByUrl: { clear: () => void };
  relayConnectPromises: { clear: () => void };
  relayStatusVersion: Ref<number>;
  resetContactSubscriptionsRuntimeState: (reason?: string) => void;
  resetEventSinceForFreshLogin: () => void;
  resetMyRelayListRuntimeState: (reason?: string) => void;
  resetPrivateContactListRuntimeState: (reason?: string) => void;
  resetPrivateMessagesIngestRuntimeState: () => void;
  resetPrivateMessagesSubscriptionRuntimeState: (options?: {
    clearLastEventState?: boolean;
  }) => void;
  resetPrivateMessagesUiRuntimeState: (options?: {
    includeRefreshQueue?: boolean;
  }) => void;
  resetStartupStepTracking: () => void;
  resetTrackedContactEventState: () => void;
  restoreRuntimeState: RestoreRuntimeState;
  setCachedSigner: (signer: NDKSigner | null) => void;
  setCachedSignerSessionKey: (sessionKey: string | null) => void;
  setPendingPrivateMessagesEpochSubscriptionRefreshOptions: (
    options: SubscribePrivateMessagesOptions | null
  ) => void;
  setPrivateMessagesEpochSubscriptionRefreshQueue: (queue: Promise<void>) => void;
  setPrivateMessagesEpochSubscriptionRefreshTimerId: (
    timerId: ReturnType<typeof globalThis.setTimeout> | null
  ) => void;
  setRestoreStartupStatePromise: (promise: Promise<void> | null) => void;
  setSyncLoggedInContactProfilePromise: (promise: Promise<void> | null) => void;
  setSyncRecentChatContactsPromise: (promise: Promise<void> | null) => void;
  stopPrivateMessagesSubscription: (reason?: string) => void;
}

export function createAuthSessionRuntime({
  authenticatedRelayUrls,
  backgroundGroupContactRefreshStartedAt,
  bumpDeveloperDiagnosticsVersion,
  chatStoreClearAllComposerDrafts,
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
  getPrivateMessagesEpochSubscriptionRefreshTimerId,
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
  setCachedSigner,
  setCachedSignerSessionKey,
  setPendingPrivateMessagesEpochSubscriptionRefreshOptions,
  setPrivateMessagesEpochSubscriptionRefreshQueue,
  setPrivateMessagesEpochSubscriptionRefreshTimerId,
  setRestoreStartupStatePromise,
  setSyncLoggedInContactProfilePromise,
  setSyncRecentChatContactsPromise,
  stopPrivateMessagesSubscription
}: AuthSessionRuntimeDeps) {
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

  function setStoredAuthSession(
    authMethod: AuthMethod,
    pubkeyHex: string,
    privateKeyHex?: string
  ): void {
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

  function resetPendingContactCursorTimers(): void {
    pendingContactCursorPublishTimers.forEach((timerId) => {
      globalThis.clearTimeout(timerId);
    });
    pendingContactCursorPublishTimers.clear();
    pendingContactCursorPublishStates.clear();
  }

  function resetPrivateMessagesEpochRefreshState(): void {
    const timerId = getPrivateMessagesEpochSubscriptionRefreshTimerId();
    if (timerId !== null) {
      globalThis.clearTimeout(timerId);
      setPrivateMessagesEpochSubscriptionRefreshTimerId(null);
    }

    setPendingPrivateMessagesEpochSubscriptionRefreshOptions(null);
    setPrivateMessagesEpochSubscriptionRefreshQueue(Promise.resolve());
  }

  function clearPrivateKey(): void {
    setCachedSigner(null);
    setCachedSignerSessionKey(null);
    ndk.signer = undefined;
    resetPrivateMessagesSubscriptionRuntimeState({ clearLastEventState: true });
    resetStartupStepTracking();
    pendingIncomingReactions.clear();
    pendingIncomingDeletions.clear();
    resetPendingContactCursorTimers();
    resetTrackedContactEventState();
    void clearDeveloperTraceEntries().catch((error) => {
      console.error('Failed to clear developer trace entries.', error);
    });
    resetContactSubscriptionsRuntimeState('clear-private-key');
    resetMyRelayListRuntimeState('clear-private-key');
    resetPrivateContactListRuntimeState('clear-private-key');
    stopPrivateMessagesSubscription();
    resetPrivateMessagesEpochRefreshState();
    loggedInvalidGroupEpochConflictKeys.clear();
    resetPrivateMessagesUiRuntimeState();
    authenticatedRelayUrls.clear();
    clearStoredPrivateMessagesLastReceivedCreatedAt();
    clearPrivateMessagesBackfillState();
    chatStoreClearAllComposerDrafts();
    bumpDeveloperDiagnosticsVersion();

    if (!hasStorage()) {
      return;
    }

    window.localStorage.removeItem(AUTH_METHOD_STORAGE_KEY);
    window.localStorage.removeItem(PRIVATE_KEY_STORAGE_KEY);
    window.localStorage.removeItem(PUBLIC_KEY_STORAGE_KEY);
    clearPrivatePreferencesStorage();
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
    setCachedSigner(signer);
    setCachedSignerSessionKey(`nsec:${signer.pubkey}`);
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
    setCachedSigner(signer);
    setCachedSignerSessionKey(`nip07:${pubkeyHex}`);
    ndk.signer = signer;
    return pubkeyHex;
  }

  async function logout(): Promise<void> {
    clearPrivateKey();
    eventSince.value = 0;
    pendingEventSinceState.pendingEventSinceUpdate = 0;
    isRestoringStartupState.value = false;
    setRestoreStartupStatePromise(null);
    setSyncLoggedInContactProfilePromise(null);
    setSyncRecentChatContactsPromise(null);
    restoreRuntimeState.restorePrivatePreferencesPromise = null;
    restoreRuntimeState.restoreGroupIdentitySecretsPromise = null;
    restoreRuntimeState.restoreContactCursorStatePromise = null;
    resetPrivateMessagesIngestRuntimeState();
    resetPrivateMessagesUiRuntimeState({ includeRefreshQueue: true });
    configuredRelayUrls.clear();
    relayConnectPromises.clear();
    relayConnectFailureCooldownUntilByUrl.clear();
    groupContactRefreshPromises.clear();
    backgroundGroupContactRefreshStartedAt.clear();
    setPendingPrivateMessagesEpochSubscriptionRefreshOptions(null);
    setPrivateMessagesEpochSubscriptionRefreshQueue(Promise.resolve());
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

  return {
    clearPrivateKey,
    getPrivateKeyHex,
    loginWithExtension,
    logout,
    savePrivateKeyHex
  };
}
