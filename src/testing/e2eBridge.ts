import { inputSanitizerService } from 'src/services/inputSanitizerService';
import { saveBrowserNotificationsPreference } from 'src/utils/browserNotificationPreference';

export interface AppE2EBootstrapOptions {
  privateKey: string;
  relayUrls: string[];
  developerDiagnosticsEnabled?: boolean;
}

export interface AppE2ERefreshOptions {
  chatId?: string | null;
}

export interface AppE2ERotateGroupEpochOptions {
  groupPublicKey: string;
  memberPublicKeys: string[];
  relayUrls?: string[];
}

export interface AppE2ESendMessagesOptions {
  chatId: string;
  texts: string[];
  createdAts?: string[];
}

export interface AppE2ESessionSnapshot {
  publicKey: string;
  npub: string | null;
  relayUrls: string[];
}

export interface AppE2EBridge {
  bootstrapSession(options: AppE2EBootstrapOptions): Promise<AppE2ESessionSnapshot>;
  getSessionSnapshot(): Promise<AppE2ESessionSnapshot>;
  refreshSession(options?: AppE2ERefreshOptions): Promise<void>;
  logout(): Promise<void>;
  rotateGroupEpoch(options: AppE2ERotateGroupEpochOptions): Promise<void>;
  sendMessages(options: AppE2ESendMessagesOptions): Promise<void>;
}

const WINDOW_BRIDGE_KEY = '__appE2E__';

function normalizeRelayUrls(relayUrls: string[]): string[] {
  return inputSanitizerService.normalizeRelayEntriesFromUrls(relayUrls).map((entry) => entry.url);
}

function createSessionSnapshot(
  publicKey: string,
  encodeNpub: (publicKeyHex: string) => string | null,
  relayUrls: string[]
): AppE2ESessionSnapshot {
  const normalizedRelayUrls = Array.isArray(relayUrls)
    ? relayUrls.filter((url): url is string => typeof url === 'string')
    : [];

  return JSON.parse(
    JSON.stringify({
      publicKey,
      npub: encodeNpub(publicKey),
      relayUrls: normalizedRelayUrls,
    })
  );
}

async function bootstrapSession(options: AppE2EBootstrapOptions): Promise<AppE2ESessionSnapshot> {
  const privateKey = options.privateKey.trim();
  const relayUrls = normalizeRelayUrls(options.relayUrls);

  if (!privateKey) {
    throw new Error('A private key is required for e2e bootstrap.');
  }

  if (relayUrls.length === 0) {
    throw new Error('At least one relay URL is required for e2e bootstrap.');
  }

  const relayEntries = inputSanitizerService.normalizeRelayEntriesFromUrls(relayUrls);
  const [
    { useNostrStore },
    { useRelayStore },
    { useNip65RelayStore },
    { useChatStore },
    { useMessageStore },
  ] = await Promise.all([
    import('src/stores/nostrStore'),
    import('src/stores/relayStore'),
    import('src/stores/nip65RelayStore'),
    import('src/stores/chatStore'),
    import('src/stores/messageStore'),
  ]);

  const nostrStore = useNostrStore();
  const relayStore = useRelayStore();
  const nip65RelayStore = useNip65RelayStore();
  const chatStore = useChatStore();
  const messageStore = useMessageStore();

  relayStore.init();
  relayStore.replaceRelayEntries(relayEntries);

  nip65RelayStore.init();
  nip65RelayStore.replaceRelayEntries(relayEntries);

  saveBrowserNotificationsPreference(false);

  if (typeof options.developerDiagnosticsEnabled === 'boolean') {
    nostrStore.setDeveloperDiagnosticsEnabled(options.developerDiagnosticsEnabled);
  }

  const validation = nostrStore.savePrivateKey(privateKey);
  if (!validation.isValid) {
    throw new Error('Invalid private key supplied for e2e bootstrap.');
  }

  await nostrStore.updateLoggedInUserRelayList(relayEntries);
  await nostrStore.publishMyRelayList(relayEntries, relayUrls);
  await nostrStore.restoreStartupState(relayUrls);
  await Promise.all([chatStore.init(), messageStore.init()]);
  await Promise.all([chatStore.reload(), messageStore.reloadLoadedMessages()]);

  const publicKey = nostrStore.getLoggedInPublicKeyHex();
  if (!publicKey) {
    throw new Error('Failed to restore the logged-in public key.');
  }

  return createSessionSnapshot(
    publicKey,
    (candidatePublicKey) => nostrStore.encodeNpub(candidatePublicKey),
    relayUrls
  );
}

