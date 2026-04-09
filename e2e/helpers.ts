import { type Browser, type BrowserContext, expect, type Page } from '@playwright/test';

export interface TestAccount {
  privateKey: string;
  displayName: string;
}

export interface BootstrappedUser {
  account: TestAccount;
  context: BrowserContext;
  page: Page;
  session: {
    publicKey: string;
    npub: string | null;
    relayUrls: string[];
  };
}

export interface BootstrapUserOptions {
  relayUrls?: string[];
}

export const E2E_RELAY_URL = process.env.E2E_RELAY_URL ?? 'ws://127.0.0.1:7000';
export const E2E_RELAY_URL_TWO = process.env.E2E_RELAY_URL_TWO ?? 'ws://127.0.0.1:7001';
export const E2E_DUAL_RELAY_URLS = [E2E_RELAY_URL, E2E_RELAY_URL_TWO];

export const TEST_ACCOUNTS = {
  startupRestoreAlice: {
    privateKey: '17109060832c2b13b1280c20c929e17a8b013e1dcb770b9d83ca511d9626e5cb',
    displayName: 'Alice Startup',
  },
  startupRestoreBob: {
    privateKey: 'cefa6999263a9310fa7facb77ef6cfcbc0301e9388fc2316c5158a38ef14f0dc',
    displayName: 'Bob Startup',
  },
  requestAlice: {
    privateKey: 'e0e3310b05ea1dd89ed2ce5bfaf1fdb95a646e45d5812e670c3fa4e98b2f3d47',
    displayName: 'Alice Request',
  },
  requestBob: {
    privateKey: 'c61c6cde623a6acd20f6b4f6e9c6d707226b16e3704d162dd9f79ad996031f25',
    displayName: 'Bob Request',
  },
  actionsAlice: {
    privateKey: '995653b67023e74f41c7b293af1acb99c785b0bf1a727ab457ce92a4142b9956',
    displayName: 'Alice Actions',
  },
  actionsBob: {
    privateKey: 'c25694028321c053f174245104441935f681ce5117a89b27e4263e4360d05433',
    displayName: 'Bob Actions',
  },
  reactionReloadAlice: {
    privateKey: 'ed0d7a4610d16dd4ffb0a14fe92cfad11ad2bd575f53dcfc0bbfd799a098ce8e',
    displayName: 'Alice Reactions Reload',
  },
  reactionReloadBob: {
    privateKey: '84fd8f703d01d4f3d724861dd092f6c9c0d9301c56bfda7051be388d6c183ff8',
    displayName: 'Bob Reactions Reload',
  },
  profileRefreshAlice: {
    privateKey: 'efe5f8abdf1e13ca96afd16c73bf39c518a98bb4215903b4c64e29ccde36f37c',
    displayName: 'Alice Contact Refresh',
  },
  profileRefreshBob: {
    privateKey: '0d13b78191d3023697245897ff5ca68a7d0616e0d28f44e19122a81722750cd6',
    displayName: 'Bob Contact Refresh',
  },
  relaySettingsAlice: {
    privateKey: 'f0c9fa56ec5c7f9170c5dbf4f3ded6f2f24b02885e8f5e71b95d6a3c5954176f',
    displayName: 'Alice Relay Settings',
  },
  relaySettingsBob: {
    privateKey: '68da0a59c381ef5c80e64a5cbca770c90c06fdd57b39b75c80fc17a4a217de99',
    displayName: 'Bob Relay Settings',
  },
  groupAlice: {
    privateKey: 'eeb0542ecef525deee036b1865dc872bcda25df86016403ef25a730f330115b2',
    displayName: 'Alice Group',
  },
  groupBob: {
    privateKey: '31eecc51589b4de8f72f07b36cd888c95f339e1caf4f868f88c8ab8cf9f69587',
    displayName: 'Bob Group',
  },
  groupCharlie: {
    privateKey: '55a9153bb5fc61f56063c7984c7e5cdc29aaf157c294a1f495de673b4b74b07f',
    displayName: 'Charlie Group',
  },
  groupRemovalOwner: {
    privateKey: '93b14eb63c3a5da797dc6aa64cade4398866def096f7ae83835024986127c7ce',
    displayName: 'Owner Removal',
  },
  groupRemovalBob: {
    privateKey: '7330a002e102edae7539020f26b90cef6e0f45fff3a50d402f8bcf461d1cd7ad',
    displayName: 'Bob Removal',
  },
  groupRemovalCharlie: {
    privateKey: '68f656c523ca35f7364365d78888e4e64ea8ea92cb1c2ff095ffd697f9914155',
    displayName: 'Charlie Removal',
  },
  groupRestartAlice: {
    privateKey: 'd0648961ad953ab6ff4eb540df0be00016dff25823907f4194a5cd8a1253ed21',
    displayName: 'Alice Restart',
  },
  groupRestartBob: {
    privateKey: 'dab1a69c14f05653be2fcf725d04068cd85214f9dbe09c2ac0fadbd1f9545d4c',
    displayName: 'Bob Restart',
  },
  groupRelayAlice: {
    privateKey: '2483f2c5443f2a4992e6ada11e76d603fbcf52fa97633b315e4c3e3d53ede5bc',
    displayName: 'Alice Relay',
  },
  groupRelayBob: {
    privateKey: '4ace9d0cf7d76251894bfc88418367135d12b3ed9c78b4cd191f04ac17fcec20',
    displayName: 'Bob Relay',
  },
  groupEpochAlice: {
    privateKey: 'f540818766397792222a9722e94b73b780ea7f746aaf2ac763509663246530d4',
    displayName: 'Alice Epoch',
  },
  groupEpochBob: {
    privateKey: 'b646572a31e22409692be6f6d7840812687525e71f4b2abb8673889f9a8507ba',
    displayName: 'Bob Epoch',
  },
  groupRotateAlice: {
    privateKey: '5b31c34552ff63d834cf3159bd69b42177f6b8e164baec19c4c2aff641bb468a',
    displayName: 'Alice Rotate',
  },
  groupRotateBob: {
    privateKey: 'a225a891658fe37b69b13ea988a098a3687b73760d8bb401e2475e5536613367',
    displayName: 'Bob Rotate',
  },
  dmRestartAlice: {
    privateKey: '6d6a6c562ef4c89ff66e8964e9c424ebb3a3ac59b130cdf118c3caab8a456272',
    displayName: 'Alice DM Restart',
  },
  dmRestartBob: {
    privateKey: '431f4956e15695984eb56874ec8454ddb35260d09c6b3d1857c36b55467f2c7a',
    displayName: 'Bob DM Restart',
  },
  isolationAlice: {
    privateKey: '558033f49171bc9bbc4654b411ad5228b5ba3da15326ed16691824a9db03b628',
    displayName: 'Alice Isolation',
  },
  isolationBob: {
    privateKey: '60a6bba9ddf6eaa5ce72df047678d754f43bce4b7f85b412ed3e787e5855fdce',
    displayName: 'Bob Isolation',
  },
  isolationCharlie: {
    privateKey: '600318cd43cd7c80ce7b366dec6b61b1f4c89379adf553d0989d1536797d358d',
    displayName: 'Charlie Isolation',
  },
  blockAlice: {
    privateKey: '732cc8f4c9bb1542b025b94aa494a706c9991bbf2dd23ce589cf51f99b0652ff',
    displayName: 'Alice Block',
  },
  blockBob: {
    privateKey: '4d517870c8adca0a6dd678a15ef2c715c55e976a580bac9254e1ffd742141a32',
    displayName: 'Bob Block',
  },
  catchupAlice: {
    privateKey: 'd1994d3490b9bfb6a34196038311697a903150169d67b5bd9fd34bfe21ee2738',
    displayName: 'Alice Catchup',
  },
  catchupBob: {
    privateKey: 'e537a186c1bd3971a314c0d89d3a584cdc451c0649bb8e9152e8ef1707c4bc9b',
    displayName: 'Bob Catchup',
  },
} as const;

