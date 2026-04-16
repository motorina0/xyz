import { expect, test } from '@playwright/test';
import {
  acceptFirstRequest,
  addGroupMemberAndPublish,
  addGroupMembersAndPublish,
  bootstrapUser,
  createGroup,
  disposeUsers,
  E2E_DUAL_RELAY_URLS,
  E2E_RELAY_URL,
  expectNoUnexpectedBrowserErrors,
  navigateToChat,
  openGroupContact,
  openGroupEpochsTab,
  openGroupRelaysTab,
  openProfileRelaysSection,
  openRequests,
  readGroupEpochNumbers,
  reloadAndWaitForApp,
  removeGroupMemberAndPublish,
  removeGroupRelayAndPublish,
  rotateGroupEpoch,
  sendMessage,
  TEST_ACCOUNTS,
  threadMessage,
  updateStoredContactRelays,
  waitForAppBridge,
  waitForNoThreadMessage,
  waitForThreadMessage,
} from './helpers';

test.describe.configure({ mode: 'serial' });

test('group owner can create a group, invite a member, and exchange messages both ways', async ({
  browser,
}) => {
  const alice = await bootstrapUser(browser, TEST_ACCOUNTS.groupAlice);
  const bob = await bootstrapUser(browser, TEST_ACCOUNTS.groupBob);

  try {
    const groupName = `Group ${Date.now()}`;
    const groupAbout = 'Relay-backed group e2e';
    const aliceGroupMessage = `group-hello-from-alice-${Date.now()}`;
    const bobGroupMessage = `group-hello-from-bob-${Date.now()}`;

    const groupPublicKey = await createGroup(alice.page, {
      name: groupName,
      about: groupAbout,
    });

    await addGroupMemberAndPublish(alice.page, bob.session.publicKey);
    const invitedMemberRow = alice.page
      .locator('.profile-members-list .q-item')
      .filter({ hasText: bob.session.publicKey.slice(0, 32) })
      .first();
    await expect(invitedMemberRow.getByTestId('group-member-ticket-epoch-badge')).toContainText(
      'Epoch 0'
    );
    await expect(invitedMemberRow.getByTestId('group-member-ticket-status')).toBeVisible();
    await invitedMemberRow.getByTestId('group-member-ticket-status').click();
    await expect(
      alice.page.locator('.profile-member-delivery__dialog-relay').filter({
        hasText: E2E_RELAY_URL,
      })
    ).toBeVisible();
    await alice.page.keyboard.press('Escape');

    await openRequests(bob.page);
    await expect(bob.page.getByTestId('chat-request-item')).toContainText('Group invitation');
    await acceptFirstRequest(bob.page);

    await navigateToChat(alice.page, groupPublicKey);
    await sendMessage(alice.page, aliceGroupMessage, {
      chatId: groupPublicKey,
    });
    await navigateToChat(bob.page, groupPublicKey);
    await waitForThreadMessage(bob.page, aliceGroupMessage, {
      chatId: groupPublicKey,
    });
    await sendMessage(bob.page, bobGroupMessage, {
      chatId: groupPublicKey,
    });
    await navigateToChat(alice.page, groupPublicKey);
    await waitForThreadMessage(alice.page, bobGroupMessage, {
      chatId: groupPublicKey,
    });
    await threadMessage(alice.page, bobGroupMessage)
      .getByTestId('thread-author-profile-link')
      .click();
    await alice.page.waitForURL(new RegExp(`#\\/contacts\\/${bob.session.publicKey}$`));
    await expectNoUnexpectedBrowserErrors([alice, bob]);
  } finally {
    await disposeUsers(alice, bob);
  }
});

test('group invite survives hard reload before acceptance and still opens a working chat', async ({
  browser,
}) => {
  const alice = await bootstrapUser(browser, TEST_ACCOUNTS.inviteReloadAlice);
  const bob = await bootstrapUser(browser, TEST_ACCOUNTS.inviteReloadBob);

  try {
    const groupPublicKey = await createGroup(alice.page, {
      name: `Reload Invite Group ${Date.now()}`,
      about: 'Invite reload coverage',
    });
    const ownerMessage = `invite-reload-owner-${Date.now()}`;
    const memberReply = `invite-reload-member-${Date.now()}`;

    await addGroupMemberAndPublish(alice.page, bob.session.publicKey);

    await openRequests(bob.page);
    await expect(bob.page.getByTestId('chat-request-item')).toContainText('Group invitation');
    await reloadAndWaitForApp(bob.page);
    await openRequests(bob.page);
    await expect(bob.page.getByTestId('chat-request-item')).toContainText('Group invitation');
    await acceptFirstRequest(bob.page);

    await navigateToChat(alice.page, groupPublicKey);
    await sendMessage(alice.page, ownerMessage, {
      chatId: groupPublicKey,
    });
    await navigateToChat(bob.page, groupPublicKey);
    await waitForThreadMessage(bob.page, ownerMessage, {
      chatId: groupPublicKey,
    });
    await sendMessage(bob.page, memberReply, {
      chatId: groupPublicKey,
    });
    await navigateToChat(alice.page, groupPublicKey);
    await waitForThreadMessage(alice.page, memberReply, {
      chatId: groupPublicKey,
    });
    await expectNoUnexpectedBrowserErrors([alice, bob]);
  } finally {
    await disposeUsers(alice, bob);
  }
});

