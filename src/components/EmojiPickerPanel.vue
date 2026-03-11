<template>
  <div class="emoji-picker" :style="pickerStyle">
    <div class="emoji-picker__search">
      <q-input
        v-model="emojiSearch"
        class="tg-input"
        dense
        outlined
        rounded
        clearable
        placeholder="Search emoji"
      >
        <template #prepend>
          <q-icon name="search" />
        </template>
      </q-input>
    </div>

    <div
      ref="emojiScrollRef"
      class="emoji-picker__scroll"
    >
      <div
        v-if="activeEmojiGroup"
        class="emoji-picker__group"
      >
        <div class="emoji-picker__group-title">{{ activeEmojiGroup.label }}</div>
        <div class="emoji-picker__grid">
          <button
            v-for="entry in activeEmojiGroup.emojis"
            :key="entry.emoji"
            v-close-popup
            type="button"
            class="emoji-picker__item"
            :aria-label="entry.label"
            @mousedown.prevent
            @click="handleSelect(entry.emoji)"
          >
            <span class="emoji-picker__char">{{ entry.emoji }}</span>
            <AppTooltip>{{ entry.label }}</AppTooltip>
          </button>
        </div>
      </div>

      <div v-if="availableEmojiGroups.length === 0" class="emoji-picker__empty">
        No emoji found.
      </div>
    </div>

    <div
      v-if="availableEmojiGroups.length > 0"
      class="emoji-picker__tabs"
      role="tablist"
      aria-label="Emoji categories"
    >
      <button
        v-for="group in availableEmojiGroups"
        :key="group.key"
        type="button"
        class="emoji-picker__tab"
        :class="{ 'emoji-picker__tab--active': activeEmojiCategoryKey === group.key }"
        role="tab"
        :aria-selected="activeEmojiCategoryKey === group.key ? 'true' : 'false'"
        :aria-label="group.label"
        @click="selectEmojiCategory(group.key)"
      >
        <q-icon :name="group.icon" size="18px" />
        <AppTooltip anchor="top middle" self="bottom middle" :offset="[0, 8]">
          {{ group.label }}
        </AppTooltip>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import AppTooltip from 'src/components/AppTooltip.vue';
import { EMOJI_GROUPS, filterEmojiEntries, groupEmojiEntries } from 'src/data/topEmojis';
import type { EmojiCategoryKey, EmojiGroup } from 'src/data/topEmojis';

interface Props {
  width?: string;
  maxHeight?: string;
  columns?: number;
  itemMinHeight?: string;
  itemPadding?: string;
}

const props = withDefaults(defineProps<Props>(), {
  width: '360px',
  maxHeight: '300px',
  columns: 6,
  itemMinHeight: '42px',
  itemPadding: '10px 6px'
});

const emit = defineEmits<{
  (event: 'select', emoji: string): void;
}>();

const emojiSearch = ref('');
const emojiScrollRef = ref<HTMLElement | null>(null);
const activeEmojiCategoryKey = ref<EmojiCategoryKey | null>(null);

const pickerStyle = computed(() => ({
  '--emoji-picker-width': props.width,
  '--emoji-picker-max-height': props.maxHeight,
  '--emoji-picker-columns': `${props.columns}`,
  '--emoji-picker-item-min-height': props.itemMinHeight,
  '--emoji-picker-item-padding': props.itemPadding
}));

const isSearching = computed(() => emojiSearch.value.trim().length > 0);
const filteredEmojis = computed(() => filterEmojiEntries(emojiSearch.value));
const availableEmojiGroups = computed<EmojiGroup[]>(() => {
  if (!isSearching.value) {
    return EMOJI_GROUPS;
  }

  return groupEmojiEntries(filteredEmojis.value);
});
const activeEmojiGroup = computed<EmojiGroup | null>(() => {
  const groups = availableEmojiGroups.value;
  if (groups.length === 0) {
    return null;
  }

  return groups.find((group) => group.key === activeEmojiCategoryKey.value) ?? groups[0] ?? null;
});

