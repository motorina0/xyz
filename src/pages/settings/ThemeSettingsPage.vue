<template>
  <SettingsDetailLayout title="Theme" icon="wallpaper">
    <q-card flat bordered class="theme-card">
      <q-card-section class="theme-card__section">
        <div>
          <div class="text-body1">Appearance</div>
          <div class="text-caption text-grey-6">
            Switch between light and dark appearance.
          </div>
        </div>

        <q-toggle
          v-model="darkMode"
          color="primary"
          checked-icon="dark_mode"
          unchecked-icon="light_mode"
          label="Dark mode"
          left-label
          class="theme-card__toggle"
        />
      </q-card-section>
    </q-card>
  </SettingsDetailLayout>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useQuasar } from 'quasar';
import SettingsDetailLayout from 'src/components/SettingsDetailLayout.vue';
import { saveDarkModePreference } from 'src/utils/themeStorage';

const $q = useQuasar();

const darkMode = computed({
  get: () => $q.dark.isActive,
  set: (value: boolean) => {
    $q.dark.set(value);
    saveDarkModePreference(value);
  }
});
</script>

<style scoped>
.theme-card {
  width: 100%;
  max-width: none;
  background: color-mix(in srgb, var(--nc-sidebar) 92%, transparent);
}

.theme-card__section {
  display: grid;
  gap: 18px;
}

.theme-card__toggle {
  width: 100%;
  justify-content: space-between;
}

.theme-card__toggle :deep(.q-toggle__inner) {
  flex-shrink: 0;
}

.theme-card__toggle :deep(.q-toggle__label) {
  flex: 1 1 auto;
  min-width: 0;
}

.theme-card__toggle :deep(.q-toggle__inner + .q-toggle__label),
.theme-card__toggle :deep(.q-toggle__label + .q-toggle__inner) {
  margin-left: 0;
}
</style>
