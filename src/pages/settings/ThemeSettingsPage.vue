<template>
  <SettingsDetailLayout title="Theme" icon="wallpaper">
    <q-card flat bordered class="theme-card">
      <q-card-section class="theme-card__section">
        <div class="theme-card__row">
          <div>
            <div class="text-body1">Dark Mode</div>
            <div class="text-caption text-grey-6">
              Switch between light and dark appearance.
            </div>
          </div>

          <q-toggle
            v-model="darkMode"
            color="primary"
            checked-icon="dark_mode"
            unchecked-icon="light_mode"
          />
        </div>

        <q-input
          :model-value="panelOpacity"
          class="tg-input theme-card__input"
          type="number"
          min="0"
          max="100"
          outlined
          dense
          rounded
          label="Panel Opacity"
          suffix="%"
          @update:model-value="handlePanelOpacityInput"
        />

        <div class="text-caption text-grey-6">
          Set the opacity for the main app panels from 0 to 100.
        </div>
      </q-card-section>
    </q-card>
  </SettingsDetailLayout>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useQuasar } from 'quasar';
import SettingsDetailLayout from 'src/components/SettingsDetailLayout.vue';
import {
  readPanelOpacityPreference,
  savePanelOpacityPreference,
  saveDarkModePreference
} from 'src/utils/themeStorage';

const $q = useQuasar();
const panelOpacity = ref(readPanelOpacityPreference());

const darkMode = computed({
  get: () => $q.dark.isActive,
  set: (value: boolean) => {
    $q.dark.set(value);
    saveDarkModePreference(value);
  }
});

function normalizePanelOpacityInput(value: string | number | null): number {
  const parsedValue =
    typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);

  if (!Number.isFinite(parsedValue)) {
    return readPanelOpacityPreference();
  }

  return Math.min(100, Math.max(0, Math.round(parsedValue)));
}

function handlePanelOpacityInput(value: string | number | null): void {
  const normalizedValue = normalizePanelOpacityInput(value);
  panelOpacity.value = normalizedValue;
  savePanelOpacityPreference(normalizedValue);
}
</script>

<style scoped>
.theme-card {
  max-width: 520px;
  background: color-mix(in srgb, var(--tg-sidebar) 92%, transparent);
}

.theme-card__section {
  display: grid;
  gap: 18px;
}

.theme-card__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.theme-card__input {
  max-width: 180px;
}
</style>
