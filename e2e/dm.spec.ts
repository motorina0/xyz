import { expect, test } from '@playwright/test';
import {
  acceptFirstRequest,
  bootstrapUser,
  deleteFirstRequest,
  deleteMessage,
  disposeUsers,
  E2E_DUAL_RELAY_URLS,
  establishAcceptedDirectChat,
  expectBrowserStorageToBeEmpty,
  expectNoUnexpectedBrowserErrors,
  logoutFromSettings,
  navigateToChat,
  openDirectChatFromIdentifier,
  openRequests,
  reactToMessage,
  reloadAndWaitForApp,
  sendMessage,
  TEST_ACCOUNTS,
  waitForChatPreview,
  waitForChatReactionBadge,
  waitForDeletedMessageState,
  waitForNoRequests,
  waitForReaction,
  waitForReactionCount,
  waitForThreadMessage,
  waitForThreadMessageCount,
} from './helpers';

test.describe.configure({ mode: 'serial' });

test('first-contact DM becomes a request, can be accepted, and supports reply', async ({
  browser,
}) => {
  const alice = await bootstrapUser(browser, TEST_ACCOUNTS.requestAlice);
  const bob = await bootstrapUser(browser, TEST_ACCOUNTS.requestBob);

  try {
    const openingMessage = `hello-from-alice-${Date.now()}`;
    const replyMessage = `reply-from-bob-${Date.now()}`;

    await openDirectChatFromIdentifier(
      alice.page,
      bob.session.publicKey,
      TEST_ACCOUNTS.requestBob.displayName
    );
    await sendMessage(alice.page, openingMessage, {
      chatId: bob.session.publicKey,
    });

    await openRequests(bob.page);
    await expect(bob.page.getByTestId('chat-request-item')).toContainText(openingMessage);
    await acceptFirstRequest(bob.page);

    await navigateToChat(bob.page, alice.session.publicKey);
    await sendMessage(bob.page, replyMessage, {
      chatId: alice.session.publicKey,
    });
    await waitForThreadMessage(alice.page, replyMessage, {
      chatId: bob.session.publicKey,
    });
    await expectNoUnexpectedBrowserErrors([alice, bob]);
  } finally {
    await disposeUsers(alice, bob);
  }
});

test('hard reload restores accepted DM chat list, unread count, and thread history', async ({
  browser,
}) => {
  const alice = await bootstrapUser(browser, TEST_ACCOUNTS.startupRestoreAlice);
  const bob = await bootstrapUser(browser, TEST_ACCOUNTS.startupRestoreBob);

  try {
    const firstMessage = `startup-restore-one-${Date.now()}`;
    const secondMessage = `startup-restore-two-${Date.now()}`;
    const thirdMessage = `startup-restore-three-${Date.now()}`;
    const replyAfterReload = `startup-restore-reply-${Date.now()}`;

    await establishAcceptedDirectChat(alice, bob);

    await bob.page.goto('/#/chats');
    await sendMessage(alice.page, firstMessage, {
      chatId: bob.session.publicKey,
    });
    await sendMessage(alice.page, secondMessage, {
      chatId: bob.session.publicKey,
    });
    await sendMessage(alice.page, thirdMessage, {
      chatId: bob.session.publicKey,
    });

    await waitForChatPreview(bob.page, thirdMessage);

    await bob.page.getByTestId('chat-item').first().click();
    await waitForThreadMessage(bob.page, firstMessage, {
      chatId: alice.session.publicKey,
    });
    await waitForThreadMessage(bob.page, secondMessage, {
      chatId: alice.session.publicKey,
    });
    await waitForThreadMessage(bob.page, thirdMessage, {
      chatId: alice.session.publicKey,
    });
    await expect(
      bob
        .page
        .getByTestId('chat-item')
        .filter({ hasText: TEST_ACCOUNTS.startupRestoreAlice.displayName })
        .locator('.chat-item__meta .q-badge')
    ).toHaveCount(0);

    await reloadAndWaitForApp(bob.page);
    await expect(bob.page).toHaveURL(new RegExp(`#\\/chats\\/${alice.session.publicKey}$`));
    await waitForThreadMessage(bob.page, thirdMessage, {
      chatId: alice.session.publicKey,
    });
    await expect(
      bob
        .page
        .getByTestId('chat-item')
        .filter({ hasText: TEST_ACCOUNTS.startupRestoreAlice.displayName })
        .locator('.chat-item__meta .q-badge')
    ).toHaveCount(0);

    await sendMessage(bob.page, replyAfterReload, {
      chatId: alice.session.publicKey,
    });
    await navigateToChat(alice.page, bob.session.publicKey);
    await waitForThreadMessage(alice.page, replyAfterReload, {
      chatId: bob.session.publicKey,
    });
    await expectNoUnexpectedBrowserErrors([alice, bob]);
  } finally {
    await disposeUsers(alice, bob);
  }
});

