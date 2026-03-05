<template>
  <aside class="nav-rail">
    <div class="nav-rail__group">
      <q-btn
        v-for="item in topItems"
        :key="item.key"
        unelevated
        class="nav-rail__btn"
        :class="{ 'nav-rail__btn--active': active === item.key }"
        :aria-label="item.label"
        @click="$emit('select', item.key)"
      >
        <q-icon :name="item.icon" size="18px" />

        <AppTooltip anchor="center right" self="center left" :offset="[8, 0]">
          {{ item.label }}
        </AppTooltip>
      </q-btn>
    </div>

    <div class="nav-rail__settings">
      <q-btn
        unelevated
        class="nav-rail__btn"
        :class="{ 'nav-rail__btn--active': active === 'settings' }"
        aria-label="Settings"
        @click="$emit('select', 'settings')"
      >
        <q-icon name="settings" size="18px" />
        <AppTooltip anchor="center right" self="center left" :offset="[8, 0]">
          Settings
        </AppTooltip>
      </q-btn>
    </div>
  </aside>
</template>

<script setup lang="ts">
import AppTooltip from 'src/components/AppTooltip.vue';

const topItems = [
  { key: 'chats', label: 'Chats', icon: 'chat' },
  { key: 'contacts', label: 'Contacts', icon: 'contacts' }
] as const;

defineProps<{
  active: 'chats' | 'contacts' | 'settings';
}>();

defineEmits<{
  (event: 'select', value: 'chats' | 'contacts' | 'settings'): void;
}>();
</script>

<style scoped>
.nav-rail {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 10px 8px;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--tg-rail) 92%, #dbe8ff 8%) 0%,
      color-mix(in srgb, var(--tg-rail) 96%, #dbe8ff 4%) 100%
    );
}

.nav-rail__group {
  display: grid;
  gap: 6px;
}

.nav-rail__settings {
  display: grid;
  gap: 6px;
  padding-top: 8px;
}

.nav-rail__settings::before {
  content: '';
  display: block;
  height: 1px;
  margin: 0 4px;
  background: var(--tg-border);
}

.nav-rail__btn {
  border-radius: 14px;
  min-height: 44px;
  min-width: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #5d718d;
  background: color-mix(in srgb, var(--tg-sidebar) 70%, transparent);
  border: 1px solid transparent;
  transition:
    transform 0.2s ease,
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
}

.nav-rail__btn:hover {
  transform: translateY(-1px);
  background: color-mix(in srgb, var(--tg-sidebar) 86%, #deecff 14%);
  border-color: color-mix(in srgb, var(--tg-border) 86%, #8ca2bf 14%);
}

.nav-rail__btn--active {
  background: linear-gradient(140deg, rgba(30, 172, 124, 0.2), rgba(46, 135, 255, 0.2));
  color: #0f6246;
  border-color: rgba(45, 138, 255, 0.34);
  box-shadow: 0 9px 20px rgba(38, 112, 217, 0.18);
}

body.body--dark .nav-rail__btn {
  color: #9cacbf;
  background: color-mix(in srgb, var(--tg-sidebar) 72%, transparent);
}

body.body--dark .nav-rail__btn--active {
  color: #79e0b2;
  background: linear-gradient(140deg, rgba(16, 126, 93, 0.42), rgba(30, 94, 184, 0.34));
  border-color: rgba(86, 166, 255, 0.36);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.35);
}
</style>
