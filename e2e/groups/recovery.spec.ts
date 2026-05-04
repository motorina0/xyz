import { expect, test } from '@playwright/test';
import {
  acceptFirstRequest,
  addGroupMemberAndPublish,
  bootstrapUser,
  createGroup,
  disposeUsers,
  E2E_RELAY_URL,
  expectNoUnexpectedBrowserErrors,
  navigateToChat,
  openGroupContact,
  openGroupEpochsTab,
  openRequests,
  readGroupEpochNumbers,
  reloadAndWaitForApp,
  removeStoredMessageByEventId,
  replyToMessage,
  rotateGroupEpoch,
  sendMessage,
  sendMessagesViaBridge,
  TEST_ACCOUNTS,
  threadMessage,
  waitForNoThreadMessage,
  waitForThreadMessage,
} from '../helpers';

test.describe.configure({ mode: 'serial' });

test('group delivery still works after both users restart', async ({ browser }) => {
  let alice = await bootstrapUser(browser, TEST_ACCOUNTS.groupRestartAlice);
  let bob = await bootstrapUser(browser, TEST_ACCOUNTS.groupRestartBob);

  try {
    const groupPublicKey = await createGroup(alice.page, {
      name: `Restart Group ${Date.now()}`,
      about: 'Restart and restore coverage',
    });
    const beforeRestartMessage = `before-restart-${Date.now()}`;
    const afterRestartMessage = `after-restart-${Date.now()}`;
    const restartReplyMessage = `reply-after-restart-${Date.now()}`;

    await addGroupMemberAndPublish(alice.page, bob.session.publicKey);

    await openRequests(bob.page);
    await expect(bob.page.getByTestId('chat-request-item')).toContainText('Group invitation');
    await acceptFirstRequest(bob.page);

    await navigateToChat(alice.page, groupPublicKey);
    await sendMessage(alice.page, beforeRestartMessage, {
      chatId: groupPublicKey,
    });
    await navigateToChat(bob.page, groupPublicKey);
    await waitForThreadMessage(bob.page, beforeRestartMessage, {
      chatId: groupPublicKey,
    });

    await disposeUsers(alice, bob);
    alice = await bootstrapUser(browser, TEST_ACCOUNTS.groupRestartAlice);
    bob = await bootstrapUser(browser, TEST_ACCOUNTS.groupRestartBob);

    await navigateToChat(alice.page, groupPublicKey);
    await sendMessage(alice.page, afterRestartMessage, {
      chatId: groupPublicKey,
    });
    await navigateToChat(bob.page, groupPublicKey);
    await waitForThreadMessage(bob.page, afterRestartMessage, {
      chatId: groupPublicKey,
    });
    await sendMessage(bob.page, restartReplyMessage, {
      chatId: groupPublicKey,
    });
    await navigateToChat(alice.page, groupPublicKey);
    await waitForThreadMessage(alice.page, restartReplyMessage, {
      chatId: groupPublicKey,
    });
    await expectNoUnexpectedBrowserErrors([alice, bob]);
  } finally {
    await disposeUsers(alice, bob);
  }
});

