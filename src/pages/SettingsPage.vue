<template>
  <q-page class="settings-page" :style-fn="settingsPageStyleFn">
    <div class="settings-shell" :class="{ 'settings-shell--mobile': isMobile }">
      <aside v-if="!isMobile" class="rail-panel">
        <AppNavRail active="settings" @select="handleRailSelect" />
      </aside>

      <aside v-if="!isMobile || isSettingsListView" class="settings-sidebar">
        <div class="settings-sidebar__top">
          <div class="settings-sidebar__title">Settings</div>
        </div>

        <q-list class="settings-menu q-pa-sm">
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
  padding: 12px;
  overflow: hidden;
  width: 100%;
  max-width: 100%;
}

.settings-shell {
  display: grid;
  grid-template-columns: 76px 320px minmax(0, 1fr);
  gap: 12px;
  height: 100%;
  min-height: 0;
  width: 100%;
  max-width: 100%;
}

.settings-shell--mobile {
  grid-template-columns: 1fr;
}

.rail-panel,
.settings-sidebar,
.settings-content-panel {
  border: 1px solid color-mix(in srgb, var(--tg-border) 88%, #8ea4c0 12%);
  border-radius: 18px;
  overflow: hidden;
  background: var(--tg-panel-sidebar-bg);
  box-shadow: var(--tg-shadow-sm);
}

.rail-panel {
  background: var(--tg-panel-rail-bg);
}

.settings-sidebar {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.settings-sidebar__top {
  padding: 13px;
  border-bottom: 1px solid color-mix(in srgb, var(--tg-border) 90%, #8fa5c1 10%);
  background: var(--tg-panel-header-bg);
  backdrop-filter: blur(10px);
}

.settings-sidebar__title {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.1;
}

.settings-menu {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.settings-menu__item {
  border-radius: 14px;
  margin-bottom: 8px;
  border: 1px solid transparent;
  transition:
    transform 0.2s ease,
    background-color 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.settings-menu__item:hover {
  transform: translateX(3px);
  background: linear-gradient(130deg, rgba(52, 137, 255, 0.1), rgba(28, 186, 137, 0.08));
  border-color: color-mix(in srgb, var(--tg-border) 78%, #8aa5c5 22%);
  box-shadow: 0 8px 16px rgba(53, 110, 186, 0.1);
}

.settings-menu__item--active {
  background: linear-gradient(130deg, rgba(52, 137, 255, 0.18), rgba(28, 186, 137, 0.14));
  border-color: rgba(56, 136, 255, 0.34);
  box-shadow: 0 10px 20px rgba(53, 110, 186, 0.14);
}

.settings-menu__item--danger {
  margin-top: 10px;
  color: #b42318;
}

.settings-menu__item--danger:hover {
  background: linear-gradient(130deg, rgba(239, 68, 68, 0.12), rgba(249, 115, 22, 0.1));
  border-color: rgba(220, 38, 38, 0.2);
  box-shadow: 0 8px 16px rgba(185, 28, 28, 0.1);
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
  color: #ff9e8f;
}

@media (max-width: 1023px) {
  .settings-page {
    padding: 0;
  }

  .settings-sidebar,
  .settings-content-panel {
    border-radius: 0;
    border-left: 0;
    border-right: 0;
  }
}
</style>
