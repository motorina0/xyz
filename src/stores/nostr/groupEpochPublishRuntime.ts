import NDK, { NDKEvent, NDKPrivateKeySigner, NDKUser, type NostrEvent } from '@nostr-dev-kit/ndk';
import { contactsService } from 'src/services/contactsService';
import { inputSanitizerService } from 'src/services/inputSanitizerService';
import { GROUP_PRIVATE_KEY_CONTACT_META_KEY } from 'src/stores/nostr/constants';
import type {
  GroupIdentitySecretContent,
  PublishGroupMemberChangesResult,
  RelayPublishStatusesResult,
  RelaySaveStatus,
  RotateGroupEpochResult,
} from 'src/stores/nostr/types';
import {
  normalizeRelayStatusUrlsValue,
  resolveGroupPublishRelayUrlsValue,
} from 'src/stores/nostr/valueUtils';
import type { MessageRelayStatus } from 'src/types/chat';
import type { ContactRecord } from 'src/types/contact';

interface GroupEpochPublishRuntimeDeps {
  appendRelayStatusesToGroupMemberTicketEvent: (
    groupPublicKey: string,
    memberPublicKey: string,
    epochNumber: number,
    relayStatuses: MessageRelayStatus[],
    options?: {
      event?: NostrEvent;
      direction?: 'in' | 'out';
      eventId?: string;
      createdAt?: string;
    }
  ) => Promise<void>;
  buildFailedOutboundRelayStatuses: (
    relayUrls: string[],
    scope: 'recipient' | 'self',
    detail: string
  ) => MessageRelayStatus[];
  buildPendingOutboundRelayStatuses: (
    relayUrls: string[],
    scope: 'recipient' | 'self'
  ) => MessageRelayStatus[];
  buildRelaySaveStatus: (relayStatuses: MessageRelayStatus[]) => RelaySaveStatus;
  encryptGroupIdentitySecretContent: (content: GroupIdentitySecretContent) => Promise<string>;
  ensureGroupIdentitySecretEpochState: (
    groupContact: ContactRecord,
    seedRelayUrls?: string[]
  ) => Promise<{
    contact: ContactRecord;
    secret: GroupIdentitySecretContent;
  }>;
  ensureRelayConnections: (relayUrls: string[]) => Promise<void>;
  getAppRelayUrls: () => string[];
  getLoggedInPublicKeyHex: () => string | null;
  giftWrapSignedEvent: (
    signedEvent: NDKEvent,
    recipient: NDKUser,
    signer: NDKPrivateKeySigner
  ) => Promise<NDKEvent>;
  ndk: NDK;
  normalizeEventId: (value: unknown) => string | null;
  persistIncomingGroupEpochTicket: (
    groupPublicKey: string,
    epochNumber: number,
    epochPrivateKey: string,
    options?: {
      fallbackName?: string;
      accepted?: boolean;
      invitationCreatedAt?: string;
      seedRelayUrls?: string[];
    }
  ) => Promise<void>;
  publishEventWithRelayStatuses: (
    event: NDKEvent,
    relayUrls: string[],
    scope?: 'recipient' | 'self'
  ) => Promise<RelayPublishStatusesResult>;
  publishGroupIdentitySecret: (
    groupPublicKey: string,
    encryptedPrivateKey: string,
    seedRelayUrls?: string[]
  ) => Promise<RelaySaveStatus>;
  publishGroupMembershipFollowSet: (
    groupPublicKey: string,
    memberPublicKeys: string[],
    seedRelayUrls?: string[]
  ) => Promise<RelaySaveStatus>;
  toIsoTimestampFromUnix: (value: number | undefined) => string;
  toStoredNostrEvent: (event: NDKEvent) => Promise<NostrEvent | null>;
}

