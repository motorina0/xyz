<template>
  <q-page class="settings-page" :style-fn="settingsPageStyleFn">
    <div class="settings-shell" :class="{ 'settings-shell--mobile': isMobile }">
      <aside v-if="!isMobile || isSettingsListView" class="settings-sidebar">
        <div class="settings-sidebar__top">
          <div class="settings-sidebar__title">Settings</div>
        </div>

        <q-list class="settings-menu">
          <q-item
            v-for="item in settingsItems"
            :key="item.key"
            clickable
            class="settings-menu__item"
            :class="{ 'settings-menu__item--danger': item.action === 'logout' }"
            :active="item.routeName ? activeSettingKey === item.key : false"
            active-class="settings-menu__item--active"
            @click="handleSettingsItemClick(item)"
          >
            <q-item-section avatar>
              <q-icon :name="item.icon" />
            </q-item-section>

            <q-item-section>
              <q-item-label>{{ item.label }}</q-item-label>
            </q-item-section>
          </q-item>
        </q-list>
        <AppStatus compact />
        <AppNavRail
          v-if="!isMobile"
          class="settings-sidebar__nav"
          active="settings"
          @select="handleRailSelect"
        />
      </aside>

      <section v-if="!isMobile || !isSettingsListView" class="settings-content-panel">
        <router-view />
      </section>
    </div>

    <AppDialog
      v-model="isLogoutDialogOpen"
      title="Log Out"
      subtitle="This will remove your saved key, chats, contacts, relays, caches, and other local app data from this device."
      :persistent="isLoggingOut"
      :show-close="!isLoggingOut"
      max-width="460px"
    >
      <div class="settings-logout-dialog__body">
        You will be redirected to the login page.
      </div>

      <template #actions>
        <q-btn
          flat
          no-caps
          label="Cancel"
          :disable="isLoggingOut"
          @click="isLogoutDialogOpen = false"
        />
        <q-btn
          unelevated
          no-caps
          color="negative"
          label="Log Out"
          :loading="isLoggingOut"
          @click="handleConfirmLogout"
        />
      </template>
    </AppDialog>
  </q-page>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import AppDialog from 'src/components/AppDialog.vue';
import AppNavRail from 'src/components/AppNavRail.vue';
import AppStatus from 'src/components/AppStatus.vue';
import { useNostrStore } from 'src/stores/nostrStore';
import { reportUiError } from 'src/utils/uiErrorHandler';

const $q = useQuasar();
const route = useRoute();
const router = useRouter();
const nostrStore = useNostrStore();

const isMobile = computed(() => $q.screen.lt.md);
const isSettingsListView = computed(() => route.name === 'settings');
const isLogoutDialogOpen = ref(false);
const isLoggingOut = ref(false);

type SettingsRouteName =
  | 'settings-profile'
  | 'settings-theme'
  | 'settings-relays'
  | 'settings-language'
  | 'settings-notifications'
  | 'settings-developer';

interface SettingsItem {
  key: string;
  label: string;
  icon: string;
  routeName?: SettingsRouteName;
  action?: 'logout';
}

const settingsItems: SettingsItem[] = [
  { key: 'profile', label: 'Profile', icon: 'face', routeName: 'settings-profile' },
  { key: 'relays', label: 'Relays', icon: 'satellite_alt', routeName: 'settings-relays' },
  { key: 'theme', label: 'Theme', icon: 'wallpaper', routeName: 'settings-theme' },
  { key: 'language', label: 'Language', icon: 'language', routeName: 'settings-language' },
  {
    key: 'notifications',
    label: 'Notifications',
    icon: 'notifications',
    routeName: 'settings-notifications'
  },
  {
    key: 'developer',
    label: 'Developer',
    icon: 'terminal',
    routeName: 'settings-developer'
  },
  { key: 'logout', label: 'Log Out', icon: 'logout', action: 'logout' }
];