function composerInput(page: Page) {
  return page.getByPlaceholder('Write a message');
}

function contactLookupIdentifierInput(page: Page) {
  return page.getByLabel('Identifier or Public key');
}

function contactLookupGivenNameInput(page: Page) {
  return page.getByLabel('Given Name');
}

function threadMessages(page: Page, text: string) {
  return page.locator('.thread-message-entry').filter({ hasText: text });
}

function resolveChatItem(page: Page, match?: string | RegExp) {
  const chatItems = page.getByTestId('chat-item');
  if (typeof match === 'undefined') {
    return chatItems.first();
  }

  return chatItems.filter({ hasText: match }).first();
}

function groupMemberListItem(page: Page, memberPublicKey: string) {
  return page
    .locator('.profile-members-list .q-item')
    .filter({ hasText: memberPublicKey.slice(0, 32) })
    .first();
}

export function threadMessage(page: Page, text: string) {
  return threadMessages(page, text).last();
}

export async function bootstrapSessionOnPage(
  page: Page,
  account: TestAccount,
  options: BootstrapUserOptions = {}
): Promise<BootstrappedUser['session']> {
  const relayUrls =
    Array.isArray(options.relayUrls) && options.relayUrls.length > 0
      ? options.relayUrls
      : [E2E_RELAY_URL];

  await page.goto('/#/login');
  await page.waitForFunction(() => Boolean(window.__appE2E__));

  const session = await page.evaluate(
    async ({ privateKey, relayUrls }) => {
      const bridge = window.__appE2E__;
      if (!bridge) {
        throw new Error('E2E bridge is not available.');
      }

      return bridge.bootstrapSession({
        privateKey,
        relayUrls,
      });
    },
    {
      privateKey: account.privateKey,
      relayUrls,
    }
  );

  await page.goto('/#/chats');
  await expect(page.getByTestId('start-new-chat-button')).toBeVisible();

  return session;
}

