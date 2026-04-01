const BROWSER_NOTIFICATIONS_STORAGE_KEY = 'ui-browser-notifications';

export type BrowserNotificationPermissionState = NotificationPermission | 'unsupported';

function canUseWindow(): boolean {
  return typeof window !== 'undefined';
}

function canUseStorage(): boolean {
  return canUseWindow() && typeof window.localStorage !== 'undefined';
}

export function isBrowserNotificationSupported(): boolean {
  return canUseWindow() && typeof window.Notification !== 'undefined';
}

export function getBrowserNotificationPermission(): BrowserNotificationPermissionState {
  if (!isBrowserNotificationSupported()) {
    return 'unsupported';
  }

  return window.Notification.permission;
}

export function readBrowserNotificationsPreference(): boolean {
  if (!canUseStorage()) {
    return false;
  }

  try {
    return window.localStorage.getItem(BROWSER_NOTIFICATIONS_STORAGE_KEY) === '1';
  } catch (error) {
    console.error('Failed to read saved browser notification preference.', error);
  }

  return false;
}

export function areBrowserNotificationsEnabled(): boolean {
  return (
    readBrowserNotificationsPreference() &&
    getBrowserNotificationPermission() === 'granted'
  );
}

export function saveBrowserNotificationsPreference(enabled: boolean): void {
  if (!canUseStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(BROWSER_NOTIFICATIONS_STORAGE_KEY, enabled ? '1' : '0');
  } catch (error) {
    console.error('Failed to persist browser notification preference.', error);
  }
}

export function clearBrowserNotificationsPreference(): void {
  if (!canUseStorage()) {
    return;
  }

  try {
    window.localStorage.removeItem(BROWSER_NOTIFICATIONS_STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear saved browser notification preference.', error);
  }
}

export async function requestBrowserNotificationPermission(): Promise<BrowserNotificationPermissionState> {
  if (!isBrowserNotificationSupported()) {
    return 'unsupported';
  }

  try {
    return await window.Notification.requestPermission();
  } catch (error) {
    console.error('Failed to request browser notification permission.', error);
  }

  return window.Notification.permission;
}

export async function requestBrowserNotificationsAfterLogin(): Promise<BrowserNotificationPermissionState> {
  if (!isBrowserNotificationSupported()) {
    saveBrowserNotificationsPreference(false);
    return 'unsupported';
  }

  const currentPermission = getBrowserNotificationPermission();
  if (currentPermission === 'granted') {
    saveBrowserNotificationsPreference(true);
    return currentPermission;
  }

  const permission = await requestBrowserNotificationPermission();
  saveBrowserNotificationsPreference(permission === 'granted');
  return permission;
}
