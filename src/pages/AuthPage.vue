<template>
  <div class="auth-page auth-entry-page">
    <div class="auth-shell" :class="{ 'auth-shell--wide': loginStep === 'onboarding' }">
      <q-card v-if="loginStep === 'welcome'" flat bordered class="auth-card auth-card--light">
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

      <q-card v-else-if="loginStep === 'methods'" flat bordered class="auth-card auth-card--light">
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

      <q-card v-else-if="loginStep === 'key'" flat bordered class="auth-card auth-card--light">
        <q-card-section class="auth-card__header">
          <div class="auth-card__title">Login with Key</div>
          <div class="auth-card__subtitle">Enter your nsec or hex private key to continue</div>
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
            class="nc-input"
            dense
            outlined
            rounded
            type="password"
            label="Private Key (nsec or hex)"
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

      <q-card v-else flat bordered class="auth-card auth-card--light auth-card--onboarding">
        <q-card-section class="auth-card__header">
          <div class="auth-card__title">{{ onboardingTitle }}</div>
          <div class="auth-card__subtitle">{{ onboardingSubtitle }}</div>
        </q-card-section>

        <q-card-section class="auth-card__actions auth-onboarding">
          <div v-if="onboardingStatus === 'checking'" class="onboarding-checking">
            <q-spinner color="primary" size="42px" />
            <div class="onboarding-checking__text">
              <div class="onboarding-checking__title">Looking for your profile</div>
              <div class="onboarding-checking__subtitle">
                Checking {{ appRelayCountLabel }} for your Nostr metadata.
              </div>
            </div>
          </div>

          <div v-else-if="onboardingStatus === 'found'" class="onboarding-profile">
            <CachedAvatar
              :src="onboardingProfilePicture"
              :alt="onboardingProfileName"
              :fallback="onboardingProfileAvatar"
              class="onboarding-profile__avatar"
            />
            <div class="onboarding-profile__body">
              <div class="onboarding-profile__name">{{ onboardingProfileName }}</div>
              <div class="onboarding-profile__pubkey">{{ onboardingProfilePubkey }}</div>
              <div class="onboarding-profile__about">
                {{ onboardingProfileAbout }}
              </div>
              <div v-if="onboardingProfileNip05" class="onboarding-profile__nip05">
                {{ onboardingProfileNip05 }}
              </div>
            </div>
          </div>

          <q-banner
            v-else-if="onboardingStatus === 'not-found'"
            dense
            rounded
            class="auth-onboarding-banner"
          >
            <template #avatar>
              <q-icon name="person_search" color="primary" />
            </template>
            No profile was found on the current app relays.
          </q-banner>

          <q-banner
            v-else-if="onboardingStatus === 'error'"
            dense
            rounded
            class="auth-onboarding-banner auth-onboarding-banner--warning"
          >
            <template #avatar>
              <q-icon name="warning_amber" color="warning" />
            </template>
            {{ onboardingErrorMessage }}
          </q-banner>

          <div v-if="onboardingStatus === 'relay-setup'" class="onboarding-relays">
            <q-input
              v-model="onboardingRelayInput"
              class="nc-input"
              dense
              outlined
              rounded
              label="Relay URL"
              placeholder="wss://example-relay.io"
              data-testid="auth-onboarding-relay-input"
              :error="Boolean(onboardingRelayValidationError)"
              :error-message="onboardingRelayValidationError"
              @keydown.enter.prevent="handleOnboardingAddRelay"
            >
              <template #append>
                <q-btn
                  unelevated
                  round
                  dense
                  color="primary"
                  icon="add"
                  size="sm"
                  aria-label="Add relay"
                  data-testid="auth-onboarding-add-relay-button"
                  :disable="!canAddOnboardingRelay"
                  @click="handleOnboardingAddRelay"
                />
              </template>
            </q-input>

            <q-list bordered separator class="onboarding-relay-list">
              <q-item v-for="relay in onboardingRelayRows" :key="relay.url">
                <q-item-section avatar>
                  <q-checkbox
                    dense
                    color="primary"
                    :model-value="relay.selected"
                    :aria-label="`Use ${relay.url} when searching for profile`"
                    @update:model-value="
                      (value) => setOnboardingRelaySelected(relay.url, Boolean(value))
                    "
                  />
                </q-item-section>
                <q-item-section>
                  <q-item-label class="onboarding-relay-list__url">{{ relay.url }}</q-item-label>
                </q-item-section>
                <q-item-section side>
                  <q-badge
                    outline
                    :color="relay.statusColor"
                    class="onboarding-relay-list__status"
                    :aria-label="relay.statusLabel"
                  >
                    <q-icon :name="relay.statusIcon" size="18px" />
                  </q-badge>
                </q-item-section>
              </q-item>
            </q-list>
          </div>

          <div v-if="onboardingStatus === 'found'" class="auth-card__button-row auth-card__button-row--single">
            <q-btn
              unelevated
              color="primary"
              no-caps
              label="Continue"
              class="auth-card__button"
              data-testid="auth-onboarding-continue-button"
              :loading="isOnboardingContinuing"
              @click="continueFromOnboarding"
            />
          </div>

          <div v-else-if="onboardingStatus === 'not-found'" class="auth-card__button-row">
            <q-btn
              outline
              color="primary"
              no-caps
              label="Skip for now"
              class="auth-card__button"
              data-testid="auth-onboarding-skip-button"
              :loading="isOnboardingContinuing"
              @click="continueFromOnboarding"
            />
            <q-btn
              unelevated
              color="primary"
              no-caps
              label="Add relays"
              class="auth-card__button"
              data-testid="auth-onboarding-add-relays-button"
              @click="showOnboardingRelaySetup"
            />
          </div>

          <div v-else-if="onboardingStatus === 'error'" class="auth-card__actions auth-card__actions--nested">
            <q-btn
              unelevated
              color="primary"
              no-caps
              label="Try again"
              class="auth-card__button"
              data-testid="auth-onboarding-retry-button"
              @click="() => runProfileLookup()"
            />
            <div class="auth-card__button-row">
              <q-btn
                outline
                color="primary"
                no-caps
                label="Edit relays"
                class="auth-card__button"
                @click="showOnboardingRelaySetup"
              />
              <q-btn
                flat
                color="primary"
                no-caps
                label="Continue"
                class="auth-card__button"
                data-testid="auth-onboarding-skip-button"
                :loading="isOnboardingContinuing"
                @click="continueFromOnboarding"
              />
            </div>
          </div>

          <div v-else-if="onboardingStatus === 'relay-setup'" class="auth-card__button-row">
            <q-btn
              outline
              color="primary"
              no-caps
              label="Skip for now"
              class="auth-card__button"
              data-testid="auth-onboarding-skip-button"
              :loading="isOnboardingContinuing"
              @click="continueFromOnboarding"
            />
            <q-btn
              unelevated
              color="primary"
              no-caps
              label="Search again"
              class="auth-card__button"
              data-testid="auth-onboarding-search-again-button"
              :disable="!canSearchSelectedOnboardingRelays"
              @click="runProfileLookup(selectedOnboardingRelayUrls)"
            />
          </div>
        </q-card-section>
      </q-card>
    </div>

    <BrowserNotificationsLoginDialog
      v-model="isBrowserNotificationsLoginDialogOpen"
      @enable="confirmBrowserNotificationsLoginDialog"
      @skip="skipBrowserNotificationsLoginDialog"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { normalizeRelayUrl } from '@nostr-dev-kit/ndk';
