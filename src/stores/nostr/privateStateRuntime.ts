import type NDK from '@nostr-dev-kit/ndk';
import {
  NDKEvent,
  NDKKind,
  NDKPrivateKeySigner,
  NDKRelaySet,
  NDKSubscriptionCacheUsage,
} from '@nostr-dev-kit/ndk';
import { chatDataService } from 'src/services/chatDataService';
import { contactsService } from 'src/services/contactsService';
import { inputSanitizerService } from 'src/services/inputSanitizerService';
import {
  CONTACT_CURSOR_FETCH_BATCH_SIZE,
  CONTACT_CURSOR_PUBLISH_DELAY_MS,
  GROUP_IDENTITY_SECRET_TAG,
  GROUP_IDENTITY_SECRET_VERSION,
  GROUP_MEMBERS_FOLLOW_SET_D_TAG,
  LAST_SEEN_RECEIVED_ACTIVITY_AT_META_KEY,
  PRIVATE_PREFERENCES_D_TAG,
  PRIVATE_PREFERENCES_KIND,
} from 'src/stores/nostr/constants';
import type {
  ContactCursorContent,
  ContactCursorState,
  CreateGroupChatInput,
  CreateGroupChatResult,
  GroupIdentitySecretContent,
  PrivatePreferences,
  RelaySaveStatus,
} from 'src/stores/nostr/types';
import type { ContactMetadata, ContactRecord, ContactRelay } from 'src/types/contact';
import {
  buildGroupMembershipFollowSetPrivateTags,
  parseGroupMembershipFollowSetPrivateTags,
} from 'src/utils/groupMembershipFollowSet';
import {
  areMessageReactionsEqual,
  buildMetaWithReactions,
  countUnseenReactionsForAuthor,
  normalizeMessageReactions,
} from 'src/utils/messageReactions';
import { resolveGroupPublishRelayUrlsValue } from 'src/stores/nostr/valueUtils';
import type { Ref } from 'vue';

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
  contactRelayListsEqual: (
    first: ContactRelay[] | undefined,
    second: ContactRelay[] | undefined
  ) => boolean;
  createInitialGroupEpochSecretState: () => Pick<
    GroupIdentitySecretContent,
    'epoch_number' | 'epoch_privkey'
  >;
  createStartupBatchTracker: (stepId: any) => {
    beginItem: () => void;
    finishItem: (error?: unknown) => void;
    seal: () => void;
  };
  decryptContactCursorContent: (content: string) => Promise<ContactCursorContent | null>;
  decryptGroupIdentitySecretContent: (
    content: string
  ) => Promise<GroupIdentitySecretContent | null>;
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
  ensurePrivatePreferences: (options?: {
    publishIfCreated?: boolean;
  }) => Promise<PrivatePreferences>;
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
      seedRelayUrls?: string[];
    }
  ) => Promise<void>;
  publishGroupRelayList: (
    groupPublicKey: string,
    relayEntries: ContactRelay[],
    seedRelayUrls?: string[]
  ) => Promise<RelaySaveStatus>;
  publishPrivateContactList: (seedRelayUrls?: string[]) => Promise<void>;
  publishEventWithRelayStatuses: (
    event: NDKEvent,
    relayUrls: string[],
    scope?: 'recipient' | 'self'
  ) => Promise<{ relayStatuses: any[]; error: Error | null }>;
  publishReplaceableEventWithRelayStatuses: (
    event: NDKEvent,
    relayUrls: string[],
    scope?: 'recipient' | 'self'
  ) => Promise<{ relayStatuses: any[]; error: Error | null }>;
  queueTrackedContactSubscriptionsRefresh: () => void;
  readPrivatePreferencesFromStorage: () => PrivatePreferences | null;
  refreshContactByPublicKey: (
    pubkeyHex: string,
    fallbackName?: string,
    lifecycle?: Record<string, any>
  ) => Promise<any>;
  refreshContactRelayList: (pubkeyHex: string) => Promise<ContactRelay[] | null>;
  resolveLoggedInPublishRelayUrls: (seedRelayUrls?: string[]) => Promise<string[]>;
  resolveLoggedInReadRelayUrls: (seedRelayUrls?: string[]) => Promise<string[]>;
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
  buildRelaySaveStatus,
  bumpContactListVersion,
  chatStore,
  chunkValues,
  compareReplaceableEventState,
  completeStartupStep,
  contactRelayListsEqual,
  createInitialGroupEpochSecretState,
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
  getLoggedInPublicKeyHex,
  getStartupStepSnapshot,
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

  readPrivatePreferencesFromStorage,

  refreshContactRelayList,
  resolveLoggedInPublishRelayUrls,
  resolveLoggedInReadRelayUrls,
  restoreState,
  scheduleChatChecks,
  sha256Hex,
  toComparableTimestamp,
  toIsoTimestampFromUnix,
  updateStoredEventSinceFromCreatedAt,
  writePrivatePreferencesToStorage,
}: PrivateStateRuntimeDeps) {
  function compareContactCursorState(
    first: ContactCursorState | ContactCursorContent | null | undefined,
    second: ContactCursorState | ContactCursorContent | null | undefined
  ): number {
    const firstTimestamp =
      first && 'last_seen_incoming_activity_at' in first
        ? first.last_seen_incoming_activity_at
        : first && 'at' in first
          ? first.at
          : null;
    const secondTimestamp =
      second && 'last_seen_incoming_activity_at' in second
        ? second.last_seen_incoming_activity_at
        : second && 'at' in second
          ? second.at
          : null;
    const byTimestamp =
      toComparableTimestamp(firstTimestamp) - toComparableTimestamp(secondTimestamp);
    if (byTimestamp !== 0) {
      return byTimestamp;
    }

    const firstEventId =
      normalizeEventId(
        first && 'last_seen_incoming_activity_event_id' in first
          ? first.last_seen_incoming_activity_event_id
          : first && 'eventId' in first
            ? first.eventId
            : null
      ) ?? '';
    const secondEventId =
      normalizeEventId(
        second && 'last_seen_incoming_activity_event_id' in second
          ? second.last_seen_incoming_activity_event_id
          : second && 'eventId' in second
            ? second.eventId
            : null
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
      tags: [['d', PRIVATE_PREFERENCES_D_TAG]],
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
            '#d': [PRIVATE_PREFERENCES_D_TAG],
          },
          {
            cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
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
        ['t', GROUP_IDENTITY_SECRET_TAG],
      ],
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

  async function encryptGroupMembershipFollowSetContent(
    groupPrivateKey: string,
    groupPublicKey: string,
    memberPublicKeys: string[],
    excludedPubkeys: string[] = []
  ): Promise<string> {
    const normalizedGroupPrivateKey = inputSanitizerService.normalizeHexKey(groupPrivateKey);
    const normalizedGroupPublicKey = inputSanitizerService.normalizeHexKey(groupPublicKey);
    if (!normalizedGroupPrivateKey || !normalizedGroupPublicKey) {
      throw new Error('A valid group identity is required.');
    }

    const groupSigner = new NDKPrivateKeySigner(normalizedGroupPrivateKey, ndk);
    const signerUser = await groupSigner.user();
    if (inputSanitizerService.normalizeHexKey(signerUser.pubkey) !== normalizedGroupPublicKey) {
      throw new Error('Decrypted group private key does not match the group public key.');
    }

    return groupSigner.encrypt(
      signerUser,
      JSON.stringify(
        buildGroupMembershipFollowSetPrivateTags(memberPublicKeys, [
          normalizedGroupPublicKey,
          ...excludedPubkeys,
        ])
      ),
      'nip44'
    );
  }

  async function decryptGroupMembershipFollowSetContent(
    groupPrivateKey: string,
    groupPublicKey: string,
    content: string,
    excludedPubkeys: string[] = []
  ): Promise<string[]> {
    const normalizedGroupPrivateKey = inputSanitizerService.normalizeHexKey(groupPrivateKey);
    const normalizedGroupPublicKey = inputSanitizerService.normalizeHexKey(groupPublicKey);
    const normalizedContent = content.trim();
    if (!normalizedGroupPrivateKey || !normalizedGroupPublicKey) {
      throw new Error('A valid group identity is required.');
    }

    if (!normalizedContent) {
      return [];
    }

    const groupSigner = new NDKPrivateKeySigner(normalizedGroupPrivateKey, ndk);
    const signerUser = await groupSigner.user();
    if (inputSanitizerService.normalizeHexKey(signerUser.pubkey) !== normalizedGroupPublicKey) {
      throw new Error('Decrypted group private key does not match the group public key.');
    }

    const decryptedContent = await groupSigner.decrypt(signerUser, normalizedContent, 'nip44');
    let parsed: unknown;

    try {
      parsed = JSON.parse(decryptedContent);
    } catch {
      return [];
    }

    return parseGroupMembershipFollowSetPrivateTags(parsed, [
      normalizedGroupPublicKey,
      ...excludedPubkeys,
    ]);
  }

  async function fetchGroupMembershipFollowSetPubkeys(
    groupPublicKey: string,
    seedRelayUrls: string[] = []
  ): Promise<string[]> {
    const normalizedGroupPublicKey = inputSanitizerService.normalizeHexKey(groupPublicKey);
    const loggedInPubkeyHex = getLoggedInPublicKeyHex();
    if (!loggedInPubkeyHex) {
      throw new Error('Missing public key in localStorage. Login is required.');
    }

    if (!normalizedGroupPublicKey) {
      throw new Error('A valid group public key is required.');
    }

    await contactsService.init();
    const existingGroupContact =
      await contactsService.getContactByPublicKey(normalizedGroupPublicKey);
    if (!existingGroupContact || existingGroupContact.type !== 'group') {
      throw new Error('Group contact not found.');
    }

    const normalizedOwnerPublicKey = inputSanitizerService.normalizeHexKey(
      existingGroupContact.meta.owner_public_key ?? ''
    );
    if (!normalizedOwnerPublicKey || normalizedOwnerPublicKey !== loggedInPubkeyHex) {
      throw new Error('Only the owner can refresh the group member list.');
    }

    const encryptedGroupPrivateKey =
      existingGroupContact.meta.group_private_key_encrypted?.trim() ?? '';
    if (!encryptedGroupPrivateKey) {
      throw new Error('Encrypted group private key not found.');
    }

    const decryptedSecret = await decryptGroupIdentitySecretContent(encryptedGroupPrivateKey);
    if (
      !decryptedSecret ||
      inputSanitizerService.normalizeHexKey(decryptedSecret.group_pubkey) !==
        normalizedGroupPublicKey
    ) {
      throw new Error('Failed to decrypt the group private key.');
    }

    try {
      await refreshContactRelayList(normalizedGroupPublicKey);
    } catch (error) {
      console.warn(
        'Failed to refresh group relay list before refreshing group members',
        normalizedGroupPublicKey,
        error
      );
    }

    const groupContact = await contactsService.getContactByPublicKey(normalizedGroupPublicKey);
    if (!groupContact || groupContact.type !== 'group') {
      throw new Error('Group contact not found.');
    }

    const relayUrls = resolveGroupPublishRelayUrlsValue(groupContact.relays, seedRelayUrls);
    if (relayUrls.length === 0) {
      throw new Error('Cannot refresh group members without at least one group relay.');
    }

    await ensureRelayConnections(relayUrls);

    const relaySet = NDKRelaySet.fromRelayUrls(relayUrls, ndk);
    const listEvent = await ndk.fetchEvent(
      {
        kinds: [NDKKind.FollowSet],
        authors: [normalizedGroupPublicKey],
        '#d': [GROUP_MEMBERS_FOLLOW_SET_D_TAG],
      },
      {
        cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
      },
      relaySet
    );
    if (!listEvent) {
      throw new Error('Published group member list not found on relays.');
    }

    updateStoredEventSinceFromCreatedAt(listEvent.created_at);

    return decryptGroupMembershipFollowSetContent(
      decryptedSecret.group_privkey,
      normalizedGroupPublicKey,
      listEvent.content,
      [normalizedOwnerPublicKey]
    );
  }

  async function publishGroupMembershipFollowSet(
    groupPublicKey: string,
    memberPublicKeys: string[],
    seedRelayUrls: string[] = []
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
      throw new Error('Only the owner can publish the group member list.');
    }

    const encryptedGroupPrivateKey = groupContact.meta.group_private_key_encrypted?.trim() ?? '';
    if (!encryptedGroupPrivateKey) {
      throw new Error('Encrypted group private key not found.');
    }

    const decryptedSecret = await decryptGroupIdentitySecretContent(encryptedGroupPrivateKey);
    if (
      !decryptedSecret ||
      inputSanitizerService.normalizeHexKey(decryptedSecret.group_pubkey) !==
        normalizedGroupPublicKey
    ) {
      throw new Error('Failed to decrypt the group private key.');
    }

    const relayUrls = resolveGroupPublishRelayUrlsValue(groupContact.relays, seedRelayUrls);
    if (relayUrls.length === 0) {
      throw new Error('Cannot publish group member list without at least one group relay.');
    }

    await ensureRelayConnections(relayUrls);

    const listEvent = new NDKEvent(ndk, {
      kind: NDKKind.FollowSet,
      created_at: Math.floor(Date.now() / 1000),
      pubkey: normalizedGroupPublicKey,
      content: await encryptGroupMembershipFollowSetContent(
        decryptedSecret.group_privkey,
        normalizedGroupPublicKey,
        memberPublicKeys,
        [normalizedOwnerPublicKey]
      ),
      tags: [['d', GROUP_MEMBERS_FOLLOW_SET_D_TAG]],
    });

    const groupSigner = new NDKPrivateKeySigner(decryptedSecret.group_privkey, ndk);
    await listEvent.sign(groupSigner);

    const publishResult = await publishEventWithRelayStatuses(listEvent, relayUrls, 'self');
    if (
      publishResult.relayStatuses.some(
        (entry) => entry.direction === 'outbound' && entry.status === 'published'
      )
    ) {
      updateStoredEventSinceFromCreatedAt(listEvent.created_at);
    }

    const relaySaveStatus = buildRelaySaveStatus(publishResult.relayStatuses);
    if (publishResult.error && !relaySaveStatus.errorMessage) {
      relaySaveStatus.errorMessage = publishResult.error.message;
    }

    if (publishResult.error && relaySaveStatus.publishedRelayUrls.length === 0) {
      throw publishResult.error;
    }

    return relaySaveStatus;
  }

  function buildRestoredGroupMembers(
    memberPubkeys: string[],
    existingMembers: ContactMetadata['group_members']
  ): NonNullable<ContactMetadata['group_members']> {
    const existingMembersByPubkey = new Map(
      inputSanitizerService
        .normalizeContactGroupMembers(existingMembers)
        .map((member) => [member.public_key, member] as const)
    );

    return memberPubkeys.map((memberPublicKey) => {
      return (
        existingMembersByPubkey.get(memberPublicKey) ?? {
          public_key: memberPublicKey,
          name: memberPublicKey,
        }
      );
    });
  }

  async function restoreGroupMembershipFollowSet(
    groupPublicKey: string,
    groupPrivateKey: string,
    ownerPublicKey: string,
    seedRelayUrls: string[] = []
  ): Promise<boolean> {
    const normalizedGroupPublicKey = inputSanitizerService.normalizeHexKey(groupPublicKey);
    const normalizedGroupPrivateKey = inputSanitizerService.normalizeHexKey(groupPrivateKey);
    const normalizedOwnerPublicKey = inputSanitizerService.normalizeHexKey(ownerPublicKey);
    if (!normalizedGroupPublicKey || !normalizedGroupPrivateKey || !normalizedOwnerPublicKey) {
      return false;
    }

    await contactsService.init();
    const existingGroupContact =
      await contactsService.getContactByPublicKey(normalizedGroupPublicKey);
    if (!existingGroupContact || existingGroupContact.type !== 'group') {
      return false;
    }

    try {
      await refreshContactRelayList(normalizedGroupPublicKey);
    } catch (error) {
      console.warn(
        'Failed to refresh group relay list before restoring group members',
        normalizedGroupPublicKey,
        error
      );
    }

    const groupContact = await contactsService.getContactByPublicKey(normalizedGroupPublicKey);
    if (!groupContact || groupContact.type !== 'group') {
      return false;
    }

    const relayUrls = resolveGroupPublishRelayUrlsValue(groupContact.relays, seedRelayUrls);
    if (relayUrls.length === 0) {
      return false;
    }

    await ensureRelayConnections(relayUrls);

    const relaySet = NDKRelaySet.fromRelayUrls(relayUrls, ndk);
    const listEvent = await ndk.fetchEvent(
      {
        kinds: [NDKKind.FollowSet],
        authors: [normalizedGroupPublicKey],
        '#d': [GROUP_MEMBERS_FOLLOW_SET_D_TAG],
      },
      {
        cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
      },
      relaySet
    );
    if (!listEvent) {
      return false;
    }

    updateStoredEventSinceFromCreatedAt(listEvent.created_at);
    const memberPubkeys = await decryptGroupMembershipFollowSetContent(
      normalizedGroupPrivateKey,
      normalizedGroupPublicKey,
      listEvent.content,
      [normalizedOwnerPublicKey]
    );
    const existingMembers = inputSanitizerService.normalizeContactGroupMembers(
      groupContact.meta.group_members
    );
    const nextMembers = buildRestoredGroupMembers(memberPubkeys, existingMembers);
    if (JSON.stringify(existingMembers) === JSON.stringify(nextMembers)) {
      return false;
    }

    const nextMeta: ContactMetadata = {
      ...(groupContact.meta ?? {}),
    };
    if (nextMembers.length > 0) {
      nextMeta.group_members = nextMembers;
    } else {
      delete nextMeta.group_members;
    }

    const updatedContact = await contactsService.updateContact(groupContact.id, {
      meta: nextMeta,
    });
    if (!updatedContact) {
      throw new Error('Failed to persist restored group members.');
    }

    return true;
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
        '#t': [GROUP_IDENTITY_SECRET_TAG],
      },
      {
        cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
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
        const loggedInPubkeyHex = getLoggedInPublicKeyHex();
        for (const [groupPublicKey, event] of eventsByGroupPubkey.entries()) {
          let decryptedSecret: GroupIdentitySecretContent | null = null;
          try {
            decryptedSecret = await decryptGroupIdentitySecretContent(event.content);
          } catch (error) {
            console.warn('Failed to decrypt group identity secret event', groupPublicKey, error);
            continue;
          }

          if (!decryptedSecret || decryptedSecret.group_pubkey !== groupPublicKey) {
            continue;
          }

          didChange =
            (await ensureGroupContactAndChat(groupPublicKey, event.content, {
              name: decryptedSecret.name,
              about: decryptedSecret.about,
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
                invitationCreatedAt: toIsoTimestampFromUnix(event.created_at),
              }
            );
          }

          if (loggedInPubkeyHex) {
            try {
              didChange =
                (await restoreGroupMembershipFollowSet(
                  groupPublicKey,
                  decryptedSecret.group_privkey,
                  loggedInPubkeyHex,
                  seedRelayUrls
                )) || didChange;
            } catch (error) {
              console.warn(
                'Failed to restore group members from follow set',
                groupPublicKey,
                error
              );
            }
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
        : {}),
    });

    const didChange = await ensureGroupContactAndChat(groupPublicKey, encryptedPrivateKey, {
      name: options.name,
      about: options.about,
    });
    await persistIncomingGroupEpochTicket(
      groupPublicKey,
      initialEpochState.epoch_number,
      initialEpochState.epoch_privkey,
      {
        fallbackName: options.name,
        accepted: true,
        invitationCreatedAt: new Date().toISOString(),
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
          relays: relayEntries,
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
          error instanceof Error ? error.message : 'Failed to publish group identity secret.',
      };
    }

    if (relayEntries.length > 0) {
      try {
        await publishGroupRelayList(groupPublicKey, relayEntries, relayUrls);
      } catch (error) {
        console.warn('Failed to publish group relay list during group creation', error);
      }
    }

    let memberListSyncError: string | null = null;
    try {
      await publishGroupMembershipFollowSet(groupPublicKey, [], relayUrls);
    } catch (error) {
      memberListSyncError =
        error instanceof Error ? error.message : 'Failed to publish group member list.';
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
      memberListSyncError,
      contactListSyncError,
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
          '#d': dTagBatch,
        },
        {
          cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
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
    const contactMeta =
      contact.meta && typeof contact.meta === 'object' && !Array.isArray(contact.meta)
        ? (contact.meta as ContactMetadata)
        : {};
    const existingContactCursor: ContactCursorContent | null = normalizeTimestamp(
      contactMeta.last_seen_incoming_activity_at
    )
      ? {
          version: '0.1',
          last_seen_incoming_activity_at: contactMeta.last_seen_incoming_activity_at,
          last_seen_incoming_activity_event_id:
            normalizeEventId(contactMeta.last_seen_incoming_activity_event_id) ?? null,
        }
      : null;
    const shouldAdvanceContactCursor = compareContactCursorState(cursor, existingContactCursor) > 0;
    const nextContactMeta: ContactMetadata = {
      ...contactMeta,
      last_seen_incoming_activity_at: shouldAdvanceContactCursor
        ? cursor.last_seen_incoming_activity_at
        : contactMeta.last_seen_incoming_activity_at,
    };
    if (shouldAdvanceContactCursor && cursor.last_seen_incoming_activity_event_id) {
      nextContactMeta.last_seen_incoming_activity_event_id =
        cursor.last_seen_incoming_activity_event_id;
    } else if (shouldAdvanceContactCursor) {
      delete nextContactMeta.last_seen_incoming_activity_event_id;
    }

    const didChangeLastSeenIncomingActivityAt =
      contactMeta.last_seen_incoming_activity_at !==
        nextContactMeta.last_seen_incoming_activity_at ||
      (contactMeta.last_seen_incoming_activity_event_id ?? null) !==
        (nextContactMeta.last_seen_incoming_activity_event_id ?? null);

    if (didChangeLastSeenIncomingActivityAt) {
      await contactsService.updateContact(contact.id, {
        meta: nextContactMeta,
      });
      didChange = true;
    }

    const chatRow = await chatDataService.getChatByPublicKey(normalizedContactPubkey);
    if (!chatRow) {
      return didChange;
    }

    const messageRows = await chatDataService.listMessages(normalizedContactPubkey);
    const currentChatLastSeenReceivedActivityAt =
      typeof chatRow.meta?.[LAST_SEEN_RECEIVED_ACTIVITY_AT_META_KEY] === 'string'
        ? chatRow.meta[LAST_SEEN_RECEIVED_ACTIVITY_AT_META_KEY].trim()
        : '';
    const effectiveCursorAt =
      [
        cursor.last_seen_incoming_activity_at,
        contactMeta.last_seen_incoming_activity_at,
        currentChatLastSeenReceivedActivityAt,
      ].reduce((latest, candidate) =>
        toComparableTimestamp(candidate) > toComparableTimestamp(latest) ? candidate : latest
      ) || '';
    const cursorTimestamp = toComparableTimestamp(effectiveCursorAt);
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
            viewedByAuthorAt: effectiveCursorAt,
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
        [LAST_SEEN_RECEIVED_ACTIVITY_AT_META_KEY]: effectiveCursorAt,
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
          ),
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
      publishIfCreated: true,
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
      tags: [['d', dTag]],
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
      eventId: normalizeEventId(cursor.eventId),
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
      fetchGroupMembershipFollowSetPubkeys,
      fetchGroupIdentitySecretEvents,
      publishContactCursor,
      publishGroupMembershipFollowSet,
    publishGroupIdentitySecret,
    publishPrivatePreferences,
    restoreContactCursorState,
    restoreGroupIdentitySecrets,
    restorePrivatePreferences,
    scheduleContactCursorPublish,
  };
}
