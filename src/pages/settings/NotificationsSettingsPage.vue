<template>
  <SettingsDetailLayout title="Notifications" icon="notifications">
    <q-card flat bordered class="notifications-card">
      <q-card-section class="notifications-card__section">
        <div class="notifications-card__row">
          <div>
            <div class="text-body1">{{ notificationsTitle }}</div>
            <div class="text-caption text-grey-6">
              {{ notificationCaption }}
            </div>
          </div>

          <q-toggle
            :model-value="notificationsEnabled"
            :disable="isPermissionRequestInFlight || !notificationsSupported"
            color="primary"
            checked-icon="notifications_active"
            unchecked-icon="notifications_off"
            @update:model-value="handleNotificationsToggle"
          />
        </div>
      </q-card-section>
    </q-card>
  </SettingsDetailLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useQuasar } from 'quasar';
import SettingsDetailLayout from 'src/components/SettingsDetailLayout.vue';
import {
  clearAndroidPushNotificationsPreference,
  getAndroidPushPermission,
  isAndroidPushNotificationConfigured,
  isAndroidPushNotificationSupported,
  readAndroidPushNotificationsPreference,
  requestAndroidPushNotificationsAfterLogin,
  saveAndroidPushNotificationsPreference,
  unregisterAndroidPushNotifications,
  type AndroidPushPermissionState
} from 'src/services/androidPushNotificationService';
import {
  getBrowserNotificationPermission,
  isBrowserNotificationSupported,
  readBrowserNotificationsPreference,
  requestBrowserNotificationPermission,
  saveBrowserNotificationsPreference
} from 'src/utils/browserNotificationPreference';
import { reportUiError } from 'src/utils/uiErrorHandler';

const $q = useQuasar();

type NotificationPermissionState =
  | BrowserNotificationPermissionState
  | AndroidPushPermissionState;

type BrowserNotificationPermissionState = ReturnType<typeof getBrowserNotificationPermission>;

const isAndroidRuntime = isAndroidPushNotificationSupported();
const storedBrowserNotificationsPreference = readBrowserNotificationsPreference();
const storedAndroidPushPreference = readAndroidPushNotificationsPreference();
const notificationsSupported = isAndroidRuntime
  ? isAndroidPushNotificationConfigured()
  : isBrowserNotificationSupported();
const notificationPermission = ref<NotificationPermissionState>(
  isAndroidRuntime ? 'prompt' : getBrowserNotificationPermission()
);
const notificationsEnabled = ref(
  isAndroidRuntime
    ? storedAndroidPushPreference && notificationPermission.value === 'granted'
    : storedBrowserNotificationsPreference &&
        (notificationPermission.value === 'granted' || notificationPermission.value === 'native')
);
const isPermissionRequestInFlight = ref(false);
const isDesktopRuntime =
  typeof window !== 'undefined' && Boolean(window.desktopRuntime?.isElectron);

if (
  storedBrowserNotificationsPreference &&
  notificationPermission.value !== 'granted' &&
  notificationPermission.value !== 'native'
) {
  saveBrowserNotificationsPreference(false);
}

onMounted(() => {
  if (!isAndroidRuntime) {
    return;
  }

  void refreshAndroidPermissionState();
});

const notificationsTitle = computed(() => {
  if (isAndroidRuntime) {
    return 'Show Android push notifications';
  }

  return isDesktopRuntime ? 'Show desktop notifications' : 'Show browser notifications';
});

const notificationCaption = computed(() => {
  if (!notificationsSupported) {
    if (isAndroidRuntime) {
      return 'Android push notifications need a configured push gateway.';
    }

    return isDesktopRuntime
      ? 'Desktop notifications are not supported in this app environment.'
      : 'This browser does not support notifications for this app.';
  }

  if (notificationsEnabled.value) {
    if (isAndroidRuntime) {
      return 'Show a notification when new messages arrive while this device is in the background.';
    }

    return isDesktopRuntime
      ? 'Show a desktop notification when a new message arrives.'
      : 'Show a browser notification when a new message arrives.';
  }

  if (notificationPermission.value === 'denied') {
    return isAndroidRuntime
      ? 'Android notifications are blocked. Allow them in Android settings, then toggle this back on.'
      : 'Browser notifications are blocked. Allow them in browser settings, then toggle this back on.';
  }

  if (notificationPermission.value === 'native') {
    return 'Off by default. Turning this on will enable desktop notifications for this app.';
  }

  return isAndroidRuntime
    ? 'Off by default. Turning this on will ask Android for notification permission.'
    : 'Off by default. Turning this on will ask the browser for notification permission.';
});

