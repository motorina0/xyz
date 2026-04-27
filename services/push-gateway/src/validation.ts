import type { DeviceRegistrationInput, DeviceUnregisterInput, RelayRegistration } from './types.js';

const HEX_PUBKEY_PATTERN = /^[0-9a-f]{64}$/;
const MAX_DEVICE_ID_LENGTH = 160;
const MAX_TOKEN_LENGTH = 4096;
const MAX_RELAY_COUNT = 64;
const MAX_WATCHED_PUBKEY_COUNT = 256;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizePubkey(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return HEX_PUBKEY_PATTERN.test(normalized) ? normalized : null;
}

export function normalizeDeviceId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_DEVICE_ID_LENGTH) {
    return null;
  }

  return normalized;
}

export function normalizeFcmToken(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_TOKEN_LENGTH) {
    return null;
  }

  return normalized;
}

export function normalizeRelayUrl(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'wss:' && parsed.protocol !== 'ws:') {
      return null;
    }

    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeRelays(value: unknown): RelayRegistration[] {
  if (!Array.isArray(value) || value.length > MAX_RELAY_COUNT) {
    return [];
  }

  const relays = new Map<string, RelayRegistration>();
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }

    const url = normalizeRelayUrl(entry.url);
    if (!url) {
      continue;
    }

    relays.set(url, {
      url,
      read: typeof entry.read === 'boolean' ? entry.read : true,
    });
  }

  return Array.from(relays.values()).filter((relay) => relay.read);
}

function normalizeWatchedPubkeys(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > MAX_WATCHED_PUBKEY_COUNT) {
    return [];
  }

  const pubkeys = new Set<string>();
  for (const entry of value) {
    const pubkey = normalizePubkey(entry);
    if (pubkey) {
      pubkeys.add(pubkey);
    }
  }

  return Array.from(pubkeys).sort((first, second) => first.localeCompare(second));
}

export function parseDeviceRegistrationInput(value: unknown): DeviceRegistrationInput {
  if (!isRecord(value)) {
    throw new Error('Registration body must be an object.');
  }

  const ownerPubkey = normalizePubkey(value.ownerPubkey);
  const deviceId = normalizeDeviceId(value.deviceId);
  const fcmToken = normalizeFcmToken(value.fcmToken);
  const relays = normalizeRelays(value.relays);
  const watchedPubkeys = normalizeWatchedPubkeys(value.watchedPubkeys);
  const appVersion = typeof value.appVersion === 'string' ? value.appVersion.trim() : '';

  if (!ownerPubkey) {
    throw new Error('A valid ownerPubkey is required.');
  }

  if (!deviceId) {
    throw new Error('A valid deviceId is required.');
  }

  if (value.platform !== 'android') {
    throw new Error('Only the android platform is supported.');
  }

  if (!fcmToken) {
    throw new Error('A valid fcmToken is required.');
  }

  if (relays.length === 0) {
    throw new Error('At least one readable relay is required.');
  }

  if (!watchedPubkeys.includes(ownerPubkey)) {
    throw new Error('watchedPubkeys must include the owner pubkey.');
  }

  return {
    ownerPubkey,
    deviceId,
    platform: 'android',
    appVersion: appVersion || 'unknown',
    fcmToken,
    relays,
    watchedPubkeys,
    notificationsEnabled: value.notificationsEnabled === true,
  };
}

export function parseDeviceUnregisterInput(value: unknown): DeviceUnregisterInput {
  if (!isRecord(value)) {
    throw new Error('Unregister body must be an object.');
  }

  const ownerPubkey = normalizePubkey(value.ownerPubkey);
  const deviceId = normalizeDeviceId(value.deviceId);
  if (!ownerPubkey || !deviceId) {
    throw new Error('A valid ownerPubkey and deviceId are required.');
  }

  return {
    ownerPubkey,
    deviceId,
  };
}
