import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { chatDataService } from 'src/services/chatDataService';
import { inputSanitizerService } from 'src/services/inputSanitizerService';
import {
  isPushGatewayConfigured,
  mapRelayEntriesForPushGateway,
  type PushGatewayRegistrationPayload,
  refreshPushGatewayDevice,
  registerPushGatewayDevice,
  unregisterPushGatewayDevice,
} from 'src/services/pushGatewayClient';
import { useNostrStore } from 'src/stores/nostrStore';
import { useRelayStore } from 'src/stores/relayStore';
import type { RouteLocationRaw } from 'vue-router';

const ANDROID_PUSH_NOTIFICATIONS_STORAGE_KEY = 'ui-android-push-notifications';
const ANDROID_PUSH_DEVICE_ID_STORAGE_KEY = 'android-push-device-id';
const ANDROID_PUSH_TOKEN_STORAGE_KEY = 'android-push-fcm-token';
const ANDROID_PUSH_CHANNEL_ID = 'nostr_chat_messages';
const ANDROID_PUSH_CHANNEL_NAME = 'Messages';
const ANDROID_PUSH_CHANNEL_DESCRIPTION = 'Incoming Nostr Chat messages';

export type AndroidPushPermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';

let didInstallPushListeners = false;

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function isAndroidPushNotificationSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export function isAndroidPushNotificationConfigured(): boolean {
  return isAndroidPushNotificationSupported() && isPushGatewayConfigured();
}

export function readAndroidPushNotificationsPreference(): boolean {
  if (!canUseStorage()) {
    return false;
  }

  return window.localStorage.getItem(ANDROID_PUSH_NOTIFICATIONS_STORAGE_KEY) === '1';
}

export function saveAndroidPushNotificationsPreference(enabled: boolean): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(ANDROID_PUSH_NOTIFICATIONS_STORAGE_KEY, enabled ? '1' : '0');
}

export function clearAndroidPushNotificationsPreference(): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(ANDROID_PUSH_NOTIFICATIONS_STORAGE_KEY);
  window.localStorage.removeItem(ANDROID_PUSH_TOKEN_STORAGE_KEY);
}

function readStoredDeviceId(): string | null {
  if (!canUseStorage()) {
    return null;
  }

  return window.localStorage.getItem(ANDROID_PUSH_DEVICE_ID_STORAGE_KEY)?.trim() || null;
}

function ensureDeviceId(): string {
  const stored = readStoredDeviceId();
  if (stored) {
    return stored;
  }

  const deviceId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  if (canUseStorage()) {
    window.localStorage.setItem(ANDROID_PUSH_DEVICE_ID_STORAGE_KEY, deviceId);
  }
  return deviceId;
}

function readStoredFcmToken(): string | null {
  if (!canUseStorage()) {
    return null;
  }

  return window.localStorage.getItem(ANDROID_PUSH_TOKEN_STORAGE_KEY)?.trim() || null;
}

function saveFcmToken(token: string): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(ANDROID_PUSH_TOKEN_STORAGE_KEY, token);
}

export async function getAndroidPushPermission(): Promise<AndroidPushPermissionState> {
  if (!isAndroidPushNotificationSupported()) {
    return 'unsupported';
  }

  const permission = await PushNotifications.checkPermissions();
  return permission.receive === 'granted'
    ? 'granted'
    : permission.receive === 'denied'
      ? 'denied'
      : 'prompt';
}

async function requestAndroidPushPermission(): Promise<AndroidPushPermissionState> {
  if (!isAndroidPushNotificationSupported()) {
    return 'unsupported';
  }

  const permission = await PushNotifications.requestPermissions();
  return permission.receive === 'granted'
    ? 'granted'
    : permission.receive === 'denied'
      ? 'denied'
      : 'prompt';
}

async function ensureAndroidPushChannel(): Promise<void> {
  if (!isAndroidPushNotificationSupported()) {
    return;
  }

  await PushNotifications.createChannel({
    id: ANDROID_PUSH_CHANNEL_ID,
    name: ANDROID_PUSH_CHANNEL_NAME,
    description: ANDROID_PUSH_CHANNEL_DESCRIPTION,
    importance: 4,
    visibility: 1,
    sound: 'default',
    vibration: true,
  });
}

async function requestFcmToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let registrationHandle: { remove: () => Promise<void> } | null = null;
    let errorHandle: { remove: () => Promise<void> } | null = null;
    const timeoutId = window.setTimeout(() => {
      finish(() => reject(new Error('Timed out while registering for push notifications.')));
    }, 20_000);

    function finish(action: () => void): void {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeoutId);
      void registrationHandle?.remove();
      void errorHandle?.remove();
      action();
    }

    void Promise.all([
      PushNotifications.addListener('registration', (token) => {
        finish(() => resolve(token.value));
      }),
      PushNotifications.addListener('registrationError', (error) => {
        finish(() =>
          reject(new Error(error.error || 'Failed to register for push notifications.'))
        );
      }),
    ])
      .then(([nextRegistrationHandle, nextErrorHandle]) => {
        registrationHandle = nextRegistrationHandle;
        errorHandle = nextErrorHandle;
        return PushNotifications.register();
      })
      .catch((error: unknown) => {
        finish(() => reject(error));
      });
  });
}

