import {
  NDKEvent,
  NDKPrivateKeySigner,
  NDKRelaySet,
  NDKSubscriptionCacheUsage,
  type NDK
} from '@nostr-dev-kit/ndk';
import type { Ref } from 'vue';
import { chatDataService } from 'src/services/chatDataService';
import { contactsService } from 'src/services/contactsService';
import { inputSanitizerService } from 'src/services/inputSanitizerService';
import {
  CONTACT_CURSOR_FETCH_BATCH_SIZE,
  CONTACT_CURSOR_PUBLISH_DELAY_MS,
  GROUP_IDENTITY_SECRET_TAG,
  GROUP_IDENTITY_SECRET_VERSION,
  LAST_SEEN_RECEIVED_ACTIVITY_AT_META_KEY,
  PRIVATE_PREFERENCES_D_TAG,
  PRIVATE_PREFERENCES_KIND
} from 'src/stores/nostr/constants';
import type {
  ContactCursorContent,
  ContactCursorState,
  CreateGroupChatInput,
  CreateGroupChatResult,
  GroupIdentitySecretContent,
  PrivatePreferences,
  RelaySaveStatus
} from 'src/stores/nostr/types';
import {
  areMessageReactionsEqual,
  buildMetaWithReactions,
  countUnseenReactionsForAuthor,
  normalizeMessageReactions
} from 'src/utils/messageReactions';
import type { ContactMetadata, ContactRecord, ContactRelay } from 'src/types/contact';

interface RestoreRuntimeState {
  restoreContactCursorStatePromise: Promise<void> | null;
  restoreGroupIdentitySecretsPromise: Promise<void> | null;
  restorePrivatePreferencesPromise: Promise<void> | null;
}

interface PrivateStateRuntimeDeps {
  beginStartupStep: (stepId: any) => void;
  buildFreshPrivatePreferences: (existing?: Record<string, unknown>) => PrivatePreferences;
  buildRelaySaveStatus: (relayStatuses: any[]) => RelaySaveStatus;
  bumpContactListVersion: () => void;
  chatStore: { reload: () => Promise<void> };
  chunkValues: <T>(values: T[], chunkSize: number) => T[][];
  compareReplaceableEventState: (
    first: Pick<NDKEvent, 'created_at' | 'id'> | null | undefined,
    second: Pick<NDKEvent, 'created_at' | 'id'> | null | undefined
  ) => number;
  completeStartupStep: (stepId: any) => void;
  contactRelayListsEqual: (first: ContactRelay[] | undefined, second: ContactRelay[] | undefined) => boolean;
  createInitialGroupEpochSecretState: () => Pick<GroupIdentitySecretContent, 'epoch_number' | 'epoch_privkey'>;
  createStartupBatchTracker: (stepId: any) => {
    beginItem: () => void;
    finishItem: (error?: unknown) => void;
    seal: () => void;
  };
  decryptContactCursorContent: (content: string) => Promise<ContactCursorContent | null>;
  decryptGroupIdentitySecretContent: (content: string) => Promise<GroupIdentitySecretContent | null>;
  decryptPrivatePreferencesContent: (content: string) => Promise<PrivatePreferences | null>;
  deriveContactCursorDTag: (contactPublicKey: string) => Promise<string | null>;
  encryptContactCursorContent: (cursor: ContactCursorState) => Promise<string>;
  encryptGroupIdentitySecretContent: (content: GroupIdentitySecretContent) => Promise<string>;
  encryptPrivatePreferencesContent: (preferences: PrivatePreferences) => Promise<string>;
  ensureGroupContactAndChat: (
    groupPublicKey: string,
    encryptedPrivateKey: string,
    profile?: { name?: string; about?: string }
  ) => Promise<boolean>;
  ensureLoggedInSignerUser: () => Promise<any>;
  ensurePrivatePreferences: (options?: { publishIfCreated?: boolean }) => Promise<PrivatePreferences>;
  ensureRelayConnections: (relayUrls: string[]) => Promise<void>;
  failStartupStep: (stepId: any, error: unknown) => void;
  getFilterSince: () => number;
  getLoggedInPublicKeyHex: () => string | null;
  getStartupStepSnapshot: (stepId: any) => { status: string };
  isRestoringStartupState: Ref<boolean>;
  ndk: NDK;
  normalizeEventId: (value: unknown) => string | null;
  normalizeTimestamp: (value: unknown) => string | null;
  pendingContactCursorPublishStates: Map<string, ContactCursorState>;
  pendingContactCursorPublishTimers: Map<string, ReturnType<typeof globalThis.setTimeout>>;
  persistIncomingGroupEpochTicket: (
    groupPublicKey: string,
    epochNumber: number,
    epochPrivateKey: string,
    options?: {
      fallbackName?: string;
      accepted?: boolean;
      invitationCreatedAt?: string | null;
    }
  ) => Promise<boolean>;
  publishGroupRelayList: (
    groupPublicKey: string,
    relayEntries: ContactRelay[],
    seedRelayUrls?: string[]
  ) => Promise<RelaySaveStatus>;
  publishPrivateContactList: (seedRelayUrls?: string[]) => Promise<void>;
  publishReplaceableEventWithRelayStatuses: (
    event: NDKEvent,
    relayUrls: string[],
    scope?: 'recipient' | 'self'
  ) => Promise<{ relayStatuses: any[]; error: Error | null }>;
  queueTrackedContactSubscriptionsRefresh: () => void;
  readPrivatePreferencesFromStorage: () => PrivatePreferences | null;
  readStoredPrivateMessagesLastReceivedCreatedAt: () => number | null;
  refreshContactByPublicKey: (
    pubkeyHex: string,
    fallbackName?: string,
    lifecycle?: Record<string, any>
  ) => Promise<any>;
  refreshContactRelayList: (pubkeyHex: string) => Promise<ContactRelay[] | null>;
  resolveLoggedInPublishRelayUrls: (seedRelayUrls?: string[]) => Promise<string[]>;
  resolveLoggedInReadRelayUrls: (seedRelayUrls?: string[]) => Promise<string[]>;
  restorePrivatePreferences: (seedRelayUrls?: string[]) => Promise<void>;
  restoreState: RestoreRuntimeState;
  scheduleChatChecks: (chatIds?: string[], options?: { allChats?: boolean }) => void;
  sha256Hex: (value: string) => Promise<string>;
  shouldApplyPrivateContactListEvent: (event: NDKEvent) => boolean;
  toComparableTimestamp: (value: string | null | undefined) => number;
  toIsoTimestampFromUnix: (value: number | undefined) => string;
  updateStoredEventSinceFromCreatedAt: (value: unknown) => void;
  writePrivatePreferencesToStorage: (preferences: PrivatePreferences) => void;
}

