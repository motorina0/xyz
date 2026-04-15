declare namespace NodeJS {
  interface ProcessEnv {
    QUASAR_PUBLIC_FOLDER: string;
    QUASAR_ELECTRON_PRELOAD_FOLDER: string;
    QUASAR_ELECTRON_PRELOAD_EXTENSION: string;
    APP_URL: string;
  }
}

interface DesktopRuntimeInfo {
  isElectron: true;
  platform: NodeJS.Platform;
}

interface Window {
  desktopRuntime?: DesktopRuntimeInfo;
}
