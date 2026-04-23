import { test } from '@playwright/test';
import {
  composePost,
  expectFeedPost,
  loginWithPrivateKey,
  primeLocalRelayStorage,
} from './helpers';

test('can sign in, publish a note, and restore it from local relays', async ({ page }) => {
  await primeLocalRelayStorage(page);
  await loginWithPrivateKey(page);

  const content = `nostr-scroll smoke ${Date.now()}`;

  await composePost(page, content);
  await expectFeedPost(page, content);

  await page.reload();
  await expectFeedPost(page, content);
});