export async function bootstrapUser(
  browser: Browser,
  account: TestAccount,
  options: BootstrapUserOptions = {}
): Promise<BootstrappedUser> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const session = await bootstrapSessionOnPage(page, account, options);

  return {
    account,
    context,
    page,
    session,
  };
}

export async function disposeUsers(...users: BootstrappedUser[]): Promise<void> {
  await Promise.all(
    users.map(async (user) => {
      try {
        await user.context.close();
      } catch {
        // Playwright may already have closed the context after a timeout.
      }
    })
  );
}

export async function waitForAppBridge(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean(window.__appE2E__), undefined, {
    timeout: 30_000,
  });
}

export async function refreshSession(page: Page, chatId?: string): Promise<void> {
  await page.evaluate(
    async ({ nextChatId }) => {
      const bridge = window.__appE2E__;
      if (!bridge) {
        throw new Error('E2E bridge is not available.');
      }

      await bridge.refreshSession({
        chatId: nextChatId,
      });
    },
    { nextChatId: chatId ?? null }
  );
}

export async function openDirectChatFromIdentifier(
  page: Page,
  identifier: string,
  givenName: string
): Promise<void> {
  await page.getByTestId('start-new-chat-button').click();
  await page.getByTestId('start-new-chat-menu-item').click();
  await expect(contactLookupIdentifierInput(page)).toBeVisible();
  await contactLookupIdentifierInput(page).fill(identifier);
  await contactLookupGivenNameInput(page).fill(givenName);
  await page.getByTestId('contact-lookup-submit').click();
  await page.waitForURL(new RegExp(`#\\/chats\\/${identifier}$`));
  await expect(composerInput(page)).toBeVisible();
}

