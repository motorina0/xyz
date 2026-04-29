<template>
  <div class="relay-info-node" :style="indentStyle">
    <q-input
      v-if="isSupportedNipsField"
      :label="displayLabel"
      :model-value="supportedNipsCsvValue"
      dense
      outlined
      readonly
      disable
    />

    <q-input
      v-else-if="isPrimitive(value)"
      :label="displayLabel"
      :model-value="formatPrimitive(value)"
      dense
      outlined
      readonly
      disable
    />

    <div v-else-if="Array.isArray(value)" class="relay-info-group">
      <div class="relay-info-group__label">{{ displayLabel }}</div>

      <div class="relay-info-group__children">
        <q-input
          v-if="value.length === 0"
          label="value"
          model-value="[]"
          dense
          outlined
          readonly
          disable
        />

        <template v-else>
          <RelayInfoFields
            v-for="(entry, index) in value"
            :key="`${fieldLabel}-${index}`"
            :label="`[${index}]`"
            :value="entry"
            :depth="depth + 1"
          />
        </template>
      </div>
    </div>

    <div v-else class="relay-info-group">
      <div class="relay-info-group__label">{{ displayLabel }}</div>

      <div class="relay-info-group__children">
        <q-input
          v-if="objectEntries.length === 0"
          label="value"
          model-value="{}"
          dense
          outlined
          readonly
          disable
        />

        <template v-else>
          <RelayInfoFields
            v-for="[key, entry] in objectEntries"
            :key="`${fieldLabel}-${key}`"
            :label="key"
            :value="entry"
            :depth="depth + 1"
          />
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

defineOptions({
  name: 'RelayInfoFields'
});

const props = withDefaults(
  defineProps<{
    value: unknown;
    label?: string;
    depth?: number;
  }>(),
  {
    label: 'value',
    depth: 0
  }
);

const fieldLabel = computed(() => props.label || 'value');
const displayLabel = computed(() => humanizeLabel(fieldLabel.value));
const indentStyle = computed(() => ({
  paddingLeft: `${Math.max(0, props.depth) * 12}px`
}));

const objectEntries = computed<[string, unknown][]>(() => {
  if (!isRecord(props.value)) {
    return [];
  }

  return Object.entries(props.value);
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPrimitive(value: unknown): boolean {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

const isSupportedNipsField = computed(() => {
  if (normalizeLabel(fieldLabel.value) !== 'supported_nips' || !Array.isArray(props.value)) {
    return false;
  }

  return props.value.every((entry) => isPrimitive(entry));
});

const supportedNipsCsvValue = computed(() => {
  if (!Array.isArray(props.value)) {
    return '';
  }

  return props.value.map((entry) => formatPrimitive(entry)).join(', ');
});

function formatPrimitive(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  return String(value);
}

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_');
}

function humanizeLabel(value: string): string {
  const trimmed = value.trim();
  const indexMatch = trimmed.match(/^\[(\d+)\]$/);
  if (indexMatch) {
    return `Item ${Number(indexMatch[1]) + 1}`;
  }

  const normalized = normalizeLabel(trimmed).replace(/[^a-z0-9_]/g, '_');
  const words = normalized
    .split('_')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => toDisplayWord(part));

  if (words.length === 0) {
    return 'Value';
  }

  return words.join(' ');
}

function toDisplayWord(part: string): string {
  const acronyms: Record<string, string> = {
    nip: 'NIP',
    nips: 'NIPs',
    url: 'URL',
    ws: 'WS',
    id: 'ID'
  };

  if (acronyms[part]) {
    return acronyms[part];
  }

  return part.charAt(0).toUpperCase() + part.slice(1);
}
</script>

<style scoped>
.relay-info-group {
  border-left: 1px solid var(--nc-border);
  padding-left: 8px;
}

.relay-info-group__label {
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  margin-bottom: 6px;
}

.relay-info-group__children {
  display: grid;
  gap: 8px;
}
</style>
