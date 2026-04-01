<template>
  <q-layout view="lHh Lpr lFf">
    <q-page-container class="main-layout__page-container">
      <router-view />
      <div
        v-if="showMobileNavigationMask"
        class="main-layout__mobile-nav-mask"
        aria-hidden="true"
      />
    </q-page-container>

    <q-footer v-if="showMobileNav" bordered class="mobile-nav">
      <div class="mobile-nav__inner">
        <q-btn
          :flat="activeSection !== 'chats'"
          :unelevated="activeSection === 'chats'"
          :color="activeSection === 'chats' ? 'primary' : undefined"
          :text-color="activeSection === 'chats' ? 'white' : undefined"
          no-caps
          class="mobile-nav__btn"
          :class="{ 'mobile-nav__btn--active': activeSection === 'chats' }"
          @click="goToSection('chats')"
        >
          <span class="mobile-nav__content">
            <span class="mobile-nav__icon-shell">
              <q-icon name="chat" class="mobile-nav__icon" />
              <q-badge
                v-if="unreadChatCount > 0"
                rounded
                color="primary"
                class="mobile-nav__badge"
                :label="unreadChatBadgeLabel"
              />
            </span>
            <span class="mobile-nav__label">Chats</span>
          </span>
        </q-btn>
        <q-btn
          :flat="activeSection !== 'contacts'"
          :unelevated="activeSection === 'contacts'"
          :color="activeSection === 'contacts' ? 'primary' : undefined"
          :text-color="activeSection === 'contacts' ? 'white' : undefined"
          no-caps
          class="mobile-nav__btn"
          :class="{ 'mobile-nav__btn--active': activeSection === 'contacts' }"
          @click="goToSection('contacts')"
        >
          <span class="mobile-nav__content">
            <span class="mobile-nav__icon-shell">
              <q-icon name="contacts" class="mobile-nav__icon" />
            </span>
            <span class="mobile-nav__label">Contacts</span>
          </span>
        </q-btn>
        <q-btn
          :flat="activeSection !== 'settings'"
          :unelevated="activeSection === 'settings'"
          :color="activeSection === 'settings' ? 'primary' : undefined"
          :text-color="activeSection === 'settings' ? 'white' : undefined"
          no-caps
          class="mobile-nav__btn"
          :class="{ 'mobile-nav__btn--active': activeSection === 'settings' }"
          @click="goToSection('settings')"
        >
          <span class="mobile-nav__content">
            <span class="mobile-nav__icon-shell">
              <q-icon name="settings" class="mobile-nav__icon" />
            </span>
            <span class="mobile-nav__label">Settings</span>
          </span>
        </q-btn>
      </div>
    </q-footer>
  </q-layout>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useRoute, useRouter } from 'vue-router';
import {
  loadChatsPage,
  loadContactsPage,
  loadSettingsPage
} from 'src/router/pageLoaders';
import { useChatStore } from 'src/stores/chatStore';
import {
  readDarkModePreference
} from 'src/utils/themeStorage';
import { reportUiError } from 'src/utils/uiErrorHandler';

const $q = useQuasar();
const route = useRoute();
const router = useRouter();
const chatStore = useChatStore();
const savedDarkMode = readDarkModePreference();
const isMobile = computed(() => $q.screen.lt.md);

type NavigationSection = 'chats' | 'contacts' | 'settings';
type RouteLoader = () => Promise<unknown>;

const activeSection = computed<NavigationSection>(() => {
  const routeName = String(route.name ?? '');

  if (routeName === 'contacts') {
    return 'contacts';
  }

  if (routeName === 'settings' || routeName.startsWith('settings-')) {
    return 'settings';
  }

  return 'chats';
});
const pendingMobileSection = ref<NavigationSection | null>(null);
const showMobileNavigationMask = computed(() => isMobile.value && pendingMobileSection.value !== null);

const routeLoaders: Record<NavigationSection, RouteLoader> = {
  chats: loadChatsPage,
  contacts: loadContactsPage,
  settings: loadSettingsPage
};
const unreadChatCount = computed(() => chatStore.unreadChatCount);
const unreadChatBadgeLabel = computed(() =>
  unreadChatCount.value > 99 ? '99+' : String(unreadChatCount.value)
);

const showMobileNav = computed(() => {
  if (!isMobile.value) {
    return false;
  }

  if (route.name === 'chats') {
    return !(typeof route.params.pubkey === 'string' && route.params.pubkey.trim().length > 0);
  }

  if (route.name === 'contacts') {
    return !(typeof route.params.pubkey === 'string' && route.params.pubkey.trim().length > 0);
  }

  if (route.name === 'settings') {
    return true;
  }

  return false;
});

const visibleChatId = computed(() => {
  if (route.name !== 'chats') {
    return null;
  }

  if (typeof route.params.pubkey !== 'string') {
    return null;
  }

  const chatId = route.params.pubkey.trim().toLowerCase();
  return chatId || null;
});

