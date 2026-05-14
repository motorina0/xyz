<template>
  <q-card flat bordered class="auth-onboarding-card auth-onboarding-card--light">
    <q-card-section class="auth-onboarding-card__header">
      <div class="auth-onboarding-card__title">{{ onboardingTitle }}</div>
      <div class="auth-onboarding-card__subtitle">{{ onboardingSubtitle }}</div>
    </q-card-section>

    <q-card-section class="auth-onboarding-card__actions auth-onboarding">
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

      <div v-else-if="onboardingStatus === 'profile-setup'" class="onboarding-profile-setup">
        <q-input
          v-model="onboardingProfileNameInput"
          class="nc-input"
          dense
          outlined
          rounded
          label="Name (optional)"
          data-testid="auth-onboarding-profile-name-input"
          @keydown.enter.prevent="completeOnboardingProfileSetup"
        />

        <q-input
          v-model="onboardingProfilePictureInput"
          class="nc-input"
          dense
          outlined
          rounded
          label="Picture URL (optional)"
          data-testid="auth-onboarding-profile-picture-input"
          :error="Boolean(onboardingProfilePictureError)"
          :error-message="onboardingProfilePictureError"
          @keydown.enter.prevent="completeOnboardingProfileSetup"
        />

        <q-checkbox
          v-if="hasSelectedOnboardingRelays"
          v-model="shouldUpdateOnboardingRelays"
          color="primary"
          label="Use selected relays"
          data-testid="auth-onboarding-update-relays-checkbox"
          class="onboarding-profile-setup__checkbox"
        />
      </div>

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
                class="onboarding-relay-list__checkbox"
                @update:model-value="
                  (value) => setOnboardingRelaySelected(relay.url, Boolean(value))
                "
              />
            </q-item-section>
            <q-item-section>
              <q-item-label class="onboarding-relay-list__main">
                <q-badge
                  outline
                  :color="relay.statusColor"
                  class="onboarding-relay-list__status"
                  :aria-label="relay.statusLabel"
                >
                  <q-icon :name="relay.statusIcon" size="18px" />
                </q-badge>
                <span class="onboarding-relay-list__url">{{ relay.url }}</span>
              </q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-btn
                flat
                round
                dense
                icon="delete"
                color="negative"
                :aria-label="`Delete ${relay.url}`"
                @click="removeOnboardingRelay(relay.url)"
              />
            </q-item-section>
          </q-item>
        </q-list>
      </div>

      <div
        v-if="onboardingStatus === 'found'"
        class="auth-onboarding-card__button-row auth-onboarding-card__button-row--single"
      >
        <q-btn
          unelevated
          color="primary"
          no-caps
          label="Continue"
          class="auth-onboarding-card__button"
          data-testid="auth-onboarding-continue-button"
          :loading="isOnboardingContinuing"
          @click="continueFromOnboarding"
        />
      </div>

      <div v-else-if="onboardingStatus === 'not-found'" class="auth-onboarding-card__button-row">
        <q-btn
          outline
          color="primary"
          no-caps
          label="Skip for now"
          class="auth-onboarding-card__button"
          data-testid="auth-onboarding-skip-button"
          :loading="isOnboardingContinuing"
          @click="continueFromOnboarding"
        />
        <q-btn
          unelevated
          color="primary"
          no-caps
          label="Add relays"
          class="auth-onboarding-card__button"
          data-testid="auth-onboarding-add-relays-button"
          @click="showOnboardingRelaySetup"
        />
      </div>

      <div
        v-else-if="onboardingStatus === 'error'"
        class="auth-onboarding-card__actions auth-onboarding-card__actions--nested"
      >
        <q-btn
          unelevated
          color="primary"
          no-caps
          label="Try again"
          class="auth-onboarding-card__button"
          data-testid="auth-onboarding-retry-button"
          @click="() => runProfileLookup()"
        />
        <div class="auth-onboarding-card__button-row">
          <q-btn
            outline
            color="primary"
            no-caps
            label="Edit relays"
            class="auth-onboarding-card__button"
            @click="showOnboardingRelaySetup"
          />
          <q-btn
            flat
            color="primary"
            no-caps
            label="Continue"
            class="auth-onboarding-card__button"
            data-testid="auth-onboarding-skip-button"
            :loading="isOnboardingContinuing"
            @click="continueFromOnboarding"
          />
        </div>
      </div>

      <div v-else-if="onboardingStatus === 'relay-setup'" class="auth-onboarding-card__button-row">
        <q-btn
          outline
          color="primary"
          no-caps
          label="Search again"
          class="auth-onboarding-card__button"
          data-testid="auth-onboarding-search-again-button"
          :disable="!canSearchSelectedOnboardingRelays"
          @click="runProfileLookup(selectedOnboardingRelayUrls)"
        />
        <q-btn
          unelevated
          color="primary"
          no-caps
          label="Continue"
          class="auth-onboarding-card__button"
          data-testid="auth-onboarding-skip-button"
          @click="showOnboardingProfileSetup"
        />
      </div>

      <div
        v-else-if="onboardingStatus === 'profile-setup'"
        class="auth-onboarding-card__button-row auth-onboarding-card__button-row--single"
      >
        <q-btn
          unelevated
          color="primary"
          no-caps
          label="Save and start using app"
          class="auth-onboarding-card__button"
          data-testid="auth-onboarding-profile-start-button"
          :disable="!canCompleteOnboardingProfileSetup"
          :loading="isOnboardingContinuing"
          @click="completeOnboardingProfileSetup"
        />
      </div>
    </q-card-section>

    <BrowserNotificationsLoginDialog
      v-model="isBrowserNotificationsLoginDialogOpen"
      @enable="confirmBrowserNotificationsLoginDialog"
      @skip="skipBrowserNotificationsLoginDialog"
    />
  </q-card>
