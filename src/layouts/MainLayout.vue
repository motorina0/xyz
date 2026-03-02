<template>
  <q-layout view="lHh Lpr lFf">
    <q-page-container>
      <router-view />
    </q-page-container>

    <q-footer v-if="isMobile" bordered class="mobile-nav">
      <div class="mobile-nav__inner">
        <q-btn
          flat
          stack
          no-caps
          icon="chat"
          label="Chats"
          class="mobile-nav__btn"
          :class="{ 'mobile-nav__btn--active': activeSection === 'chats' }"
          @click="goToSection('chats')"
        />
        <q-btn
          flat
          stack
          no-caps
          icon="contacts"
          label="Contacts"
          class="mobile-nav__btn"
          :class="{ 'mobile-nav__btn--active': activeSection === 'contacts' }"
          @click="goToSection('contacts')"
        />
        <q-btn
          flat
          stack
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
import { computed } from 'vue';
import { useQuasar } from 'quasar';
import { useRoute, useRouter } from 'vue-router';
import { useRelayStore } from 'src/stores/relayStore';
import { readDarkModePreference } from 'src/utils/themeStorage';

const $q = useQuasar();
const route = useRoute();
const router = useRouter();
const relayStore = useRelayStore();
const savedDarkMode = readDarkModePreference();
const isMobile = computed(() => $q.screen.lt.md);

type NavigationSection = 'chats' | 'contacts' | 'settings';

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

if (savedDarkMode !== null) {
  $q.dark.set(savedDarkMode);
}
relayStore.init();

function goToSection(section: NavigationSection): void {
  if (section === 'chats') {
    if (route.name !== 'home') {
      void router.push({ name: 'home' });
    }
    return;
  }

  if (section === 'contacts') {
    if (route.name !== 'contacts') {
      void router.push({ name: 'contacts' });
    }
    return;
  }

  if (route.name !== 'settings' && !String(route.name ?? '').startsWith('settings-')) {
    void router.push({ name: 'settings' });
  }
}
</script>

<style scoped>
.mobile-nav {
  background: var(--tg-sidebar);
  border-top: 1px solid var(--tg-border);
  padding-bottom: env(safe-area-inset-bottom);
}

.mobile-nav__inner {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
}

.mobile-nav__btn {
  color: #64748b;
  border-radius: 12px;
  min-height: 56px;
}

.mobile-nav__btn--active {
  color: #1f7a48;
  background: rgba(34, 197, 94, 0.14);
}

body.body--dark .mobile-nav__btn {
  color: #9ca3af;
}

body.body--dark .mobile-nav__btn--active {
  color: #73e2a7;
  background: rgba(22, 163, 74, 0.22);
}
</style>
