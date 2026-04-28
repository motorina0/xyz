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

export interface PushGatewaySigner {
  signHttpAuthHeader(input: { url: string; method: string; body?: string }): Promise<string>;
}

const DEFAULT_PUSH_GATEWAY_BASE_URL = 'https://push.lnbits.link';

export function readPushGatewayBaseUrl(): string {
  const processEnv = process.env as Record<string, string | undefined>;
  const viteEnv = import.meta.env as Record<string, string | undefined>;
  const configured = [
    processEnv.PUSH_GATEWAY_URL,
    processEnv.VITE_PUSH_GATEWAY_URL,
    viteEnv.PUSH_GATEWAY_URL,
    viteEnv.VITE_PUSH_GATEWAY_URL,
    DEFAULT_PUSH_GATEWAY_BASE_URL,
  ].find((value) => typeof value === 'string' && value.trim().length > 0);
  return configured.trim().replace(/\/+$/, '');
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

export function mapRelayEntriesForPushGateway(entries: RelayListEntry[]): PushGatewayRelayInput[] {
  return entries
    .filter((entry) => entry.read !== false)
    .map((entry) => ({
      url: entry.url,
      read: true,
    }));
}
