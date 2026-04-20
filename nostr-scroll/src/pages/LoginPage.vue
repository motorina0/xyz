<template>
  <q-page class="login-page">
    <div class="login-shell">
      <div class="login-card scroll-card">
        <div class="login-card__eyebrow">real nostr sign-in</div>
        <h1 class="login-card__title">nostr-scroll</h1>

        <template v-if="loginStep === 'welcome'">
          <p class="login-card__subtitle">
            Sign in with your Nostr identity and keep the same mock feed experience.
          </p>

          <q-btn
            no-caps
            unelevated
            color="primary"
            class="scroll-button login-card__button"
            label="Login"
            @click="openLoginOptions"
          />
        </template>

        <template v-else-if="loginStep === 'methods'">
          <p class="login-card__subtitle">Choose how you want to continue.</p>

          <q-btn
            no-caps
            unelevated
            color="primary"
            class="scroll-button login-card__button"
            icon="extension"
            label="Login with Extension"
            :loading="isExtensionLoginInProgress"
            @click="handleExtensionLogin"
          />

          <div class="login-card__hint text-scroll-muted">
            {{ authStore.hasExtension ? 'Detected a NIP-07 extension in this browser.' : 'No NIP-07 extension detected. You can still continue with a private key.' }}
          </div>

          <q-btn
            no-caps
            outline
            color="primary"
            class="scroll-button login-card__button"
            icon="vpn_key"
            label="Login with Key"
            @click="openKeyLogin"
          />

          <q-btn
            no-caps
            flat
            color="primary"
            class="scroll-button login-card__button login-card__button--ghost"
            label="Back"
            @click="goBackToWelcome"
          />
        </template>

        <template v-else>
          <p class="login-card__subtitle">
            Enter your `nsec` or 64-character hex private key to continue.
          </p>

          <div class="login-card__warning">
            Entering your private key is strongly discouraged. A NIP-07 extension is safer.
          </div>

          <q-input
            v-model="privateKey"
            dense
            outlined
            rounded
            type="password"
            class="login-card__input"
            label="Private Key (nsec or hex)"
            :error="Boolean(privateKeyError)"
            :error-message="privateKeyError"
            @keydown.enter.prevent="handleKeyLogin"
          />

          <div class="login-card__actions">
            <q-btn
              no-caps
              flat
              color="primary"
              class="scroll-button login-card__button login-card__button--ghost"
              label="Back"
              :disable="isKeyLoginInProgress"
              @click="goBackToLoginOptions"
            />

            <q-btn
              no-caps
              unelevated
              color="primary"
              class="scroll-button login-card__button"
              label="Login"
              :loading="isKeyLoginInProgress"
              :disable="!canLoginWithKey"
              @click="handleKeyLogin"
            />
          </div>
        </template>

        <div v-if="authError" class="login-card__error">
          {{ authError }}
        </div>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

type AuthStep = 'welcome' | 'methods' | 'key';

const router = useRouter();
const authStore = useAuthStore();

const loginStep = ref<AuthStep>('welcome');
const privateKey = ref('');
const authError = ref('');
const isExtensionLoginInProgress = ref(false);
const isKeyLoginInProgress = ref(false);
const privateKeyValidation = computed(() => authStore.validatePrivateKey(privateKey.value.trim()));
const privateKeyError = computed(() =>
  privateKey.value.trim() && !privateKeyValidation.value.isValid
    ? 'Enter a valid nsec or 64-character hex private key.'
    : '',
);
const canLoginWithKey = computed(() => privateKeyValidation.value.isValid && !isKeyLoginInProgress.value);

function clearAuthError(): void {
  authError.value = '';
}

function openLoginOptions(): void {
  loginStep.value = 'methods';
  clearAuthError();
}

function openKeyLogin(): void {
  loginStep.value = 'key';
  clearAuthError();
}

function goBackToWelcome(): void {
  loginStep.value = 'welcome';
  privateKey.value = '';
  clearAuthError();
}

function goBackToLoginOptions(): void {
  loginStep.value = 'methods';
  privateKey.value = '';
  clearAuthError();
}

async function goToHome(): Promise<void> {
  await router.replace({ name: 'home' });
}

async function handleExtensionLogin(): Promise<void> {
  if (isExtensionLoginInProgress.value) {
    return;
  }

  clearAuthError();
  isExtensionLoginInProgress.value = true;
  try {
    await authStore.loginWithExtension();
    await goToHome();
  } catch (error) {
    authError.value =
      error instanceof Error ? error.message : 'Failed to log in with a NIP-07 extension.';
  } finally {
    isExtensionLoginInProgress.value = false;
  }
}

async function handleKeyLogin(): Promise<void> {
  if (!canLoginWithKey.value || isKeyLoginInProgress.value) {
    return;
  }

  clearAuthError();
  isKeyLoginInProgress.value = true;
  try {
    await authStore.loginWithPrivateKey(privateKey.value.trim());
    await goToHome();
  } catch (error) {
    authError.value = error instanceof Error ? error.message : 'Failed to log in with a private key.';
  } finally {
    isKeyLoginInProgress.value = false;
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  padding: 28px 20px;
}

.login-shell {
  width: min(100%, 480px);
  margin: 0 auto;
  padding-top: min(15vh, 140px);
}

.login-card {
  padding: 32px 28px;
  background:
    radial-gradient(circle at top right, rgba(29, 155, 240, 0.16), transparent 36%),
    radial-gradient(circle at bottom left, rgba(251, 113, 133, 0.1), transparent 30%),
    var(--scroll-surface);
}

.login-card__eyebrow {
  color: var(--scroll-accent-strong);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  margin-bottom: 16px;
}

.login-card__title {
  margin: 0;
  font-size: clamp(2.5rem, 8vw, 3.8rem);
  line-height: 0.96;
  font-weight: 900;
}

.login-card__subtitle {
  margin: 14px 0 24px;
  color: var(--scroll-text-muted);
  font-size: 1rem;
  line-height: 1.5;
}

.login-card__button {
  width: 100%;
  min-height: 50px;
  font-size: 1rem;
  font-weight: 800;
}

.login-card__button--ghost {
  min-height: 42px;
}

.login-card__hint {
  margin: 10px 2px 16px;
  font-size: 0.88rem;
  line-height: 1.45;
}

.login-card__warning {
  margin-bottom: 16px;
  padding: 12px 14px;
  border: 1px solid rgba(249, 24, 128, 0.2);
  border-radius: 14px;
  background: rgba(249, 24, 128, 0.08);
  color: #ff9ac9;
  line-height: 1.45;
  font-size: 0.92rem;
}

.login-card__input {
  margin-bottom: 18px;
}

.login-card__actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
}

.login-card__error {
  margin-top: 16px;
  padding: 11px 14px;
  border: 1px solid rgba(244, 63, 94, 0.24);
  border-radius: 14px;
  background: rgba(244, 63, 94, 0.08);
  color: #ffb4be;
  font-size: 0.92rem;
  line-height: 1.4;
}

@media (max-width: 599px) {
  .login-shell {
    padding-top: 52px;
  }

  .login-card {
    padding: 28px 20px;
  }

  .login-card__actions {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