test('accepted DM restores thread history and keeps working after both users restart', async ({
  browser,
}) => {
  let alice = await bootstrapUser(browser, TEST_ACCOUNTS.dmRestartAlice);
  let bob = await bootstrapUser(browser, TEST_ACCOUNTS.dmRestartBob);

  try {
    const beforeRestartMessage = `dm-before-restart-${Date.now()}`;
    const afterRestartReply = `dm-after-restart-${Date.now()}`;

    await establishAcceptedDirectChat(alice, bob);
    await sendMessage(alice.page, beforeRestartMessage, {
      chatId: bob.session.publicKey,
    });
    await waitForThreadMessage(bob.page, beforeRestartMessage, {
      chatId: alice.session.publicKey,
    });

    await disposeUsers(alice, bob);
    alice = await bootstrapUser(browser, TEST_ACCOUNTS.dmRestartAlice);
    bob = await bootstrapUser(browser, TEST_ACCOUNTS.dmRestartBob);

    await navigateToChat(bob.page, alice.session.publicKey);
    await waitForThreadMessage(bob.page, beforeRestartMessage, {
      chatId: alice.session.publicKey,
    });
    await sendMessage(bob.page, afterRestartReply, {
      chatId: alice.session.publicKey,
    });
    await navigateToChat(alice.page, bob.session.publicKey);
    await waitForThreadMessage(alice.page, afterRestartReply, {
      chatId: bob.session.publicKey,
    });
    await expectNoUnexpectedBrowserErrors([alice, bob]);
  } finally {
    await disposeUsers(alice, bob);
  }
});

test('reactions surface in the chat list and deleted messages stay deleted after reloads', async ({
  browser,
}) => {
  const alice = await bootstrapUser(browser, TEST_ACCOUNTS.reactionReloadAlice);
  const bob = await bootstrapUser(browser, TEST_ACCOUNTS.reactionReloadBob);

  try {
    const targetMessage = `reaction-reload-${Date.now()}`;

    await establishAcceptedDirectChat(alice, bob);
    await sendMessage(alice.page, targetMessage, {
      chatId: bob.session.publicKey,
    });
    await waitForThreadMessage(bob.page, targetMessage, {
      chatId: alice.session.publicKey,
    });

    await alice.page.goto('/#/chats');
    await reactToMessage(bob.page, targetMessage);
    await waitForChatReactionBadge(alice.page, 1);

    await alice.page.getByTestId('chat-item').first().click();
    await waitForReaction(alice.page, /thumbs up reaction/i, {
      chatId: bob.session.publicKey,
    });
    await alice.page.goto('/#/chats');
    await expect(alice.page.locator('.chat-item__reaction-badge')).toHaveCount(0);

    await navigateToChat(alice.page, bob.session.publicKey);
    await reloadAndWaitForApp(alice.page);
    await expect(alice.page).toHaveURL(new RegExp(`#\\/chats\\/${bob.session.publicKey}$`));
    await waitForReaction(alice.page, /thumbs up reaction/i, {
      chatId: bob.session.publicKey,
    });

    await deleteMessage(alice.page, targetMessage);
    await reloadAndWaitForApp(bob.page);
    await expect(bob.page).toHaveURL(new RegExp(`#\\/chats\\/${alice.session.publicKey}$`));
    await waitForDeletedMessageState(bob.page, targetMessage, {
      chatId: alice.session.publicKey,
    });
    await expectNoUnexpectedBrowserErrors([alice, bob]);
  } finally {
    await disposeUsers(alice, bob);
  }
});

test('deleting a first-contact DM request keeps later messages in requests instead of accepted chats', async ({
  browser,
}) => {
  const alice = await bootstrapUser(browser, TEST_ACCOUNTS.blockAlice);
  let bob = await bootstrapUser(browser, TEST_ACCOUNTS.blockBob);

  try {
    const openingMessage = `deleted-request-open-${Date.now()}`;
    const followupMessage = `deleted-request-followup-${Date.now()}`;

    await openDirectChatFromIdentifier(
      alice.page,
      bob.session.publicKey,
      TEST_ACCOUNTS.blockBob.displayName
    );
    await sendMessage(alice.page, openingMessage, {
      chatId: bob.session.publicKey,
    });

    await openRequests(bob.page);
    await expect(bob.page.getByTestId('chat-request-item')).toContainText(openingMessage);
    await deleteFirstRequest(bob.page);
    await waitForNoRequests(bob.page);

    await sendMessage(alice.page, followupMessage, {
      chatId: bob.session.publicKey,
    });
    await openRequests(bob.page);
    await expect(bob.page.getByTestId('chat-request-item')).toContainText(followupMessage);
    await bob.page.goto('/#/chats');
    await expect(bob.page.getByTestId('chat-item')).toHaveCount(0);

    await bob.context.close();
    bob = await bootstrapUser(browser, TEST_ACCOUNTS.blockBob);
    await openRequests(bob.page);
    await expect(bob.page.getByTestId('chat-request-item')).toContainText(followupMessage);
    await expectNoUnexpectedBrowserErrors([alice, bob]);
  } finally {
    await disposeUsers(alice, bob);
  }
});

