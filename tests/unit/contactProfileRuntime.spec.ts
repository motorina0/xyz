import { createContactProfileRuntime } from 'src/stores/nostr/contactProfileRuntime';
import { BACKGROUND_GROUP_CONTACT_REFRESH_COOLDOWN_MS } from 'src/stores/nostr/constants';
import type { ContactRecord } from 'src/types/contact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const USER_PUBKEY = 'a'.repeat(64);
const GROUP_PUBKEY = 'b'.repeat(64);
const serviceMocks = vi.hoisted(() => ({
  contactsService: {
    createContact: vi.fn(),
    getContactByPublicKey: vi.fn(),
    init: vi.fn(),
    updateContact: vi.fn(),
  },
}));

vi.mock('src/services/contactsService', () => ({
  contactsService: serviceMocks.contactsService,
}));

function makeContact(
  publicKey: string,
  overrides: Partial<ContactRecord> = {}
): ContactRecord {
  return {
    id: 1,
    public_key: publicKey,
    type: 'user',
    name: `Contact ${publicKey.slice(0, 8)}`,
    given_name: null,
    meta: {},
    relays: [],
    sendMessagesToAppRelays: false,
    ...overrides,
  };
}

function makeUser(publicKey: string) {
  return {
    pubkey: publicKey,
    npub: `npub1${publicKey.slice(0, 8)}`,
    nprofile: `nprofile1${publicKey.slice(0, 8)}`,
    relayUrls: [],
    fetchProfile: vi.fn().mockResolvedValue({
      name: `Profile ${publicKey.slice(0, 8)}`,
      display_name: `Display ${publicKey.slice(0, 8)}`,
    }),
  };
}

