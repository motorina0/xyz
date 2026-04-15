import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('desktopRuntime', {
  isElectron: true,
  platform: process.platform,
  setUnreadChatBadge: (count: number, label: string) => {
    ipcRenderer.send('desktop:set-unread-chat-badge', { count, label });
  },
});
