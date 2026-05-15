import { expect, test } from '@playwright/test';
import {
  acceptFirstRequest,
  bootstrapExtensionUser,
  bootstrapUser,
  disposeUsers,
  E2E_RELAY_URL,
  E2E_RELAY_URL_TWO,
  expectBrowserStorageToBeEmpty,
  expectNoUnexpectedBrowserErrors,
  logoutFromSettings,
  navigateToChat,
  openDirectChatFromIdentifier,
  openRequests,
  sendMessage,
  TEST_ACCOUNTS,
  waitForThreadMessage,
} from './helpers';

test.describe.configure({ mode: 'serial' });

test('generated key login opens profile onboarding before chats', async ({ browser }) => {
  const context = await browser.newContext();
  await context.addInitScript(
    (relayUrls: string[]) => {
      window.localStorage.setItem(
        'relays',
        JSON.stringify(relayUrls.map((url) => ({ url, read: true, write: true })))
      );
    },
    [E2E_RELAY_URL, E2E_RELAY_URL_TWO]
  );
  const page = await context.newPage();

  try {
    await page.goto('/#/register');
    await expect(page.getByRole('button', { name: 'Login Now', exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole('button', { name: 'Login Now', exact: true }).click();

    await expect(page.getByTestId('auth-onboarding-relays-next-button')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId('auth-onboarding-logout-button')).toBeVisible();
    await expect(page.getByTestId('auth-onboarding-relays-next-button')).toHaveText('Next');
    await expect(page).toHaveURL(/#\/register$/);

    const secondRelayCheckbox = page.getByRole('checkbox', {
      name: `Use ${E2E_RELAY_URL_TWO} when searching for profile`,
    });
    await expect(secondRelayCheckbox).toBeChecked({ timeout: 10_000 });
    await secondRelayCheckbox.click();
    await expect(secondRelayCheckbox).not.toBeChecked();

    await page.getByTestId('auth-onboarding-relays-next-button').click();
    await expect(page.getByTestId('auth-onboarding-profile-name-input')).toBeVisible();
    await expect(page.getByTestId('auth-onboarding-profile-about-input')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back' })).toBeVisible();
    await expect(
      page.getByRole('checkbox', { name: 'Use selected relays for my profile' })
    ).toBeChecked();
    await expect(page.getByTestId('auth-onboarding-profile-start-button')).toBeEnabled();
    await page.getByTestId('auth-onboarding-profile-start-button').click();
    await page
      .getByRole('button', { name: 'Not now', exact: true })
      .click({ timeout: 3_000 })
      .catch(() => undefined);
    await expect.poll(() => page.url(), { timeout: 30_000 }).toMatch(/#\/chats$/);

    const storedRelayLists = await page.evaluate(() => {
      const appRelaysValue = window.localStorage.getItem('relays');
      const nip65RelaysValue = window.localStorage.getItem('nip65_relays');
      return {
        appRelays: appRelaysValue ? (JSON.parse(appRelaysValue) as Array<{ url: string }>) : [],
        nip65Relays: nip65RelaysValue
          ? (JSON.parse(nip65RelaysValue) as Array<{ url: string }>)
          : [],
      };
    });
    expect(storedRelayLists.appRelays.map((relay) => relay.url)).toEqual([
      new URL(E2E_RELAY_URL).href,
    ]);
    expect(storedRelayLists.nip65Relays.map((relay) => relay.url)).toEqual([
      new URL(E2E_RELAY_URL).href,
    ]);
  } finally {
    await context.close();
  }
});

test('NIP-07 login can establish a direct chat and receive a reply', async ({ browser }) => {
  const alice = await bootstrapExtensionUser(browser, TEST_ACCOUNTS.nip07Alice);
  const bob = await bootstrapUser(browser, TEST_ACCOUNTS.nip07Bob);

  try {
    await alice.page.goto('/#/auth');
    await expect.poll(() => alice.page.url(), { timeout: 10_000 }).toMatch(/#\/chats$/);
    await alice.page.goto('/#/register');
    await expect.poll(() => alice.page.url(), { timeout: 10_000 }).toMatch(/#\/chats$/);

    const openingMessage = `nip07-open-${Date.now()}`;
    const replyMessage = `nip07-reply-${Date.now()}`;

    await openDirectChatFromIdentifier(
      alice.page,
      bob.session.publicKey,
      TEST_ACCOUNTS.nip07Bob.displayName
    );
    await sendMessage(alice.page, openingMessage, {
      chatId: bob.session.publicKey,
    });

    await openRequests(bob.page);
    await acceptFirstRequest(bob.page);
    await navigateToChat(bob.page, alice.session.publicKey);
    await sendMessage(bob.page, replyMessage, {
      chatId: alice.session.publicKey,
    });

    await navigateToChat(alice.page, bob.session.publicKey);
    await waitForThreadMessage(alice.page, replyMessage, {
      chatId: bob.session.publicKey,
    });
    await logoutFromSettings(alice.page);
    await expectBrowserStorageToBeEmpty(alice.page);
    await expectNoUnexpectedBrowserErrors([alice, bob]);
  } finally {
    await disposeUsers(alice, bob);
  }
});
