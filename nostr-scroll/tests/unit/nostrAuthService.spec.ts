import { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import { describe, expect, it } from 'vitest';
import {
  createAccount,
  defaultAuthSession,
  normalizeStoredSession,
  validatePrivateKey,
} from '../../src/services/nostrAuthService';

describe('nostrAuthService', () => {
  it('accepts a 64-character hex private key', () => {
    const privateKey = '17109060832c2b13b1280c20c929e17a8b013e1dcb770b9d83ca511d9626e5cb';

    expect(validatePrivateKey(privateKey)).toEqual({
      isValid: true,
      hexPrivateKey: privateKey,
      format: 'hex',
    });
  });

  it('accepts an nsec private key', () => {
    const signer = new NDKPrivateKeySigner(
      '17109060832c2b13b1280c20c929e17a8b013e1dcb770b9d83ca511d9626e5cb'
    );

    expect(validatePrivateKey(signer.nsec)).toEqual({
      isValid: true,
      hexPrivateKey: signer.privateKey,
      format: 'nsec',
    });
  });

  it('rejects malformed stored nsec sessions that are missing the private key', () => {
    expect(
      normalizeStoredSession({
        isAuthenticated: true,
        method: 'nsec',
        currentPubkey: 'f'.repeat(64),
      })
    ).toEqual(defaultAuthSession);
  });

  it('creates a usable account payload', () => {
    const account = createAccount();

    expect(account.publicKeyHex).toMatch(/^[0-9a-f]{64}$/);
    expect(account.privateKeyHex).toMatch(/^[0-9a-f]{64}$/);
    expect(account.npub.startsWith('npub1')).toBe(true);
    expect(account.nsec.startsWith('nsec1')).toBe(true);
  });
});
