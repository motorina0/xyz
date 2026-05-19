<template>
  <SettingsDetailLayout :title="$t('settings.language.titlePlural')" icon="language">
    <q-card flat bordered class="language-card">
      <q-card-section class="language-card__section">
        <div>
          <div class="text-body1">{{ $t('settings.language.field') }}</div>
          <div class="text-caption text-grey-6">
            {{ $t('settings.language.description') }}
          </div>
        </div>

        <q-select
          v-model="selectedLocale"
          class="nc-input language-card__select"
          outlined
          dense
          emit-value
          map-options
          option-label="label"
          option-value="code"
          :label="$t('settings.language.title')"
          :options="languageSelectOptions"
        />
      </q-card-section>
    </q-card>
  </SettingsDetailLayout>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import SettingsDetailLayout from 'src/components/SettingsDetailLayout.vue';
import { useI18n, type LocaleCode } from 'src/i18n';

const { locale, languages, setLocale } = useI18n();

const languageSelectOptions = computed(() =>
  languages.map((language) => ({
    code: language.code,
    label:
      language.nativeName === language.englishName
        ? language.nativeName
        : `${language.nativeName} - ${language.englishName}`
  }))
);

const selectedLocale = computed<LocaleCode>({
  get: () => locale.value,
  set: (value) => setLocale(value)
});
</script>

<style scoped>
.language-card {
  width: 100%;
  max-width: 560px;
  background: color-mix(in srgb, var(--nc-sidebar) 92%, transparent);
}

.language-card__section {
  display: grid;
  gap: 18px;
}

.language-card__select {
  width: 100%;
}
</style>
