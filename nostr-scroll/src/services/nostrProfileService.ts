import {
  isValidNip05,
  isValidPubkey,
  NDKKind,
  NDKUser,
  profileFromEvent,
  serializeProfile,
  type NDKEvent,
  type NDKUserProfile,
} from '@nostr-dev-kit/ndk';
import type { NostrAuthSession } from '../types/auth';
import type { NostrProfile } from '../types/nostr';
import type { RelayListEntry } from '../types/relays';
import {
  buildReadRelayUrls,
  buildWriteRelayUrls,
  connectNdkClient,
  createLoggedReqSubscriptionOptions,
  createNdkClient,
  createRelaySet,
  fetchEventFromRelays,
  fetchEventsFromRelays,
  publishReplaceableEventToRelays,
} from './nostrClientService';
import {
  encodeProfileReference,
  normalizeProfileReference,
  shortenPubkey,
  slugifyHandle,
} from './nostrEntityService';
import { createFallbackAvatarDataUri, createFallbackBannerDataUri } from '../utils/visuals';

export interface SaveProfileInput {
  displayName: string;
  about: string;
  location?: string;
  website?: string;
  picture?: string;
  banner?: string;
}

export interface ProfileSearchResolution {
  isValid: boolean;
  normalizedPubkey: string | null;
  relayHints: string[];
  identifierType: 'pubkey' | 'nip05' | null;
  error: 'invalid' | 'nip05_unresolved' | null;
}

export function buildFallbackProfile(pubkey: string): NostrProfile {
  const shortPubkey = shortenPubkey(pubkey);
  const handle = `nostr_${pubkey.slice(0, 8)}`;

  return {
    pubkey,
    npub: new NDKUser({ pubkey }).npub,
    nprofile: encodeProfileReference(pubkey),
    name: handle,
    displayName: shortPubkey,
    verified: false,
    about: '',
    picture: createFallbackAvatarDataUri(shortPubkey, pubkey),
    banner: createFallbackBannerDataUri(shortPubkey, pubkey),
    followersCount: undefined,
    followingCount: undefined,
  };
}

function normalizeWebsite(value: string | undefined): string | undefined {
  const trimmedValue = value?.trim() ?? '';
  if (!trimmedValue) {
    return undefined;
  }

  try {
    return new URL(trimmedValue).toString();
  } catch {
    try {
      return new URL(`https://${trimmedValue}`).toString();
    } catch {
      return trimmedValue;
    }
  }
}

function mapProfile(pubkey: string, profile: NDKUserProfile | null, profileEvent?: NDKEvent | null): NostrProfile {
  const fallback = buildFallbackProfile(pubkey);
  const displayName = `${profile?.displayName ?? profile?.name ?? fallback.displayName}`.trim() || fallback.displayName;
  const name = `${profile?.name ?? slugifyHandle(displayName)}`.trim() || fallback.name;
  const picture = `${profile?.picture ?? profile?.image ?? ''}`.trim() || fallback.picture;
  const banner = `${profile?.banner ?? ''}`.trim() || fallback.banner;

  return {
    ...fallback,
    name,
    displayName,
    about: `${profile?.about ?? profile?.bio ?? ''}`.trim(),
    picture,
    banner,
    nip05: `${profile?.nip05 ?? ''}`.trim() || undefined,
    website: normalizeWebsite(`${profile?.website ?? ''}`.trim() || undefined),
    lud16: `${profile?.lud16 ?? ''}`.trim() || undefined,
    location:
      typeof profile?.location === 'string' && profile.location.trim()
        ? profile.location.trim()
        : undefined,
    joinedAt:
      typeof profileEvent?.created_at === 'number'
        ? new Date(profileEvent.created_at * 1000).toISOString()
        : undefined,
    verified: Boolean(profile?.nip05),
  };
}

export async function resolveProfileSearchInput(
  session: NostrAuthSession,
  appRelayEntries: RelayListEntry[],
  myRelayEntries: RelayListEntry[],
  input: string,
): Promise<ProfileSearchResolution> {
  const value = input.trim();
  if (!value) {
    return {
      isValid: false,
      normalizedPubkey: null,
      relayHints: [],
      identifierType: null,
      error: 'invalid',
    };
  }

  const normalizedReference = normalizeProfileReference(value);
  if (normalizedReference) {
    return {
      isValid: true,
      normalizedPubkey: normalizedReference.pubkey,
      relayHints: normalizedReference.relayHints,
      identifierType: 'pubkey',
      error: null,
    };
  }

  if (!value.includes('@')) {
    return {
      isValid: false,
      normalizedPubkey: null,
      relayHints: [],
      identifierType: null,
      error: 'invalid',
    };
  }

  if (!isValidNip05(value)) {
    return {
      isValid: false,
      normalizedPubkey: null,
      relayHints: [],
      identifierType: 'nip05',
      error: 'invalid',
    };
  }

  try {
    const relayUrls = buildReadRelayUrls(appRelayEntries, myRelayEntries);
    const ndk = createNdkClient(session, relayUrls);
    const user = await NDKUser.fromNip05(value, ndk, true);
    const normalizedPubkey = user?.pubkey?.toLowerCase() ?? null;

    if (!normalizedPubkey || !isValidPubkey(normalizedPubkey)) {
      return {
        isValid: false,
        normalizedPubkey: null,
        relayHints: [],
        identifierType: 'nip05',
        error: 'nip05_unresolved',
      };
    }

    return {
      isValid: true,
      normalizedPubkey,
      relayHints: Array.isArray(user?.relayUrls) ? user.relayUrls : [],
      identifierType: 'nip05',
      error: null,
    };
  } catch {
    return {
      isValid: false,
      normalizedPubkey: null,
      relayHints: [],
      identifierType: 'nip05',
      error: 'nip05_unresolved',
    };
  }
}