async function buildRegistrationPayload(fcmToken: string): Promise<PushGatewayRegistrationPayload> {
  const nostrStore = useNostrStore();
  const relayStore = useRelayStore();
  relayStore.init();

  const ownerPubkey = nostrStore.getLoggedInPublicKeyHex();
  if (!ownerPubkey) {
    throw new Error('A logged-in public key is required for push notifications.');
  }

  const relays = mapRelayEntriesForPushGateway(relayStore.relayEntries);
  if (relays.length === 0) {
    throw new Error('At least one readable relay is required for push notifications.');
  }

  const watchedPubkeys = await nostrStore.listPrivateMessageRecipientPubkeys();
  if (!watchedPubkeys.includes(ownerPubkey)) {
    watchedPubkeys.unshift(ownerPubkey);
  }

  return {
    ownerPubkey,
    deviceId: ensureDeviceId(),
    platform: 'android',
    appVersion: process.env.APP_VERSION ?? '0.1.0',
    fcmToken,
    relays,
    watchedPubkeys,
    notificationsEnabled: true,
  };
}

export async function requestAndroidPushNotificationsAfterLogin(): Promise<AndroidPushPermissionState> {
  if (!isAndroidPushNotificationSupported()) {
    saveAndroidPushNotificationsPreference(false);
    return 'unsupported';
  }

  if (!isPushGatewayConfigured()) {
    saveAndroidPushNotificationsPreference(false);
    throw new Error('Push gateway URL is not configured.');
  }

  const permission = await requestAndroidPushPermission();
  if (permission !== 'granted') {
    saveAndroidPushNotificationsPreference(false);
    return permission;
  }

  await ensureAndroidPushChannel();
  const token = await requestFcmToken();
  saveFcmToken(token);
  await registerPushGatewayDevice(await buildRegistrationPayload(token), useNostrStore());
  saveAndroidPushNotificationsPreference(true);
  return 'granted';
}

export async function refreshAndroidPushRegistration(): Promise<void> {
  if (
    !isAndroidPushNotificationConfigured() ||
    !readAndroidPushNotificationsPreference() ||
    (await getAndroidPushPermission()) !== 'granted'
  ) {
    return;
  }

  const token = readStoredFcmToken();
  if (!token) {
    return;
  }

  await refreshPushGatewayDevice(await buildRegistrationPayload(token), useNostrStore());
}

export async function unregisterAndroidPushNotifications(): Promise<void> {
  if (!isAndroidPushNotificationSupported()) {
    clearAndroidPushNotificationsPreference();
    return;
  }

  const nostrStore = useNostrStore();
  const ownerPubkey = nostrStore.getLoggedInPublicKeyHex();
  const deviceId = readStoredDeviceId();
  if (isPushGatewayConfigured() && ownerPubkey && deviceId) {
    await unregisterPushGatewayDevice({ ownerPubkey, deviceId }, nostrStore);
  }

  try {
    await PushNotifications.unregister();
  } finally {
    clearAndroidPushNotificationsPreference();
  }
}

export function startAndroidPushNotificationListeners(
  onNotificationAction: (recipientPubkey: string | null) => void
): void {
  if (!isAndroidPushNotificationSupported() || didInstallPushListeners) {
    return;
  }

  didInstallPushListeners = true;
  void ensureAndroidPushChannel().catch((error) => {
    console.warn('Failed to create Android push notification channel.', error);
  });

  void PushNotifications.addListener('pushNotificationActionPerformed', (event) => {
    const recipientPubkey = inputSanitizerService.normalizeHexKey(
      String(event.notification.data?.recipientPubkey ?? '')
    );
    onNotificationAction(recipientPubkey);
  });
}

export async function resolveAndroidPushNotificationRoute(
  recipientPubkey: string | null
): Promise<RouteLocationRaw> {
  const nostrStore = useNostrStore();
  const loggedInPubkey = nostrStore.getLoggedInPublicKeyHex();
  if (!recipientPubkey || recipientPubkey === loggedInPubkey) {
    return { name: 'chats' };
  }

  await chatDataService.init();
  const chats = await chatDataService.listChats();
  const matchingGroup = chats.find((chat) => {
    if (chat.type !== 'group') {
      return false;
    }

    const currentEpochPubkey =
      typeof chat.meta?.current_epoch_public_key === 'string'
        ? chat.meta.current_epoch_public_key
        : typeof chat.meta?.epoch_public_key === 'string'
          ? chat.meta.epoch_public_key
          : '';
    return inputSanitizerService.normalizeHexKey(currentEpochPubkey) === recipientPubkey;
  });

  if (matchingGroup) {
    return {
      name: 'chats',
      params: {
        pubkey: matchingGroup.public_key,
      },
    };
  }

  return { name: 'chats' };
}
