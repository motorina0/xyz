<template>
  <q-dialog
    :model-value="uiStore.isComposeDialogOpen"
    transition-show="fade"
    transition-hide="fade"
    @update:model-value="handleDialogToggle"
    @show="handleShow"
  >
    <q-card class="compose-dialog">
      <div class="compose-dialog__header">
        <q-btn flat round dense icon="close" class="compose-dialog__close" @click="closeDialog" />
        <q-btn flat no-caps dense label="Drafts" class="compose-dialog__drafts" />
      </div>

      <div class="compose-dialog__body">
        <q-avatar size="40px" class="compose-dialog__avatar">
          <img :src="currentProfile?.picture" :alt="currentProfile?.displayName ?? 'Profile'" />
        </q-avatar>

        <div class="compose-dialog__main">
          <q-input
            ref="composerInput"
            v-model="draft"
            autogrow
            borderless
            class="compose-dialog__input"
            placeholder="What's happening?"
            maxlength="280"
          />

          <div class="compose-dialog__reply-setting">
            <q-icon name="public" size="16px" />
            <span>Everyone can reply</span>
          </div>

          <div class="compose-dialog__footer">
            <div class="compose-dialog__tools">
              <q-btn
                v-for="icon in composerTools"
                :key="icon"
                flat
                round
                dense
                :icon="icon"
                class="compose-dialog__tool"
              />
            </div>

            <div class="compose-dialog__actions">
              <span v-if="draft.length" class="text-scroll-soft">{{ draft.length }}/280</span>

              <q-btn
                no-caps
                unelevated
                label="Post"
                :disable="!canSubmit"
                class="scroll-button compose-dialog__submit"
                :class="{ 'compose-dialog__submit--active': canSubmit }"
                @click="submit"
              />
            </div>
          </div>
        </div>
      </div>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { QInput } from 'quasar';
import { computed, nextTick, ref } from 'vue';
import { useAuthStore } from '../../stores/auth';
import { useFeedStore } from '../../stores/feed';
import { useProfilesStore } from '../../stores/profiles';
import { useUiStore } from '../../stores/ui';

const authStore = useAuthStore();
const profilesStore = useProfilesStore();
const feedStore = useFeedStore();
const uiStore = useUiStore();

const draft = ref('');
const composerInput = ref<QInput | null>(null);
const composerTools = [
  'image',
  'gif_box',
  'bar_chart',
  'sentiment_satisfied_alt',
  'event',
  'location_on',
];

const currentProfile = computed(() =>
  profilesStore.getProfileByPubkey(authStore.currentPubkey),
);
const canSubmit = computed(() => draft.value.trim().length > 0);

function closeDialog(): void {
  uiStore.closeComposeDialog();
}

function handleDialogToggle(isOpen: boolean): void {
  if (isOpen) {
    uiStore.openComposeDialog();
    return;
  }

  closeDialog();
}

async function handleShow(): Promise<void> {
  await nextTick();
  composerInput.value?.focus();
}

function submit(): void {
  const content = draft.value.trim();
  if (!content) {
    return;
  }

  feedStore.createPost(content);
  draft.value = '';
  closeDialog();
}
</script>

<style scoped>
.compose-dialog {
  width: min(600px, calc(100vw - 32px));
  max-width: 600px;
  background: #000000;
  border: 1px solid rgba(83, 100, 113, 0.18);
  border-radius: 16px;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.02), 0 24px 80px rgba(0, 0, 0, 0.62);
}

.compose-dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px 0;
}

.compose-dialog__close {
  color: var(--scroll-text);
}

.compose-dialog__drafts {
  color: var(--scroll-accent);
  font-weight: 700;
}

.compose-dialog__body {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 8px 16px 12px;
}

.compose-dialog__main {
  flex: 1;
  min-width: 0;
}

.compose-dialog__input :deep(textarea) {
  min-height: 180px;
  color: var(--scroll-text);
  font-size: 1.38rem;
  line-height: 1.35;
}

.compose-dialog__reply-setting {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  color: var(--scroll-accent);
  font-size: 0.95rem;
  font-weight: 700;
}

.compose-dialog__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px solid var(--scroll-border);
}

.compose-dialog__tools {
  display: flex;
  align-items: center;
  gap: 4px;
}

.compose-dialog__tool {
  color: var(--scroll-accent);
}

.compose-dialog__actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.compose-dialog__submit {
  min-width: 76px;
  min-height: 36px;
  background: #3b4a54;
  color: rgba(15, 20, 25, 0.9);
  font-weight: 800;
}

.compose-dialog__submit--active {
  background: #eff3f4;
  color: #0f1419;
}

.compose-dialog__submit.q-btn--disabled {
  opacity: 1 !important;
}

@media (max-width: 599px) {
  .compose-dialog {
    width: 100vw;
    max-width: 100vw;
    min-height: 100vh;
    border: none;
    border-radius: 0;
  }

  .compose-dialog__input :deep(textarea) {
    min-height: 220px;
  }
}
</style>