async function refreshAndroidPermissionState(): Promise<void> {
  notificationPermission.value = await getAndroidPushPermission();
  notificationsEnabled.value =
    readAndroidPushNotificationsPreference() && notificationPermission.value === 'granted';
  if (readAndroidPushNotificationsPreference() && notificationPermission.value !== 'granted') {
    saveAndroidPushNotificationsPreference(false);
    notificationsEnabled.value = false;
  }
}

async function handleNotificationsToggle(nextValue: boolean): Promise<void> {
  if (isAndroidRuntime) {
    await handleAndroidPushNotificationsToggle(nextValue);
    return;
  }

  if (!nextValue) {
    notificationsEnabled.value = false;
    saveBrowserNotificationsPreference(false);
    notificationPermission.value = getBrowserNotificationPermission();
    return;
  }

  if (!notificationsSupported) {
    notificationsEnabled.value = false;
    saveBrowserNotificationsPreference(false);
    $q.notify({
      type: 'warning',
      message: 'Browser notifications are not supported here.',
      position: 'top',
      timeout: 3000
    });
    return;
  }

  if (notificationPermission.value === 'native') {
    notificationsEnabled.value = true;
    saveBrowserNotificationsPreference(true);
    return;
  }

  isPermissionRequestInFlight.value = true;

  try {
    const permission = await requestBrowserNotificationPermission();
    notificationPermission.value = permission;

    if (permission === 'granted') {
      notificationsEnabled.value = true;
      saveBrowserNotificationsPreference(true);
      return;
    }

    notificationsEnabled.value = false;
    saveBrowserNotificationsPreference(false);

    $q.notify({
      type: permission === 'denied' ? 'warning' : 'info',
      message:
        permission === 'denied'
          ? 'Browser notifications were blocked. Allow them in browser settings to enable this.'
          : 'Browser notification permission was not granted.',
      position: 'top',
      timeout: 3200
    });
  } catch (error) {
    notificationsEnabled.value = false;
    saveBrowserNotificationsPreference(false);
    reportUiError(
      'Failed to update browser notification preference',
      error,
      'Failed to update browser notifications.'
    );
  } finally {
    isPermissionRequestInFlight.value = false;
  }
}

async function handleAndroidPushNotificationsToggle(nextValue: boolean): Promise<void> {
  if (!nextValue) {
    isPermissionRequestInFlight.value = true;
    try {
      await unregisterAndroidPushNotifications();
      notificationsEnabled.value = false;
      notificationPermission.value = await getAndroidPushPermission();
    } catch (error) {
      notificationsEnabled.value = readAndroidPushNotificationsPreference();
      reportUiError(
        'Failed to disable Android push notifications',
        error,
        'Failed to disable push notifications.'
      );
    } finally {
      isPermissionRequestInFlight.value = false;
    }
    return;
  }

  if (!notificationsSupported) {
    notificationsEnabled.value = false;
    clearAndroidPushNotificationsPreference();
    $q.notify({
      type: 'warning',
      message: 'Android push notifications need a configured push gateway.',
      position: 'top',
      timeout: 3200
    });
    return;
  }

  isPermissionRequestInFlight.value = true;
  try {
    const permission = await requestAndroidPushNotificationsAfterLogin();
    notificationPermission.value = permission;
    notificationsEnabled.value = permission === 'granted';

    if (permission !== 'granted') {
      clearAndroidPushNotificationsPreference();
      $q.notify({
        type: permission === 'denied' ? 'warning' : 'info',
        message:
          permission === 'denied'
            ? 'Android notifications were blocked. Allow them in Android settings to enable this.'
            : 'Android notification permission was not granted.',
        position: 'top',
        timeout: 3200
      });
    }
  } catch (error) {
    notificationsEnabled.value = false;
    clearAndroidPushNotificationsPreference();
    reportUiError(
      'Failed to update Android push notification preference',
      error,
      'Failed to update push notifications.'
    );
  } finally {
    isPermissionRequestInFlight.value = false;
  }
}
</script>

<style scoped>
.notifications-card {
  max-width: 520px;
  background: color-mix(in srgb, var(--tg-sidebar) 92%, transparent);
}

.notifications-card__section {
  display: grid;
  gap: 18px;
}

.notifications-card__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
</style>
