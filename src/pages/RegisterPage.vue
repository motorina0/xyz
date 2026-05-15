<template>
  <div class="register-page auth-entry-page">
    <div class="register-shell" :class="{ 'register-shell--wide': showProfileOnboarding }">
      <AuthProfileOnboardingCard v-if="showProfileOnboarding" />

      <q-card v-else flat bordered class="register-card register-card--light">
        <q-card-section class="register-card__header">
          <div class="register-card__header-main">
            <q-btn
              flat
              round
              dense
              icon="arrow_back"
              color="primary"
              class="register-card__back-button"
              aria-label="Back"
              :disable="isLoggingIn"
              @click="goBackToAuth"
            />
            <div class="register-card__header-text">
              <div class="register-card__title">Create Account</div>
              <div class="register-card__subtitle" v-if="isCreatingAccount">Creating Account</div>
              <div class="register-card__subtitle" v-else>
                A new Nostr keypair has been generated for this account. Download the secret before
                continuing.
              </div>
            </div>
          </div>
        </q-card-section>

        <q-card-section class="register-card__actions">
          <q-linear-progress
            v-if="isCreatingAccount"
            size="10px"
            rounded
            color="primary"
            track-color="grey-3"
            instant-feedback
            :value="creationProgress"
          />

          <template v-else>
            <q-btn
              outline
              color="primary"
              no-caps
              icon="download"
              label="Download Account Secret"
              class="register-card__button"
              :disable="!generatedAccount"
              @click="handleDownloadSecret"
            />

            <q-btn
              unelevated
              color="primary"
              no-caps
              icon="login"
              label="Login Now"
              class="register-card__button"
              :disable="!generatedAccount"
              :loading="isLoggingIn"
              @click="handleLoginNow"
            />
          </template>
        </q-card-section>

        <q-card-section class="register-card__footer">
          <span>Made by the</span>
          <a
            href="https://lnbits.com"
            target="_blank"
            rel="noopener noreferrer"
            class="register-card__footer-logo-link"
            aria-label="LNbits"
          >
            <img src="/lnbits.svg" alt="" class="register-card__footer-logo" aria-hidden="true" />
          </a>
          <a
            href="https://lnbits.com"
            target="_blank"
            rel="noopener noreferrer"
            class="register-card__footer-link"
          >
            LNbits
          </a>
          <span>team.</span>
        </q-card-section>
      </q-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import AuthProfileOnboardingCard from 'src/components/AuthProfileOnboardingCard.vue';
import { useNostrStore } from 'src/stores/nostrStore';
import { reportUiError } from 'src/utils/uiErrorHandler';

interface GeneratedAccount {
  publicKeyHex: string;
  privateKeyHex: string;
  npub: string;
  nsec: string;
}

const router = useRouter();
const nostrStore = useNostrStore();
const generatedAccount = ref<GeneratedAccount | null>(null);
const isCreatingAccount = ref(true);
const creationProgress = ref(0);
const isLoggingIn = ref(false);
const showProfileOnboarding = ref(false);
const ACCOUNT_CREATION_DURATION_MS = 2000;
let creationAnimationFrameId: number | null = null;
let creationCompletionFrameId: number | null = null;
let creationStartedAtMs: number | null = null;

onMounted(() => {
  initializeRegisterPage();
});

onBeforeUnmount(() => {
  clearCreationTimers();
});

function initializeRegisterPage(): void {
  clearCreationTimers();
  isCreatingAccount.value = true;
  creationProgress.value = 0;
  creationStartedAtMs = null;
  creationAnimationFrameId = window.requestAnimationFrame(updateCreationProgress);
}

function clearCreationTimers(): void {
  if (creationAnimationFrameId !== null) {
    window.cancelAnimationFrame(creationAnimationFrameId);
    creationAnimationFrameId = null;
  }

  if (creationCompletionFrameId !== null) {
    window.cancelAnimationFrame(creationCompletionFrameId);
    creationCompletionFrameId = null;
  }

  creationStartedAtMs = null;
}

function updateCreationProgress(timestampMs: number): void {
  if (creationStartedAtMs === null) {
    creationStartedAtMs = timestampMs;
  }

  const elapsedMs = timestampMs - creationStartedAtMs;
  const normalizedProgress = Math.min(elapsedMs / ACCOUNT_CREATION_DURATION_MS, 1);
  creationProgress.value = normalizedProgress;

  if (normalizedProgress < 1) {
    creationAnimationFrameId = window.requestAnimationFrame(updateCreationProgress);
    return;
  }

  creationAnimationFrameId = null;
  creationCompletionFrameId = window.requestAnimationFrame(() => {
    creationCompletionFrameId = null;
    generateAccountKeys();
    isCreatingAccount.value = false;
  });
}