watch(
  visibleChatId,
  (chatId) => {
    chatStore.setVisibleChatId(chatId);
  },
  { immediate: true }
);

const removeAfterEachHook = router.afterEach(() => {
  pendingMobileSection.value = null;
});
let mobilePreloadTimeoutId: number | null = null;
let startupRestoreFrameId: number | null = null;

if (savedDarkMode !== null) {
  $q.dark.set(savedDarkMode);
}

onMounted(() => {
  startupRestoreFrameId = window.requestAnimationFrame(() => {
    startupRestoreFrameId = null;
    void restoreStartupState();
  });

  if (!isMobile.value) {
    return;
  }

  mobilePreloadTimeoutId = window.setTimeout(() => {
    mobilePreloadTimeoutId = null;
    void preloadMobileSections();
  }, 900);
});

onBeforeUnmount(() => {
  removeAfterEachHook();

  if (mobilePreloadTimeoutId !== null) {
    window.clearTimeout(mobilePreloadTimeoutId);
  }

  if (startupRestoreFrameId !== null) {
    window.cancelAnimationFrame(startupRestoreFrameId);
  }
});

async function restoreStartupState(): Promise<void> {
  try {
    const [{ useNostrStore }, { useRelayStore }] = await Promise.all([
      import('src/stores/nostrStore'),
      import('src/stores/relayStore')
    ]);
    const relayStore = useRelayStore();
    relayStore.init();
    await useNostrStore().restoreStartupState(relayStore.relays);
  } catch (error) {
    console.error('Failed to restore app state on startup', error);
  }
}

async function preloadMobileSections(): Promise<void> {
  const sections = Object.entries(routeLoaders)
    .filter(([section]) => section !== activeSection.value)
    .map(([, loader]) => loader());

  const results = await Promise.allSettled(sections);
  const failedCount = results.filter((result) => result.status === 'rejected').length;
  if (failedCount > 0) {
    console.warn(`Failed to preload ${failedCount} mobile navigation page(s).`);
  }
}

function navigateToSection(section: NavigationSection, routeName: NavigationSection): void {
  if (isMobile.value && section !== activeSection.value) {
    pendingMobileSection.value = section;
  }

  void router.push({ name: routeName }).catch((error) => {
    pendingMobileSection.value = null;
    reportUiError(`Failed to navigate to ${section}`, error);
  });
}

function goToSection(section: NavigationSection): void {
  if (section === 'chats') {
    const hasActiveChatParam = typeof route.params.pubkey === 'string' && route.params.pubkey.trim().length > 0;
    if (route.name !== 'chats' || hasActiveChatParam) {
      navigateToSection('chats', 'chats');
    }
    return;
  }

  if (section === 'contacts') {
    const hasActiveContactParam =
      typeof route.params.pubkey === 'string' && route.params.pubkey.trim().length > 0;
    if (route.name !== 'contacts' || hasActiveContactParam) {
      navigateToSection('contacts', 'contacts');
    }
    return;
  }

  if (route.name !== 'settings' && !String(route.name ?? '').startsWith('settings-')) {
    navigateToSection('settings', 'settings');
  }
}
</script>

<style scoped>
.main-layout__page-container {
  position: relative;
}

.main-layout__mobile-nav-mask {
  position: absolute;
  inset: 0;
  z-index: 5;
  background: var(--tg-overlay);
  pointer-events: auto;
}

.mobile-nav {
  background: var(--tg-panel-sidebar-bg);
  border-top: 1px solid var(--tg-border);
  padding-bottom: env(safe-area-inset-bottom);
}

.mobile-nav__inner {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: center;
  gap: 2px;
  padding: 6px 8px 8px;
}

.mobile-nav__btn {
  color: var(--tg-text-secondary);
  border-radius: 10px;
  min-height: 46px;
  padding: 0 8px;
  border: 1px solid transparent;
  background: transparent;
  transition:
    background-color 0.2s ease,
    color 0.2s ease;
}

.mobile-nav__badge {
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  position: absolute;
  top: -7px;
  left: calc(100% - 2px);
  z-index: 1;
}

.mobile-nav__content {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.mobile-nav__icon-shell {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  min-width: 20px;
}

.mobile-nav__icon {
  font-size: 18px;
}

.mobile-nav__label {
  min-width: 0;
}

.mobile-nav__btn :deep(.q-btn__content) {
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.01em;
  width: 100%;
}

.mobile-nav__btn:hover {
  background: var(--tg-hover);
}

.mobile-nav__btn--active {
  background: var(--tg-active);
  color: var(--tg-active-text);
}

body.body--dark .mobile-nav__btn {
  color: var(--tg-text-secondary);
  background: transparent;
}

body.body--dark .mobile-nav__btn--active {
  background: var(--tg-active);
  color: var(--tg-active-text);
}
</style>