import BrowserNotificationsLoginDialog from 'src/components/BrowserNotificationsLoginDialog.vue';
import CachedAvatar from 'src/components/CachedAvatar.vue';
import { useBrowserNotificationsLoginPrompt } from 'src/composables/useBrowserNotificationsLoginPrompt';
import { useNostrStore, type UserProfileLookupResult } from 'src/stores/nostrStore';
import { useRelayStore } from 'src/stores/relayStore';
import { buildAvatarText } from 'src/utils/avatarText';
import { buildRelayLookupKey, uniqueRelayUrls } from 'src/utils/relayUrls';
import { reportUiError } from 'src/utils/uiErrorHandler';

const router = useRouter();
const nostrStore = useNostrStore();
const relayStore = useRelayStore();
const {
  isBrowserNotificationsLoginDialogOpen,
  handleBrowserNotificationsAfterLogin,
  confirmBrowserNotificationsLoginDialog,
  skipBrowserNotificationsLoginDialog
} = useBrowserNotificationsLoginPrompt();
type AuthStep = 'welcome' | 'methods' | 'key' | 'onboarding';
type OnboardingStatus = 'idle' | 'checking' | 'found' | 'not-found' | 'error' | 'relay-setup';

const loginStep = ref<AuthStep>('welcome');
const privateKey = ref('');
const isExtensionLoginInProgress = ref(false);
const isKeyLoginInProgress = ref(false);
const onboardingStatus = ref<OnboardingStatus>('idle');
const onboardingProfile = ref<UserProfileLookupResult | null>(null);
const onboardingPubkey = ref('');
const onboardingNpub = ref('');
const onboardingError = ref('');
const onboardingRelayInput = ref('');
const onboardingAttempt = ref(0);
const selectedOnboardingRelayKeys = ref<Set<string>>(new Set());
const isOnboardingContinuing = ref(false);
const PROFILE_LOOKUP_TIMEOUT_MS = 12_000;
const privateKeyValidation = computed(() => nostrStore.validatePrivateKey(privateKey.value.trim()));
const privateKeyError = computed(() =>
  privateKey.value.trim() && !privateKeyValidation.value.isValid
    ? 'Enter a valid nsec or 64-character hex private key.'
    : ''
);
const canLoginWithKey = computed(() => privateKeyValidation.value.isValid && !isKeyLoginInProgress.value);
const onboardingTitle = computed(() => {
  if (onboardingStatus.value === 'found') {
    return 'Confirm profile';
  }

  if (onboardingStatus.value === 'relay-setup') {
    return 'Add relays';
  }

  if (onboardingStatus.value === 'error') {
    return 'Profile check failed';
  }

  return 'Checking profile';
});
const onboardingSubtitle = computed(() => {
  if (onboardingStatus.value === 'found') {
    return 'This profile was found on your app relays';
  }

  if (onboardingStatus.value === 'relay-setup') {
    return 'Add relays to search for your profile';
  }

  if (onboardingStatus.value === 'not-found') {
    return 'You can add relays or skip this step';
  }

  if (onboardingStatus.value === 'error') {
    return 'The app could not finish checking your relays';
  }

  return 'Stay here while the app checks your relays';
});
const appRelayCountLabel = computed(() => {
  const count = relayStore.relays.length;
  return `${count} app relay${count === 1 ? '' : 's'}`;
});
const onboardingProfileName = computed(() => onboardingProfile.value?.name ?? 'Unknown profile');
const onboardingProfilePubkey = computed(() => {
  if (onboardingNpub.value) {
    return onboardingNpub.value;
  }

  if (!onboardingPubkey.value) {
    return '';
  }

  return `${onboardingPubkey.value.slice(0, 10)}...${onboardingPubkey.value.slice(-6)}`;
});
const onboardingProfilePicture = computed(() => onboardingProfile.value?.picture ?? '');
const onboardingProfileAvatar = computed(() => buildAvatarText(onboardingProfileName.value));
const onboardingProfileAbout = computed(
  () => onboardingProfile.value?.about || 'No description published.'
);
const onboardingProfileNip05 = computed(() => onboardingProfile.value?.nip05 ?? '');
const onboardingErrorMessage = computed(
  () => onboardingError.value || 'Profile lookup failed. You can retry, edit relays, or continue.'
);
const onboardingRelayValidationError = computed(() =>
  validateRelayUrlForOnboarding(onboardingRelayInput.value.trim())
);
const canAddOnboardingRelay = computed(() => {
  const value = onboardingRelayInput.value.trim();
  return value.length > 0 && onboardingRelayValidationError.value.length === 0;
});
const onboardingRelayRows = computed(() => {
  void nostrStore.relayStatusVersion;
  return relayStore.relays.map((url) => {
    const connected = nostrStore.getRelayConnectionState(url) === 'connected';
    return {
      url,
      connected,
      selected: selectedOnboardingRelayKeys.value.has(buildRelayLookupKey(url)),
      statusColor: connected ? 'positive' : 'warning',
      statusIcon: connected ? 'check' : 'warning_amber',
      statusLabel: connected ? 'Connected' : 'Warning',
    };
  });
});
const selectedOnboardingRelayUrls = computed(() =>
  uniqueRelayUrls(
    relayStore.relays.filter((url) => selectedOnboardingRelayKeys.value.has(buildRelayLookupKey(url)))
  )
);
const canSearchSelectedOnboardingRelays = computed(
  () => selectedOnboardingRelayUrls.value.length > 0
);

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
    await startProfileOnboarding();
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
    const validation = nostrStore.savePrivateKey(privateKey.value);
    if (!validation.isValid) {
      return;
    }

    privateKey.value = '';
    await startProfileOnboarding();
  } catch (error) {
    reportUiError('Failed to log in', error, 'Failed to log in.');
  } finally {
    isKeyLoginInProgress.value = false;
  }
}