const activeSettingKey = computed(() => {
  const match = settingsItems.find((item) => item.routeName === route.name);
  return match?.key ?? null;
});

watch(
  [isMobile, () => route.name],
  ([mobile, routeName]) => {
    if (!mobile && routeName === 'settings') {
      void router.replace({ name: 'settings-profile' });
    }
  },
  { immediate: true }
);

function settingsPageStyleFn(offset: number, height: number): Record<string, string> {
  const pageHeight = Math.max(height - offset, 0);

  return {
    height: `${pageHeight}px`,
    minHeight: `${pageHeight}px`
  };
}

function handleRailSelect(section: 'chats' | 'contacts' | 'settings'): void {
  try {
    if (section === 'chats') {
      void router.push({ name: 'chats' });
      return;
    }

    if (section === 'contacts') {
      void router.push({ name: 'contacts' });
    }
  } catch (error) {
    reportUiError('Failed to navigate from settings rail', error);
  }
}

function goToSetting(routeName: SettingsRouteName): void {
  try {
    void router.push({ name: routeName });
  } catch (error) {
    reportUiError('Failed to open settings section', error);
  }
}

function handleSettingsItemClick(item: SettingsItem): void {
  if (item.action === 'logout') {
    isLogoutDialogOpen.value = true;
    return;
  }

  if (item.routeName) {
    goToSetting(item.routeName);
  }
}

async function handleConfirmLogout(): Promise<void> {
  if (isLoggingOut.value) {
    return;
  }

  isLoggingOut.value = true;

  try {
    await nostrStore.logout();
    await router.replace({ name: 'auth' });
    window.location.reload();
  } catch (error) {
    isLoggingOut.value = false;
    reportUiError('Failed to log out', error, 'Failed to log out.');
  }
}
</script>

<style scoped>
.settings-page {
  height: calc(100vh - env(safe-area-inset-top));
  padding: 0;
  overflow: hidden;
  width: 100%;
  max-width: 100%;
  background: var(--tg-app-background);
}

.settings-shell {
  display: grid;
  grid-template-columns: minmax(300px, 380px) minmax(0, 1fr);
  gap: 0;
  height: 100%;
  min-height: 0;
  width: 100%;
  max-width: 100%;
  background: var(--tg-panel-thread-bg);
}

.settings-shell--mobile {
  grid-template-columns: 1fr;
}

.settings-sidebar,
.settings-content-panel {
  overflow: hidden;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

.settings-sidebar {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  background: var(--tg-panel-sidebar-bg);
  border-right: 1px solid var(--tg-border);
}

.settings-sidebar__top {
  padding: 12px;
  border-bottom: 1px solid var(--tg-border);
  background: var(--tg-panel-header-bg);
}

.settings-sidebar__title {
  font-size: 20px;
  font-weight: 600;
  line-height: 1.2;
}

.settings-menu {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.settings-menu__item {
  border-radius: 0;
  min-height: 56px;
  margin-bottom: 0;
  border: 0;
  border-bottom: 1px solid var(--tg-border);
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease;
}

.settings-menu__item:hover {
  transform: none;
  background: var(--tg-hover);
}

.settings-menu__item--active {
  background: var(--tg-active);
  color: var(--tg-active-text);
}

.settings-menu__item--danger {
  margin-top: 0;
  color: #f39aa0;
}

.settings-menu__item--danger:hover {
  background: rgba(239, 107, 115, 0.12);
}

.settings-logout-dialog__body {
  font-size: 14px;
  line-height: 1.5;
  color: color-mix(in srgb, currentColor 78%, #64748b 22%);
}

.settings-content-panel {
  background: transparent;
  min-height: 0;
}

body.body--dark .settings-menu__item--danger {
  color: #f7a7ad;
}

.settings-sidebar__nav {
  border-top: 1px solid var(--tg-border);
}

@media (max-width: 1023px) {
  .settings-sidebar,
  .settings-content-panel {
    border-right: 0;
  }
}
</style>
