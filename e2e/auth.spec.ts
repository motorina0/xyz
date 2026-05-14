import { expect, test } from '@playwright/test';
import {
  acceptFirstRequest,
  bootstrapExtensionUser,
  bootstrapUser,
  disposeUsers,
  E2E_RELAY_URL,
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
  await context.addInitScript((relayUrl) => {
    window.localStorage.setItem(
      'relays',
      JSON.stringify([{ url: relayUrl, read: true, write: true }])
    );
  }, E2E_RELAY_URL);
  const page = await context.newPage();

  try {
    await page.goto('/#/register');
    await expect(page.getByRole('button', { name: 'Login Now', exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole('button', { name: 'Login Now', exact: true }).click();

    await expect(
      page.locator(
        '[data-testid="auth-onboarding-continue-button"], [data-testid="auth-onboarding-skip-button"]'
      )
    ).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/#\/register$/);

    await page.getByTestId('auth-onboarding-skip-button').click();
    await page
      .getByRole('button', { name: 'Not now', exact: true })
      .click({ timeout: 3_000 })
      .catch(() => undefined);
    await expect.poll(() => page.url(), { timeout: 30_000 }).toMatch(/#\/chats$/);
  } finally {
    await context.close();
  }
});

test('NIP-07 login can establish a direct chat and receive a reply', async ({ browser }) => {
  const alice = await bootstrapExtensionUser(browser, TEST_ACCOUNTS.nip07Alice);
  const bob = await bootstrapUser(browser, TEST_ACCOUNTS.nip07Bob);

  try {
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