async function startProfileOnboarding(): Promise<void> {
  const publicKey = nostrStore.getLoggedInPublicKeyHex();
  if (!publicKey) {
    throw new Error('Failed to resolve the logged-in public key.');
  }

  relayStore.init();
  onboardingPubkey.value = publicKey;
  onboardingNpub.value = nostrStore.encodeNpub(publicKey) ?? '';
  onboardingProfile.value = null;
  onboardingError.value = '';
  loginStep.value = 'onboarding';
  await runProfileLookup();
}

async function runProfileLookup(relayUrlOverride?: string[]): Promise<void> {
  if (!onboardingPubkey.value) {
    return;
  }

  const attempt = onboardingAttempt.value + 1;
  onboardingAttempt.value = attempt;
  onboardingStatus.value = 'checking';
  onboardingProfile.value = null;
  onboardingError.value = '';

  const relayUrls = uniqueRelayUrls(relayUrlOverride ?? relayStore.relays);
  if (relayUrls.length === 0) {
    onboardingStatus.value = 'not-found';
    return;
  }

  try {
    const profile = await withTimeout(
      nostrStore.fetchUserProfileFromRelays(onboardingPubkey.value, relayUrls),
      PROFILE_LOOKUP_TIMEOUT_MS
    );
    if (attempt !== onboardingAttempt.value) {
      return;
    }

    if (profile) {
      onboardingProfile.value = profile;
      onboardingStatus.value = 'found';
      return;
    }

    onboardingStatus.value = 'not-found';
  } catch (error) {
    if (attempt !== onboardingAttempt.value) {
      return;
    }

    onboardingError.value =
      error instanceof Error && error.message
        ? error.message
        : 'Profile lookup failed. You can retry, edit relays, or continue.';
    onboardingStatus.value = 'error';
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error('Profile lookup timed out. Check your relays or try again.'));
    }, timeoutMs);

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => {
        window.clearTimeout(timeoutId);
      });
  });
}

