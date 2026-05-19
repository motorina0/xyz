import {
  DEFAULT_PUSH_GATEWAY_BASE_URL,
  readPushGatewayBaseUrl,
  readStoredPushGatewayBaseUrl,
  savePushGatewayBaseUrl,
  validatePushGatewayBaseUrl,
} from 'src/services/pushGatewayClient';
import { afterEach, describe, expect, it, vi } from 'vitest';

function createMockStorage(initialValues: Record<string, string> = {}) {
  const store = new Map(Object.entries(initialValues));
  const api: Storage = {
    get length() {
      return store.size;
    },
    clear: vi.fn(() => store.clear()),
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
  };

  return { api, store };
}

describe('pushGatewayClient', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('falls back to the default push gateway URL', () => {
    vi.stubEnv('PUSH_GATEWAY_URL', '');
    vi.stubEnv('VITE_PUSH_GATEWAY_URL', '');

    expect(readPushGatewayBaseUrl()).toBe(DEFAULT_PUSH_GATEWAY_BASE_URL);
  });

  it('validates and normalizes http and https gateway URLs', () => {
    expect(validatePushGatewayBaseUrl('')).toMatchObject({
      isValid: false,
      normalizedUrl: null,
      reason: 'empty',
    });
    expect(validatePushGatewayBaseUrl('not a url')).toMatchObject({
      isValid: false,
      normalizedUrl: null,
      reason: 'invalid',
    });
    expect(validatePushGatewayBaseUrl('ftp://example.test')).toMatchObject({
      isValid: false,
      normalizedUrl: null,
      reason: 'protocol',
    });
    expect(validatePushGatewayBaseUrl(' http://localhost:4100/push/ ')).toMatchObject({
      isValid: true,
      normalizedUrl: 'http://localhost:4100/push',
      reason: null,
    });
    expect(validatePushGatewayBaseUrl('https://example.test/push/?token=1#section')).toMatchObject({
      isValid: true,
      normalizedUrl: 'https://example.test/push',
      reason: null,
    });
  });

  it('uses a saved gateway URL before the hardcoded default', () => {
    const localStorage = createMockStorage();
    vi.stubGlobal('window', { localStorage: localStorage.api });

    expect(readStoredPushGatewayBaseUrl()).toBeNull();

    const savedUrl = savePushGatewayBaseUrl(' http://localhost:4100/gateway/ ');

    expect(savedUrl).toBe('http://localhost:4100/gateway');
    expect(readStoredPushGatewayBaseUrl()).toBe('http://localhost:4100/gateway');
    expect(readPushGatewayBaseUrl()).toBe('http://localhost:4100/gateway');
  });
});
