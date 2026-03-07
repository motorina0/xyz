<template>
  <div class="register-page">
    <div class="register-shell">
      <q-card flat bordered class="register-card">
        <q-card-section class="register-card__header">
          <div class="register-card__title">Create Account</div>
          <div class="register-card__subtitle">
            A new Nostr keypair has been generated for this account. Download the secret before continuing.
          </div>
        </q-card-section>

        <q-card-section class="register-card__actions">
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
        </q-card-section>
      </q-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
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
const isLoggingIn = ref(false);

initializeRegisterPage();

function initializeRegisterPage(): void {
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

    await router.push({ name: 'chats' });
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

.register-card {
  border-radius: 20px;
  border: 1px solid var(--tg-border);
  background: color-mix(in srgb, var(--tg-sidebar) 96%, transparent);
}

.register-card__header {
  padding: 22px 22px 10px;
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
</style>