</template>

<script setup lang="ts">
import { normalizeRelayUrl } from '@nostr-dev-kit/ndk';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import BrowserNotificationsLoginDialog from 'src/components/BrowserNotificationsLoginDialog.vue';
import CachedAvatar from 'src/components/CachedAvatar.vue';
import { useBrowserNotificationsLoginPrompt } from 'src/composables/useBrowserNotificationsLoginPrompt';
import {
  useNostrStore,
  type PublishUserMetadataInput,
  type UserProfileLookupResult,
} from 'src/stores/nostrStore';
import { useNip65RelayStore } from 'src/stores/nip65RelayStore';
import { useRelayStore } from 'src/stores/relayStore';
import { buildAvatarText } from 'src/utils/avatarText';
import { buildRelayLookupKey, uniqueRelayUrls } from 'src/utils/relayUrls';
import { reportUiError } from 'src/utils/uiErrorHandler';

type OnboardingStatus =
  | 'idle'
  | 'checking'
  | 'found'
  | 'not-found'
  | 'error'
  | 'relay-setup'
  | 'profile-setup';

const router = useRouter();
const nostrStore = useNostrStore();
const relayStore = useRelayStore();
const nip65RelayStore = useNip65RelayStore();
const {
  isBrowserNotificationsLoginDialogOpen,
  handleBrowserNotificationsAfterLogin,
  confirmBrowserNotificationsLoginDialog,
  skipBrowserNotificationsLoginDialog,
} = useBrowserNotificationsLoginPrompt();
const onboardingStatus = ref<OnboardingStatus>('idle');
const onboardingProfile = ref<UserProfileLookupResult | null>(null);
const onboardingPubkey = ref('');
const onboardingNpub = ref('');
const onboardingError = ref('');
const onboardingRelayInput = ref('');
const onboardingProfileNameInput = ref('');
const onboardingProfilePictureInput = ref('');
const onboardingAttempt = ref(0);
const selectedOnboardingRelayKeys = ref<Set<string>>(new Set());
const hasSeenOnboardingRelaySetup = ref(false);
const shouldUpdateOnboardingRelays = ref(true);
const isOnboardingContinuing = ref(false);
const PROFILE_LOOKUP_TIMEOUT_MS = 12_000;

