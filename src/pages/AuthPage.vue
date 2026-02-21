<template>
  <div class="auth-page">
    <div class="auth-shell">
      <q-card flat bordered class="auth-card">
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
            @click="goToHome"
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();

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
</style>