test('member restart restores group history from both the current and prior epochs', async ({
  browser,
}) => {
  const alice = await bootstrapUser(browser, TEST_ACCOUNTS.groupEpochHistoryAlice);
  let bob = await bootstrapUser(browser, TEST_ACCOUNTS.groupEpochHistoryBob);

  try {
    const groupPublicKey = await createGroup(alice.page, {
      name: `Epoch History Group ${Date.now()}`,
      about: 'Historical epoch restore coverage',
    });
    const epochZeroMessage = `epoch-zero-message-${Date.now()}`;
    const epochOneMessage = `epoch-one-message-${Date.now()}`;
    const restartReplyMessage = `epoch-history-reply-${Date.now()}`;

    await addGroupMemberAndPublish(alice.page, bob.session.publicKey);
    await openRequests(bob.page);
    await expect(bob.page.getByTestId('chat-request-item')).toContainText('Group invitation');
    await acceptFirstRequest(bob.page);

    await navigateToChat(alice.page, groupPublicKey);
    await sendMessage(alice.page, epochZeroMessage, {
      chatId: groupPublicKey,
    });
    await navigateToChat(bob.page, groupPublicKey);
    await waitForThreadMessage(bob.page, epochZeroMessage, {
      chatId: groupPublicKey,
    });

    await rotateGroupEpoch(alice.page, groupPublicKey, [bob.session.publicKey], [E2E_RELAY_URL]);

    await navigateToChat(alice.page, groupPublicKey);
    await sendMessage(alice.page, epochOneMessage, {
      chatId: groupPublicKey,
    });
    await navigateToChat(bob.page, groupPublicKey);
    await waitForThreadMessage(bob.page, epochOneMessage, {
      chatId: groupPublicKey,
    });

    await disposeUsers(bob);
    bob = await bootstrapUser(browser, TEST_ACCOUNTS.groupEpochHistoryBob);

    await navigateToChat(bob.page, groupPublicKey);
    await waitForThreadMessage(bob.page, epochZeroMessage, {
      chatId: groupPublicKey,
    });
    await waitForThreadMessage(bob.page, epochOneMessage, {
      chatId: groupPublicKey,
    });

    await openGroupContact(bob.page, groupPublicKey);
    await openGroupEpochsTab(bob.page);
    await expect.poll(() => readGroupEpochNumbers(bob.page), { timeout: 12_000 }).toEqual([1, 0]);

    await navigateToChat(bob.page, groupPublicKey);
    await sendMessage(bob.page, restartReplyMessage, {
      chatId: groupPublicKey,
    });
    await navigateToChat(alice.page, groupPublicKey);
    await waitForThreadMessage(alice.page, restartReplyMessage, {
      chatId: groupPublicKey,
    });
    await expectNoUnexpectedBrowserErrors([alice, bob]);
  } finally {
    await disposeUsers(alice, bob);
  }
});

test('missing prior-epoch reply targets are restored after restart', async ({ browser }) => {
  test.slow();

  const owner = await bootstrapUser(browser, TEST_ACCOUNTS.groupReplyRepairOwner);
  const bob = await bootstrapUser(browser, TEST_ACCOUNTS.groupReplyRepairBob);

  try {
    const groupPublicKey = await createGroup(owner.page, {
      name: `Reply Repair Group ${Date.now()}`,
      about: 'Prior epoch reply repair coverage',
    });
    const epochZeroMessage = `epoch-zero-reply-target-${Date.now()}`;
    const epochOneReplyMessage = `epoch-one-reply-${Date.now()}`;
    const epochZeroCreatedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

    await addGroupMemberAndPublish(owner.page, bob.session.publicKey);
    await openRequests(bob.page);
    await expect(bob.page.getByTestId('chat-request-item')).toContainText('Group invitation');
    await acceptFirstRequest(bob.page);

    await navigateToChat(owner.page, groupPublicKey);
    const [seededTarget] = await sendMessagesViaBridge(
      owner.page,
      groupPublicKey,
      [epochZeroMessage],
      {
        createdAts: [epochZeroCreatedAt],
      }
    );
    if (!seededTarget?.eventId) {
      throw new Error('Expected the seeded group reply target to have an event id.');
    }

    await navigateToChat(bob.page, groupPublicKey);
    await waitForThreadMessage(bob.page, epochZeroMessage, {
      chatId: groupPublicKey,
    });

    await rotateGroupEpoch(owner.page, groupPublicKey, [bob.session.publicKey], [E2E_RELAY_URL]);
    await removeStoredMessageByEventId(bob.page, groupPublicKey, seededTarget.eventId);
    await waitForNoThreadMessage(bob.page, epochZeroMessage, {
      chatId: groupPublicKey,
      refresh: false,
      timeoutMs: 6_000,
    });

    await navigateToChat(owner.page, groupPublicKey);
    await waitForThreadMessage(owner.page, epochZeroMessage, {
      chatId: groupPublicKey,
    });
    await replyToMessage(owner.page, epochZeroMessage, epochOneReplyMessage, {
      chatId: groupPublicKey,
    });
    await waitForThreadMessage(bob.page, epochOneReplyMessage, {
      chatId: groupPublicKey,
    });

    await reloadAndWaitForApp(bob.page);
    await navigateToChat(bob.page, groupPublicKey);
    await waitForThreadMessage(bob.page, epochOneReplyMessage, {
      chatId: groupPublicKey,
    });
    await waitForThreadMessage(bob.page, epochZeroMessage, {
      chatId: groupPublicKey,
    });
    await expect(
      threadMessage(bob.page, epochOneReplyMessage).locator('.bubble__reply-preview-text')
    ).toContainText(epochZeroMessage, {
      timeout: 45_000,
    });
    await expectNoUnexpectedBrowserErrors([owner, bob]);
  } finally {
    await disposeUsers(owner, bob);
  }
});
