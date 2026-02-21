<template>
  <q-layout view="lHh Lpr lFf">
    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { useQuasar } from 'quasar';
import { readDarkModePreference } from 'src/utils/themeStorage';

const $q = useQuasar();
const savedDarkMode = readDarkModePreference();

if (savedDarkMode !== null) {
  $q.dark.set(savedDarkMode);
}
</script>