test('invited members see published group relays and profile refresh restores them when missing', async ({
  browser,
}) => {
  const alice = await bootstrapUser(browser, TEST_ACCOUNTS.groupInviteRelayAlice, {
    relayUrls: E2E_DUAL_RELAY_URLS,
  });
  const bob = await bootstrapUser(browser, TEST_ACCOUNTS.groupInviteRelayBob, {
    relayUrls: [E2E_RELAY_URL],
  });

  try {
    const groupPublicKey = await createGroup(alice.page, {
      name: `Invite Relay Group ${Date.now()}`,
      about: 'Invite relay propagation coverage',
    });

    await addGroupMemberAndPublish(alice.page, bob.session.publicKey);
    await openRequests(bob.page);
    await expect(bob.page.getByTestId('chat-request-item')).toContainText('Group invitation');
    await acceptFirstRequest(bob.page);

    await openGroupContact(bob.page, groupPublicKey);
    await openProfileRelaysSection(bob.page);
    await expect(bob.page.locator('.profile-tab-panel')).toContainText(E2E_DUAL_RELAY_URLS[0]);
    await expect(bob.page.locator('.profile-tab-panel')).toContainText(E2E_DUAL_RELAY_URLS[1]);

    await updateStoredContactRelays(bob.page, groupPublicKey, []);
    await bob.page.goto('/#/chats');
    await openGroupContact(bob.page, groupPublicKey);
    await openProfileRelaysSection(bob.page);
    await expect(bob.page.getByText('No relays configured.', { exact: true })).toBeVisible();

    await bob.page.getByTestId('contact-profile-refresh-button').click();
    await openProfileRelaysSection(bob.page);
    await expect(bob.page.locator('.profile-tab-panel')).toContainText(E2E_DUAL_RELAY_URLS[0]);
    await expect(bob.page.locator('.profile-tab-panel')).toContainText(E2E_DUAL_RELAY_URLS[1]);
    await expectNoUnexpectedBrowserErrors([alice, bob]);
  } finally {
    await disposeUsers(alice, bob);
  }
});

test('group member removal rotates epoch and blocks removed members from new messages', async ({
  browser,
}) => {
  const owner = await bootstrapUser(browser, TEST_ACCOUNTS.groupRemovalOwner);
  const survivingMember = await bootstrapUser(browser, TEST_ACCOUNTS.groupRemovalBob);
  const removedMember = await bootstrapUser(browser, TEST_ACCOUNTS.groupRemovalCharlie);

  try {
    const groupPublicKey = await createGroup(owner.page, {
      name: `Removal Group ${Date.now()}`,
      about: 'Group epoch rotation coverage',
    });
    const initialMessage = `before-removal-${Date.now()}`;
    const postRemovalMessage = `after-removal-${Date.now()}`;

    await addGroupMembersAndPublish(owner.page, [
      survivingMember.session.publicKey,
      removedMember.session.publicKey,
    ]);

    await openRequests(survivingMember.page);
    await expect(survivingMember.page.getByTestId('chat-request-item')).toContainText(
      'Group invitation'
    );
    await acceptFirstRequest(survivingMember.page);

    await openRequests(removedMember.page);
    await expect(removedMember.page.getByTestId('chat-request-item')).toContainText(
      'Group invitation'
    );
    await acceptFirstRequest(removedMember.page);

    await navigateToChat(owner.page, groupPublicKey);
    await sendMessage(owner.page, initialMessage, {
      chatId: groupPublicKey,
    });
    await navigateToChat(survivingMember.page, groupPublicKey);
    await waitForThreadMessage(survivingMember.page, initialMessage, {
      chatId: groupPublicKey,
    });
    await navigateToChat(removedMember.page, groupPublicKey);
    await waitForThreadMessage(removedMember.page, initialMessage, {
      chatId: groupPublicKey,
    });

    await openGroupContact(owner.page, groupPublicKey);
    await removeGroupMemberAndPublish(owner.page, removedMember.session.publicKey);
    await openGroupEpochsTab(owner.page);
    await expect.poll(() => readGroupEpochNumbers(owner.page), { timeout: 12_000 }).toEqual([1, 0]);

    await navigateToChat(owner.page, groupPublicKey);
    await sendMessage(owner.page, postRemovalMessage, {
      chatId: groupPublicKey,
    });
    await navigateToChat(survivingMember.page, groupPublicKey);
    await waitForThreadMessage(survivingMember.page, postRemovalMessage, {
      chatId: groupPublicKey,
    });
    await navigateToChat(removedMember.page, groupPublicKey);
    await waitForNoThreadMessage(removedMember.page, postRemovalMessage, {
      chatId: groupPublicKey,
      timeoutMs: 6_000,
    });
    await expectNoUnexpectedBrowserErrors([owner, survivingMember, removedMember]);
  } finally {
    await disposeUsers(owner, survivingMember, removedMember);
  }
});

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

