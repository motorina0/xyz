<template>
  <q-tooltip
    v-bind="$attrs"
    :anchor="anchor"
    :self="self"
    :offset="offset"
    class="app-tooltip"
    :style="{ '--app-tooltip-max-width': maxWidth }"
    transition-show="jump-down"
    transition-hide="jump-up"
  >
    <slot />
  </q-tooltip>
</template>

<script setup lang="ts">
type TooltipPosition =
  | 'bottom middle'
  | 'top middle'
  | 'top left'
  | 'top right'
  | 'top start'
  | 'top end'
  | 'center left'
  | 'center middle'
  | 'center right'
  | 'center start'
  | 'center end'
  | 'bottom left'
  | 'bottom right'
  | 'bottom start'
  | 'bottom end';

interface Props {
  anchor?: TooltipPosition;
  self?: TooltipPosition;
  offset?: [number, number];
  maxWidth?: string;
}

withDefaults(defineProps<Props>(), {
  anchor: 'bottom middle',
  self: 'top middle',
  offset: () => [0, 10],
  maxWidth: '280px'
});
</script>

<style>
.app-tooltip {
  font-family: var(--nc-title-font);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #eef6ff;
  border-radius: 8px;
  border: 1px solid rgba(124, 177, 255, 0.48);
  padding: 7px 12px;
  line-height: 1.2;
  max-width: var(--app-tooltip-max-width, 280px);
  background:
    radial-gradient(circle at 14% 20%, rgba(115, 180, 255, 0.3), transparent 46%),
    linear-gradient(135deg, rgba(24, 62, 133, 0.94), rgba(15, 118, 91, 0.92));
  box-shadow:
    0 10px 26px rgba(7, 23, 48, 0.36),
    inset 0 1px 0 rgba(255, 255, 255, 0.16);
  backdrop-filter: blur(var(--nc-glass-blur-soft));
}

body.body--dark .app-tooltip {
  border-color: rgba(111, 169, 255, 0.44);
  color: #ecf4ff;
  background:
    radial-gradient(circle at 16% 18%, rgba(95, 154, 255, 0.34), transparent 48%),
    linear-gradient(135deg, rgba(16, 44, 104, 0.94), rgba(10, 96, 74, 0.92));
  box-shadow:
    0 12px 28px rgba(0, 0, 0, 0.42),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}
</style>