export function createPrivateStateRuntime({
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
  ensureLoggedInSignerUser,
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
  resolveLoggedInPublishRelayUrls,
  resolveLoggedInReadRelayUrls,
  restoreState,
  scheduleChatChecks,
  sha256Hex,
  toComparableTimestamp,
  toIsoTimestampFromUnix,
  updateStoredEventSinceFromCreatedAt,
  writePrivatePreferencesToStorage
}: PrivateStateRuntimeDeps) {
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
    const byTimestamp = toComparableTimestamp(firstTimestamp) - toComparableTimestamp(secondTimestamp);
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
    const user = await ensureLoggedInSignerUser();

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
    if (restoreState.restorePrivatePreferencesPromise) {
      return restoreState.restorePrivatePreferencesPromise;
    }

    beginStartupStep('private-preferences');
    restoreState.restorePrivatePreferencesPromise = (async () => {
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
        await ensureLoggedInSignerUser();

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
      restoreState.restorePrivatePreferencesPromise = null;
    });

    return restoreState.restorePrivatePreferencesPromise;
  }

  async function publishGroupIdentitySecret(
    groupPublicKey: string,
    encryptedPrivateKey: string,
    seedRelayUrls: string[] = []
  ): Promise<RelaySaveStatus> {
    const normalizedGroupPublicKey = inputSanitizerService.normalizeHexKey(groupPublicKey);
    const normalizedEncryptedPrivateKey = encryptedPrivateKey.trim();
    const loggedInPubkeyHex = getLoggedInPublicKeyHex();
    if (!loggedInPubkeyHex) {
      throw new Error('Missing public key in localStorage. Login is required.');
    }

    if (!normalizedGroupPublicKey || !normalizedEncryptedPrivateKey) {
      throw new Error('A valid group identity is required.');
    }

    const relayUrls = await resolveLoggedInPublishRelayUrls(seedRelayUrls);
    if (relayUrls.length === 0) {
      throw new Error('Cannot publish group identity secret without at least one relay.');
    }

    await ensureRelayConnections(relayUrls);
    const user = await ensureLoggedInSignerUser();

    const groupSecretEvent = new NDKEvent(ndk, {
      kind: PRIVATE_PREFERENCES_KIND,
      created_at: Math.floor(Date.now() / 1000),
      pubkey: user.pubkey,
      content: normalizedEncryptedPrivateKey,
      tags: [
        ['d', normalizedGroupPublicKey],
        ['t', GROUP_IDENTITY_SECRET_TAG]
      ]
    });

    const publishResult = await publishReplaceableEventWithRelayStatuses(
      groupSecretEvent,
      relayUrls,
      'self'
    );
    if (
      publishResult.relayStatuses.some(
        (entry) => entry.direction === 'outbound' && entry.status === 'published'
      )
    ) {
      updateStoredEventSinceFromCreatedAt(groupSecretEvent.created_at);
    }

    const relaySaveStatus = buildRelaySaveStatus(publishResult.relayStatuses);
    if (publishResult.error && !relaySaveStatus.errorMessage) {
      relaySaveStatus.errorMessage = publishResult.error.message;
    }

    return relaySaveStatus;
  }

  async function fetchGroupIdentitySecretEvents(
    seedRelayUrls: string[] = []
  ): Promise<Map<string, NDKEvent>> {
    const loggedInPubkeyHex = getLoggedInPublicKeyHex();
    if (!loggedInPubkeyHex) {
      return new Map<string, NDKEvent>();
    }

    const relayUrls = await resolveLoggedInReadRelayUrls(seedRelayUrls);
    if (relayUrls.length === 0) {
      return new Map<string, NDKEvent>();
    }

    await ensureRelayConnections(relayUrls);
    await ensureLoggedInSignerUser();

    const relaySet = NDKRelaySet.fromRelayUrls(relayUrls, ndk);
    const events = await ndk.fetchEvents(
      {
        kinds: [PRIVATE_PREFERENCES_KIND],
        authors: [loggedInPubkeyHex],
        '#t': [GROUP_IDENTITY_SECRET_TAG]
      },
      {
        cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY
      },
      relaySet
    );

    const eventsByGroupPubkey = new Map<string, NDKEvent>();

    for (const event of events) {
      updateStoredEventSinceFromCreatedAt(event.created_at);
      const dTag = inputSanitizerService.normalizeHexKey(
        event.getMatchingTags('d')[0]?.[1]?.trim() ?? ''
      );
      if (!dTag) {
        continue;
      }

      const existingEvent = eventsByGroupPubkey.get(dTag);
      if (existingEvent && compareReplaceableEventState(existingEvent, event) >= 0) {
        continue;
      }

      eventsByGroupPubkey.set(dTag, event);
    }

    return eventsByGroupPubkey;
  }

  async function restoreGroupIdentitySecrets(seedRelayUrls: string[] = []): Promise<void> {
    if (restoreState.restoreGroupIdentitySecretsPromise) {
      return restoreState.restoreGroupIdentitySecretsPromise;
    }

    beginStartupStep('group-identity-secrets');
    restoreState.restoreGroupIdentitySecretsPromise = (async () => {
      try {
        const eventsByGroupPubkey = await fetchGroupIdentitySecretEvents(seedRelayUrls);
        if (eventsByGroupPubkey.size === 0) {
          completeStartupStep('group-identity-secrets');
          return;
        }

        let didChange = false;
        for (const [groupPublicKey, event] of eventsByGroupPubkey.entries()) {
          let decryptedSecret: GroupIdentitySecretContent | null = null;
          try {
            decryptedSecret = await decryptGroupIdentitySecretContent(event.content);
          } catch (error) {
            console.warn(
              'Failed to decrypt group identity secret event',
              groupPublicKey,
              error
            );
            continue;
          }

          if (!decryptedSecret || decryptedSecret.group_pubkey !== groupPublicKey) {
            continue;
          }

          didChange =
            (await ensureGroupContactAndChat(groupPublicKey, event.content, {
              name: decryptedSecret.name,
              about: decryptedSecret.about
            })) || didChange;
          if (
            Number.isInteger(decryptedSecret.epoch_number) &&
            Number(decryptedSecret.epoch_number) >= 0 &&
            decryptedSecret.epoch_privkey
          ) {
            await persistIncomingGroupEpochTicket(
              groupPublicKey,
              Math.floor(Number(decryptedSecret.epoch_number)),
              decryptedSecret.epoch_privkey,
              {
                fallbackName: decryptedSecret.name,
                accepted: true,
                invitationCreatedAt: toIsoTimestampFromUnix(event.created_at)
              }
            );
          }
        }

        if (didChange) {
          bumpContactListVersion();
          await chatStore.reload();
        }

        completeStartupStep('group-identity-secrets');
      } catch (error) {
        failStartupStep('group-identity-secrets', error);
        throw error;
      }
    })().finally(() => {
      restoreState.restoreGroupIdentitySecretsPromise = null;
    });

    return restoreState.restoreGroupIdentitySecretsPromise;
  }

  async function createGroupChat(
    options: CreateGroupChatInput = {}
  ): Promise<CreateGroupChatResult> {
    const relayUrls = Array.isArray(options.relayUrls) ? options.relayUrls : [];
    const relayEntries = inputSanitizerService.normalizeRelayEntriesFromUrls(relayUrls);
    const groupSigner = NDKPrivateKeySigner.generate();
    const initialEpochState = createInitialGroupEpochSecretState();
    const groupPublicKey = inputSanitizerService.normalizeHexKey(groupSigner.pubkey);
    if (!groupPublicKey) {
      throw new Error('Failed to generate a valid group identity.');
    }

    const encryptedPrivateKey = await encryptGroupIdentitySecretContent({
      version: GROUP_IDENTITY_SECRET_VERSION,
      group_pubkey: groupPublicKey,
      group_privkey: groupSigner.privateKey,
      ...initialEpochState,
      ...(typeof options.name === 'string' && options.name.trim()
        ? { name: options.name.trim() }
        : {}),
      ...(typeof options.about === 'string' && options.about.trim()
        ? { about: options.about.trim() }
        : {})
    });

    const didChange = await ensureGroupContactAndChat(groupPublicKey, encryptedPrivateKey, {
      name: options.name,
      about: options.about
    });
    await persistIncomingGroupEpochTicket(
      groupPublicKey,
      initialEpochState.epoch_number,
      initialEpochState.epoch_privkey,
      {
        fallbackName: options.name,
        accepted: true,
        invitationCreatedAt: new Date().toISOString()
      }
    );
    if (didChange) {
      bumpContactListVersion();
      await chatStore.reload();
    }

    if (relayEntries.length > 0) {
      await contactsService.init();
      const groupContact = await contactsService.getContactByPublicKey(groupPublicKey);
      if (groupContact && !contactRelayListsEqual(groupContact.relays, relayEntries)) {
        const updatedGroupContact = await contactsService.updateContact(groupContact.id, {
          relays: relayEntries
        });
        if (updatedGroupContact) {
          bumpContactListVersion();
        }
      }
    }

    let groupSecretSave: RelaySaveStatus;
    try {
      groupSecretSave = await publishGroupIdentitySecret(
        groupPublicKey,
        encryptedPrivateKey,
        relayUrls
      );
    } catch (error) {
      groupSecretSave = {
        relayUrls: [],
        publishedRelayUrls: [],
        failedRelayUrls: [],
        errorMessage:
          error instanceof Error ? error.message : 'Failed to publish group identity secret.'
      };
    }

    if (relayEntries.length > 0) {
      try {
        await publishGroupRelayList(groupPublicKey, relayEntries, relayUrls);
      } catch (error) {
        console.warn('Failed to publish group relay list during group creation', error);
      }
    }

    let contactListSyncError: string | null = null;
    try {
      await publishPrivateContactList(relayUrls);
    } catch (error) {
      contactListSyncError =
        error instanceof Error ? error.message : 'Failed to publish private contact list.';
    }

    return {
      groupPublicKey,
      encryptedPrivateKey,
      groupSecretSave,
      contactListSyncError
    };
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
    await ensureLoggedInSignerUser();

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

    const didChangeLastSeenIncomingActivityAt =
      contact.meta.last_seen_incoming_activity_at !==
        nextContactMeta.last_seen_incoming_activity_at ||
      (contact.meta.last_seen_incoming_activity_event_id ?? null) !==
        (nextContactMeta.last_seen_incoming_activity_event_id ?? null);

    if (didChangeLastSeenIncomingActivityAt) {
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

      nextUnseenReactionCount += countUnseenReactionsForAuthor(
        nextReactions,
        loggedInPubkeyHex
      );

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

    if (JSON.stringify(chatRow.meta) !== JSON.stringify(nextChatMeta)) {
      await chatDataService.updateChatMeta(normalizedContactPubkey, nextChatMeta);
      didChange = true;
    }

    if (Number(chatRow.unread_count ?? 0) !== nextUnreadMessageCount) {
      await chatDataService.updateChatUnreadCount(normalizedContactPubkey, nextUnreadMessageCount);
      didChange = true;
    }

    if (didChangeLastSeenIncomingActivityAt) {
      scheduleChatChecks([normalizedContactPubkey]);
    }

    return didChange;
  }

  async function restoreContactCursorState(seedRelayUrls: string[] = []): Promise<void> {
    if (restoreState.restoreContactCursorStatePromise) {
      return restoreState.restoreContactCursorStatePromise;
    }

    beginStartupStep('contact-cursor-data');
    restoreState.restoreContactCursorStatePromise = (async () => {
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
      restoreState.restoreContactCursorStatePromise = null;
    });

    return restoreState.restoreContactCursorStatePromise;
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
    const user = await ensureLoggedInSignerUser();

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

  return {
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
  };
}
