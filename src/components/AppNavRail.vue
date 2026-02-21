<template>
  <aside class="nav-rail">
    <div class="nav-rail__group">
      <q-btn
        v-for="item in topItems"
        :key="item.key"
        unelevated
        class="nav-rail__btn"
        :class="{ 'nav-rail__btn--active': modelValue === item.key }"
        :aria-label="item.label"
        @click="$emit('update:modelValue', item.key)"
      >
        <q-icon :name="item.icon" size="20px" />

        <q-tooltip anchor="center right" self="center left" :offset="[8, 0]">
          {{ item.label }}
        </q-tooltip>
      </q-btn>
    </div>

    <q-btn
      unelevated
      class="nav-rail__btn"
      :class="{ 'nav-rail__btn--active': modelValue === 'settings' }"
      aria-label="Settings"
      @click="$emit('update:modelValue', 'settings')"
    >
      <q-icon name="settings" size="20px" />
      <q-tooltip anchor="center right" self="center left" :offset="[8, 0]">
        Settings
      </q-tooltip>
    </q-btn>
  </aside>
</template>

<script setup lang="ts">
const topItems = [
  { key: 'chats', label: 'Chats', icon: 'chat' },
  { key: 'contacts', label: 'Contacts', icon: 'contacts' }
] as const;

defineProps<{
  modelValue: 'chats' | 'contacts' | 'settings';
}>();

defineEmits<{
  (event: 'update:modelValue', value: 'chats' | 'contacts' | 'settings'): void;
}>();
</script>

<style scoped>
.nav-rail {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 10px 8px;
  background: var(--tg-rail);
}

.nav-rail__group {
  display: grid;
  gap: 8px;
}

.nav-rail__btn {
  border-radius: 12px;
  min-height: 44px;
  min-width: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  background: transparent;
  border: 1px solid transparent;
}

.nav-rail__btn--active {
  background: rgba(34, 197, 94, 0.14);
  color: #1f7a48;
  border-color: rgba(34, 197, 94, 0.28);
}

body.body--dark .nav-rail__btn {
  color: #9ca3af;
}

body.body--dark .nav-rail__btn--active {
  color: #73e2a7;
  background: rgba(22, 163, 74, 0.22);
  border-color: rgba(34, 197, 94, 0.35);
}
</style>