test('group relay changes still deliver after both members restart on the updated relay set', async ({
  browser,
}) => {
  let alice = await bootstrapUser(browser, TEST_ACCOUNTS.groupRelayAlice, {
    relayUrls: E2E_DUAL_RELAY_URLS,
  });
  let bob = await bootstrapUser(browser, TEST_ACCOUNTS.groupRelayBob, {
    relayUrls: E2E_DUAL_RELAY_URLS,
  });

  try {
    const groupPublicKey = await createGroup(alice.page, {
      name: `Relay Switch Group ${Date.now()}`,
      about: 'Group relay propagation coverage',
    });
    const postRelayChangeMessage = `after-relay-change-${Date.now()}`;

    await addGroupMemberAndPublish(alice.page, bob.session.publicKey);
    await openRequests(bob.page);
    await expect(bob.page.getByTestId('chat-request-item')).toContainText('Group invitation');
    await acceptFirstRequest(bob.page);

    await openGroupContact(alice.page, groupPublicKey);
    await openGroupRelaysTab(alice.page);
    await expect(alice.page.locator('.profile-group-relays')).toContainText(E2E_DUAL_RELAY_URLS[0]);
    await expect(alice.page.locator('.profile-group-relays')).toContainText(E2E_DUAL_RELAY_URLS[1]);
    await removeGroupRelayAndPublish(alice.page, E2E_DUAL_RELAY_URLS[0]);

    await disposeUsers(alice, bob);
    alice = await bootstrapUser(browser, TEST_ACCOUNTS.groupRelayAlice, {
      relayUrls: E2E_DUAL_RELAY_URLS,
    });
    bob = await bootstrapUser(browser, TEST_ACCOUNTS.groupRelayBob, {
      relayUrls: E2E_DUAL_RELAY_URLS,
    });

    await navigateToChat(alice.page, groupPublicKey);
    await sendMessage(alice.page, postRelayChangeMessage, {
      chatId: groupPublicKey,
    });
    await navigateToChat(bob.page, groupPublicKey);
    await waitForThreadMessage(bob.page, postRelayChangeMessage, {
      chatId: groupPublicKey,
    });
    await expectNoUnexpectedBrowserErrors([alice, bob]);
  } finally {
    await disposeUsers(alice, bob);
  }
});

