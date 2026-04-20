import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import {
  defaultAuthSession,
  hasNip07Extension,
  loginWithExtension,
  loginWithPrivateKey,
  normalizeStoredSession,
  validatePrivateKey,
} from '../services/nostrAuthService';
import type { NostrAuthSession } from '../types/auth';
import {
  STORAGE_KEYS,
  readStorageItem,
  removeStorageItem,
  writeStorageItem,
} from '../utils/storage';

export const useAuthStore = defineStore('auth', () => {
  const session = ref<NostrAuthSession>(
    normalizeStoredSession(readStorageItem(STORAGE_KEYS.auth, defaultAuthSession)),
  );
  const loading = ref(false);

  const isAuthenticated = computed(
    () => session.value.isAuthenticated && Boolean(session.value.currentPubkey),
  );
  const currentPubkey = computed(() => session.value.currentPubkey);
  const currentAuthMethod = computed(() => session.value.method);
  const hasExtension = computed(() => hasNip07Extension());

  function persistSession(): void {
    if (!session.value.isAuthenticated || !session.value.currentPubkey) {
      removeStorageItem(STORAGE_KEYS.auth);
      return;
    }

    writeStorageItem(STORAGE_KEYS.auth, session.value);
  }

  function restoreSession(): void {
    session.value = normalizeStoredSession(readStorageItem(STORAGE_KEYS.auth, defaultAuthSession));
  }

  async function loginWithExtensionMethod(): Promise<void> {
    loading.value = true;

    try {
      session.value = await loginWithExtension();
      persistSession();
    } finally {
      loading.value = false;
    }
  }

  async function loginWithPrivateKeyMethod(input: string): Promise<void> {
    loading.value = true;

    try {
      session.value = loginWithPrivateKey(input);
      persistSession();
    } finally {
      loading.value = false;
    }
  }

  function logout(): void {
    session.value = { ...defaultAuthSession };
    removeStorageItem(STORAGE_KEYS.auth);
  }

  return {
    session,
    loading,
    isAuthenticated,
    currentPubkey,
    currentAuthMethod,
    hasExtension,
    loginWithExtension: loginWithExtensionMethod,
    loginWithPrivateKey: loginWithPrivateKeyMethod,
    logout,
    restoreSession,
    validatePrivateKey,
  };
});
