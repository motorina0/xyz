import { route } from 'quasar/wrappers';
import {
  clearAndroidPrivateKeySessionMetadata,
  hasUsableAndroidPrivateKeySession,
} from 'src/services/androidSecurePrivateKeyStorage';
import {
  clearElectronPrivateKeySessionMetadata,
  hasUsableElectronPrivateKeySession,
} from 'src/services/electronSecurePrivateKeyStorage';
import { PUBLIC_KEY_STORAGE_KEY } from 'src/stores/nostr/constants';
import { finalizePendingLogoutCleanup } from 'src/utils/logoutCleanup';
import {
  createMemoryHistory,
  createRouter,
  createWebHashHistory,
  createWebHistory,
} from 'vue-router';
import routes from './routes';

async function hasStoredPublicKey(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return false;
  }

  const hasPublicKey = Boolean(window.localStorage.getItem(PUBLIC_KEY_STORAGE_KEY)?.trim());
  if (!hasPublicKey) {
    return false;
  }

  if (!(await hasUsableAndroidPrivateKeySession())) {
    clearAndroidPrivateKeySessionMetadata();
    return false;
  }

  if (!(await hasUsableElectronPrivateKeySession())) {
    clearElectronPrivateKeySessionMetadata();
    return false;
  }

  return true;
}

export default route(() => {
  const createHistory = process.env.SERVER
    ? createMemoryHistory
    : process.env.VUE_ROUTER_MODE === 'history'
      ? createWebHistory
      : createWebHashHistory;

  const Router = createRouter({
    scrollBehavior: () => ({ left: 0, top: 0 }),
    routes,
    history: createHistory(process.env.VUE_ROUTER_BASE),
  });

  Router.beforeEach(async (to) => {
    if (!process.env.SERVER) {
      await finalizePendingLogoutCleanup();
    }

    if (process.env.SERVER) {
      return true;
    }

    const isAuthRoute = to.name === 'auth' || to.name === 'register';
    const hasLoggedInUser = await hasStoredPublicKey();

    if (isAuthRoute) {
      return hasLoggedInUser ? { name: 'chats' } : true;
    }

    if (hasLoggedInUser) {
      return true;
    }

    return '/login';
  });

  return Router;
});
