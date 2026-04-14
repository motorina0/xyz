import { NDKPrivateKeySigner, type NostrEvent } from '@nostr-dev-kit/ndk';
import { type ChatRow, chatDataService } from 'src/services/chatDataService';
import { contactsService } from 'src/services/contactsService';
import { inputSanitizerService } from 'src/services/inputSanitizerService';
import { nostrEventDataService } from 'src/services/nostrEventDataService';
import {
  GROUP_CHAT_EPOCH_PUBLIC_KEY_META_KEY,
  GROUP_CURRENT_EPOCH_PRIVATE_KEY_ENCRYPTED_CHAT_META_KEY,
  GROUP_CURRENT_EPOCH_PUBLIC_KEY_CHAT_META_KEY,
  GROUP_EPOCH_KEYS_CHAT_META_KEY,
  GROUP_MEMBER_TICKET_DELIVERIES_CHAT_META_KEY,
  GROUP_OWNER_PUBLIC_KEY_CONTACT_META_KEY,
  GROUP_PRIVATE_KEY_CONTACT_META_KEY,
} from 'src/stores/nostr/constants';
import type {
  GroupIdentitySecretContent,
  RelaySaveStatus,
  SubscribePrivateMessagesOptions,
} from 'src/stores/nostr/types';
import {
  buildAvatarFallbackValue,
  findConflictingKnownGroupEpochNumberValue,
  findHigherKnownGroupEpochConflictValue,
  normalizeChatGroupEpochKeysValue,
  resolveCurrentGroupChatEpochEntryValue,
  resolveGroupChatEpochEntriesValue,
  resolveGroupDisplayNameValue,
} from 'src/stores/nostr/valueUtils';
import type {
  ChatGroupEpochKey,
  ChatMetadata,
  GroupMemberTicketDelivery,
  MessageRelayStatus,
  NostrEventDirection,
} from 'src/types/chat';
import type { ContactMetadata, ContactRecord } from 'src/types/contact';
import {
  mergeGroupMemberTicketDeliveries,
  normalizeGroupMemberTicketDeliveries,
} from 'src/utils/groupMemberTicketDelivery';
import { normalizeMessageRelayStatuses } from 'src/utils/messageRelayStatus';

interface GroupEpochStateRuntimeDeps {
  bumpContactListVersion: () => void;
  chatStore: {
    init: () => Promise<void>;
    reload: () => Promise<void>;
    acceptChat: (
      chatId: string,
      options?: {
        acceptedAt?: string;
        lastOutgoingMessageAt?: string;
      }
    ) => Promise<void>;
  };
  decryptGroupIdentitySecretContent: (
    content: string
  ) => Promise<GroupIdentitySecretContent | null>;
  derivePublicKeyFromPrivateKey: (privateKey: string) => string | null;
  encryptGroupIdentitySecretContent: (content: GroupIdentitySecretContent) => Promise<string>;
  encryptPrivateStringContent: (content: string) => Promise<string>;
  getLoggedInPublicKeyHex: () => string | null;
  getPrivateMessagesEpochSwitchSince: () => number;
  logConflictingIncomingEpochNumber: (
    groupPublicKey: string,
    epochNumber: number,
    epochPublicKey: string | null,
    createdAt: string | null,
    conflict: ChatGroupEpochKey
  ) => void;
  logInvalidIncomingEpochNumber: (
    groupPublicKey: string,
    epochNumber: number,
    epochPublicKey: string | null,
    createdAt: string | null,
    conflict: {
      higherEpochEntry: ChatGroupEpochKey;
      olderHigherEpochEntry: ChatGroupEpochKey | null;
    }
  ) => void;
  publishGroupIdentitySecret: (
    groupPublicKey: string,
    encryptedPrivateKey: string,
    seedRelayUrls?: string[]
  ) => Promise<RelaySaveStatus>;
  queueEpochDrivenPrivateMessagesSubscriptionRefresh: (
    options?: SubscribePrivateMessagesOptions
  ) => void;
  restoreGroupEpochHistory: (
    groupPublicKey: string,
    epochPublicKey: string,
    options?: {
      force?: boolean;
      recipientPubkey?: string;
      seedRelayUrls?: string[];
    }
  ) => Promise<void>;
}

