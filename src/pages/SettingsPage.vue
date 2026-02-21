<template>
  <q-page class="settings-page">
    <div class="settings-shell" :class="{ 'settings-shell--mobile': isMobile }">
      <aside v-if="!isMobile" class="rail-panel">
        <AppNavRail active="settings" @select="handleRailSelect" />
      </aside>

      <aside class="settings-sidebar">
        <div class="settings-sidebar__top">
          <div class="settings-sidebar__title">Settings</div>
        </div>

        <q-list class="settings-menu q-pa-sm">
          <q-item
            v-for="item in settingsItems"
            :key="item.key"
            clickable
            class="settings-menu__item"
            :active="activeSettingKey === item.key"
            active-class="settings-menu__item--active"
            @click="goToSetting(item.routeName)"
          >
            <q-item-section avatar>
              <q-icon :name="item.icon" />
            </q-item-section>

            <q-item-section>
              <q-item-label>{{ item.label }}</q-item-label>
            </q-item-section>
          </q-item>
        </q-list>
      </aside>

      <section class="settings-content-panel">
        <router-view />
      </section>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import AppNavRail from 'src/components/AppNavRail.vue';

const $q = useQuasar();
const route = useRoute();
const router = useRouter();

const isMobile = computed(() => $q.screen.lt.md);

const settingsItems = [
  { key: 'profile', label: 'Profile', icon: 'face', routeName: 'settings-profile' },
  { key: 'theme', label: 'Theme', icon: 'wallpaper', routeName: 'settings-theme' },
  { key: 'language', label: 'Language', icon: 'language', routeName: 'settings-language' },
  {
    key: 'notifications',
    label: 'Notifications',
    icon: 'notifications',
    routeName: 'settings-notifications'
  }
] as const;

const activeSettingKey = computed(() => {
  const match = settingsItems.find((item) => item.routeName === route.name);
  return match?.key ?? 'profile';
});

function handleRailSelect(section: 'chats' | 'contacts' | 'settings'): void {
  if (section === 'chats') {
    void router.push({ name: 'home' });
    return;
  }

  if (section === 'contacts') {
    void router.push({ name: 'contacts' });
  }
}

function goToSetting(
  routeName: 'settings-profile' | 'settings-theme' | 'settings-language' | 'settings-notifications'
): void {
  void router.push({ name: routeName });
}
</script>

<style scoped>
.settings-page {
  height: calc(100vh - env(safe-area-inset-top));
  padding: 10px;
}

.settings-shell {
  display: grid;
  grid-template-columns: 88px 320px minmax(0, 1fr);
  gap: 10px;
  height: 100%;
}

.settings-shell--mobile {
  grid-template-columns: 1fr;
}

.rail-panel,
.settings-sidebar,
.settings-content-panel {
  border: 1px solid var(--tg-border);
  border-radius: 16px;
  overflow: hidden;
  background: var(--tg-sidebar);
}

.rail-panel {
  background: var(--tg-rail);
}

.settings-sidebar {
  display: flex;
  flex-direction: column;
}

.settings-sidebar__top {
  padding: 12px;
  border-bottom: 1px solid var(--tg-border);
}

.settings-sidebar__title {
  font-size: 22px;
  font-weight: 700;
}

.settings-menu {
  flex: 1;
}

.settings-menu__item {
  border-radius: 12px;
  margin-bottom: 6px;
}

.settings-menu__item--active {
  background: rgba(55, 119, 245, 0.12);
}

.settings-content-panel {
  background: var(--tg-thread-bg);
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