test('hard reload after rotation keeps the higher group epoch current and messaging working', async ({
  browser,
}) => {
  const alice = await bootstrapUser(browser, TEST_ACCOUNTS.groupEpochAlice);
  const bob = await bootstrapUser(browser, TEST_ACCOUNTS.groupEpochBob);

  try {
    const groupPublicKey = await createGroup(alice.page, {
      name: `Epoch Restore Group ${Date.now()}`,
      about: 'Stale epoch regression coverage',
    });
    const rotatedOwnerMessage = `epoch-reload-owner-${Date.now()}`;
    const rotatedMemberReply = `epoch-reload-member-${Date.now()}`;

    await addGroupMemberAndPublish(alice.page, bob.session.publicKey);
    await openRequests(bob.page);
    await expect(bob.page.getByTestId('chat-request-item')).toContainText('Group invitation');
    await acceptFirstRequest(bob.page);

    await rotateGroupEpoch(alice.page, groupPublicKey, [bob.session.publicKey], [E2E_RELAY_URL]);

    await bob.page.reload();
    await waitForAppBridge(bob.page);
    await openGroupContact(bob.page, groupPublicKey);
    await openGroupEpochsTab(bob.page);
    await expect
      .poll(async () => (await readGroupEpochNumbers(bob.page))[0] ?? null, {
        timeout: 12_000,
      })
      .toBe(1);

    await navigateToChat(alice.page, groupPublicKey);
    await sendMessage(alice.page, rotatedOwnerMessage, {
      chatId: groupPublicKey,
    });
    await navigateToChat(bob.page, groupPublicKey);
    await waitForThreadMessage(bob.page, rotatedOwnerMessage, {
      chatId: groupPublicKey,
    });
    await sendMessage(bob.page, rotatedMemberReply, {
      chatId: groupPublicKey,
    });
    await navigateToChat(alice.page, groupPublicKey);
    await waitForThreadMessage(alice.page, rotatedMemberReply, {
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

test('group messages continue both ways after an explicit epoch rotation', async ({ browser }) => {
  const alice = await bootstrapUser(browser, TEST_ACCOUNTS.groupRotateAlice);
  const bob = await bootstrapUser(browser, TEST_ACCOUNTS.groupRotateBob);

  try {
    const groupPublicKey = await createGroup(alice.page, {
      name: `Rotated Group ${Date.now()}`,
      about: 'Post-rotation messaging coverage',
    });
    const rotatedOwnerMessage = `owner-after-rotation-${Date.now()}`;
    const rotatedMemberReply = `member-after-rotation-${Date.now()}`;

    await addGroupMemberAndPublish(alice.page, bob.session.publicKey);
    await openRequests(bob.page);
    await expect(bob.page.getByTestId('chat-request-item')).toContainText('Group invitation');
    await acceptFirstRequest(bob.page);

    await rotateGroupEpoch(alice.page, groupPublicKey, [bob.session.publicKey], [E2E_RELAY_URL]);

    await navigateToChat(alice.page, groupPublicKey);
    await sendMessage(alice.page, rotatedOwnerMessage, {
      chatId: groupPublicKey,
    });
    await navigateToChat(bob.page, groupPublicKey);
    await waitForThreadMessage(bob.page, rotatedOwnerMessage, {
      chatId: groupPublicKey,
    });
    await sendMessage(bob.page, rotatedMemberReply, {
      chatId: groupPublicKey,
    });
    await navigateToChat(alice.page, groupPublicKey);
    await waitForThreadMessage(alice.page, rotatedMemberReply, {
      chatId: groupPublicKey,
    });
    await expectNoUnexpectedBrowserErrors([alice, bob]);
  } finally {
    await disposeUsers(alice, bob);
  }
});

test('adding a new group member without rotation keeps the current epoch and messaging working for all members', async ({
  browser,
}) => {
  const owner = await bootstrapUser(browser, TEST_ACCOUNTS.groupAddOwner);
  const bob = await bootstrapUser(browser, TEST_ACCOUNTS.groupAddBob);
  const charlie = await bootstrapUser(browser, TEST_ACCOUNTS.groupAddCharlie);

  try {
    const groupPublicKey = await createGroup(owner.page, {
      name: `Add Member Group ${Date.now()}`,
      about: 'No-rotation add-member coverage',
    });
    const beforeAddMessage = `before-add-${Date.now()}`;
    const afterAddMessage = `after-add-${Date.now()}`;
    const charlieReply = `charlie-reply-${Date.now()}`;

    await addGroupMemberAndPublish(owner.page, bob.session.publicKey);
    await openRequests(bob.page);
    await expect(bob.page.getByTestId('chat-request-item')).toContainText('Group invitation');
    await acceptFirstRequest(bob.page);

    await navigateToChat(owner.page, groupPublicKey);
    await sendMessage(owner.page, beforeAddMessage, {
      chatId: groupPublicKey,
    });
    await navigateToChat(bob.page, groupPublicKey);
    await waitForThreadMessage(bob.page, beforeAddMessage, {
      chatId: groupPublicKey,
    });

    await openGroupContact(owner.page, groupPublicKey);
    await addGroupMemberAndPublish(owner.page, charlie.session.publicKey);
    await openGroupEpochsTab(owner.page);
    await expect.poll(() => readGroupEpochNumbers(owner.page), { timeout: 12_000 }).toEqual([0]);

    await openRequests(charlie.page);
    await expect(charlie.page.getByTestId('chat-request-item')).toContainText('Group invitation');
    await acceptFirstRequest(charlie.page);

    await navigateToChat(owner.page, groupPublicKey);
    await sendMessage(owner.page, afterAddMessage, {
      chatId: groupPublicKey,
    });

    await navigateToChat(charlie.page, groupPublicKey);
    await waitForThreadMessage(charlie.page, beforeAddMessage, {
      chatId: groupPublicKey,
    });
    await waitForThreadMessage(charlie.page, afterAddMessage, {
      chatId: groupPublicKey,
    });

    await navigateToChat(bob.page, groupPublicKey);
    await waitForThreadMessage(bob.page, beforeAddMessage, {
      chatId: groupPublicKey,
    });
    await waitForThreadMessage(bob.page, afterAddMessage, {
      chatId: groupPublicKey,
    });

    await sendMessage(charlie.page, charlieReply, {
      chatId: groupPublicKey,
    });
    await navigateToChat(owner.page, groupPublicKey);
    await waitForThreadMessage(owner.page, charlieReply, {
      chatId: groupPublicKey,
    });
    await expectNoUnexpectedBrowserErrors([owner, bob, charlie]);
  } finally {
    await disposeUsers(owner, bob, charlie);
  }
});

test('removed group member stays blocked after hard reload and cannot deliver new group messages', async ({
  browser,
}) => {
  const owner = await bootstrapUser(browser, TEST_ACCOUNTS.groupRemovalReloadOwner);
  const survivingMember = await bootstrapUser(browser, TEST_ACCOUNTS.groupRemovalReloadBob);
  const removedMember = await bootstrapUser(browser, TEST_ACCOUNTS.groupRemovalReloadCharlie);

  try {
    const groupPublicKey = await createGroup(owner.page, {
      name: `Removal Reload Group ${Date.now()}`,
      about: 'Removed member reload coverage',
    });
    const initialMessage = `before-removal-reload-${Date.now()}`;
    const postRemovalMessage = `after-removal-reload-${Date.now()}`;
    const removedMemberAttempt = `removed-member-attempt-${Date.now()}`;

    await addGroupMembersAndPublish(owner.page, [
      survivingMember.session.publicKey,
      removedMember.session.publicKey,
    ]);

    await openRequests(survivingMember.page);
    await acceptFirstRequest(survivingMember.page);
    await openRequests(removedMember.page);
    await acceptFirstRequest(removedMember.page);

    await navigateToChat(owner.page, groupPublicKey);
    await sendMessage(owner.page, initialMessage, {
      chatId: groupPublicKey,
    });
    await navigateToChat(survivingMember.page, groupPublicKey);
    await waitForThreadMessage(survivingMember.page, initialMessage, {
      chatId: groupPublicKey,
    });
    await navigateToChat(removedMember.page, groupPublicKey);
    await waitForThreadMessage(removedMember.page, initialMessage, {
      chatId: groupPublicKey,
    });

    await openGroupContact(owner.page, groupPublicKey);
    await removeGroupMemberAndPublish(owner.page, removedMember.session.publicKey);
    await openGroupEpochsTab(owner.page);
    await expect.poll(() => readGroupEpochNumbers(owner.page), { timeout: 12_000 }).toEqual([1, 0]);

    await navigateToChat(owner.page, groupPublicKey);
    await sendMessage(owner.page, postRemovalMessage, {
      chatId: groupPublicKey,
    });
    await navigateToChat(survivingMember.page, groupPublicKey);
    await waitForThreadMessage(survivingMember.page, postRemovalMessage, {
      chatId: groupPublicKey,
    });
    await navigateToChat(removedMember.page, groupPublicKey);
    await waitForNoThreadMessage(removedMember.page, postRemovalMessage, {
      chatId: groupPublicKey,
      timeoutMs: 6_000,
    });

    await reloadAndWaitForApp(removedMember.page);
    await navigateToChat(removedMember.page, groupPublicKey);
    await waitForNoThreadMessage(removedMember.page, postRemovalMessage, {
      chatId: groupPublicKey,
      timeoutMs: 6_000,
    });

    await sendMessage(removedMember.page, removedMemberAttempt, {
      chatId: groupPublicKey,
    });
    await navigateToChat(owner.page, groupPublicKey);
    await waitForNoThreadMessage(owner.page, removedMemberAttempt, {
      chatId: groupPublicKey,
      timeoutMs: 6_000,
    });
    await navigateToChat(survivingMember.page, groupPublicKey);
    await waitForNoThreadMessage(survivingMember.page, removedMemberAttempt, {
      chatId: groupPublicKey,
      timeoutMs: 6_000,
    });
    await expectNoUnexpectedBrowserErrors([owner, survivingMember, removedMember]);
  } finally {
    await disposeUsers(owner, survivingMember, removedMember);
  }
});
