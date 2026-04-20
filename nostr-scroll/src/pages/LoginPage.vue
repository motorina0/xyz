<template>
  <q-page class="login-page">
    <div class="login-card scroll-card">
      <div class="login-card__eyebrow">mocked nostr-auth</div>
      <h1 class="login-card__title">nostr-scroll</h1>
      <p class="login-card__subtitle">Nostr social client prototype</p>

      <q-btn
        no-caps
        unelevated
        color="primary"
        class="scroll-button login-card__button"
        :loading="authStore.loading"
        label="Continue with nostr-auth"
        @click="handleLogin"
      />

      <div class="login-card__footnote text-scroll-muted">Mocked login only</div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useFeedStore } from '../stores/feed';
import { useProfilesStore } from '../stores/profiles';

const router = useRouter();
const authStore = useAuthStore();
const profilesStore = useProfilesStore();
const feedStore = useFeedStore();

async function handleLogin(): Promise<void> {
  await Promise.all([profilesStore.ensureHydrated(), feedStore.ensureHydrated()]);
  await authStore.loginWithNostrAuth();
  await router.replace({ name: 'home' });
}
</script>

<style scoped>
.login-page {
  display: grid;
  place-items: center;
  min-height: 100vh;
  padding: 24px;
}

.login-card {
  width: min(100%, 460px);
  padding: 42px 32px;
  text-align: center;
}

.login-card__eyebrow {
  color: var(--scroll-accent-strong);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  margin-bottom: 18px;
}

.login-card__title {
  margin: 0;
  font-size: clamp(2.4rem, 7vw, 3.6rem);
  line-height: 0.98;
  font-weight: 900;
}

.login-card__subtitle {
  color: var(--scroll-text-muted);
  font-size: 1rem;
  margin: 14px 0 30px;
}

.login-card__button {
  width: 100%;
  min-height: 52px;
  font-size: 1rem;
  font-weight: 800;
}

.login-card__footnote {
  margin-top: 14px;
  font-size: 0.84rem;
}
</style>
