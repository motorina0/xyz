import type { Ref } from 'vue';
import { chatDataService } from 'src/services/chatDataService';
import { contactsService } from 'src/services/contactsService';
import { inputSanitizerService } from 'src/services/inputSanitizerService';
import { PRIVATE_MESSAGES_STARTUP_RESTORE_THROTTLE_MS } from 'src/stores/nostr/constants';
import type {
  ContactCursorContent,
  ContactRefreshLifecycle,
  PrivatePreferences,
  SubscribePrivateMessagesOptions
} from 'src/stores/nostr/types';
import type { ContactRecord } from 'src/types/contact';

interface StartupBatchTracker {
  beginItem: () => void;
  finishItem: (error?: unknown) => void;
  seal: () => void;
}

interface RefreshAllStoredContactsSummary {
  totalCount: number;
  refreshedCount: number;
  failedCount: number;
  cursorContactCount: number;
  cursorAppliedCount: number;
  cursorUiReloaded: boolean;
}

interface StartupContactSyncRuntimeDeps {
  applyContactCursorStateToContact: (
    contact: ContactRecord,
    cursor: ContactCursorContent
  ) => Promise<boolean>;
  bumpContactListVersion: () => void;
  createStartupBatchTracker: (
    stepId: 'logged-in-profile' | 'logged-in-relays' | 'recent-chat-profiles' | 'recent-chat-relays'
  ) => StartupBatchTracker;
  deriveContactCursorDTag: (contactPublicKey: string) => Promise<string | null>;
  ensureRelayConnections: (relayUrls: string[]) => Promise<void>;
  ensureStoredEventSince: () => void;
  fetchContactCursorEvents: (
    contacts: ContactRecord[]
  ) => Promise<Map<string, ContactCursorContent>>;
  flushPendingEventSinceUpdate: () => void;
  getLoggedInPublicKeyHex: () => string | null;
  getRestoreStartupStatePromise: () => Promise<void> | null;
  getSyncLoggedInContactProfilePromise: () => Promise<void> | null;
  getSyncRecentChatContactsPromise: () => Promise<void> | null;
  isRestoringStartupState: Ref<boolean>;
  readPrivatePreferencesFromStorage: () => PrivatePreferences | null;
  reloadChats: () => Promise<void>;
  refreshContactByPublicKey: (
    pubkeyHex: string,
    fallbackName?: string,
    lifecycle?: ContactRefreshLifecycle
  ) => Promise<unknown>;
  refreshGroupRelayListsOnStartup: (seedRelayUrls?: string[]) => Promise<void>;
  resetStartupStepTracking: () => void;
  resolveStalePendingOutboundMessageRelayStatuses: () => Promise<void>;
  restoreContactCursorState: (seedRelayUrls?: string[]) => Promise<void>;
  restoreGroupIdentitySecrets: (seedRelayUrls?: string[]) => Promise<void>;
  restoreMyRelayList: (seedRelayUrls?: string[]) => Promise<void>;
  restorePrivateContactList: (seedRelayUrls?: string[]) => Promise<void>;
  restorePrivatePreferences: (seedRelayUrls?: string[]) => Promise<void>;
  setRestoreStartupStatePromise: (promise: Promise<void> | null) => void;
  setSyncLoggedInContactProfilePromise: (promise: Promise<void> | null) => void;
  setSyncRecentChatContactsPromise: (promise: Promise<void> | null) => void;
  subscribeContactProfileUpdates: (seedRelayUrls?: string[]) => Promise<void>;
  subscribeContactRelayListUpdates: (seedRelayUrls?: string[]) => Promise<void>;
  subscribeMyRelayListUpdates: (seedRelayUrls?: string[]) => Promise<void>;
  subscribePrivateContactListUpdates: (seedRelayUrls?: string[]) => Promise<void>;
  subscribePrivateMessagesForLoggedInUser: (
    force?: boolean,
    options?: SubscribePrivateMessagesOptions
  ) => Promise<void>;
}

export function createStartupContactSyncRuntime({
  applyContactCursorStateToContact,
  bumpContactListVersion,
  createStartupBatchTracker,
  deriveContactCursorDTag,
  ensureRelayConnections,
  ensureStoredEventSince,
  fetchContactCursorEvents,
  flushPendingEventSinceUpdate,
  getLoggedInPublicKeyHex,
  getRestoreStartupStatePromise,
  getSyncLoggedInContactProfilePromise,
  getSyncRecentChatContactsPromise,
  isRestoringStartupState,
  readPrivatePreferencesFromStorage,
  reloadChats,
  refreshContactByPublicKey,
  refreshGroupRelayListsOnStartup,
  resetStartupStepTracking,
  resolveStalePendingOutboundMessageRelayStatuses,
  restoreContactCursorState,
  restoreGroupIdentitySecrets,
  restoreMyRelayList,
  restorePrivateContactList,
  restorePrivatePreferences,
  setRestoreStartupStatePromise,
  setSyncLoggedInContactProfilePromise,
  setSyncRecentChatContactsPromise,
  subscribeContactProfileUpdates,
  subscribeContactRelayListUpdates,
  subscribeMyRelayListUpdates,
  subscribePrivateContactListUpdates,
  subscribePrivateMessagesForLoggedInUser
}: StartupContactSyncRuntimeDeps) {
  async function refreshAllStoredContacts(): Promise<RefreshAllStoredContactsSummary> {
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
        console.warn(
          'Failed to refresh stored contact after DM startup EOSE',
          contact.public_key,
          error
        );
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
        const { useMessageStore } = await import('src/stores/messageStore');
        await Promise.all([reloadChats(), useMessageStore().reloadLoadedMessages()]);
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

  async function syncLoggedInContactProfile(relayUrls: string[]): Promise<void> {
    const existingPromise = getSyncLoggedInContactProfilePromise();
    if (existingPromise) {
      return existingPromise;
    }

    const nextPromise = (async () => {
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
      setSyncLoggedInContactProfilePromise(null);
    });

    setSyncLoggedInContactProfilePromise(nextPromise);
    return nextPromise;
  }

  async function syncRecentChatContacts(relayUrls: string[]): Promise<void> {
    const existingPromise = getSyncRecentChatContactsPromise();
    if (existingPromise) {
      return existingPromise;
    }

    const nextPromise = (async () => {
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
      setSyncRecentChatContactsPromise(null);
    });

    setSyncRecentChatContactsPromise(nextPromise);
    return nextPromise;
  }

  async function restoreStartupState(seedRelayUrls: string[] = []): Promise<void> {
    const existingPromise = getRestoreStartupStatePromise();
    if (existingPromise) {
      return existingPromise;
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
    const nextPromise = (async () => {
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
        setRestoreStartupStatePromise(null);
      }
    })();

    setRestoreStartupStatePromise(nextPromise);
    return nextPromise;
  }

  return {
    refreshAllStoredContacts,
    restoreStartupState,
    syncLoggedInContactProfile,
    syncRecentChatContacts
  };
}
