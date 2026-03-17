<template>
  <q-dialog
    v-model="dialogModel"
    :persistent="persistent"
    :position="dialogPosition"
    class="app-dialog-root"
  >
    <q-card
      class="app-dialog"
      :class="{ 'app-dialog--sheet': isMobile && mobileSheet }"
      :style="{ '--app-dialog-max-width': maxWidth }"
    >
      <div v-if="isMobile && mobileSheet" class="app-dialog__grabber" aria-hidden="true" />

      <q-card-section v-if="showHeader" class="app-dialog__header">
        <div class="app-dialog__header-copy">
          <slot name="title">
            <div v-if="title" class="app-dialog__title">{{ title }}</div>
          </slot>
          <slot name="subtitle">
            <div v-if="subtitle" class="app-dialog__subtitle">{{ subtitle }}</div>
          </slot>
        </div>

        <slot name="header-actions">
          <q-btn
            v-if="showClose"
            flat
            dense
            round
            icon="close"
            aria-label="Close dialog"
            class="app-dialog__close"
            @click="closeDialog"
          />
        </slot>
      </q-card-section>

      <q-card-section class="app-dialog__body" :class="bodyClass">
        <slot />
      </q-card-section>

      <q-card-actions v-if="$slots.actions" :align="actionsAlign" class="app-dialog__actions">
        <slot name="actions" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useQuasar } from 'quasar';

interface Props {
  modelValue: boolean;
  title?: string;
  subtitle?: string;
  maxWidth?: string;
  persistent?: boolean;
  showClose?: boolean;
  mobileSheet?: boolean;
  bodyClass?: string;
  actionsAlign?: 'left' | 'right' | 'center' | 'between' | 'around' | 'evenly';
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  subtitle: '',
  maxWidth: '440px',
  persistent: false,
  showClose: true,
  mobileSheet: true,
  bodyClass: '',
  actionsAlign: 'right'
});

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void;
}>();

const $q = useQuasar();

const isMobile = computed(() => $q.screen.lt.sm);

const dialogModel = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
});

const dialogPosition = computed(() => {
  return isMobile.value && props.mobileSheet ? 'bottom' : 'standard';
});

const showHeader = computed(() => {
  return Boolean(props.title || props.subtitle || props.showClose);
});

function closeDialog(): void {
  emit('update:modelValue', false);
}
</script>

<style scoped>
.app-dialog-root :deep(.q-dialog__inner) {
  padding: 18px;
}

.app-dialog-root :deep(.q-dialog__backdrop) {
  background: rgba(9, 17, 31, 0.48);
  backdrop-filter: blur(var(--tg-glass-blur-overlay));
}

.app-dialog {
  width: min(calc(100vw - 36px), var(--app-dialog-max-width, 440px));
  max-width: 100%;
  border-radius: 24px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--tg-border) 82%, #8ea4c0 18%);
  background:
    radial-gradient(circle at 12% 12%, rgba(98, 154, 255, 0.16), transparent 34%),
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--tg-sidebar) 88%, #f3f8ff 12%),
      color-mix(in srgb, var(--tg-sidebar) 96%, #f3f8ff 4%)
    );
  box-shadow: var(--tg-shadow-md);
}

.app-dialog--sheet {
  width: min(100vw, var(--app-dialog-max-width, 440px));
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}

.app-dialog__grabber {
  width: 46px;
  height: 5px;
  margin: 10px auto 2px;
  border-radius: 999px;
  background: rgba(100, 116, 139, 0.28);
}

.app-dialog__header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--tg-border) 90%, #8fa5c1 10%);
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--tg-sidebar) 86%, #dbe9ff 14%),
      color-mix(in srgb, var(--tg-sidebar) 96%, #dbe9ff 4%)
    );
}

.app-dialog__header-copy {
  min-width: 0;
  flex: 1;
}

.app-dialog__title {
  font-family: var(--tg-title-font);
  font-size: 17px;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: 0.02em;
}

.app-dialog__subtitle {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.4;
  color: color-mix(in srgb, currentColor 68%, #64748b 32%);
}

.app-dialog__close {
  flex: 0 0 auto;
  color: #64748b;
  background: rgba(255, 255, 255, 0.55);
}

.app-dialog__body {
  padding: 14px 16px 16px;
}

.app-dialog__actions {
  padding: 0 16px 16px;
  gap: 8px;
}

body.body--dark .app-dialog {
  border-color: color-mix(in srgb, var(--tg-border) 86%, #6b86a8 14%);
  background:
    radial-gradient(circle at 14% 14%, rgba(72, 126, 219, 0.24), transparent 36%),
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--tg-sidebar) 90%, #22324b 10%),
      color-mix(in srgb, var(--tg-sidebar) 98%, #22324b 2%)
    );
}

body.body--dark .app-dialog__header {
  border-bottom-color: color-mix(in srgb, var(--tg-border) 88%, #617c9d 12%);
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--tg-sidebar) 88%, #223652 12%),
      color-mix(in srgb, var(--tg-sidebar) 98%, #223652 2%)
    );
}

body.body--dark .app-dialog__close {
  color: #d8e5f6;
  background: rgba(28, 42, 61, 0.7);
}

body.body--dark .app-dialog__grabber {
  background: rgba(148, 163, 184, 0.28);
}

@media (max-width: 599px) {
  .app-dialog-root :deep(.q-dialog__inner) {
    padding: 0;
  }

  .app-dialog {
    width: 100vw;
    max-height: min(88vh, 760px);
  }

  .app-dialog__header {
    padding: 12px 14px 10px;
  }

  .app-dialog__body {
    padding: 12px 14px 14px;
  }

  .app-dialog__actions {
    padding: 0 14px max(14px, env(safe-area-inset-bottom));
  }
}
</style>
