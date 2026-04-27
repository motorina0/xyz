<template>
  <AppDialog
    v-model="dialogModel"
    :title="dialogTitle"
    :subtitle="dialogSubtitle"
    :persistent="true"
    :show-close="false"
    max-width="440px"
  >
    <div class="browser-notifications-login-dialog__body">
      You can also manage this later from <strong>Settings</strong> under <strong>Notifications</strong>.
    </div>

    <template #actions>
      <q-btn flat no-caps label="Not now" @click="handleSkip" />
      <q-btn unelevated no-caps color="primary" label="Enable" @click="handleEnable" />
    </template>
  </AppDialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import AppDialog from 'src/components/AppDialog.vue';
import { isAndroidPushNotificationSupported } from 'src/services/androidPushNotificationService';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void;
  (event: 'enable'): void;
  (event: 'skip'): void;
}>();

const dialogModel = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
});

const isDesktopRuntime = computed(
  () => typeof window !== 'undefined' && Boolean(window.desktopRuntime?.isElectron)
);
const isAndroidRuntime = computed(() => isAndroidPushNotificationSupported());
const dialogTitle = computed(() => {
  if (isAndroidRuntime.value || isDesktopRuntime.value) {
    return 'Enable Notifications';
  }

  return 'Enable Browser Notifications';
});
const dialogSubtitle = computed(() => {
  if (isAndroidRuntime.value) {
    return 'Get notified when new messages arrive. If you continue, Android will ask for notification permission.';
  }

  return isDesktopRuntime.value
    ? 'Get notified when new messages arrive. If you continue, desktop notifications will be enabled for this app.'
    : 'Get notified when new messages arrive. If you continue, your browser will ask for permission next.';
});

function handleEnable(): void {
  emit('update:modelValue', false);
  emit('enable');
}

function handleSkip(): void {
  emit('update:modelValue', false);
  emit('skip');
}
</script>

<style scoped>
.browser-notifications-login-dialog__body {
  color: var(--tg-text);
  line-height: 1.5;
}
</style>