function showOnboardingRelaySetup(): void {
  resetSelectedOnboardingRelaysToConnected();
  onboardingStatus.value = 'relay-setup';
}

async function handleOnboardingAddRelay(): Promise<void> {
  try {
    const value = onboardingRelayInput.value.trim();
    if (!value || onboardingRelayValidationError.value) {
      return;
    }

    const normalizedRelay = normalizeRelayUrl(value);
    relayStore.replaceRelayEntries([
      { url: normalizedRelay, read: true, write: true },
      ...relayStore.relayEntries,
    ]);
    onboardingRelayInput.value = '';

    try {
      await nostrStore.ensureRelayConnections([normalizedRelay]);
      if (nostrStore.getRelayConnectionState(normalizedRelay) === 'connected') {
        setOnboardingRelaySelected(normalizedRelay, true);
      }
    } catch (error) {
      console.warn('Failed to connect onboarding relay', normalizedRelay, error);
    }
  } catch (error) {
    reportUiError('Failed to add relay during onboarding', error, 'Failed to add relay.');
  }
}

function resetSelectedOnboardingRelaysToConnected(): void {
  selectedOnboardingRelayKeys.value = new Set(
    relayStore.relays
      .filter((url) => nostrStore.getRelayConnectionState(url) === 'connected')
      .map((url) => buildRelayLookupKey(url))
  );
}

function setOnboardingRelaySelected(relayUrl: string, selected: boolean): void {
  const nextSelectedRelayKeys = new Set(selectedOnboardingRelayKeys.value);
  const key = buildRelayLookupKey(relayUrl);
  if (selected) {
    nextSelectedRelayKeys.add(key);
  } else {
    nextSelectedRelayKeys.delete(key);
  }
  selectedOnboardingRelayKeys.value = nextSelectedRelayKeys;
}

function validateRelayUrlForOnboarding(value: string): string {
  if (!value) {
    return '';
  }

  try {
    const url = new URL(value);
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
      return 'Relay must use ws:// or wss://';
    }

    if (!url.hostname) {
      return 'Relay URL must include a hostname';
    }

    const nextRelayKey = buildRelayLookupKey(normalizeRelayUrl(value));
    const existingRelayKeys = new Set(relayStore.relays.map((relay) => buildRelayLookupKey(relay)));
    if (existingRelayKeys.has(nextRelayKey)) {
      return 'Relay is already added';
    }

    return '';
  } catch {
    return 'Relay must be a valid ws:// or wss:// URL';
  }
}