export function createGroupEpochPublishRuntime({
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
  publishGroupIdentitySecret,
  publishGroupMembershipFollowSet,
  toIsoTimestampFromUnix,
  toStoredNostrEvent,
}: GroupEpochPublishRuntimeDeps) {
  function normalizeUniqueMemberPublicKeys(
    memberPublicKeys: string[],
    excludedPublicKeys: string[] = []
  ): string[] {
    const excludedPubkeySet = new Set(
      excludedPublicKeys
        .map((publicKey) => inputSanitizerService.normalizeHexKey(publicKey))
        .filter((publicKey): publicKey is string => Boolean(publicKey))
    );

    return Array.from(
      new Set(
        memberPublicKeys
          .map((memberPublicKey) => inputSanitizerService.normalizeHexKey(memberPublicKey))
          .filter((memberPublicKey): memberPublicKey is string => Boolean(memberPublicKey))
          .filter((memberPublicKey) => !excludedPubkeySet.has(memberPublicKey))
      )
    );
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

    const seedRelayUrls = normalizeRelayStatusUrlsValue([
      ...inputSanitizerService.normalizeStringArray(options.seedRelayUrls ?? []),
      ...getAppRelayUrls(),
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
        epoch_privkey: nextEpochSigner.privateKey,
      };
      const nextEncryptedSecret = await encryptGroupIdentitySecretContent(nextSecret);
      const updatedGroupContact = await contactsService.updateContact(currentGroupContact.id, {
        meta: {
          ...(currentGroupContact.meta ?? {}),
          [GROUP_PRIVATE_KEY_CONTACT_META_KEY]: nextEncryptedSecret,
        },
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
          invitationCreatedAt: new Date().toISOString(),
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
      normalizedOwnerPublicKey,
      normalizedGroupPublicKey,
    ]);
    const normalizedTicketRecipientPubkeys = shouldRotateEpoch
      ? normalizeUniqueMemberPublicKeys([normalizedOwnerPublicKey, ...normalizedMemberPubkeys])
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
          error,
        });
      }
    }

    return {
      epochNumber,
      createdNewEpoch: shouldRotateEpoch,
      attemptedMemberCount: normalizedTicketRecipientPubkeys.length,
      deliveredMemberCount: normalizedTicketRecipientPubkeys.length - failedMemberPubkeys.length,
      failedMemberPubkeys,
      publishedRelayUrls: Array.from(publishedRelayUrls.values()),
    };
  }

  async function rotateGroupEpochAndSendTickets(
    groupPublicKey: string,
    memberPublicKeys: string[],
    seedRelayUrls: string[] = []
  ): Promise<RotateGroupEpochResult> {
    return publishGroupEpochTickets(groupPublicKey, memberPublicKeys, {
      rotateEpoch: true,
      seedRelayUrls,
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
      [normalizedOwnerPublicKey, normalizedGroupPublicKey]
    );
    const nextMemberPubkeys = normalizeUniqueMemberPublicKeys(memberPublicKeys, [
      normalizedOwnerPublicKey,
      normalizedGroupPublicKey,
    ]);
    const nextMemberPubkeySet = new Set(nextMemberPubkeys);
    const currentMemberPubkeySet = new Set(currentMemberPubkeys);
    const hasRemovedMembers = currentMemberPubkeys.some(
      (memberPublicKey) => !nextMemberPubkeySet.has(memberPublicKey)
    );
    const addedMemberPubkeys = nextMemberPubkeys.filter(
      (memberPublicKey) => !currentMemberPubkeySet.has(memberPublicKey)
    );
    const membershipDidChange = hasRemovedMembers || addedMemberPubkeys.length > 0;
    const publishResult = await publishGroupEpochTickets(
      normalizedGroupPublicKey,
      hasRemovedMembers ? nextMemberPubkeys : addedMemberPubkeys,
      {
        rotateEpoch: hasRemovedMembers,
        seedRelayUrls,
      }
    );

    if (!membershipDidChange) {
      return publishResult;
    }

    const memberListSave = await publishGroupMembershipFollowSet(
      normalizedGroupPublicKey,
      nextMemberPubkeys,
      seedRelayUrls
    );

    return {
      ...publishResult,
      publishedRelayUrls: Array.from(
        new Set([...publishResult.publishedRelayUrls, ...memberListSave.publishedRelayUrls])
      ),
    };
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

    const relayUrls = resolveGroupPublishRelayUrlsValue(updatedGroupContact.relays, seedRelayUrls);
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
        ['epoch', String(Math.floor(Number(secret.epoch_number)))],
      ],
    });
    await epochTicketEvent.sign(groupSigner);

    const storedEpochTicketEvent = await toStoredNostrEvent(epochTicketEvent);
    const epochTicketEventId = normalizeEventId(storedEpochTicketEvent?.id ?? epochTicketEvent.id);
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
          createdAt: createdAtIso,
        }
      );
    }

    let publishResult: RelayPublishStatusesResult | null = null;

    try {
      await ensureRelayConnections(relayUrls);
      const recipient = new NDKUser({ pubkey: normalizedMemberPublicKey });
      const giftWrapEvent = await giftWrapSignedEvent(epochTicketEvent, recipient, groupSigner);
      publishResult = await publishEventWithRelayStatuses(giftWrapEvent, relayUrls, 'recipient');
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
            createdAt: createdAtIso,
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
          createdAt: createdAtIso,
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

    return relaySaveStatus;
  }

  return {
    publishGroupEpochTickets,
    publishGroupMemberChanges,
    rotateGroupEpochAndSendTickets,
    sendGroupEpochTicket,
  };
}
