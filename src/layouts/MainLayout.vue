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
          icon="chat"
          label="Chats"
          class="mobile-nav__btn"
          :class="{ 'mobile-nav__btn--active': activeSection === 'chats' }"
          @click="goToSection('chats')"
        />
        <q-btn
          :flat="activeSection !== 'contacts'"
          :unelevated="activeSection === 'contacts'"
          :color="activeSection === 'contacts' ? 'primary' : undefined"
          :text-color="activeSection === 'contacts' ? 'white' : undefined"
          no-caps
          icon="contacts"
          label="Contacts"
          class="mobile-nav__btn"
          :class="{ 'mobile-nav__btn--active': activeSection === 'contacts' }"
          @click="goToSection('contacts')"
        />
        <q-btn
          :flat="activeSection !== 'settings'"
          :unelevated="activeSection === 'settings'"
          :color="activeSection === 'settings' ? 'primary' : undefined"
          :text-color="activeSection === 'settings' ? 'white' : undefined"
          no-caps
          icon="settings"
          label="Settings"
          class="mobile-nav__btn"
          :class="{ 'mobile-nav__btn--active': activeSection === 'settings' }"
          @click="goToSection('settings')"
        />
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
import { useRelayStore } from 'src/stores/relayStore';
import { useNostrStore } from 'src/stores/nostrStore';
import {
  applyPanelOpacityPreference,
  readPanelOpacityPreference,
  readDarkModePreference
} from 'src/utils/themeStorage';
import { reportUiError } from 'src/utils/uiErrorHandler';

const $q = useQuasar();
const route = useRoute();
const router = useRouter();
const chatStore = useChatStore();
const relayStore = useRelayStore();
const nostrStore = useNostrStore();
const savedDarkMode = readDarkModePreference();
const savedPanelOpacity = readPanelOpacityPreference();
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

if (savedDarkMode !== null) {
  $q.dark.set(savedDarkMode);
}

applyPanelOpacityPreference(savedPanelOpacity);
relayStore.init();
void nostrStore.restoreStartupState(relayStore.relays).catch((error) => {
  console.error('Failed to restore app state on startup', error);
});

onMounted(() => {
  if (!isMobile.value) {
    return;
  }

  window.setTimeout(() => {
    void preloadMobileSections();
  }, 0);
});

onBeforeUnmount(() => {
  removeAfterEachHook();
});

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
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--tg-sidebar) 96%, transparent),
      color-mix(in srgb, var(--tg-sidebar) 88%, transparent)
    );
  pointer-events: auto;
}

.mobile-nav {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--tg-sidebar) 78%, transparent), var(--tg-sidebar));
  border-top: 1px solid color-mix(in srgb, var(--tg-border) 84%, #6b7d96 16%);
  padding-bottom: env(safe-area-inset-bottom);
  backdrop-filter: blur(14px);
}

.mobile-nav__inner {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: center;
  gap: 6px;
  padding: 6px 8px 5px;
}

.mobile-nav__btn {
  color: #55697f;
  border-radius: 12px;
  min-height: 42px;
  padding: 0 8px;
  border: 1px solid color-mix(in srgb, var(--tg-border) 74%, transparent);
  background: color-mix(in srgb, var(--tg-sidebar) 90%, #eef5ff 10%);
  transition:
    transform 0.2s ease,
    background-color 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    color 0.2s ease;
}

.mobile-nav__btn :deep(.q-btn__content) {
  gap: 5px;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.mobile-nav__btn :deep(.q-icon) {
  font-size: 18px;
}

.mobile-nav__btn:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--tg-border) 72%, #6d8db8 28%);
  background: color-mix(in srgb, var(--tg-sidebar) 82%, #dce9ff 18%);
}

.mobile-nav__btn--active {
  border-color: rgba(33, 110, 236, 0.68);
  box-shadow: 0 8px 18px rgba(30, 102, 214, 0.24);
}

body.body--dark .mobile-nav__btn {
  color: #a5b6c9;
  border-color: color-mix(in srgb, var(--tg-border) 72%, transparent);
  background: color-mix(in srgb, var(--tg-sidebar) 90%, #102035 10%);
}

body.body--dark .mobile-nav__btn--active {
  border-color: rgba(128, 193, 255, 0.62);
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.38);
}
</style>
