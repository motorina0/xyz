<template>
  <q-layout view="hHh Lpr lFf" class="app-shell-layout">
    <q-page-container class="scroll-page-shell">
      <div class="app-shell-grid">
        <aside class="app-shell-left gt-sm">
          <LeftSidebar />
        </aside>

        <main class="app-shell-center scroll-main-column">
          <slot />
        </main>

        <aside class="app-shell-right gt-md">
          <RightNewsPanel />
        </aside>
      </div>
    </q-page-container>

    <ComposePostDialog />
    <MobileBottomNav class="lt-md" />
  </q-layout>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useAppRelaysStore } from '../../stores/appRelays';
import { useAuthStore } from '../../stores/auth';
import { useFeedStore } from '../../stores/feed';
import { useMyRelaysStore } from '../../stores/myRelays';
import { useProfilesStore } from '../../stores/profiles';
import ComposePostDialog from '../feed/ComposePostDialog.vue';
import LeftSidebar from './LeftSidebar.vue';
import MobileBottomNav from './MobileBottomNav.vue';
import RightNewsPanel from './RightNewsPanel.vue';

const appRelaysStore = useAppRelaysStore();
const authStore = useAuthStore();
const profilesStore = useProfilesStore();
const feedStore = useFeedStore();
const myRelaysStore = useMyRelaysStore();

onMounted(() => {
  authStore.restoreSession();
  appRelaysStore.init();
  myRelaysStore.init();
  void profilesStore.ensureHydrated();
  void feedStore.ensureHydrated();

  if (authStore.isAuthenticated) {
    void myRelaysStore.hydrateFromNostr();
  }
});
</script>

<style scoped>
.app-shell-layout {
  background: var(--scroll-bg);
}

.app-shell-grid {
  display: grid;
  grid-template-columns: minmax(252px, 275px) minmax(0, 600px) minmax(320px, 350px);
  gap: 0;
  justify-content: center;
  max-width: 1265px;
  min-height: 100vh;
  margin: 0 auto;
}

.app-shell-left {
  padding: 0 18px 0 8px;
}

.app-shell-right {
  padding: 0 0 0 28px;
}

.app-shell-center {
  min-width: 0;
}

@media (max-width: 1279px) {
  .app-shell-grid {
    grid-template-columns: minmax(250px, 275px) minmax(0, 600px);
    max-width: 875px;
  }
}

@media (max-width: 1023px) {
  .app-shell-grid {
    grid-template-columns: minmax(0, 1fr);
    max-width: none;
  }

  .app-shell-center {
    border-left: none;
    border-right: none;
    padding-bottom: 60px;
  }
}
</style>