test('accepted DMs catch up after the recipient reconnects without duplicates', async ({
  browser,
}) => {
  const alice = await bootstrapUser(browser, TEST_ACCOUNTS.catchupAlice);
  let bob = await bootstrapUser(browser, TEST_ACCOUNTS.catchupBob);

  try {
    const offlineMessageOne = `offline-catchup-one-${Date.now()}`;
    const offlineMessageTwo = `offline-catchup-two-${Date.now()}`;
    const bobPublicKey = bob.session.publicKey;

    await establishAcceptedDirectChat(alice, bob);

    await bob.context.close();

    await sendMessage(alice.page, offlineMessageOne, {
      chatId: bobPublicKey,
    });
    await sendMessage(alice.page, offlineMessageTwo, {
      chatId: bobPublicKey,
    });

    bob = await bootstrapUser(browser, TEST_ACCOUNTS.catchupBob);
    await navigateToChat(bob.page, alice.session.publicKey);
    await waitForThreadMessageCount(bob.page, offlineMessageOne, 1, {
      chatId: alice.session.publicKey,
    });
    await waitForThreadMessageCount(bob.page, offlineMessageTwo, 1, {
      chatId: alice.session.publicKey,
    });
    await expectNoUnexpectedBrowserErrors([alice, bob]);
  } finally {
    await disposeUsers(alice, bob);
  }
});

test('accepted DM supports reactions, deletion, and logout', async ({ browser }) => {
  const alice = await bootstrapUser(browser, TEST_ACCOUNTS.actionsAlice);
  const bob = await bootstrapUser(browser, TEST_ACCOUNTS.actionsBob);

  try {
    const targetMessage = `reaction-delete-${Date.now()}`;

    await establishAcceptedDirectChat(alice, bob);
    await sendMessage(alice.page, targetMessage, {
      chatId: bob.session.publicKey,
    });
    await waitForThreadMessage(bob.page, targetMessage, {
      chatId: alice.session.publicKey,
    });

    await reactToMessage(bob.page, targetMessage);
    await waitForReaction(alice.page, /thumbs up reaction/i, {
      chatId: bob.session.publicKey,
    });

    await deleteMessage(alice.page, targetMessage);
    await waitForDeletedMessageState(bob.page, targetMessage, {
      chatId: alice.session.publicKey,
    });

    await logoutFromSettings(alice.page);
    await expectBrowserStorageToBeEmpty(alice.page);
    await expectNoUnexpectedBrowserErrors([alice, bob]);
  } finally {
    await disposeUsers(alice, bob);
  }
});

test('duplicate delivery across multiple relays does not duplicate messages, reactions, or deletions', async ({
  browser,
}) => {
  const alice = await bootstrapUser(browser, TEST_ACCOUNTS.dedupeAlice, {
    relayUrls: E2E_DUAL_RELAY_URLS,
  });
  const bob = await bootstrapUser(browser, TEST_ACCOUNTS.dedupeBob, {
    relayUrls: E2E_DUAL_RELAY_URLS,
  });

  try {
    const targetMessage = `dedupe-target-${Date.now()}`;

    await establishAcceptedDirectChat(alice, bob);
    await sendMessage(alice.page, targetMessage, {
      chatId: bob.session.publicKey,
    });
    await navigateToChat(bob.page, alice.session.publicKey);
    await waitForThreadMessageCount(bob.page, targetMessage, 1, {
      chatId: alice.session.publicKey,
    });

    await reloadAndWaitForApp(bob.page);
    await navigateToChat(bob.page, alice.session.publicKey);
    await waitForThreadMessageCount(bob.page, targetMessage, 1, {
      chatId: alice.session.publicKey,
    });

    await reactToMessage(bob.page, targetMessage);
    await waitForReaction(alice.page, /thumbs up reaction/i, {
      chatId: bob.session.publicKey,
    });
    await reloadAndWaitForApp(alice.page);
    await navigateToChat(alice.page, bob.session.publicKey);
    await waitForReactionCount(alice.page, /thumbs up reaction/i, 1);

    await deleteMessage(alice.page, targetMessage);
    await reloadAndWaitForApp(bob.page);
    await navigateToChat(bob.page, alice.session.publicKey);
    await waitForDeletedMessageState(bob.page, targetMessage, {
      chatId: alice.session.publicKey,
    });
    await waitForThreadMessageCount(bob.page, targetMessage, 1, {
      chatId: alice.session.publicKey,
    });
    await expectNoUnexpectedBrowserErrors([alice, bob]);
  } finally {
    await disposeUsers(alice, bob);
  }
});
