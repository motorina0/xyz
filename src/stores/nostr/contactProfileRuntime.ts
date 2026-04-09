import type NDK from '@nostr-dev-kit/ndk';
import type { NDKUser, NDKUserProfile } from '@nostr-dev-kit/ndk';
import { contactsService } from 'src/services/contactsService';
import { inputSanitizerService } from 'src/services/inputSanitizerService';
import { BACKGROUND_GROUP_CONTACT_REFRESH_COOLDOWN_MS } from 'src/stores/nostr/constants';
import type {
  ContactProfileEventState,
  ContactRefreshLifecycle,
  ContactRelayListFetchResult,
} from 'src/stores/nostr/types';
import type { ContactMetadata, ContactRecord, ContactRelay } from 'src/types/contact';

interface ContactProfileRuntimeDeps {
  backgroundGroupContactRefreshStartedAt: Map<string, number>;
  buildIdentifierFallbacks: (pubkeyHex: string, existingMeta?: ContactMetadata) => string[];
  buildUpdatedContactMeta: (
    existingMeta: ContactMetadata | undefined,
    profile: NDKUserProfile | null,
    resolvedNpub: string | null,
    resolvedNprofile: string | null
  ) => ContactMetadata;
  bumpContactListVersion: () => void;
  chatStore: {
    syncContactProfile: (pubkeyHex: string) => Promise<void>;
  };
  contactMetadataEqual: (
    first: ContactMetadata | undefined,
    second: ContactMetadata | undefined
  ) => boolean;
  contactRelayListsEqual: (
    first: ContactRelay[] | undefined,
    second: ContactRelay[] | undefined
  ) => boolean;
  ensureContactListedInPrivateContactList: (
    targetPubkeyHex: string,
    options?: {
      fallbackName?: string;
      type?: 'user' | 'group';
    }
  ) => Promise<{
    contact: ContactRecord | null;
    didChange: boolean;
  }>;
  extractContactProfileEventStateFromProfile: (
    profile: NDKUserProfile | null
  ) => ContactProfileEventState | null;
  fetchContactRelayList: (pubkeyHex: string) => Promise<ContactRelayListFetchResult | null>;
  getAppRelayUrls: () => string[];
  getLoggedInPublicKeyHex: () => string | null;
  groupContactRefreshPromises: Map<string, Promise<ContactRecord | null>>;
  isContactListedInPrivateContactList: (contact: ContactRecord | null | undefined) => boolean;
  markContactProfileEventApplied: (pubkeyHex: string, eventState: ContactProfileEventState) => void;
  markContactRelayListEventApplied: (
    pubkeyHex: string,
    eventState: {
      createdAt: number;
      eventId: string;
    }
  ) => void;
  ndk: NDK;
  publishPrivateContactList: (seedRelayUrls?: string[]) => Promise<void>;
  refreshContactRelayList: (pubkeyHex: string) => Promise<ContactRelay[] | null>;
  resolveGroupDisplayName: (groupPublicKey: string) => string;
  shouldPreserveExistingGroupRelays: (
    contact: Pick<ContactRecord, 'type' | 'public_key' | 'relays'> | null | undefined,
    nextRelayEntries: ContactRelay[] | undefined
  ) => boolean;
}