export async function createGroup(
  page: Page,
  options: {
    name: string;
    about: string;
  }
): Promise<string> {
  await page.getByTestId('start-new-chat-button').click();
  await page.getByTestId('start-new-group-menu-item').click();
  await expect(page.getByTestId('create-group-dialog')).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill(options.name);
  await page.getByLabel('About', { exact: true }).fill(options.about);
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await page.waitForURL(/#\/contacts\/([0-9a-f]{64})/, { timeout: 20_000 });

  const match = page.url().match(/#\/contacts\/([0-9a-f]{64})/);
  if (!match?.[1]) {
    throw new Error('Failed to read the created group public key from the URL.');
  }

  return match[1];
}

export async function openGroupContact(page: Page, groupPublicKey: string): Promise<void> {
  await page.goto(`/#/contacts/${groupPublicKey}`);
  await expect(page.getByTestId('contact-profile-epochs-tab')).toBeVisible();
}

export async function acceptAppRelayFallbackIfVisible(page: Page): Promise<boolean> {
  try {
    await page.getByText('Use App Relays', { exact: true }).waitFor({
      state: 'visible',
      timeout: 1_500,
    });
  } catch {
    return false;
  }

  await page.getByText('Remember this', { exact: true }).click();
  await page.getByRole('button', { name: 'Yes' }).click();
  return true;
}

export async function waitForThreadMessage(
  page: Page,
  text: string,
  options: {
    chatId?: string;
  } = {}
): Promise<void> {
  const message = threadMessage(page, text);

  try {
    await expect(message).toBeVisible({ timeout: 12_000 });
    return;
  } catch {
    await refreshSession(page, options.chatId);
  }

  await expect(message).toBeVisible({ timeout: 12_000 });
}

export async function sendMessage(
  page: Page,
  text: string,
  options: {
    chatId?: string;
  } = {}
): Promise<void> {
  await expect(composerInput(page)).toBeVisible();
  await composerInput(page).fill(text);
  await page.getByTestId('message-composer-send').click();
  await acceptAppRelayFallbackIfVisible(page);
  await waitForThreadMessage(page, text, options);
}

export async function openRequests(page: Page): Promise<void> {
  const requestItem = page.getByTestId('chat-request-item');
  await page.goto('/#/chats/requests');

  try {
    await expect(requestItem).toBeVisible({ timeout: 12_000 });
  } catch {
    await refreshSession(page);
    await page.goto('/#/chats/requests');
  }

  await expect(requestItem).toBeVisible({ timeout: 12_000 });
}

export async function acceptFirstRequest(page: Page): Promise<void> {
  await page.getByTestId('chat-request-accept-button').first().click();
  await expect(page.getByTestId('chat-request-item')).toHaveCount(0);
}

export async function navigateToChat(page: Page, publicKey: string): Promise<void> {
  await page.goto(`/#/chats/${publicKey}`);
  await expect(composerInput(page)).toBeVisible();
}

export async function waitForChatPreview(
  page: Page,
  previewText: string,
  match?: string | RegExp
): Promise<void> {
  await expect(resolveChatItem(page, match)).toContainText(previewText, {
    timeout: 12_000,
  });
}

export async function waitForChatUnreadCount(
  page: Page,
  count: number,
  match?: string | RegExp
): Promise<void> {
  await expect(resolveChatItem(page, match).locator('.chat-item__meta .q-badge')).toHaveText(
    String(count),
    {
      timeout: 12_000,
    }
  );
}

export async function waitForChatReactionBadge(
  page: Page,
  count: number,
  match?: string | RegExp
): Promise<void> {
  await expect(resolveChatItem(page, match).locator('.chat-item__reaction-badge')).toHaveAttribute(
    'aria-label',
    `${count} unseen reactions`,
    {
      timeout: 12_000,
    }
  );
}

export async function openChatActions(page: Page, match?: string | RegExp): Promise<void> {
  await resolveChatItem(page, match).getByTestId('chat-item-actions-button').click();
}

export async function reactToMessage(
  page: Page,
  text: string,
  reactionLabel = 'thumbs up'
): Promise<void> {
  await threadMessage(page, text).locator('.bubble').click();
  await page.getByLabel(`React with ${reactionLabel}`).click();
  await acceptAppRelayFallbackIfVisible(page);
}

export async function waitForReaction(
  page: Page,
  reactionLabel: RegExp,
  options: {
    chatId?: string;
  } = {}
): Promise<void> {
  const reaction = page.getByLabel(reactionLabel).first();

  try {
    await expect(reaction).toBeVisible({ timeout: 12_000 });
    return;
  } catch {
    await refreshSession(page, options.chatId);
  }

  await expect(reaction).toBeVisible({ timeout: 12_000 });
}

export async function deleteMessage(page: Page, text: string): Promise<void> {
  await threadMessage(page, text).locator('.bubble').click();
  await page.getByText('Delete', { exact: true }).click();
}

export async function waitForDeletedMessageState(
  page: Page,
  text: string,
  options: {
    chatId?: string;
  } = {}
): Promise<void> {
  await waitForThreadMessage(page, text, options);
  await threadMessage(page, text).locator('.bubble').click();
  await expect(page.getByText('View Deleted Message', { exact: true })).toBeVisible({
    timeout: 12_000,
  });
  await page.keyboard.press('Escape');
}

export async function logoutFromSettings(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const bridge = window.__appE2E__;
    if (!bridge) {
      throw new Error('E2E bridge is not available.');
    }

    await bridge.logout();
  });
  await expect.poll(() => page.url(), { timeout: 30_000 }).toMatch(/#\/(auth|login)/);
  await expect(page.getByText('Welcome')).toBeVisible({ timeout: 30_000 });
}

export async function expectBrowserStorageToBeEmpty(page: Page): Promise<void> {
  const storageSnapshot = await page.evaluate(async () => {
    const localStorageKeys = Array.from({ length: window.localStorage.length }, (_, index) =>
      window.localStorage.key(index)
    ).filter((key): key is string => typeof key === 'string' && key.length > 0);

    const sessionStorageKeys = Array.from({ length: window.sessionStorage.length }, (_, index) =>
      window.sessionStorage.key(index)
    ).filter((key): key is string => typeof key === 'string' && key.length > 0);

    const indexedDbFactory = window.indexedDB as IDBFactory & {
      databases?: () => Promise<Array<{ name?: string | null }>>;
    };
    const indexedDbNames =
      typeof indexedDbFactory.databases === 'function'
        ? (await indexedDbFactory.databases()).flatMap((database) => {
            const name = typeof database?.name === 'string' ? database.name.trim() : '';
            return name ? [name] : [];
          })
        : [];

    return {
      indexedDbNames,
      localStorageKeys,
      sessionStorageKeys,
    };
  });

  expect(storageSnapshot.localStorageKeys).toEqual([]);
  expect(storageSnapshot.sessionStorageKeys).toEqual([]);
  expect(storageSnapshot.indexedDbNames).toEqual([]);
}

export async function blockFirstRequest(page: Page): Promise<void> {
  await page.getByTestId('chat-request-block-button').first().click();
  await expect(page.getByTestId('chat-request-item')).toHaveCount(0);
}

export async function deleteFirstRequest(page: Page): Promise<void> {
  await page.getByTestId('chat-request-delete-button').first().click();
  await expect(page.getByTestId('chat-request-item')).toHaveCount(0);
}

export async function addGroupMemberAndPublish(page: Page, memberPublicKey: string): Promise<void> {
  await addGroupMembersAndPublish(page, [memberPublicKey]);
}

export async function addGroupMembersAndPublish(
  page: Page,
  memberPublicKeys: string[]
): Promise<void> {
  await page.getByTestId('contact-profile-members-tab').click();
  const memberInput = page.getByLabel('Member', { exact: true });
  const addButton = page.getByTestId('group-member-add-button');
  await expect(memberInput).toBeVisible();

  for (const memberPublicKey of memberPublicKeys) {
    await memberInput.fill(memberPublicKey);
    await expect(addButton).toBeEnabled();
    await addButton.click();
    await expect(memberInput).toHaveValue('', { timeout: 12_000 });
  }

  await expect(
    page.getByText('You must publish these changes for them to take effect')
  ).toBeVisible();
  await page.getByTestId('group-members-publish-button').click();
  await expect(
    page.getByText('You must publish these changes for them to take effect')
  ).toHaveCount(0);

  for (const memberPublicKey of memberPublicKeys) {
    await expect(page.getByText(memberPublicKey.slice(0, 32))).toBeVisible();
  }
}

export async function removeGroupMemberAndPublish(
  page: Page,
  memberPublicKey: string
): Promise<void> {
  await page.getByTestId('contact-profile-members-tab').click();
  await expect(groupMemberListItem(page, memberPublicKey)).toBeVisible();
  await groupMemberListItem(page, memberPublicKey).getByLabel('Remove member').click();
  await expect(
    page.getByText('You must publish these changes for them to take effect')
  ).toBeVisible();
  await page.getByTestId('group-members-publish-button').click();
  await expect(
    page.getByText('You must publish these changes for them to take effect')
  ).toHaveCount(0);
  await expect(groupMemberListItem(page, memberPublicKey)).toHaveCount(0);
}

export async function openGroupEpochsTab(page: Page): Promise<void> {
  await page.getByTestId('contact-profile-epochs-tab').click();
  await expect(page.locator('.profile-epochs')).toBeVisible();
}

export async function openGroupRelaysTab(page: Page): Promise<void> {
  await page.getByTestId('contact-profile-relays-tab').click();
  await expect(page.locator('.profile-group-relays')).toBeVisible();
}

export async function openAppRelaysSettings(page: Page): Promise<void> {
  await page.goto('/#/settings/relays');
  await expect(page.getByTestId('settings-relays-app-tab')).toBeVisible();
  await page.getByTestId('settings-relays-app-tab').click();
  await expect(
    page
      .getByTestId('settings-relays-app-panel')
      .getByTestId('relay-editor-new-relay-input')
      .first()
  ).toBeVisible();
}

export async function removeRelayFromSettings(page: Page, relayUrl: string): Promise<void> {
  const relayItem = page
    .getByTestId('settings-relays-app-panel')
    .locator('.relay-expansion-item')
    .filter({ hasText: relayUrl })
    .first();
  await expect(relayItem).toBeVisible();
  await relayItem.getByTestId('relay-editor-delete-relay-button').click();
  await expect(relayItem).toHaveCount(0);
}

export async function publishOwnProfile(
  page: Page,
  options: {
    name: string;
    about?: string;
  }
): Promise<void> {
  await page.goto('/#/settings/profile');
  const nameInput = page.getByPlaceholder('Your profile name').first();
  await expect(nameInput).toBeVisible();
  await nameInput.fill(options.name);

  if (typeof options.about === 'string') {
    await page.getByPlaceholder('Short bio').first().fill(options.about);
  }

  await page.getByTestId('contact-profile-publish-button').click();
  await expect(page.getByText('Profile metadata published.', { exact: true })).toBeVisible({
    timeout: 12_000,
  });
}

export async function readGroupEpochNumbers(page: Page): Promise<number[]> {
  const epochCells = page.locator('.profile-epochs-table tbody tr td:first-child');
  const count = await epochCells.count();
  if (count === 0) {
    return [];
  }

  const epochNumbers: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const value = Number((await epochCells.nth(index).textContent())?.trim() ?? Number.NaN);
    if (Number.isInteger(value) && value >= 0) {
      epochNumbers.push(value);
    }
  }

  return epochNumbers;
}

