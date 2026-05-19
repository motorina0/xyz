import type { RelayListEntry } from 'src/stores/relayStore';

export interface PushGatewayRelayInput {
  url: string;
  read: boolean;
}

export interface PushGatewayRegistrationPayload {
  ownerPubkey: string;
  deviceId: string;
  platform: 'android';
  appVersion: string;
  fcmToken: string;
  relays: PushGatewayRelayInput[];
  watchedPubkeys: string[];
  notificationsEnabled: boolean;
}

export interface PushGatewayUnregisterPayload {
  ownerPubkey: string;
  deviceId: string;
}

export interface PushGatewayNotificationResetPayload {
  ownerPubkey: string;
  deviceId: string;
}

export interface PushGatewaySigner {
  signHttpAuthHeader(input: { url: string; method: string; body?: string }): Promise<string>;
}

export type PushGatewayBaseUrlValidationReason = 'empty' | 'invalid' | 'protocol';

export interface PushGatewayBaseUrlValidation {
  isValid: boolean;
  normalizedUrl: string | null;
  reason: PushGatewayBaseUrlValidationReason | null;
}

export const DEFAULT_PUSH_GATEWAY_BASE_URL = 'https://push.lnbits.link';

const PUSH_GATEWAY_BASE_URL_STORAGE_KEY = 'push-gateway-base-url';

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function validatePushGatewayBaseUrl(value: string): PushGatewayBaseUrlValidation {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return {
      isValid: false,
      normalizedUrl: null,
      reason: 'empty',
    };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmedValue);
  } catch {
    return {
      isValid: false,
      normalizedUrl: null,
      reason: 'invalid',
    };
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return {
      isValid: false,
      normalizedUrl: null,
      reason: 'protocol',
    };
  }

  if (!parsedUrl.hostname) {
    return {
      isValid: false,
      normalizedUrl: null,
      reason: 'invalid',
    };
  }

  parsedUrl.hash = '';
  parsedUrl.search = '';

  return {
    isValid: true,
    normalizedUrl: parsedUrl.toString().replace(/\/+$/, ''),
    reason: null,
  };
}

function normalizePushGatewayBaseUrl(value: string | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const validation = validatePushGatewayBaseUrl(value);
  return validation.normalizedUrl;
}

export function readStoredPushGatewayBaseUrl(): string | null {
  if (!canUseStorage()) {
    return null;
  }

  try {
    return normalizePushGatewayBaseUrl(
      window.localStorage.getItem(PUSH_GATEWAY_BASE_URL_STORAGE_KEY) ?? undefined
    );
  } catch (error) {
    console.error('Failed to read saved push gateway URL.', error);
  }

  return null;
}

export function savePushGatewayBaseUrl(value: string): string {
  const validation = validatePushGatewayBaseUrl(value);
  if (!validation.isValid || !validation.normalizedUrl) {
    throw new Error('Push gateway URL must use http:// or https://.');
  }

  if (canUseStorage()) {
    try {
      window.localStorage.setItem(PUSH_GATEWAY_BASE_URL_STORAGE_KEY, validation.normalizedUrl);
    } catch (error) {
      console.error('Failed to persist push gateway URL.', error);
    }
  }

  return validation.normalizedUrl;
}

export function readPushGatewayBaseUrl(): string {
  const storedUrl = readStoredPushGatewayBaseUrl();
  if (storedUrl) {
    return storedUrl;
  }

  const processEnv =
    typeof process !== 'undefined' ? (process.env as Record<string, string | undefined>) : {};
  const viteEnv = import.meta.env as Record<string, string | undefined>;
  const configured = [
    processEnv.PUSH_GATEWAY_URL,
    processEnv.VITE_PUSH_GATEWAY_URL,
    viteEnv.PUSH_GATEWAY_URL,
    viteEnv.VITE_PUSH_GATEWAY_URL,
    DEFAULT_PUSH_GATEWAY_BASE_URL,
  ]
    .map(normalizePushGatewayBaseUrl)
    .find((value): value is string => typeof value === 'string' && value.length > 0);
  return configured ?? DEFAULT_PUSH_GATEWAY_BASE_URL;
}

export function isPushGatewayConfigured(): boolean {
  return readPushGatewayBaseUrl().length > 0;
}

function buildGatewayUrl(path: string): string {
  const baseUrl = readPushGatewayBaseUrl();
  if (!baseUrl) {
    throw new Error('Push gateway URL is not configured.');
  }

  return `${baseUrl}${path}`;
}

async function postSignedJson(
  path: string,
  payload: unknown,
  signer: PushGatewaySigner
): Promise<unknown> {
  const url = buildGatewayUrl(path);
  const body = JSON.stringify(payload);
  const authorization = await signer.signHttpAuthHeader({
    url,
    method: 'POST',
    body,
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization,
      'content-type': 'application/json',
    },
    body,
  });

  if (!response.ok) {
    let message = `Push gateway request failed with ${response.status}.`;
    try {
      const responseBody = (await response.json()) as { error?: unknown };
      if (typeof responseBody.error === 'string' && responseBody.error.trim()) {
        message = responseBody.error;
      }
    } catch {}

    throw new Error(message);
  }

  return response.json();
}

export async function registerPushGatewayDevice(
  payload: PushGatewayRegistrationPayload,
  signer: PushGatewaySigner
): Promise<void> {
  await postSignedJson('/v1/devices/register', payload, signer);
}

export async function refreshPushGatewayDevice(
  payload: PushGatewayRegistrationPayload,
  signer: PushGatewaySigner
): Promise<void> {
  await postSignedJson('/v1/devices/refresh', payload, signer);
}

export async function unregisterPushGatewayDevice(
  payload: PushGatewayUnregisterPayload,
  signer: PushGatewaySigner
): Promise<void> {
  await postSignedJson('/v1/devices/unregister', payload, signer);
}

export async function resetPushGatewayNotificationCounts(
  payload: PushGatewayNotificationResetPayload,
  signer: PushGatewaySigner
): Promise<void> {
  await postSignedJson('/v1/devices/notifications/reset', payload, signer);
}

export function mapRelayEntriesForPushGateway(entries: RelayListEntry[]): PushGatewayRelayInput[] {
  return entries
    .filter((entry) => entry.read !== false)
    .map((entry) => ({
      url: entry.url,
      read: true,
    }));
}