async function continueFromOnboarding(): Promise<void> {
  if (isOnboardingContinuing.value) {
    return;
  }

  isOnboardingContinuing.value = true;
  try {
    await handleBrowserNotificationsAfterLogin();
    await goToHome();
  } catch (error) {
    reportUiError('Failed to continue after profile onboarding', error, 'Failed to continue.');
  } finally {
    isOnboardingContinuing.value = false;
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

.auth-shell--wide {
  width: min(100%, 560px);
}

.auth-card {
  border-radius: 20px;
  border: 1px solid var(--nc-border);
  overflow: hidden;
  background: var(--nc-panel-sidebar-bg);
  box-shadow: var(--nc-shadow-sm);
  backdrop-filter: blur(var(--nc-glass-blur));
}

.auth-card--light {
  border-color: rgba(208, 220, 235, 0.82);
  background: rgba(239, 246, 251, 0.9);
  color: #182236;
  box-shadow: 0 18px 40px rgba(17, 40, 76, 0.16);
  backdrop-filter: blur(18px);
}

.auth-card__header {
  padding: 22px 22px 10px;
  background: var(--nc-panel-header-bg);
  border-bottom: 1px solid color-mix(in srgb, var(--nc-border) 90%, #8fa5c1 10%);
}

.auth-card--light .auth-card__header {
  background: rgba(255, 255, 255, 0.82);
  border-bottom-color: rgba(208, 220, 235, 0.82);
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

.auth-card__actions--nested {
  padding: 0;
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

.auth-card__button-row--single {
  grid-template-columns: 1fr;
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

.auth-card--onboarding {
  width: min(100%, 560px);
}

.auth-onboarding {
  gap: 16px;
  padding-top: 16px;
}

.auth-card--light .nc-input :deep(.q-field__control) {
  background: rgba(255, 255, 255, 0.94);
  color: #182236;
}

.auth-card--light .nc-input :deep(.q-field__native),
.auth-card--light .nc-input :deep(.q-field__input),
.auth-card--light .nc-input :deep(.q-field__label) {
  color: #182236;
}

.auth-card--light .nc-input :deep(.q-field__label) {
  opacity: 0.72;
}

.auth-card--light .nc-input :deep(.q-field__marginal) {
  color: #475569;
}

.onboarding-checking {
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 116px;
}

.onboarding-checking__text {
  min-width: 0;
}

.onboarding-checking__title {
  font-size: 18px;
  font-weight: 700;
}

.onboarding-checking__subtitle {
  margin-top: 4px;
  color: #64748b;
  line-height: 1.35;
}

.onboarding-profile {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 16px;
  align-items: center;
  padding: 6px 0;
}

.onboarding-profile__avatar {
  width: 72px;
  height: 72px;
  font-size: 24px;
}

.onboarding-profile__body {
  min-width: 0;
}

.onboarding-profile__name {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.onboarding-profile__pubkey {
  margin-top: 4px;
  color: #64748b;
  font-size: 13px;
  overflow-wrap: anywhere;
}

.onboarding-profile__about {
  margin-top: 10px;
  color: #334155;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.onboarding-profile__nip05 {
  margin-top: 8px;
  color: #2563eb;
  font-size: 13px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.auth-onboarding-banner {
  color: #334155;
  background: #eaf4ff;
  border: 1px solid #bfdbfe;
}

.auth-onboarding-banner--warning {
  background: #fff7db;
  border-color: #f3c969;
}

.onboarding-relays {
  display: grid;
  gap: 14px;
}

.onboarding-relay-list {
  max-height: 260px;
  overflow: auto;
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.94);
  color: #182236;
}

.onboarding-relay-list :deep(.q-item) {
  color: #182236;
}

.onboarding-relay-list :deep(.q-item__label) {
  color: #182236;
}

.onboarding-relay-list :deep(.q-item__label--caption) {
  color: #64748b;
  opacity: 1;
}

.onboarding-relay-list__url {
  font-size: 13px;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.onboarding-relay-list__status {
  min-width: 36px;
  min-height: 26px;
  justify-content: center;
}

@media (max-width: 520px) {
  .onboarding-profile {
    grid-template-columns: 1fr;
    justify-items: center;
    text-align: center;
  }

  .auth-card__button-row {
    grid-template-columns: 1fr;
  }
}
</style>
