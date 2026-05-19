<template>
  <SettingsDetailLayout :title="$t('common.status')" icon="fact_check">
    <div class="status-settings-page">
      <AppStatus class="status-settings-page__panel" />
    </div>
  </SettingsDetailLayout>
</template>

<script setup lang="ts">
import AppStatus from 'src/components/AppStatus.vue';
import SettingsDetailLayout from 'src/components/SettingsDetailLayout.vue';
</script>

<style scoped>
.status-settings-page {
  display: flex;
  min-height: 100%;
  height: 100%;
}

.status-settings-page__panel {
  flex: 1;
  width: 100%;
  min-height: 100%;
}
</style>
