import { expect, type Page } from '@playwright/test';

export const LOCAL_RELAY_URLS = [
  process.env.E2E_RELAY_URL ?? 'ws://127.0.0.1:7000',
  process.env.E2E_RELAY_URL_TWO ?? 'ws://127.0.0.1:7001',
];

export const TEST_PRIVATE_KEY = '17109060832c2b13b1280c20c929e17a8b013e1dcb770b9d83ca511d9626e5cb';

export async function primeLocalRelayStorage(page: Page): Promise<void> {
  await page.addInitScript((relayUrls) => {
    const relayEntries = relayUrls.map((url) => ({
      url,
      read: true,
      write: true,
    }));

    window.localStorage.setItem('nostr-scroll:app-relays', JSON.stringify(relayEntries));
    window.localStorage.setItem('nostr-scroll:my-relays', JSON.stringify(relayEntries));
    window.localStorage.setItem(
      'nostr-scroll:ui-state',
      JSON.stringify({
        homeTimelineTab: 'all',
        profileTabs: {},
      })
    );
  }, LOCAL_RELAY_URLS);
}

export async function loginWithPrivateKey(
  page: Page,
  privateKey = TEST_PRIVATE_KEY
): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-open-button').click();
  await page.getByTestId('login-key-method-button').click();
  await page.getByRole('textbox', { name: 'Private Key (nsec or hex)' }).fill(privateKey);
  await page.getByTestId('login-key-submit').click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByTestId('post-composer')).toBeVisible();
}

export async function composePost(page: Page, content: string): Promise<void> {
  await page.getByPlaceholder("What's happening?").fill(content);
  await page.getByTestId('post-composer-submit').click();
}

export async function expectFeedPost(page: Page, content: string): Promise<void> {
  await expect(
    page.locator('[data-testid^="post-card-"]', {
      hasText: content,
    })
  ).toBeVisible({
    timeout: 20_000,
  });
}