export async function fetchProfiles(
  session: NostrAuthSession,
  appRelayEntries: RelayListEntry[],
  myRelayEntries: RelayListEntry[],
  pubkeys: string[],
): Promise<NostrProfile[]> {
  const uniquePubkeys = Array.from(new Set(pubkeys.filter(Boolean)));
  if (uniquePubkeys.length === 0) {
    return [];
  }

  const relayUrls = buildReadRelayUrls(appRelayEntries, myRelayEntries);
  const metadataEvents = await fetchEventsFromRelays(session, relayUrls, {
    kinds: [NDKKind.Metadata],
    authors: uniquePubkeys,
  });
  const latestEventByPubkey = new Map<string, NDKEvent>();

  for (const event of metadataEvents) {
    const existingEvent = latestEventByPubkey.get(event.pubkey);
    if (!existingEvent || (event.created_at ?? 0) > (existingEvent.created_at ?? 0)) {
      latestEventByPubkey.set(event.pubkey, event);
    }
  }

  return uniquePubkeys.map((pubkey) => {
    const metadataEvent = latestEventByPubkey.get(pubkey) ?? null;
    const profile = metadataEvent ? profileFromEvent(metadataEvent) : null;
    return mapProfile(pubkey, profile, metadataEvent);
  });
}

export async function fetchFollowingCount(
  session: NostrAuthSession,
  appRelayEntries: RelayListEntry[],
  myRelayEntries: RelayListEntry[],
  pubkey: string,
): Promise<number | undefined> {
  const relayUrls = buildReadRelayUrls(appRelayEntries, myRelayEntries);
  const ndk = createNdkClient(session, relayUrls);
  await connectNdkClient(ndk);
  const user = ndk.getUser({ pubkey });
  const followFilter = {
    kinds: [NDKKind.Contacts],
    authors: [pubkey],
  };

  try {
    const followingSet = await user.followSet(
      createLoggedReqSubscriptionOptions('follow-set', relayUrls, followFilter, {
        groupable: false,
      }),
    );
    return followingSet.size;
  } catch {
    return undefined;
  }
}

export async function fetchFollowingPubkeys(
  session: NostrAuthSession,
  appRelayEntries: RelayListEntry[],
  myRelayEntries: RelayListEntry[],
  pubkey: string,
): Promise<string[]> {
  const relayUrls = buildReadRelayUrls(appRelayEntries, myRelayEntries);
  const contactsEvent = await fetchEventFromRelays(session, relayUrls, {
    authors: [pubkey],
    kinds: [NDKKind.Contacts],
  });

  if (!contactsEvent) {
    return [];
  }

  return Array.from(
    new Set(
      contactsEvent.tags
        .filter((tag) => tag[0] === 'p' && typeof tag[1] === 'string' && tag[1].length > 0)
        .map((tag) => tag[1] as string),
    ),
  );
}

export async function saveCurrentUserProfile(
  session: NostrAuthSession,
  appRelayEntries: RelayListEntry[],
  myRelayEntries: RelayListEntry[],
  input: SaveProfileInput,
): Promise<void> {
  if (!session.currentPubkey) {
    throw new Error('Login is required before updating the profile.');
  }

  const readRelayUrls = buildReadRelayUrls(appRelayEntries, myRelayEntries);
  const writeRelayUrls = buildWriteRelayUrls(appRelayEntries, myRelayEntries);
  const profileRelayUrls = writeRelayUrls.length > 0 ? writeRelayUrls : readRelayUrls;
  const ndk = createNdkClient(session, profileRelayUrls);
  await connectNdkClient(ndk);
  const user = ndk.getUser({ pubkey: session.currentPubkey });
  const relaySet = createRelaySet(ndk, profileRelayUrls);
  const existingProfile = (
    await user.fetchProfile(
      createLoggedReqSubscriptionOptions('fetch-profile', profileRelayUrls, {
        kinds: [NDKKind.Metadata],
        authors: [session.currentPubkey],
      }),
      true,
    )
  ) ?? {};
  const nextProfile: NDKUserProfile = {
    ...existingProfile,
    displayName: input.displayName.trim(),
    name: existingProfile.name?.trim() || slugifyHandle(input.displayName),
    about: input.about.trim(),
    location: input.location?.trim() || undefined,
    website: normalizeWebsite(input.website),
    picture: input.picture?.trim() || existingProfile.picture || existingProfile.image,
    banner: input.banner?.trim() || existingProfile.banner,
    nip05: existingProfile.nip05,
    lud16: existingProfile.lud16,
  };

  if (relaySet) {
    await publishReplaceableEventToRelays(session, writeRelayUrls, {
      kind: NDKKind.Metadata,
      content: serializeProfile(nextProfile),
      tags: [],
    });
    return;
  }

  user.profile = nextProfile;
  await user.publish();
}