async function getSessionSnapshot(): Promise<AppE2ESessionSnapshot> {
  const [{ useNostrStore }, { useRelayStore }] = await Promise.all([
    import('src/stores/nostrStore'),
    import('src/stores/relayStore'),
  ]);

  const nostrStore = useNostrStore();
  const relayStore = useRelayStore();
  relayStore.init();
  const publicKey = nostrStore.getLoggedInPublicKeyHex();
  if (!publicKey) {
    throw new Error('Failed to read the logged-in public key.');
  }

  return createSessionSnapshot(
    publicKey,
    (candidatePublicKey) => nostrStore.encodeNpub(candidatePublicKey),
    relayStore.relays
  );
}

async function refreshSession(options: AppE2ERefreshOptions = {}): Promise<void> {
  const [{ useNostrStore }, { useRelayStore }, { useChatStore }, { useMessageStore }] =
    await Promise.all([
      import('src/stores/nostrStore'),
      import('src/stores/relayStore'),
      import('src/stores/chatStore'),
      import('src/stores/messageStore'),
    ]);

  const nostrStore = useNostrStore();
  const relayStore = useRelayStore();
  const chatStore = useChatStore();
  const messageStore = useMessageStore();

  relayStore.init();

  await Promise.all([chatStore.init(), messageStore.init()]);
  await nostrStore.subscribePrivateMessagesForLoggedInUser(true);
  await chatStore.reload();

  const normalizedChatId =
    typeof options.chatId === 'string' ? options.chatId.trim().toLowerCase() : '';

  if (normalizedChatId) {
    await messageStore.loadMessages(normalizedChatId, true);
    return;
  }

  await messageStore.reloadLoadedMessages();
}

async function logout(): Promise<void> {
  const [{ useNostrStore }] = await Promise.all([import('src/stores/nostrStore')]);

  const nostrStore = useNostrStore();
  await nostrStore.logout();
  window.location.hash = '/auth';
}

async function rotateGroupEpoch(options: AppE2ERotateGroupEpochOptions): Promise<void> {
  const normalizedGroupPublicKey = options.groupPublicKey.trim();
  const normalizedMemberPublicKeys = options.memberPublicKeys
    .map((publicKey) => publicKey.trim())
    .filter((publicKey) => publicKey.length > 0);
  const relayUrls = normalizeRelayUrls(Array.isArray(options.relayUrls) ? options.relayUrls : []);

  if (!normalizedGroupPublicKey) {
    throw new Error('A group public key is required for e2e rotation.');
  }

  const [{ useNostrStore }] = await Promise.all([import('src/stores/nostrStore')]);

  const nostrStore = useNostrStore();
  await nostrStore.rotateGroupEpochAndSendTickets(
    normalizedGroupPublicKey,
    normalizedMemberPublicKeys,
    relayUrls
  );
}

async function sendMessages(options: AppE2ESendMessagesOptions): Promise<void> {
  const normalizedChatId = options.chatId.trim().toLowerCase();
  const texts = options.texts
    .map((entry) => String(entry ?? '').trim())
    .filter((entry) => entry.length > 0);
  const createdAts = Array.isArray(options.createdAts)
    ? options.createdAts.map((entry) => String(entry ?? '').trim())
    : [];

  if (!normalizedChatId) {
    throw new Error('A chat id is required to send e2e messages.');
  }

  if (texts.length === 0) {
    return;
  }

  if (createdAts.length > 0 && createdAts.length !== texts.length) {
    throw new Error('Explicit e2e message timestamps must match the number of messages.');
  }

  const [{ useChatStore }, { useMessageStore }] = await Promise.all([
    import('src/stores/chatStore'),
    import('src/stores/messageStore'),
  ]);

  const chatStore = useChatStore();
  const messageStore = useMessageStore();

  await Promise.all([chatStore.init(), messageStore.init()]);

  for (const [index, text] of texts.entries()) {
    const createdAt = createdAts[index];
    const created = await messageStore.sendMessage(
      normalizedChatId,
      text,
      null,
      createdAt
        ? {
            createdAt,
          }
        : {}
    );
    if (!created) {
      throw new Error(`Failed to send e2e message for chat ${normalizedChatId}.`);
    }

    await chatStore.updateChatPreview(normalizedChatId, created.text, created.sentAt);
    await chatStore.acceptChat(normalizedChatId, {
      lastOutgoingMessageAt: created.sentAt,
    });
  }
}

export function installAppE2EBridge(): void {
  if (typeof window === 'undefined') {
    return;
  }

  const bridge: AppE2EBridge = {
    bootstrapSession,
    getSessionSnapshot,
    refreshSession,
    logout,
    rotateGroupEpoch,
    sendMessages,
  };

  Object.defineProperty(window, WINDOW_BRIDGE_KEY, {
    configurable: true,
    value: bridge,
  });
}
