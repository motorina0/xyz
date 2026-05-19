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
  isSecureStorageAvailable: () => Promise<boolean>;
  encryptPrivateKey: (privateKeyHex: string) => Promise<string>;
  decryptPrivateKey: (encryptedPrivateKey: string) => Promise<string | null>;
  setUnreadChatBadge: (count: number, label: string) => void;
  showIncomingMessageNotification: (input: {
    chatPubkey: string;
    title: string;
    body: string;
  }) => void;
  onOpenChatFromNotification: (listener: (chatPubkey: string) => void) => () => void;
}

interface Window {
  desktopRuntime?: DesktopRuntimeInfo;
}