const onboardingTitle = computed(() => {
  if (onboardingStatus.value === 'found') {
    return 'Confirm profile';
  }

  if (onboardingStatus.value === 'relay-setup') {
    return 'Add relays';
  }

  if (onboardingStatus.value === 'profile-setup') {
    return 'Set up profile';
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

  if (onboardingStatus.value === 'profile-setup') {
    return 'This is the final step before entering the app';
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
const onboardingProfilePictureError = computed(() => {
  const value = onboardingProfilePictureInput.value.trim();
  if (!value) {
    return '';
  }

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? ''
      : 'Picture URL must use http:// or https://';
  } catch {
    return 'Picture URL must be a valid URL';
  }
});
const onboardingRelayRows = computed(() => {
  void nostrStore.relayStatusVersion;
  return relayStore.relays.map((url) => {
    const connected = nostrStore.getRelayConnectionState(url) === 'connected';
    return {
      url,
      selected: selectedOnboardingRelayKeys.value.has(buildRelayLookupKey(url)),
      statusColor: connected ? 'positive' : 'warning',
      statusIcon: connected ? 'check' : 'warning_amber',
      statusLabel: connected ? 'Connected' : 'Warning',
    };
  });
});
const selectedOnboardingRelayUrls = computed(() =>
  uniqueRelayUrls(
    relayStore.relays.filter((url) =>
      selectedOnboardingRelayKeys.value.has(buildRelayLookupKey(url))
    )
  )
);
const canSearchSelectedOnboardingRelays = computed(
  () => selectedOnboardingRelayUrls.value.length > 0
);
const hasSelectedOnboardingRelays = computed(() => selectedOnboardingRelayUrls.value.length > 0);
const canCompleteOnboardingProfileSetup = computed(
  () => onboardingProfilePictureError.value.length === 0 && !isOnboardingContinuing.value
);

onMounted(() => {
  void startProfileOnboarding();
});

async function startProfileOnboarding(): Promise<void> {
  const publicKey = nostrStore.getLoggedInPublicKeyHex();
  if (!publicKey) {
    reportUiError('Failed to start profile onboarding', new Error('Missing logged-in public key.'));
    onboardingStatus.value = 'error';
    onboardingError.value = 'Failed to resolve the logged-in public key.';
    return;
  }

  relayStore.init();
  onboardingPubkey.value = publicKey;
  onboardingNpub.value = nostrStore.encodeNpub(publicKey) ?? '';
  onboardingProfile.value = null;
  onboardingError.value = '';
  onboardingProfileNameInput.value = '';
  onboardingProfilePictureInput.value = '';
  selectedOnboardingRelayKeys.value = new Set();
  hasSeenOnboardingRelaySetup.value = false;
  shouldUpdateOnboardingRelays.value = true;
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
  hasSeenOnboardingRelaySetup.value = true;
  resetSelectedOnboardingRelaysToConnected();
  onboardingStatus.value = 'relay-setup';
}

function showOnboardingProfileSetup(): void {
  shouldUpdateOnboardingRelays.value = true;
  onboardingStatus.value = 'profile-setup';
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

function removeOnboardingRelay(relayUrl: string): void {
  try {
    const relayKey = buildRelayLookupKey(relayUrl);
    relayStore.replaceRelayEntries(
      relayStore.relayEntries.filter((entry) => buildRelayLookupKey(entry.url) !== relayKey)
    );
    setOnboardingRelaySelected(relayUrl, false);
  } catch (error) {
    reportUiError('Failed to remove relay during onboarding', error, 'Failed to remove relay.');
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

function keepOnlySelectedOnboardingRelays(): void {
  if (!hasSeenOnboardingRelaySetup.value) {
    return;
  }

  const selectedRelayKeys = selectedOnboardingRelayKeys.value;
  relayStore.replaceRelayEntries(
    relayStore.relayEntries.filter((entry) => selectedRelayKeys.has(buildRelayLookupKey(entry.url)))
  );
  selectedOnboardingRelayKeys.value = new Set(relayStore.relays.map((url) => buildRelayLookupKey(url)));
}

function selectedOnboardingRelayEntries() {
  const selectedRelayKeys = selectedOnboardingRelayKeys.value;
  return relayStore.relayEntries.filter((entry) => selectedRelayKeys.has(buildRelayLookupKey(entry.url)));
}

function buildOnboardingProfileMetadata(): PublishUserMetadataInput {
  const metadata: PublishUserMetadataInput = {};
  const name = onboardingProfileNameInput.value.trim();
  if (name) {
    metadata.name = name;
  }
  const picture = onboardingProfilePictureInput.value.trim();
  if (picture) {
    metadata.picture = picture;
  }
  return metadata;
}

async function completeOnboardingProfileSetup(): Promise<void> {
  if (!canCompleteOnboardingProfileSetup.value || isOnboardingContinuing.value) {
    return;
  }

  isOnboardingContinuing.value = true;
  try {
    const selectedRelayEntries = selectedOnboardingRelayEntries();
    const selectedRelayUrls = selectedRelayEntries.map((entry) => entry.url);

    const profileMetadata = buildOnboardingProfileMetadata();
    if (selectedRelayUrls.length > 0 && Object.keys(profileMetadata).length > 0) {
      await nostrStore.publishUserMetadata(profileMetadata, selectedRelayUrls);
    }

    if (shouldUpdateOnboardingRelays.value && selectedRelayEntries.length > 0) {
      nip65RelayStore.init();
      nip65RelayStore.replaceRelayEntries(selectedRelayEntries);
      await nostrStore.publishMyRelayList(selectedRelayEntries, selectedRelayUrls);
      await nostrStore.updateLoggedInUserRelayList(selectedRelayEntries);
    }

    keepOnlySelectedOnboardingRelays();
    await handleBrowserNotificationsAfterLogin();
    await router.push({ name: 'chats' });
  } catch (error) {
    reportUiError('Failed to finish profile onboarding', error, 'Failed to finish onboarding.');
  } finally {
    isOnboardingContinuing.value = false;
  }
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
    keepOnlySelectedOnboardingRelays();
    await handleBrowserNotificationsAfterLogin();
    await router.push({ name: 'chats' });
  } catch (error) {
    reportUiError('Failed to continue after profile onboarding', error, 'Failed to continue.');
  } finally {
    isOnboardingContinuing.value = false;
  }
}
</script>

<style scoped>
.auth-onboarding-card {
  width: 100%;
  border-radius: 20px;
  border: 1px solid var(--nc-border);
  overflow: hidden;
  background: var(--nc-panel-sidebar-bg);
  box-shadow: var(--nc-shadow-sm);
  backdrop-filter: blur(var(--nc-glass-blur));
}

.auth-onboarding-card--light {
  border-color: rgba(208, 220, 235, 0.82);
  background: rgba(239, 246, 251, 0.9);
  color: #182236;
  box-shadow: 0 18px 40px rgba(17, 40, 76, 0.16);
  backdrop-filter: blur(18px);
}

.auth-onboarding-card__header {
  padding: 22px 22px 10px;
  background: var(--nc-panel-header-bg);
  border-bottom: 1px solid color-mix(in srgb, var(--nc-border) 90%, #8fa5c1 10%);
}

.auth-onboarding-card--light .auth-onboarding-card__header {
  background: rgba(255, 255, 255, 0.82);
  border-bottom-color: rgba(208, 220, 235, 0.82);
}

.auth-onboarding-card__title {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.1;
}

.auth-onboarding-card__subtitle {
  margin-top: 8px;
  opacity: 0.75;
}

.auth-onboarding-card__actions {
  display: grid;
  gap: 12px;
  padding: 10px 22px 22px;
}

.auth-onboarding-card__actions--nested {
  padding: 0;
}

.auth-onboarding-card__button {
  min-height: 44px;
  border-radius: 999px;
}

.auth-onboarding-card__button-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.auth-onboarding-card__button-row--single {
  grid-template-columns: 1fr;
}

.auth-onboarding {
  gap: 16px;
  padding-top: 16px;
}

.auth-onboarding-card--light .nc-input :deep(.q-field__control) {
  background: rgba(255, 255, 255, 0.94);
  color: #182236;
}

.auth-onboarding-card--light .nc-input :deep(.q-field__native),
.auth-onboarding-card--light .nc-input :deep(.q-field__input),
.auth-onboarding-card--light .nc-input :deep(.q-field__label) {
  color: #182236;
}

.auth-onboarding-card--light .nc-input :deep(.q-field__label) {
  opacity: 0.72;
}

.auth-onboarding-card--light .nc-input :deep(.q-field__marginal) {
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

.onboarding-profile-setup {
  display: grid;
  gap: 14px;
}

.onboarding-profile-setup__checkbox {
  color: #334155;
}

.onboarding-relay-list__checkbox :deep(.q-checkbox__bg),
.onboarding-profile-setup__checkbox :deep(.q-checkbox__bg) {
  background: #ffffff;
  border: 2px solid #64748b;
}

.onboarding-relay-list__checkbox :deep(.q-checkbox__inner--truthy .q-checkbox__bg),
.onboarding-profile-setup__checkbox :deep(.q-checkbox__inner--truthy .q-checkbox__bg) {
  background: #2563eb;
  border-color: #2563eb;
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

.onboarding-relay-list__main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.onboarding-relay-list__url {
  min-width: 0;
  font-size: 13px;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.onboarding-relay-list__status {
  flex: 0 0 auto;
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

  .auth-onboarding-card__button-row {
    grid-template-columns: 1fr;
  }
}
</style>
