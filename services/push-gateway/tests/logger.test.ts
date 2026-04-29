import { afterEach, describe, expect, it, vi } from 'vitest';
import { logDebug } from '../src/logger.js';

const originalDebug = process.env.DEBUG;

describe('logDebug', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    if (originalDebug === undefined) {
      delete process.env.DEBUG;
      return;
    }

    process.env.DEBUG = originalDebug;
  });

  it('does not log when unset', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    delete process.env.DEBUG;

    logDebug('debug unset', { token: 'secret' });

    expect(infoSpy).not.toHaveBeenCalled();
  });

  it('does not log when set to false', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    process.env.DEBUG = 'false';

    logDebug('debug disabled', { token: 'secret' });

    expect(infoSpy).not.toHaveBeenCalled();
  });

  it('logs redacted details when enabled', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    process.env.DEBUG = 'true';

    logDebug('debug enabled', {
      ownerPubkey: 'a'.repeat(64),
      fcmToken: 'secret-token',
      nested: {
        authorization: 'Nostr secret',
      },
    });

    expect(infoSpy).toHaveBeenCalledWith('[debug] debug enabled', {
      ownerPubkey: 'a'.repeat(64),
      fcmToken: '[redacted]',
      nested: {
        authorization: '[redacted]',
      },
    });
  });
});
