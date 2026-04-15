<template>
  <router-view />
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { Notify, useQuasar } from 'quasar';
import { installAppE2EBridge } from 'src/testing/e2eBridge';
import { readDarkModePreference } from 'src/utils/themeStorage';

const $q = useQuasar();
Notify.setDefaults({
  position: 'top',
  actions: [
    {
      icon: 'close',
      round: true,
      dense: true,
      flat: true,
      color: 'white',
      'aria-label': 'Dismiss',
    },
  ],
});
const savedDarkMode = readDarkModePreference();

if (savedDarkMode !== null) {
  $q.dark.set(savedDarkMode);
}

onMounted(() => {
  if (process.env.DEV) {
    installAppE2EBridge();
  }
});
</script>
