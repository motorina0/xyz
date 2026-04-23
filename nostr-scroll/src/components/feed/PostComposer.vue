<template>
  <div class="post-composer scroll-divider" data-testid="post-composer">
    <q-avatar size="40px" class="post-composer__avatar">
      <img :src="currentProfile?.picture" :alt="currentProfile?.displayName ?? 'Profile'" />
    </q-avatar>

    <div class="post-composer__body">
      <q-input
        v-model="draft"
        autogrow
        borderless
        class="post-composer__input"
        data-testid="post-composer-input"
        :placeholder="placeholder"
        maxlength="280"
      />

      <div class="post-composer__footer">
        <div class="post-composer__tools">
          <q-btn
            v-for="icon in composerTools"
            :key="icon"
            flat
            round
            dense
            :icon="icon"
            class="post-composer__tool"
          />
        </div>

        <div class="post-composer__submit-wrap">
          <span v-if="draft.length" class="text-scroll-soft">{{ draft.length }}/280</span>

          <q-btn
            no-caps
            unelevated
            :label="buttonLabel"
            :disable="!canSubmit || submitting"
            class="scroll-button post-composer__submit"
            data-testid="post-composer-submit"
            :class="{ 'post-composer__submit--active': canSubmit }"
            @click="submit"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useAuthStore } from '../../stores/auth';
import { useProfilesStore } from '../../stores/profiles';

interface Props {
  placeholder?: string;
  buttonLabel?: string;
  submitting?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: "What's happening?",
  buttonLabel: 'Post',
  submitting: false,
});

const emit = defineEmits<{
  submit: [content: string];
}>();

const draft = ref('');
const authStore = useAuthStore();
const profilesStore = useProfilesStore();

const currentProfile = computed(() =>
  profilesStore.getProfileByPubkey(authStore.currentPubkey),
);
const canSubmit = computed(() => draft.value.trim().length > 0);
const composerTools = ['image', 'gif_box', 'bar_chart', 'sentiment_satisfied_alt', 'event', 'location_on'];

function submit(): void {
  const content = draft.value.trim();
  if (!content) {
    return;
  }

  emit('submit', content);
  draft.value = '';
}
</script>

<style scoped>
.post-composer {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 14px 16px 10px;
}

.post-composer__body {
  flex: 1;
  min-width: 0;
}

.post-composer__input :deep(textarea) {
  min-height: 96px;
  color: var(--scroll-text);
  font-size: 1.34rem;
  line-height: 1.35;
}

.post-composer__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--scroll-border);
}

.post-composer__tools {
  display: flex;
  align-items: center;
  gap: 4px;
}

.post-composer__tool {
  color: var(--scroll-accent);
}

.post-composer__submit-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
}

.post-composer__submit {
  min-width: 76px;
  min-height: 34px;
  background: #3b4a54;
  color: rgba(15, 20, 25, 0.9);
  font-weight: 800;
}

.post-composer__submit--active {
  background: #eff3f4;
  color: #0f1419;
}

.post-composer__submit.q-btn--disabled {
  opacity: 1 !important;
}
</style>