function createDeps() {
  const ndkUserByPubkey = new Map<string, ReturnType<typeof makeUser>>();

  const deps = {
    backgroundGroupContactRefreshStartedAt: new Map<string, number>(),
    buildIdentifierFallbacks: vi.fn((pubkeyHex: string) => [pubkeyHex]),
    buildUpdatedContactMeta: vi.fn((existingMeta) => ({
      ...(existingMeta ?? {}),
    })),
    bumpContactListVersion: vi.fn(),
    chatStore: {
      syncContactProfile: vi.fn().mockResolvedValue(undefined),
    },
    contactMetadataEqual: vi.fn((first, second) => JSON.stringify(first) === JSON.stringify(second)),
    contactRelayListsEqual: vi.fn((first, second) => JSON.stringify(first) === JSON.stringify(second)),
    ensureContactListedInPrivateContactList: vi.fn().mockResolvedValue({
      contact: null,
      didChange: false,
    }),
    extractContactProfileEventStateFromProfile: vi.fn(() => null),
    fetchContactRelayList: vi.fn().mockResolvedValue(null),
    getAppRelayUrls: vi.fn(() => []),
    getLoggedInPublicKeyHex: vi.fn(() => null),
    groupContactRefreshPromises: new Map<string, Promise<ContactRecord | null>>(),
    isContactListedInPrivateContactList: vi.fn(() => false),
    markContactProfileEventApplied: vi.fn(),
    markContactRelayListEventApplied: vi.fn(),
    ndk: {
      fetchUser: vi.fn(async (identifier: string) => ndkUserByPubkey.get(identifier)),
    } as never,
    publishPrivateContactList: vi.fn().mockResolvedValue(undefined),
    refreshContactRelayList: vi.fn().mockResolvedValue([]),
    resolveGroupDisplayName: vi.fn((groupPublicKey: string) => `Group ${groupPublicKey.slice(0, 8)}`),
    shouldPreserveExistingGroupRelays: vi.fn(() => false),
  };

  return {
    deps,
    setUser(publicKey: string) {
      const user = makeUser(publicKey);
      ndkUserByPubkey.set(publicKey, user);
      return user;
    },
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return {
    promise,
    reject,
    resolve,
  };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('contactProfileRuntime group refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-14T12:00:00.000Z'));
    serviceMocks.contactsService.init.mockResolvedValue(undefined);
    serviceMocks.contactsService.createContact.mockResolvedValue(null);
    serviceMocks.contactsService.updateContact.mockImplementation(async (id: number, input) =>
      makeContact(
        input.public_key ?? USER_PUBKEY,
        {
          id,
          type: input.type ?? 'user',
          name: input.name ?? `Contact ${(input.public_key ?? USER_PUBKEY).slice(0, 8)}`,
          given_name: input.given_name ?? null,
          meta: input.meta ?? {},
          relays: input.relays ?? [],
          sendMessagesToAppRelays: input.sendMessagesToAppRelays ?? false,
        }
      )
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reuses the in-flight group refresh promise', async () => {
    const { deps, setUser } = createDeps();
    const groupUser = setUser(GROUP_PUBKEY);
    const profileDeferred = createDeferred<{
      name: string;
      display_name: string;
    }>();
    groupUser.fetchProfile.mockReturnValueOnce(profileDeferred.promise);
    const existingGroup = makeContact(GROUP_PUBKEY, {
      id: 2,
      type: 'group',
      name: 'Study Group',
    });
    serviceMocks.contactsService.getContactByPublicKey.mockResolvedValue(existingGroup);

    const runtime = createContactProfileRuntime(deps);

    const firstRefresh = runtime.refreshGroupContactByPublicKey(GROUP_PUBKEY, 'Study Group');
    const pendingRefresh = deps.groupContactRefreshPromises.get(GROUP_PUBKEY);
    const secondRefresh = runtime.refreshGroupContactByPublicKey(GROUP_PUBKEY, 'Study Group');

    expect(pendingRefresh).toBeDefined();
    expect(deps.groupContactRefreshPromises.get(GROUP_PUBKEY)).toBe(pendingRefresh);
    expect(deps.groupContactRefreshPromises.size).toBe(1);

    profileDeferred.resolve({
      name: 'Profile study',
      display_name: 'Display study',
    });
    await firstRefresh;
    await secondRefresh;

    expect(groupUser.fetchProfile).toHaveBeenCalledTimes(1);
    expect(deps.refreshContactRelayList).toHaveBeenCalledTimes(1);
    expect(deps.groupContactRefreshPromises.size).toBe(0);
  });

  it('throttles background group refreshes with the runtime cooldown', async () => {
    const { deps, setUser } = createDeps();
    const groupUser = setUser(GROUP_PUBKEY);
    const existingGroup = makeContact(GROUP_PUBKEY, {
      id: 2,
      type: 'group',
      name: 'Study Group',
      meta: {
        group: true,
      },
      relays: [{ url: 'wss://relay.example', read: true, write: true }],
    });
    serviceMocks.contactsService.getContactByPublicKey.mockResolvedValue(existingGroup);

    const runtime = createContactProfileRuntime(deps);

    runtime.queueBackgroundGroupContactRefresh(GROUP_PUBKEY, 'Study Group');
    const firstRefresh = deps.groupContactRefreshPromises.get(GROUP_PUBKEY);
    expect(firstRefresh).toBeDefined();
    await firstRefresh;
    runtime.queueBackgroundGroupContactRefresh(GROUP_PUBKEY, 'Study Group');
    await flushPromises();

    expect(groupUser.fetchProfile).toHaveBeenCalledTimes(1);
    expect(deps.refreshContactRelayList).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(BACKGROUND_GROUP_CONTACT_REFRESH_COOLDOWN_MS + 1);
    runtime.queueBackgroundGroupContactRefresh(GROUP_PUBKEY, 'Study Group');
    const secondRefresh = deps.groupContactRefreshPromises.get(GROUP_PUBKEY);
    expect(secondRefresh).toBeDefined();
    await secondRefresh;

    expect(groupUser.fetchProfile).toHaveBeenCalledTimes(2);
    expect(deps.refreshContactRelayList).toHaveBeenCalledTimes(2);
  });
});