watch(
  availableEmojiGroups,
  (groups) => {
    if (groups.length === 0) {
      activeEmojiCategoryKey.value = null;
      return;
    }

    const hasActiveCategory = groups.some((group) => group.key === activeEmojiCategoryKey.value);
    if (!hasActiveCategory) {
      activeEmojiCategoryKey.value = groups[0]?.key ?? null;
    }

    scrollEmojiListToTop();
  },
  { immediate: true }
);

function scrollEmojiListToTop(): void {
  void nextTick(() => {
    if (emojiScrollRef.value) {
      emojiScrollRef.value.scrollTop = 0;
    }
  });
}

function selectEmojiCategory(categoryKey: EmojiCategoryKey): void {
  if (!availableEmojiGroups.value.some((group) => group.key === categoryKey)) {
    return;
  }

  activeEmojiCategoryKey.value = categoryKey;
  scrollEmojiListToTop();
}

function handleSelect(emoji: string): void {
  emit('select', emoji);
}

function reset(): void {
  emojiSearch.value = '';

  if (emojiScrollRef.value) {
    emojiScrollRef.value.scrollTop = 0;
  }

  activeEmojiCategoryKey.value = EMOJI_GROUPS[0]?.key ?? null;
}

defineExpose({
  reset
});
</script>

<style scoped>
.emoji-picker {
  width: var(--emoji-picker-width);
  display: flex;
  flex-direction: column;
  padding: 10px;
}

.emoji-picker__search {
  margin-bottom: 10px;
}

.emoji-picker__scroll {
  flex: 1 1 auto;
  min-height: 0;
  max-height: var(--emoji-picker-max-height);
  overflow-y: auto;
  padding-right: 4px;
}

.emoji-picker__group + .emoji-picker__group {
  margin-top: 10px;
}

.emoji-picker__group-title {
  margin-bottom: 8px;
  padding: 0 2px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--q-primary) 58%, currentColor 42%);
}

.emoji-picker__grid {
  display: grid;
  grid-template-columns: repeat(var(--emoji-picker-columns), minmax(0, 1fr));
  gap: 6px;
}

.emoji-picker__item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: var(--emoji-picker-item-min-height);
  padding: var(--emoji-picker-item-padding);
  border: 1px solid var(--tg-btn-soft-border);
  border-radius: 12px;
  background: var(--tg-btn-soft-bg);
  box-shadow: var(--tg-btn-soft-shadow);
  cursor: pointer;
  transition:
    transform 0.18s ease,
    background-color 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.emoji-picker__item:hover {
  transform: translateY(-1px);
  background: var(--tg-btn-soft-hover-bg);
  border-color: color-mix(in srgb, var(--q-primary) 26%, var(--tg-btn-soft-border) 74%);
}

.emoji-picker__char {
  font-size: 22px;
  line-height: 1;
}

.emoji-picker__tabs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
  gap: 4px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid color-mix(in srgb, var(--tg-border) 88%, transparent);
}

.emoji-picker__tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 10px;
  background: var(--tg-btn-soft-bg);
  box-shadow: var(--tg-btn-soft-shadow);
  color: color-mix(in srgb, currentColor 72%, #60758f 28%);
  cursor: pointer;
  transition:
    color 0.18s ease,
    background-color 0.18s ease,
    transform 0.18s ease,
    border-color 0.18s ease;
}

.emoji-picker__tab:hover {
  background: var(--tg-btn-soft-hover-bg);
  border-color: var(--tg-btn-soft-border);
  color: inherit;
}

.emoji-picker__tab--active {
  background: color-mix(in srgb, var(--q-primary) 12%, var(--tg-btn-soft-hover-bg) 88%);
  border-color: color-mix(in srgb, var(--q-primary) 26%, var(--tg-btn-soft-border) 74%);
  color: var(--q-primary);
}

.emoji-picker__tab:active {
  transform: translateY(1px);
}

.emoji-picker__empty {
  padding: 14px 6px 6px;
  font-size: 13px;
  text-align: center;
  opacity: 0.7;
}
</style>
