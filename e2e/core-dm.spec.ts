import { expect, test } from '@playwright/test';
import {
  acceptFirstRequest,
  addGroupMemberAndPublish,
  addGroupMembersAndPublish,
  bootstrapSessionOnPage,
  bootstrapUser,
  createGroup,
  deleteFirstRequest,
  deleteMessage,
  disposeUsers,
  E2E_DUAL_RELAY_URLS,
  E2E_RELAY_URL,
  establishAcceptedDirectChat,
  expectBrowserStorageToBeEmpty,
  logoutFromSettings,
  navigateToChat,
  openAppRelaysSettings,
  openDirectChatFromIdentifier,
  openGroupContact,
  openGroupEpochsTab,
  openGroupRelaysTab,
  openRequests,
  publishOwnProfile,
  reactToMessage,
  readGroupEpochNumbers,
  removeGroupMemberAndPublish,
  removeGroupRelayAndPublish,
  removeRelayFromSettings,
  rotateGroupEpoch,
  sendMessage,
  TEST_ACCOUNTS,
  threadMessage,
  waitForAppBridge,
  waitForChatPreview,
  waitForChatReactionBadge,
  waitForDeletedMessageState,
  waitForNoRequests,
  waitForNoThreadMessage,
  waitForReaction,
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

    await bob.page.reload();
    await waitForAppBridge(bob.page);
    await expect(bob.page).toHaveURL(new RegExp(`#\\/chats\\/${alice.session.publicKey}$`));
    await waitForThreadMessage(bob.page, thirdMessage, {
      chatId: alice.session.publicKey,
    });

    await sendMessage(bob.page, replyAfterReload, {
      chatId: alice.session.publicKey,
    });
    await navigateToChat(alice.page, bob.session.publicKey);
    await waitForThreadMessage(alice.page, replyAfterReload, {
      chatId: bob.session.publicKey,
    });
  } finally {
    await disposeUsers(alice, bob);
  }
});

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
  } finally {
    await disposeUsers(alice, bob);
  }
});

test('contact refresh pulls newly published remote profile metadata into an existing contact', async ({
  browser,
}) => {
  const alice = await bootstrapUser(browser, TEST_ACCOUNTS.profileRefreshAlice);
  const bob = await bootstrapUser(browser, TEST_ACCOUNTS.profileRefreshBob);

  try {
    const refreshedName = `Bob Refreshed ${Date.now()}`;
    const refreshedAbout = `About refreshed ${Date.now()}`;

    await establishAcceptedDirectChat(alice, bob);
    await publishOwnProfile(bob.page, {
      name: refreshedName,
      about: refreshedAbout,
    });

    await alice.page.goto(`/#/contacts/${bob.session.publicKey}`);
    await expect(alice.page.getByTestId('contact-profile-refresh-button')).toBeVisible();
    await alice.page.getByTestId('contact-profile-refresh-button').click();
    await expect(alice.page.getByPlaceholder('Your profile name').first()).toHaveValue(
      refreshedName,
      {
        timeout: 12_000,
      }
    );
    await expect(alice.page.getByPlaceholder('Short bio').first()).toHaveValue(refreshedAbout, {
      timeout: 12_000,
    });
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
  } finally {
    await disposeUsers(alice, bob);
  }
});

test('editing app relays survives hard reload and direct messages still arrive on the remaining relay', async ({
  browser,
}) => {
  const alice = await bootstrapUser(browser, TEST_ACCOUNTS.relaySettingsAlice, {
    relayUrls: E2E_DUAL_RELAY_URLS,
  });
  const bob = await bootstrapUser(browser, TEST_ACCOUNTS.relaySettingsBob, {
    relayUrls: E2E_DUAL_RELAY_URLS,
  });

  try {
    const afterRelayEditMessage = `after-app-relay-edit-${Date.now()}`;

    await establishAcceptedDirectChat(alice, bob);

    await openAppRelaysSettings(alice.page);
    const appRelayPanel = alice.page.getByTestId('settings-relays-app-panel');
    await expect(appRelayPanel).toContainText(E2E_DUAL_RELAY_URLS[0]);
    await expect(appRelayPanel).toContainText(E2E_DUAL_RELAY_URLS[1]);
    await removeRelayFromSettings(alice.page, E2E_DUAL_RELAY_URLS[0]);

    await alice.page.reload();
    await waitForAppBridge(alice.page);
    await openAppRelaysSettings(alice.page);
    await expect(appRelayPanel).not.toContainText(E2E_DUAL_RELAY_URLS[0]);
    await expect(appRelayPanel).toContainText(E2E_DUAL_RELAY_URLS[1]);

    await navigateToChat(bob.page, alice.session.publicKey);
    await sendMessage(bob.page, afterRelayEditMessage, {
      chatId: alice.session.publicKey,
    });
    await navigateToChat(alice.page, bob.session.publicKey);
    await waitForThreadMessage(alice.page, afterRelayEditMessage, {
      chatId: bob.session.publicKey,
    });
  } finally {
    await disposeUsers(alice, bob);
  }
});

test('logout and logging in as another user does not leak prior chat state', async ({
  browser,
}) => {
  const alice = await bootstrapUser(browser, TEST_ACCOUNTS.isolationAlice);
  const bob = await bootstrapUser(browser, TEST_ACCOUNTS.isolationBob);

  try {
    await establishAcceptedDirectChat(alice, bob);

    await alice.page.goto('/#/chats');
    await expect(alice.page.getByTestId('chat-item')).toHaveCount(1);
    await expect(alice.page.getByText(TEST_ACCOUNTS.isolationBob.displayName)).toBeVisible();

    await logoutFromSettings(alice.page);
    await expectBrowserStorageToBeEmpty(alice.page);
    await bootstrapSessionOnPage(alice.page, TEST_ACCOUNTS.isolationCharlie);

    await alice.page.goto('/#/chats');
    await expect(alice.page.getByTestId('chat-item')).toHaveCount(0);
    await expect(alice.page.getByText(TEST_ACCOUNTS.isolationBob.displayName)).toHaveCount(0);
    await expect(alice.page.getByTestId('requests-row')).toHaveCount(0);
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
    await alice.page.reload();
    await waitForAppBridge(alice.page);
    await expect(alice.page).toHaveURL(new RegExp(`#\\/chats\\/${bob.session.publicKey}$`));
    await waitForReaction(alice.page, /thumbs up reaction/i, {
      chatId: bob.session.publicKey,
    });

    await deleteMessage(alice.page, targetMessage);
    await bob.page.reload();
    await waitForAppBridge(bob.page);
    await expect(bob.page).toHaveURL(new RegExp(`#\\/chats\\/${alice.session.publicKey}$`));
    await waitForDeletedMessageState(bob.page, targetMessage, {
      chatId: alice.session.publicKey,
    });
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
  } finally {
    await disposeUsers(alice, bob);
  }
});
