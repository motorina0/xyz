<template>
  <div class="left-sidebar">
    <button class="brand-mark" type="button" @click="router.push({ name: 'home' })">
      <span class="brand-mark__glyph">Nostr</span>
    </button>

    <nav class="left-sidebar-nav">
      <button
        v-for="item in navItems"
        :key="item.key"
        class="nav-button"
        :class="{ 'nav-button--active': isActive(item) }"
        type="button"
        @click="handleNav(item)"
      >
        <q-icon :name="isActive(item) ? item.activeIcon ?? item.icon : item.icon" size="30px" />
        <span class="nav-button__label">{{ item.label }}</span>
        <q-badge v-if="item.badge" class="nav-button__badge" color="primary">{{ item.badge }}</q-badge>
      </button>
    </nav>

    <q-btn
      no-caps
      unelevated
      label="Post"
      class="scroll-button left-sidebar__post-button"
      @click="uiStore.openComposeDialog()"
    />

    <div v-if="currentProfile" class="profile-peek">
      <q-avatar size="52px">
        <img :src="currentProfile.picture" :alt="currentProfile.displayName" />
      </q-avatar>
      <div class="profile-peek__copy">
        <div class="profile-peek__name">{{ currentProfile.displayName }}</div>
        <div class="profile-peek__handle text-scroll-muted">@{{ currentProfile.name }}</div>
      </div>
      <q-btn flat round dense icon="more_horiz" class="profile-peek__more">
        <q-menu
          class="account-menu"
          anchor="top middle"
          self="bottom middle"
          :offset="[0, 10]"
        >
          <q-list class="account-menu__list" dense>
            <q-item clickable class="account-menu__item" @click="handleLogout">
              <q-item-section class="account-menu__label">Log out @{{ currentProfile.name }}</q-item-section>
            </q-item>
          </q-list>
        </q-menu>
      </q-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import { useProfilesStore } from '../../stores/profiles';
import { useUiStore } from '../../stores/ui';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const profilesStore = useProfilesStore();
const uiStore = useUiStore();

const currentProfile = computed(() =>
  profilesStore.getProfileByPubkey(authStore.currentPubkey),
);

type SidebarItem = {
  key: string;
  label: string;
  icon: string;
  activeIcon?: string;
  href?: string;
  routeName?: string;
  params?: Record<string, string> | undefined;
  badge?: string;
};

const navItems = computed<SidebarItem[]>(() => [
  {
    key: 'home',
    label: 'Home',
    icon: 'home',
    activeIcon: 'home',
    routeName: 'home',
  },
  {
    key: 'notifications',
    label: 'Notifications',
    icon: 'notifications_none',
    activeIcon: 'notifications',
  },
  {
    key: 'messages',
    label: 'Messages',
    icon: 'mail_outline',
    href: 'https://chat.nostr.com',
  },
  {
    key: 'bookmarks',
    label: 'Bookmarks',
    icon: 'bookmark_border',
    activeIcon: 'bookmark',
    routeName: 'bookmarks',
  },
  {
    key: 'profile',
    label: 'Profile',
    icon: 'person_outline',
    activeIcon: 'person',
    routeName: 'profile',
    params: currentProfile.value ? { pubkey: currentProfile.value.pubkey } : undefined,
  },
  {
    key: 'more',
    label: 'More',
    icon: 'more_horiz',
  },
]);

function isActive(item: SidebarItem): boolean {
  return Boolean(item.routeName && route.name === item.routeName);
}

function handleNav(item: SidebarItem): void {
  if (item.href) {
    window.open(item.href, '_blank', 'noopener,noreferrer');
    return;
  }

  if (!item.routeName) {
    return;
  }

  void router.push({ name: item.routeName, params: item.params });
}

async function handleLogout(): Promise<void> {
  authStore.logout();
  await router.replace({ name: 'login' });
}
</script>

<style scoped>
.left-sidebar {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 100vh;
  padding: 4px 0 12px;
}

.brand-mark {
  display: grid;
  place-items: center;
  width: auto;
  min-width: 52px;
  height: 52px;
  padding: 0 14px;
  margin-bottom: 4px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--scroll-text);
  cursor: pointer;
  transition: background 140ms ease;
}

.brand-mark:hover {
  background: var(--scroll-hover);
}

.brand-mark__glyph {
  font-size: 1.34rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.04em;
}

.left-sidebar-nav {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.nav-button {
  display: inline-flex;
  align-items: center;
  gap: 18px;
  min-height: 56px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--scroll-text);
  cursor: pointer;
  padding: 0 18px 0 14px;
  transition: background 140ms ease;
}

.nav-button:hover {
  background: var(--scroll-hover);
}

.nav-button__label {
  font-size: 1.28rem;
  font-weight: 500;
}

.nav-button--active {
  color: var(--scroll-text);
}

.nav-button--active .nav-button__label {
  font-weight: 700;
}

.nav-button__badge {
  margin-left: 2px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 4px 6px;
}

.left-sidebar__post-button {
  width: min(92%, 228px);
  min-height: 52px;
  margin-top: 8px;
  background: #eff3f4;
  color: #0f1419;
  font-size: 1.04rem;
  font-weight: 800;
}

.profile-peek {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: auto;
  padding: 12px 14px;
  border-radius: 999px;
  transition: background 140ms ease;
}

.profile-peek:hover {
  background: var(--scroll-hover);
}

.profile-peek__copy {
  flex: 1;
  min-width: 0;
}

.profile-peek__name {
  font-size: 0.94rem;
  font-weight: 700;
}

.profile-peek__handle {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-peek__more {
  color: var(--scroll-text);
}

:deep(.account-menu) {
  border: 1px solid rgba(83, 100, 113, 0.34);
  border-radius: 18px;
  background: #000000;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
  overflow: hidden;
}

:deep(.account-menu__list) {
  min-width: 240px;
  padding: 8px 0;
  background: #000000;
}

:deep(.account-menu__item) {
  min-height: 48px;
  padding: 0 18px;
}

:deep(.account-menu__item:hover) {
  background: rgba(231, 233, 234, 0.08);
}

:deep(.account-menu__label) {
  font-size: 1rem;
  font-weight: 700;
  color: var(--scroll-text);
}
</style>
