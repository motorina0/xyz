<template>
  <aside class="nav-rail">
    <q-btn
      v-for="item in navItems"
      :key="item.key"
      unelevated
      class="nav-rail__btn"
      :class="{ 'nav-rail__btn--active': active === item.key }"
      :aria-label="item.label"
      @click="$emit('select', item.key)"
    >
      <span class="nav-rail__icon-shell">
        <q-icon :name="item.icon" size="20px" />
        <q-badge
          v-if="item.key === 'chats' && unreadChatCount > 0"
          rounded
          color="primary"
          class="nav-rail__badge"
          :label="unreadChatBadgeLabel"
        />
      </span>

      <AppTooltip anchor="top middle" self="bottom middle" :offset="[0, 8]">
        {{ item.label }}
      </AppTooltip>
    </q-btn>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import AppTooltip from 'src/components/AppTooltip.vue';
import { useChatStore } from 'src/stores/chatStore';
import { formatUnreadChatBadgeLabel } from 'src/utils/unreadChatBadge';

const navItems = [
  { key: 'chats', label: 'Chats', icon: 'chat' },
  { key: 'contacts', label: 'Contacts', icon: 'contacts' },
  { key: 'settings', label: 'Settings', icon: 'settings' }
] as const;

const chatStore = useChatStore();

defineProps<{
  active: 'chats' | 'contacts' | 'settings';
}>();

defineEmits<{
  (event: 'select', value: 'chats' | 'contacts' | 'settings'): void;
}>();

const unreadChatCount = computed(() => chatStore.unreadChatCount);
const unreadChatBadgeLabel = computed(() => formatUnreadChatBadgeLabel(unreadChatCount.value));
</script>

<style scoped>
.nav-rail {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: center;
  gap: 2px;
  padding: 6px 8px calc(8px + env(safe-area-inset-bottom));
  background: var(--tg-panel-sidebar-bg);
}

.nav-rail__btn {
  border-radius: 10px;
  min-height: 48px;
  min-width: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--tg-text-secondary);
  background: transparent;
  border: 1px solid transparent;
  box-shadow: none;
  transition: background-color 0.2s ease, color 0.2s ease;
}

.nav-rail__icon-shell {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  min-width: 20px;
}

.nav-rail__badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  position: absolute;
  top: -7px;
  left: calc(100% - 2px);
  z-index: 1;
}

.nav-rail__btn:hover {
  background: var(--tg-hover);
  color: var(--tg-text);
}

.nav-rail__btn--active {
  background: var(--tg-active);
  color: var(--tg-active-text);
}

body.body--dark .nav-rail__btn {
  color: var(--tg-text-secondary);
  background: transparent;
}

body.body--dark .nav-rail__btn--active {
  color: var(--tg-active-text);
  background: var(--tg-active);
}
</style>