export async function waitForNoThreadMessage(
  page: Page,
  text: string,
  options: {
    chatId?: string;
    timeoutMs?: number;
    refresh?: boolean;
  } = {}
): Promise<void> {
  const messageLocator = threadMessages(page, text);
  const timeoutMs =
    typeof options.timeoutMs === 'number' && Number.isFinite(options.timeoutMs)
      ? Math.max(1_000, Math.floor(options.timeoutMs))
      : 4_000;

  await expect(messageLocator).toHaveCount(0, { timeout: timeoutMs });

  if (options.refresh === false) {
    return;
  }

  await refreshSession(page, options.chatId);
  await expect(messageLocator).toHaveCount(0, { timeout: timeoutMs });
}

export async function waitForThreadMessageCount(
  page: Page,
  text: string,
  count: number,
  options: {
    chatId?: string;
  } = {}
): Promise<void> {
  await waitForThreadMessage(page, text, options);
  await expect(threadMessages(page, text)).toHaveCount(count);
}

export async function removeGroupRelayAndPublish(page: Page, relayUrl: string): Promise<void> {
  await openGroupRelaysTab(page);
  const relayItem = page.locator('.relay-expansion-item').filter({ hasText: relayUrl }).first();
  await expect(relayItem).toBeVisible();
  await relayItem.getByLabel('Delete relay').click();
  await expect(relayItem).toHaveCount(0);
  await page
    .locator('.profile-group-relays')
    .getByRole('button', { name: 'Publish', exact: true })
    .click();
}

