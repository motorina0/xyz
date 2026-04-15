import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('desktopRuntime', {
  isElectron: true,
  platform: process.platform,
});
