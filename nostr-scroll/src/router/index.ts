import { route } from 'quasar/wrappers';
import { createMemoryHistory, createRouter, createWebHistory } from 'vue-router';
import routes from './routes';
import type { NostrAuthSession } from '../types/auth';
import { defaultAuthSession, normalizeStoredSession } from '../services/nostrAuthService';
import { STORAGE_KEYS, readStorageItem } from '../utils/storage';

function readStoredSession(): NostrAuthSession {
  return normalizeStoredSession(readStorageItem(STORAGE_KEYS.auth, defaultAuthSession));
}

export default route(() => {
  const Router = createRouter({
    scrollBehavior: () => ({ left: 0, top: 0 }),
    routes,
    history: process.env.SERVER ? createMemoryHistory() : createWebHistory(),
  });

  Router.beforeEach((to) => {
    const session = readStoredSession();
    const isAuthenticated = session.isAuthenticated && Boolean(session.currentPubkey);

    if (to.name === 'root') {
      return isAuthenticated ? { name: 'home' } : { name: 'login' };
    }

    if (to.name === 'login' && isAuthenticated) {
      return { name: 'home' };
    }

    if (to.meta.requiresAuth && !isAuthenticated) {
      return { name: 'login' };
    }

    return true;
  });

  return Router;
});
