<template>
  <div class="auth-page">
    <div class="auth-shell">
      <q-card v-if="!isLoginMode" flat bordered class="auth-card">
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
            @click="openLoginCard"
          />

          <q-btn
            outline
            color="primary"
            no-caps
            icon="vpn_key"
            label="Generate New Key"
            class="auth-card__button"
            @click="goToHome"
          />
        </q-card-section>
      </q-card>

      <q-card v-else flat bordered class="auth-card">
        <q-card-section class="auth-card__header">
          <div class="auth-card__title">Login</div>
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
            @keydown.enter.prevent="handleLogin"
          />
         
          <q-btn
            unelevated
            color="primary"
            no-caps
            label="Login"
            class="auth-card__button"
            :disable="!canLogin"
            @click="handleLogin"
          />
        </q-card-section>
      </q-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useNostrStore } from 'src/stores/nostrStore';

const router = useRouter();
const nostrStore = useNostrStore();
const isLoginMode = ref(false);
const privateKey = ref('');
const privateKeyValidation = computed(() => nostrStore.validateNsec(privateKey.value.trim()));
const privateKeyError = computed(() =>
  privateKey.value.trim() && !privateKeyValidation.value.isValid
    ? 'Enter a valid nsec private key.'
    : ''
);
const canLogin = computed(() => privateKeyValidation.value.isValid);

function openLoginCard(): void {
  isLoginMode.value = true;
}

function handleLogin(): void {
  if (!canLogin.value) {
    return;
  }

  nostrStore.savePrivateKeyFromNsec(privateKey.value);

  goToHome();
}

function goToHome(): void {
  void router.push({ name: 'home' });
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
