import { onBeforeUnmount, ref } from 'vue';
import {
  getBrowserNotificationPermission,
  isBrowserNotificationSupported,
  requestBrowserNotificationsAfterLogin,
  saveBrowserNotificationsPreference
} from 'src/utils/browserNotificationPreference';

export function useBrowserNotificationsLoginPrompt() {
  const isDialogOpen = ref(false);
  let pendingResolver: ((value: boolean) => void) | null = null;

  function resolveDialog(value: boolean): void {
    const resolver = pendingResolver;
    pendingResolver = null;
    isDialogOpen.value = false;
    resolver?.(value);
  }

  async function openDialog(): Promise<boolean> {
    if (pendingResolver) {
      return false;
    }

    isDialogOpen.value = true;
    return await new Promise<boolean>((resolve) => {
      pendingResolver = resolve;
    });
  }

  async function handleBrowserNotificationsAfterLogin(): Promise<void> {
    if (!isBrowserNotificationSupported()) {
      saveBrowserNotificationsPreference(false);
      return;
    }

    const permission = getBrowserNotificationPermission();
    if (permission === 'granted') {
      saveBrowserNotificationsPreference(true);
      return;
    }

    saveBrowserNotificationsPreference(false);

    if (permission === 'denied') {
      return;
    }

    const shouldRequestPermission = await openDialog();
    if (!shouldRequestPermission) {
      return;
    }

    await requestBrowserNotificationsAfterLogin();
  }

  onBeforeUnmount(() => {
    resolveDialog(false);
  });

  return {
    isBrowserNotificationsLoginDialogOpen: isDialogOpen,
    handleBrowserNotificationsAfterLogin,
    confirmBrowserNotificationsLoginDialog: () => resolveDialog(true),
    skipBrowserNotificationsLoginDialog: () => resolveDialog(false)
  };
}
