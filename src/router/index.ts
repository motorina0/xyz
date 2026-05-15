import { route } from 'quasar/wrappers';
import { finalizePendingLogoutCleanup } from 'src/utils/logoutCleanup';
import {
  createMemoryHistory,
  createRouter,
  createWebHashHistory,
  createWebHistory,
} from 'vue-router';
import routes from './routes';

const PUBLIC_KEY_STORAGE_KEY = 'npub';

function hasStoredPublicKey(): boolean {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return false;
  }

  return Boolean(window.localStorage.getItem(PUBLIC_KEY_STORAGE_KEY)?.trim());
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
    const hasLoggedInUser = hasStoredPublicKey();

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
