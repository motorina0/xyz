<template>
  <div class="auth-page">
    <div class="auth-shell">
      <q-card v-if="loginStep === 'welcome'" flat bordered class="auth-card">
        <q-card-section class="auth-card__header">
          <div class="auth-card__title">Welcome</div>
          <div class="auth-card__subtitle">Choose how you want to continue</div>
        </q-card-section>

        <q-card-section class="auth-card__actions">
          <q-btn
            unelevated
            color="primary"
            no-caps
            icon="login"
            label="Login"
            class="auth-card__button"
            @click="openLoginOptions"
          />

          <q-btn
            outline
            color="primary"
            no-caps
            icon="vpn_key"
            label="Create Account"
            class="auth-card__button"
            @click="goToRegister"
          />
        </q-card-section>
      </q-card>

      <q-card v-else-if="loginStep === 'methods'" flat bordered class="auth-card">
        <q-card-section class="auth-card__header">
          <div class="auth-card__title">Login</div>
          <div class="auth-card__subtitle">Choose a login method</div>
        </q-card-section>

        <q-card-section class="auth-card__actions">
          <q-btn
            unelevated
            color="primary"
            no-caps
            icon="extension"
            label="Login with Extension"
            class="auth-card__button"
            :loading="isExtensionLoginInProgress"
            @click="handleExtensionLogin"
          />

          <q-btn
            outline
            color="primary"
            no-caps
            icon="vpn_key"
            label="Login with Key (not recommended)"
            class="auth-card__button"
            @click="openKeyLogin"
          />

          <q-btn
            flat
            color="primary"
            no-caps
            label="Back"
            class="auth-card__button"
            @click="goBackToWelcome"
          />
        </q-card-section>
      </q-card>

      <q-card v-else flat bordered class="auth-card">
        <q-card-section class="auth-card__header">
          <div class="auth-card__title">Login with Key</div>
          <div class="auth-card__subtitle">Enter your private key to continue</div>
        </q-card-section>

        <q-card-section class="auth-card__actions">
          <q-card flat bordered class="auth-warning">
            <q-card-section class="auth-warning__content">
              <q-icon name="warning" size="20px" class="auth-warning__icon" />
              <div>Entering your private key strongly discouraged. Use a Nostr Remote Signer.</div>
            </q-card-section>
          </q-card>

          <q-input
            v-model="privateKey"
            class="tg-input"
            dense
            outlined
            rounded
            type="password"
            label="Private Key (nsec)"
            :error="Boolean(privateKeyError)"
            :error-message="privateKeyError"
            @keydown.enter.prevent="handleKeyLogin"
          />

          <div class="auth-card__button-row">
            <q-btn
              flat
              color="primary"
              no-caps
              label="Back"
              class="auth-card__button"
              :disable="isKeyLoginInProgress"
              @click="goBackToLoginOptions"
            />

            <q-btn
              unelevated
              color="primary"
              no-caps
              label="Login"
              class="auth-card__button"
              :disable="!canLoginWithKey"
              :loading="isKeyLoginInProgress"
              @click="handleKeyLogin"
            />
          </div>
        </q-card-section>
      </q-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useNostrStore } from 'src/stores/nostrStore';
import { reportUiError } from 'src/utils/uiErrorHandler';

const router = useRouter();
const nostrStore = useNostrStore();
type AuthStep = 'welcome' | 'methods' | 'key';

const loginStep = ref<AuthStep>('welcome');
const privateKey = ref('');
const isExtensionLoginInProgress = ref(false);
const isKeyLoginInProgress = ref(false);
const privateKeyValidation = computed(() => nostrStore.validateNsec(privateKey.value.trim()));
const privateKeyError = computed(() =>
  privateKey.value.trim() && !privateKeyValidation.value.isValid
    ? 'Enter a valid nsec private key.'
    : ''
);
const canLoginWithKey = computed(() => privateKeyValidation.value.isValid && !isKeyLoginInProgress.value);

function openLoginOptions(): void {
  try {
    loginStep.value = 'methods';
  } catch (error) {
    reportUiError('Failed to open login options', error);
  }
}

function openKeyLogin(): void {
  try {
    loginStep.value = 'key';
  } catch (error) {
    reportUiError('Failed to open key login', error);
  }
}

function goBackToWelcome(): void {
  try {
    loginStep.value = 'welcome';
    privateKey.value = '';
  } catch (error) {
    reportUiError('Failed to go back from login options', error);
  }
}

function goBackToLoginOptions(): void {
  try {
    loginStep.value = 'methods';
    privateKey.value = '';
  } catch (error) {
    reportUiError('Failed to go back to login options', error);
  }
}

async function handleExtensionLogin(): Promise<void> {
  if (isExtensionLoginInProgress.value) {
    return;
  }

  isExtensionLoginInProgress.value = true;
  try {
    await nostrStore.loginWithExtension();
    await goToHome();
  } catch (error) {
    reportUiError(
      'Failed to log in with NIP-07 extension',
      error,
      'Failed to log in with extension.'
    );
  } finally {
    isExtensionLoginInProgress.value = false;
  }
}

async function handleKeyLogin(): Promise<void> {
  try {
    if (!canLoginWithKey.value || isKeyLoginInProgress.value) {
      return;
    }

    isKeyLoginInProgress.value = true;
    const validation = nostrStore.savePrivateKeyFromNsec(privateKey.value);
    if (!validation.isValid) {
      return;
    }

    await goToHome();
  } catch (error) {
    reportUiError('Failed to log in', error, 'Failed to log in.');
  } finally {
    isKeyLoginInProgress.value = false;
  }
}

async function goToHome(): Promise<void> {
  try {
    await router.push({ name: 'chats' });
  } catch (error) {
    reportUiError('Failed to navigate after login', error);
  }
}

async function goToRegister(): Promise<void> {
  try {
    await router.push({ name: 'register' });
  } catch (error) {
    reportUiError('Failed to navigate to account registration', error);
  }
}
</script>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 20px;
}

.auth-shell {
  width: min(100%, 460px);
}

.auth-card {
  border-radius: 20px;
  border: 1px solid var(--tg-border);
  background: color-mix(in srgb, var(--tg-sidebar) 96%, transparent);
}

.auth-card__header {
  padding: 22px 22px 10px;
}

.auth-card__title {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.1;
}

.auth-card__subtitle {
  margin-top: 8px;
  opacity: 0.75;
}

.auth-card__actions {
  display: grid;
  gap: 12px;
  padding: 10px 22px 22px;
}

.auth-card__button {
  min-height: 44px;
  border-radius: 999px;
}

.auth-card__button-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.auth-warning {
  border-color: #f3c969;
  background: #fff7db;
}

.auth-warning__content {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  color: #7c4a03;
  font-weight: 600;
}

.auth-warning__icon {
  color: #b26b00;
}
</style>