export function createContactProfileRuntime({
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
}: ContactProfileRuntimeDeps) {
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
      } catch {}
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
    const fetchedProfileEventState = extractContactProfileEventStateFromProfile(fetchedProfile);

    const fallbackContactName = fallbackName.trim() || normalizedTargetPubkey.slice(0, 16);
    const nextName =
      nextMeta.display_name?.trim() ||
      nextMeta.name?.trim() ||
      existingContact?.name?.trim() ||
      fallbackContactName;

    let explicitRelayList: ContactRelayListFetchResult | null = null;
    let relayError: unknown | null = null;
    if (lifecycle.refreshRelayList) {
      lifecycle.onRelayFetchStart?.();
      try {
        explicitRelayList = await fetchContactRelayList(normalizedTargetPubkey);
      } catch (error) {
        relayError = error;
        console.warn('Failed to fetch relay list for contact', normalizedTargetPubkey, error);
      } finally {
        lifecycle.onRelayFetchEnd?.(relayError);
      }
    }
    const fallbackRelayEntries = inputSanitizerService.normalizeRelayEntriesFromUrls(
      resolvedUser.relayUrls ?? []
    );
    const nextRelays =
      explicitRelayList !== null
        ? explicitRelayList.relayEntries
        : fallbackRelayEntries.length > 0
          ? fallbackRelayEntries
          : (existingContact?.relays ?? []);
    const effectiveNextRelays = shouldPreserveExistingGroupRelays(existingContact, nextRelays)
      ? (existingContact?.relays ?? [])
      : nextRelays;

    const didChangeContact =
      !existingContact ||
      existingContact.name !== nextName ||
      !contactMetadataEqual(existingContact.meta, nextMeta) ||
      !contactRelayListsEqual(existingContact.relays, effectiveNextRelays);

    if (existingContact) {
      const updatedContact = await contactsService.updateContact(existingContact.id, {
        name: nextName,
        meta: nextMeta,
        relays: effectiveNextRelays,
      });
      if (!updatedContact) {
        return;
      }
      await chatStore.syncContactProfile(normalizedTargetPubkey);
      if (fetchedProfileEventState) {
        markContactProfileEventApplied(normalizedTargetPubkey, fetchedProfileEventState);
      }
      if (explicitRelayList !== null) {
        markContactRelayListEventApplied(normalizedTargetPubkey, {
          createdAt: explicitRelayList.createdAt,
          eventId: explicitRelayList.eventId,
        });
      }
      if (didChangeContact) {
        bumpContactListVersion();
      }
      return;
    }

    const createdContact = await contactsService.createContact({
      public_key: normalizedTargetPubkey,
      name: nextName,
      given_name: null,
      meta: nextMeta,
      relays: nextRelays,
    });
    if (!createdContact) {
      return;
    }
    await chatStore.syncContactProfile(normalizedTargetPubkey);
    if (fetchedProfileEventState) {
      markContactProfileEventApplied(normalizedTargetPubkey, fetchedProfileEventState);
    }
    if (explicitRelayList !== null) {
      markContactRelayListEventApplied(normalizedTargetPubkey, {
        createdAt: explicitRelayList.createdAt,
        eventId: explicitRelayList.eventId,
      });
    }
    bumpContactListVersion();
  }

  async function ensureContactStoredAsGroup(
    groupPublicKey: string,
    options: {
      fallbackName?: string;
      relays?: ContactRelay[];
    } = {}
  ): Promise<ContactRecord | null> {
    const normalizedGroupPublicKey = inputSanitizerService.normalizeHexKey(groupPublicKey);
    if (!normalizedGroupPublicKey) {
      return null;
    }

    await contactsService.init();
    const existingContact = await contactsService.getContactByPublicKey(normalizedGroupPublicKey);
    const fallbackName =
      options.fallbackName?.trim() ||
      existingContact?.name?.trim() ||
      resolveGroupDisplayName(normalizedGroupPublicKey);

    if (!existingContact) {
      const createdContact = await contactsService.createContact({
        public_key: normalizedGroupPublicKey,
        type: 'group',
        name: fallbackName,
        given_name: null,
        ...(options.relays ? { relays: options.relays } : {}),
      });
      if (createdContact) {
        bumpContactListVersion();
      }
      return createdContact;
    }

    const shouldUpdateType = existingContact.type !== 'group';
    const shouldUpdateName = existingContact.name !== fallbackName;
    const shouldUpdateRelays =
      options.relays !== undefined &&
      !contactRelayListsEqual(existingContact.relays, options.relays);

    if (!shouldUpdateType && !shouldUpdateName && !shouldUpdateRelays) {
      return existingContact;
    }

    const updatedContact = await contactsService.updateContact(existingContact.id, {
      ...(shouldUpdateType ? { type: 'group' as const } : {}),
      ...(shouldUpdateName ? { name: fallbackName } : {}),
      ...(shouldUpdateRelays ? { relays: options.relays } : {}),
    });
    if (updatedContact) {
      bumpContactListVersion();
    }

    return updatedContact ?? existingContact;
  }

  async function refreshGroupContactByPublicKey(
    groupPublicKey: string,
    fallbackName = ''
  ): Promise<ContactRecord | null> {
    const normalizedGroupPublicKey = inputSanitizerService.normalizeHexKey(groupPublicKey);
    if (!normalizedGroupPublicKey) {
      return null;
    }

    const pendingRefresh = groupContactRefreshPromises.get(normalizedGroupPublicKey);
    if (pendingRefresh) {
      return pendingRefresh;
    }

    const refreshPromise = (async (): Promise<ContactRecord | null> => {
      try {
        await refreshContactByPublicKey(normalizedGroupPublicKey, fallbackName);
      } catch (error) {
        console.warn('Failed to refresh group contact profile', normalizedGroupPublicKey, error);
      }

      const contact = await ensureContactStoredAsGroup(normalizedGroupPublicKey, {
        fallbackName,
      });
      try {
        await refreshContactRelayList(normalizedGroupPublicKey);
      } catch (error) {
        console.warn('Failed to refresh group contact relay list', normalizedGroupPublicKey, error);
      }
      if (contact) {
        await chatStore.syncContactProfile(normalizedGroupPublicKey);
      }

      return contact;
    })().finally(() => {
      groupContactRefreshPromises.delete(normalizedGroupPublicKey);
    });

    groupContactRefreshPromises.set(normalizedGroupPublicKey, refreshPromise);
    return refreshPromise;
  }

  function queueBackgroundGroupContactRefresh(groupPublicKey: string, fallbackName = ''): void {
    const normalizedGroupPublicKey = inputSanitizerService.normalizeHexKey(groupPublicKey);
    if (!normalizedGroupPublicKey) {
      return;
    }

    if (groupContactRefreshPromises.has(normalizedGroupPublicKey)) {
      return;
    }

    const now = Date.now();
    const lastStartedAt = backgroundGroupContactRefreshStartedAt.get(normalizedGroupPublicKey) ?? 0;
    if (now - lastStartedAt < BACKGROUND_GROUP_CONTACT_REFRESH_COOLDOWN_MS) {
      return;
    }

    backgroundGroupContactRefreshStartedAt.set(normalizedGroupPublicKey, now);
    void refreshGroupContactByPublicKey(normalizedGroupPublicKey, fallbackName).catch((error) => {
      console.warn(
        'Failed to refresh group contact after epoch ticket',
        normalizedGroupPublicKey,
        error
      );
    });
  }

  async function fetchContactPreviewByPublicKey(
    targetPubkeyHex: string,
    fallbackName = ''
  ): Promise<Pick<ContactRecord, 'public_key' | 'name' | 'given_name' | 'meta'> | null> {
    const normalizedTargetPubkey = inputSanitizerService.normalizeHexKey(targetPubkeyHex);
    if (!normalizedTargetPubkey) {
      return null;
    }

    await contactsService.init();
    const existingContact = await contactsService.getContactByPublicKey(normalizedTargetPubkey);
    const identifiers = buildIdentifierFallbacks(normalizedTargetPubkey, existingContact?.meta);
    const resolvedUser = await resolveUserByIdentifiers(identifiers, normalizedTargetPubkey);

    let fetchedProfile: NDKUserProfile | null = null;
    if (resolvedUser) {
      try {
        fetchedProfile = await resolvedUser.fetchProfile();
      } catch (error) {
        console.warn(
          'Failed to fetch transient profile metadata for contact preview',
          normalizedTargetPubkey,
          error
        );
      }
    }

    let resolvedNpub = existingContact?.meta.npub?.trim() ?? '';
    if (!resolvedNpub && resolvedUser) {
      try {
        resolvedNpub = resolvedUser.npub;
      } catch {
        resolvedNpub = '';
      }
    }

    let resolvedNprofile = existingContact?.meta.nprofile?.trim() ?? '';
    if (!resolvedNprofile && resolvedUser) {
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
    const fallbackContactName =
      fallbackName.trim() || existingContact?.name?.trim() || normalizedTargetPubkey.slice(0, 16);
    const nextName =
      nextMeta.display_name?.trim() ||
      nextMeta.name?.trim() ||
      existingContact?.name?.trim() ||
      fallbackContactName;

    return {
      public_key: normalizedTargetPubkey,
      name: nextName,
      given_name: existingContact?.given_name ?? null,
      meta: nextMeta,
    };
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
    if (existingContact && isContactListedInPrivateContactList(existingContact)) {
      return;
    }

    const initialName = fallbackName.trim() || normalizedTargetPubkey.slice(0, 16);
    const ensureResult = await ensureContactListedInPrivateContactList(normalizedTargetPubkey, {
      fallbackName: initialName,
    });
    if (!ensureResult.contact) {
      return;
    }

    await chatStore.syncContactProfile(normalizedTargetPubkey);

    try {
      await refreshContactByPublicKey(normalizedTargetPubkey, initialName);
    } catch (error) {
      console.warn('Failed to refresh responded contact profile', normalizedTargetPubkey, error);
    }

    if (ensureResult.didChange) {
      try {
        await publishPrivateContactList(getAppRelayUrls());
      } catch (error) {
        console.warn(
          'Failed to publish private contact list after adding responded contact',
          normalizedTargetPubkey,
          error
        );
      }
    }
  }

  return {
    ensureContactStoredAsGroup,
    ensureRespondedPubkeyIsContact,
    fetchContactPreviewByPublicKey,
    queueBackgroundGroupContactRefresh,
    refreshContactByPublicKey,
    refreshGroupContactByPublicKey,
    resolveUserByIdentifiers,
  };
}
