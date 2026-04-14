import { expect, test } from '@playwright/test';
import {
  bootstrapUser,
  disposeUsers,
  establishAcceptedDirectChat,
  expectNoUnexpectedBrowserErrors,
  publishOwnProfile,
  TEST_ACCOUNTS,
} from './helpers';

test.describe.configure({ mode: 'serial' });

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
    await expectNoUnexpectedBrowserErrors([alice, bob]);
  } finally {
    await disposeUsers(alice, bob);
  }
});

test('contact profile share dialog shows a QR code for the contact nostr address', async ({
  browser,
}) => {
  const alice = await bootstrapUser(browser, TEST_ACCOUNTS.profileRefreshAlice);
  const bob = await bootstrapUser(browser, TEST_ACCOUNTS.profileRefreshBob);

  try {
    expect(bob.session.npub).not.toBeNull();

    await alice.page.goto('/#/contacts');
    await alice.page.getByLabel('Add Contact').click();
    await alice.page.getByTestId('contact-lookup-identifier').fill(bob.session.publicKey);
    await alice.page.getByTestId('contact-lookup-given-name').fill(bob.account.displayName);
    await alice.page.getByTestId('contact-lookup-submit').click();
    await alice.page.waitForURL(new RegExp(`#\\/contacts\\/${bob.session.publicKey}$`));
    await expect(alice.page.getByTestId('contact-profile-share-button')).toBeVisible();
    await alice.page.getByTestId('contact-profile-share-button').click();

    const shareDialog = alice.page.getByTestId('contact-profile-share-dialog');
    const shareAddress = `nostr:${bob.session.npub}`;
    const shareQrImage = alice.page.getByTestId('contact-profile-share-qr');

    await expect(shareDialog).toBeVisible();
    await expect(shareDialog.getByRole('textbox', { name: 'Nostr Address' })).toHaveValue(
      shareAddress
    );
    await expect(shareQrImage).toHaveAttribute('src', /data:image\/svg\+xml/);

    const decodedShareAddress = await shareQrImage.evaluate(async (imageNode) => {
      const detectorCtor = (window as Window & { BarcodeDetector?: any }).BarcodeDetector;
      if (!detectorCtor || typeof createImageBitmap !== 'function') {
        return null;
      }

      if (typeof detectorCtor.getSupportedFormats === 'function') {
        const supportedFormats = await detectorCtor.getSupportedFormats();
        if (Array.isArray(supportedFormats) && !supportedFormats.includes('qr_code')) {
          return null;
        }
      }

      const image = imageNode as HTMLImageElement;
      if (!image.complete) {
        await new Promise<void>((resolve, reject) => {
          image.addEventListener('load', () => resolve(), { once: true });
          image.addEventListener('error', () => reject(new Error('Failed to load QR image.')), {
            once: true,
          });
        });
      }

      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;

      const context = canvas.getContext('2d');
      if (!context) {
        return null;
      }

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      const detector = new detectorCtor({ formats: ['qr_code'] });
      const results = await detector.detect(canvas);
      return results[0]?.rawValue ?? null;
    });

    if (decodedShareAddress !== null) {
      expect(decodedShareAddress).toBe(shareAddress);
    }
    await expectNoUnexpectedBrowserErrors([alice, bob]);
  } finally {
    await disposeUsers(alice, bob);
  }
});
