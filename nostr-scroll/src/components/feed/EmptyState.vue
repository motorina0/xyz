<template>
  <div class="empty-state">
    <div class="empty-state__title">{{ title }}</div>
    <div class="empty-state__subtitle text-scroll-muted">{{ subtitle }}</div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  title: string;
  subtitle: string;
}

defineProps<Props>();
</script>

<style scoped>
.empty-state {
  padding: 48px 28px 64px;
}

.empty-state__title {
  font-size: 2rem;
  line-height: 1.1;
  font-weight: 800;
  margin-bottom: 14px;
  max-width: 14ch;
}

.empty-state__subtitle {
  max-width: 32ch;
  line-height: 1.5;
  white-space: pre-line;
}
</style>
