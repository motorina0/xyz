import { route } from 'quasar/wrappers';
import {
  createMemoryHistory,
  createRouter,
  createWebHashHistory,
  createWebHistory
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
    history: createHistory(process.env.VUE_ROUTER_BASE)
  });

  Router.beforeEach((to) => {
    if (to.name === 'auth' || to.name === 'register') {
      return true;
    }

    if (process.env.SERVER) {
      return true;
    }

    if (hasStoredPublicKey()) {
      return true;
    }

    return '/login';
  });

  return Router;
});