function generateAccountKeys(): void {
  try {
    const signer = NDKPrivateKeySigner.generate();
    generatedAccount.value = {
      publicKeyHex: signer.pubkey,
      privateKeyHex: signer.privateKey,
      npub: signer.npub,
      nsec: signer.nsec
    };
  } catch (error) {
    reportUiError('Failed to generate account keys', error, 'Failed to create account keys.');
  }
}

function handleDownloadSecret(): void {
  try {
    if (!generatedAccount.value) {
      return;
    }

    const secretFile = new Blob(
      [`${generatedAccount.value.npub}\n${generatedAccount.value.nsec}`],
      { type: 'text/plain;charset=utf-8' }
    );
    const objectUrl = URL.createObjectURL(secretFile);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `nostr-account-${generatedAccount.value.publicKeyHex.slice(0, 8)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    reportUiError('Failed to download account secret', error, 'Failed to download account secret.');
  }
}

async function goBackToAuth(): Promise<void> {
  try {
    await router.push({ name: 'auth' });
  } catch (error) {
    reportUiError('Failed to navigate back to login', error);
  }
}

async function handleLoginNow(): Promise<void> {
  if (isLoggingIn.value || !generatedAccount.value) {
    return;
  }

  isLoggingIn.value = true;
  try {
    const didSave = nostrStore.savePrivateKeyHex(generatedAccount.value.privateKeyHex);
    if (!didSave) {
      throw new Error('Failed to persist the generated account key.');
    }

    showProfileOnboarding.value = true;
  } catch (error) {
    reportUiError('Failed to log in with generated account', error, 'Failed to log in.');
  } finally {
    isLoggingIn.value = false;
  }
}
</script>

<style scoped>
.register-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 20px;
}

.register-shell {
  width: min(100%, 460px);
}

.register-shell--wide {
  width: min(100%, 560px);
}

.register-card {
  --register-card-chrome-height: 128px;
  --register-card-footer-height: calc(var(--register-card-chrome-height) / 2);
  border-radius: 20px;
  border: 1px solid var(--nc-border);
  overflow: hidden;
  background: var(--nc-panel-sidebar-bg);
  box-shadow: var(--nc-shadow-sm);
  backdrop-filter: blur(var(--nc-glass-blur));
}

.register-card--light {
  border-color: rgba(208, 220, 235, 0.82);
  background: rgba(239, 246, 251, 0.9);
  color: #182236;
  box-shadow: 0 18px 40px rgba(17, 40, 76, 0.16);
  backdrop-filter: blur(18px);
}

.register-card__header {
  height: var(--register-card-chrome-height);
  padding: 22px 22px 10px;
  box-sizing: border-box;
  background: var(--nc-panel-header-bg);
  border-bottom: 1px solid color-mix(in srgb, var(--nc-border) 90%, #8fa5c1 10%);
}

.register-card--light .register-card__header {
  background: rgba(255, 255, 255, 0.82);
  border-bottom-color: rgba(208, 220, 235, 0.82);
}

.register-card__header-main {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}

.register-card__header-text {
  min-width: 0;
}

.register-card__back-button {
  flex: 0 0 auto;
  margin-top: -2px;
  color: #2563eb;
}

.register-card__title {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.1;
}

.register-card__subtitle {
  margin-top: 8px;
  opacity: 0.75;
  line-height: 1.5;
}

.register-card__actions {
  display: grid;
  gap: 12px;
  padding: 10px 22px 22px;
}

.register-card__button {
  min-height: 44px;
  border-radius: 999px;
}

.register-card__footer {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 6px;
  height: var(--register-card-footer-height);
  padding: 10px 22px 14px;
  box-sizing: border-box;
  color: #64748b;
  font-size: 13px;
  border-top: 1px solid rgba(208, 220, 235, 0.72);
  background: rgba(255, 255, 255, 0.48);
}

.register-card__footer-logo-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
}

.register-card__footer-logo {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  border-radius: 50%;
}

.register-card__footer-link {
  color: #2563eb;
  font-weight: 700;
  text-decoration: none;
}

.register-card__footer-link:hover,
.register-card__footer-link:focus-visible {
  text-decoration: underline;
}
</style>