export async function rotateGroupEpoch(
  page: Page,
  groupPublicKey: string,
  memberPublicKeys: string[],
  relayUrls: string[] = [E2E_RELAY_URL]
): Promise<void> {
  await page.evaluate(
    async ({ nextGroupPublicKey, nextMemberPublicKeys, nextRelayUrls }) => {
      const bridge = window.__appE2E__;
      if (!bridge) {
        throw new Error('E2E bridge is not available.');
      }

      await bridge.rotateGroupEpoch({
        groupPublicKey: nextGroupPublicKey,
        memberPublicKeys: nextMemberPublicKeys,
        relayUrls: nextRelayUrls,
      });
    },
    {
      nextGroupPublicKey: groupPublicKey,
      nextMemberPublicKeys: memberPublicKeys,
      nextRelayUrls: relayUrls,
    }
  );
}

export async function waitForNoRequests(page: Page): Promise<void> {
  await page.goto('/#/chats/requests');

  try {
    await expect(page.getByText('No pending requests', { exact: true })).toBeVisible({
      timeout: 12_000,
    });
  } catch {
    await refreshSession(page);
    await page.goto('/#/chats/requests');
  }

  await expect(page.getByTestId('chat-request-item')).toHaveCount(0);
  await expect(page.getByText('No pending requests', { exact: true })).toBeVisible();
}

export async function establishAcceptedDirectChat(
  sender: BootstrappedUser,
  recipient: BootstrappedUser
): Promise<void> {
  const openingMessage = `acceptance-open-${Date.now()}`;
  const replyMessage = `acceptance-reply-${Date.now()}`;

  await openDirectChatFromIdentifier(
    sender.page,
    recipient.session.publicKey,
    recipient.account.displayName
  );
  await sendMessage(sender.page, openingMessage, {
    chatId: recipient.session.publicKey,
  });
  await openRequests(recipient.page);
  await acceptFirstRequest(recipient.page);
  await navigateToChat(recipient.page, sender.session.publicKey);
  await sendMessage(recipient.page, replyMessage, {
    chatId: sender.session.publicKey,
  });
  await waitForThreadMessage(sender.page, replyMessage, {
    chatId: recipient.session.publicKey,
  });
}