export function createGroupEpochStateRuntime({
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
  publishGroupIdentitySecret,
  queueEpochDrivenPrivateMessagesSubscriptionRefresh,
  restoreGroupEpochHistory,
}: GroupEpochStateRuntimeDeps) {
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
    const nextDeliveries = mergeGroupMemberTicketDeliveries(existingDeliveries, normalizedDelivery);
    const nextMeta: ChatMetadata = {
      ...(existingChat.meta ?? {}),
      [GROUP_MEMBER_TICKET_DELIVERIES_CHAT_META_KEY]: nextDeliveries,
    };

    await chatDataService.updateChat(normalizedGroupPublicKey, {
      meta: nextMeta,
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
    const normalizedEventId =
      typeof options.eventId === 'string' && options.eventId.trim()
        ? options.eventId.trim().toLowerCase()
        : typeof options.event?.id === 'string' && options.event.id.trim()
          ? options.event.id.trim().toLowerCase()
          : null;
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
      created_at: createdAt,
    });

    if (normalizedRelayStatuses.length === 0) {
      return;
    }

    await nostrEventDataService.appendRelayStatuses(normalizedEventId, normalizedRelayStatuses, {
      event: options.event
        ? {
            ...options.event,
            id: normalizedEventId,
          }
        : undefined,
      direction: options.direction,
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
        resolveGroupChatEpochEntriesValue(chat).find(
          (entry) => entry.epoch_public_key === normalizedEpochPublicKey
        ) ?? null;
      if (epochEntry) {
        return {
          chat,
          epochEntry,
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

      const currentEpochEntry = resolveCurrentGroupChatEpochEntryValue(chat);
      const epochPublicKey = inputSanitizerService.normalizeHexKey(
        currentEpochEntry?.epoch_public_key ?? ''
      );
      if (epochPublicKey && epochPublicKey !== loggedInPubkeyHex) {
        groupRecipientPubkeys.add(epochPublicKey);
      }
    }

    return [
      loggedInPubkeyHex,
      ...Array.from(groupRecipientPubkeys).sort((first, second) => first.localeCompare(second)),
    ];
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
    const fallbackName = normalizedName || resolveGroupDisplayNameValue(normalizedGroupPublicKey);
    const existingContact = await contactsService.getContactByPublicKey(normalizedGroupPublicKey);
    const nextContactMeta: ContactMetadata = {
      ...(existingContact?.meta ?? {}),
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
        relays: [],
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
          ...(shouldUpdateMeta ? { meta: nextContactMeta } : {}),
        });
        didChange = true;
      }
    }

    const nextContact = await contactsService.getContactByPublicKey(normalizedGroupPublicKey);
    const groupName =
      normalizedName || nextContact?.name?.trim() || existingContact?.name?.trim() || fallbackName;
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
          avatar: buildAvatarFallbackValue(groupName),
          inbox_state: 'accepted',
          accepted_at: new Date().toISOString(),
        },
      });
      return true;
    }

    const shouldUpdateType = existingChat.type !== 'group';
    const shouldUpdateMeta = JSON.stringify(existingChat.meta) !== JSON.stringify(nextChatMeta);
    const shouldUpdateName = existingChat.name !== groupName;
    if (shouldUpdateType || shouldUpdateMeta || shouldUpdateName) {
      await chatDataService.updateChat(normalizedGroupPublicKey, {
        type: 'group',
        ...(shouldUpdateName ? { name: groupName } : {}),
        meta: nextChatMeta,
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
          epoch_privkey:
            inputSanitizerService.normalizeHexKey(decryptedSecret.epoch_privkey ?? '') ?? undefined,
        },
      };
    }

    const nextSecret: GroupIdentitySecretContent = {
      ...decryptedSecret,
      epoch_number: 0,
      epoch_privkey: NDKPrivateKeySigner.generate().privateKey,
    };
    const nextEncryptedSecret = await encryptGroupIdentitySecretContent(nextSecret);
    const nextMeta: ContactMetadata = {
      ...(groupContact.meta ?? {}),
      [GROUP_PRIVATE_KEY_CONTACT_META_KEY]: nextEncryptedSecret,
    };
    const updatedContact = await contactsService.updateContact(groupContact.id, {
      meta: nextMeta,
    });
    if (!updatedContact) {
      throw new Error('Failed to persist initial group epoch state.');
    }

    bumpContactListVersion();
    try {
      await publishGroupIdentitySecret(
        normalizedGroupPublicKey,
        nextEncryptedSecret,
        seedRelayUrls
      );
    } catch (error) {
      console.warn('Failed to publish updated group epoch secret', error);
    }

    return {
      contact: updatedContact,
      secret: nextSecret,
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
    const existingGroupEpochKeys = normalizeChatGroupEpochKeysValue(
      existingChat?.meta?.[GROUP_EPOCH_KEYS_CHAT_META_KEY]
    );
    const previousEpochSignature = JSON.stringify(existingGroupEpochKeys);
    const invitationCreatedAt =
      typeof options.invitationCreatedAt === 'string' && options.invitationCreatedAt.trim()
        ? options.invitationCreatedAt.trim()
        : null;
    const conflictingEpochNumber = findConflictingKnownGroupEpochNumberValue(
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
        ...(invitationCreatedAt ? { invitation_created_at: invitationCreatedAt } : {}),
      });
    } else {
      const encryptedEpochPrivateKey = await encryptPrivateStringContent(normalizedEpochPrivateKey);
      entriesByEpoch.set(epochNumber, {
        epoch_number: epochNumber,
        epoch_public_key: normalizedEpochPublicKey,
        epoch_private_key_encrypted: encryptedEpochPrivateKey,
        ...(invitationCreatedAt ? { invitation_created_at: invitationCreatedAt } : {}),
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
        : (existingGroupEpochKeys[0]?.epoch_public_key ?? '')
    );
    const nextCurrentEpochPublicKey = currentEpochEntry?.epoch_public_key ?? null;
    const fallbackName =
      typeof options.fallbackName === 'string' && options.fallbackName.trim()
        ? options.fallbackName.trim()
        : resolveGroupDisplayNameValue(normalizedGroupPublicKey);
    const nextMeta: ChatMetadata = {
      ...(existingChat?.meta ?? {}),
      [GROUP_EPOCH_KEYS_CHAT_META_KEY]: nextGroupEpochKeys,
      [GROUP_CURRENT_EPOCH_PUBLIC_KEY_CHAT_META_KEY]: currentEpochEntry?.epoch_public_key ?? '',
      [GROUP_CURRENT_EPOCH_PRIVATE_KEY_ENCRYPTED_CHAT_META_KEY]:
        currentEpochEntry?.epoch_private_key_encrypted ?? '',
      [GROUP_CHAT_EPOCH_PUBLIC_KEY_META_KEY]: currentEpochEntry?.epoch_public_key ?? '',
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
          avatar: buildAvatarFallbackValue(fallbackName),
          ...(options.accepted
            ? {
                inbox_state: 'accepted',
                accepted_at: createdAt,
              }
            : {}),
          ...nextMeta,
        },
      });
      queueEpochDrivenPrivateMessagesSubscriptionRefresh({
        seedRelayUrls: options.seedRelayUrls,
        sinceOverride: getPrivateMessagesEpochSwitchSince(),
      });
      await chatStore.reload();
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
      ...(shouldUpdateMeta ? { meta: nextMeta } : {}),
    });
    if (previousCurrentEpochPublicKey !== nextCurrentEpochPublicKey) {
      queueEpochDrivenPrivateMessagesSubscriptionRefresh({
        seedRelayUrls: options.seedRelayUrls,
        sinceOverride: getPrivateMessagesEpochSwitchSince(),
      });
    }
    await chatStore.reload();

    if (didChangeEpochSet) {
      void restoreGroupEpochHistory(normalizedGroupPublicKey, normalizedEpochPublicKey);
    }
  }

  return {
    appendRelayStatusesToGroupMemberTicketEvent,
    ensureGroupContactAndChat,
    ensureGroupIdentitySecretEpochState,
    findGroupChatEpochContextByRecipientPubkey,
    listPrivateMessageRecipientPubkeys,
    persistIncomingGroupEpochTicket,
    upsertGroupMemberTicketDelivery,
  };
}
