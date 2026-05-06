import { App } from '@capacitor/app';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';

export interface CapacitorAppLifecycleHandlers {
  setNativeAppActive: (value: boolean) => void;
}

type StopCapacitorAppLifecycleListeners = () => void;

function canUseCapacitorNativeAppLifecycle(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function removeListenerHandle(handle: PluginListenerHandle): void {
  void handle.remove().catch((error: unknown) => {
    console.warn('Failed to remove Capacitor app lifecycle listener.', error);
  });
}

export function startCapacitorAppLifecycleListeners({
  setNativeAppActive,
}: CapacitorAppLifecycleHandlers): StopCapacitorAppLifecycleListeners {
  if (!canUseCapacitorNativeAppLifecycle()) {
    return () => {};
  }

  let isStopped = false;
  const listenerHandles: PluginListenerHandle[] = [];

  const storeHandle = (handle: PluginListenerHandle): void => {
    if (isStopped) {
      removeListenerHandle(handle);
      return;
    }

    listenerHandles.push(handle);
  };

  void Promise.all([
    App.addListener('appStateChange', (state) => {
      setNativeAppActive(state.isActive);
    }),
    App.addListener('pause', () => {
      setNativeAppActive(false);
    }),
    App.addListener('resume', () => {
      setNativeAppActive(true);
    }),
  ])
    .then((handles) => {
      handles.forEach(storeHandle);
    })
    .catch((error: unknown) => {
      console.warn('Failed to start Capacitor app lifecycle listeners.', error);
    });

  void App.getState()
    .then((state) => {
      if (!isStopped) {
        setNativeAppActive(state.isActive);
      }
    })
    .catch(() => {
      // Some native shells do not return state immediately during boot. The listeners above
      // still provide the resume/pause signal once the bridge is ready.
    });

  return () => {
    isStopped = true;
    while (listenerHandles.length > 0) {
      const handle = listenerHandles.pop();
      if (handle) {
        removeListenerHandle(handle);
      }
    }
  };
}
