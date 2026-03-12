<template>
  <div class="contact-profile">
    <div v-if="showHeader" class="profile-header">
      <div
        class="profile-header__identity"
        :class="{ 'profile-header__identity--disabled': !normalizedHeaderPubkey }"
        @click="handleOpenChat"
      >
        <CachedAvatar
          :src="headerPictureUrl"
          :alt="headerName"
          :fallback="headerAvatar"
          class="profile-header__avatar"
        />
        <div class="profile-header__meta">
          <div class="profile-header__name">{{ headerName }}</div>
          <div class="profile-header__subtitle">{{ headerSubtitle }}</div>
        </div>
      </div>
      <q-btn
        flat
        dense
        round
        icon="chat_bubble"
        color="primary"
        aria-label="Open Chat"
        class="profile-header__action"
        :disable="!normalizedHeaderPubkey"
        @click="handleOpenChat"
      />
      <q-btn
        flat
        dense
        round
        icon="refresh"
        color="primary"
        aria-label="Refresh Contact Profile"
        class="profile-header__action"
        :disable="!normalizedHeaderPubkey || isRefreshingContact"
        :loading="isRefreshingContact"
        @click="handleRefreshContactProfile"
      >
        <AppTooltip>Refresh Profile</AppTooltip>
      </q-btn>
    </div>

    <div class="profile-content" :class="{ 'profile-content--with-header': showHeader }">
      <div class="profile-lookup" :class="{ 'profile-lookup--with-header': showHeader }">
        <div class="profile-card__title">Contact Lookup</div>
        <q-input
          :model-value="displayHexPubkey"
          class="tg-input"
          outlined
          dense
          rounded
          readonly
          label="Hex Public Key"
          placeholder="hex pubkey or npub"
          :loading="isLoadingContact"
          :error="Boolean(pubkeyError)"
          :error-message="pubkeyError"
        >
          <template v-if="props.showPubkeyCopyActions" #append>
            <q-btn
              flat
              dense
              round
              icon="content_copy"
              color="primary"
              aria-label="Copy hex public key"
              :disable="!displayHexPubkey.trim()"
              @click.stop="handleCopyProfileValue(displayHexPubkey, 'Hex public key')"
            >
              <AppTooltip>Copy hex public key</AppTooltip>
            </q-btn>
          </template>
        </q-input>
        <q-input
          :model-value="displayNpub"
          class="tg-input q-mt-xs"
          outlined
          dense
          rounded
          readonly
          label="npub"
          placeholder="npub1..."
        >
          <template v-if="props.showPubkeyCopyActions" #append>
            <q-btn
              flat
              dense
              round
              icon="content_copy"
              color="primary"
              aria-label="Copy npub"
              :disable="!displayNpub.trim()"
              @click.stop="handleCopyProfileValue(displayNpub, 'npub')"
            >
              <AppTooltip>Copy npub</AppTooltip>
            </q-btn>
          </template>
        </q-input>
        <div v-if="pubkeyInfo" class="text-caption text-grey-6">{{ pubkeyInfo }}</div>
      </div>

      <q-list bordered separator class="profile-sections q-mt-md">
        <q-expansion-item
          default-opened
          expand-separator
          switch-toggle-side
          class="profile-section"
        >
          <template #header>
            <q-item-section>
              <q-item-label class="profile-card__title">User Metadata (NIP-01)</q-item-label>
            </q-item-section>
          </template>

          <div class="profile-card__section profile-section__content">
            <q-input
              v-model="localProfile.name"
              class="tg-input"
              outlined
              dense
              rounded
              :readonly="readOnly"
              label="Name"
              placeholder="Your profile name"
            />

            <q-input
              v-model="localProfile.about"
              class="tg-input q-mt-sm"
              outlined
              dense
              rounded
              type="textarea"
              autogrow
              :readonly="readOnly"
              label="About"
              placeholder="Short bio"
            />

            <q-input
              v-model="localProfile.picture"
              class="tg-input q-mt-sm"
              outlined
              dense
              rounded
              :readonly="readOnly"
              label="Picture URL"
              placeholder="https://example.com/avatar.png"
            />

            <q-input
              v-model="localProfile.nip05"
              class="tg-input q-mt-sm"
              outlined
              dense
              rounded
              :readonly="readOnly"
              label="NIP-05"
              placeholder="name@example.com"
            />

            <q-input
              v-model="localProfile.lud16"
              class="tg-input q-mt-sm"
              outlined
              dense
              rounded
              :readonly="readOnly"
              label="Lightning Address"
              placeholder="name@domain.com"
            />

            <q-input
              v-model="localProfile.lud06"
              class="tg-input q-mt-sm"
              outlined
              dense
              rounded
              :readonly="readOnly"
              label="LNURL"
              placeholder="lnurl1..."
            />
          </div>
        </q-expansion-item>

        <q-expansion-item expand-separator switch-toggle-side class="profile-section">
          <template #header>
            <q-item-section>
              <q-item-label class="profile-card__title">Extra Metadata Fields (NIP-24)</q-item-label>
            </q-item-section>
          </template>

          <div class="profile-card__section profile-section__content">
            <q-input
              v-model="localProfile.display_name"
              class="tg-input"
              outlined
              dense
              rounded
              :readonly="readOnly"
              label="Display Name"
              placeholder="Alternative display name"
            />

            <q-input
              v-model="localProfile.website"
              class="tg-input q-mt-sm"
              outlined
              dense
              rounded
              :readonly="readOnly"
              label="Website"
              placeholder="https://example.com"
            />

            <q-input
              v-model="localProfile.banner"
              class="tg-input q-mt-sm"
              outlined
              dense
              rounded
              :readonly="readOnly"
              label="Banner URL"
              placeholder="https://example.com/banner.png"
            />

            <div class="profile-card__bot-row q-mt-sm">
              <div>
                <div class="text-body2">Bot</div>
                <div class="text-caption text-grey-6">
                  Content is partially or fully automated.
                </div>
              </div>

              <q-toggle
                v-model="localProfile.bot"
                color="primary"
                checked-icon="smart_toy"
                unchecked-icon="person"
                :disable="readOnly"
              />
            </div>

            <div class="profile-card__subtitle q-mt-md">Birthday</div>
            <div class="profile-card__birthday-grid q-mt-sm">
              <q-input
                v-model.number="localProfile.birthday.year"
                class="tg-input"
                outlined
                dense
                rounded
                type="number"
                :readonly="readOnly"
                label="Year"
                placeholder="1990"
              />

              <q-input
                v-model.number="localProfile.birthday.month"
                class="tg-input"
                outlined
                dense
                rounded
                type="number"
                :readonly="readOnly"
                label="Month"
                placeholder="1-12"
                min="1"
                max="12"
              />

              <q-input
                v-model.number="localProfile.birthday.day"
                class="tg-input"
                outlined
                dense
                rounded
                type="number"
                :readonly="readOnly"
                label="Day"
                placeholder="1-31"
                min="1"
                max="31"
              />
            </div>
          </div>
        </q-expansion-item>

        <q-expansion-item expand-separator switch-toggle-side class="profile-section">
          <template #header>
            <q-item-section>
              <div class="profile-card__title-row">
                <div class="profile-card__title">Relays (NIP-65)</div>
                <q-btn
                  v-if="props.showRelaysEditAction"
                  flat
                  dense
                  round
                  icon="edit"
                  color="primary"
                  aria-label="Edit relays"
                  @click.stop="emit('open-relays-settings')"
                />
              </div>
            </q-item-section>
          </template>

          <div class="profile-card__section profile-section__content">
            <RelayEditorPanel
              :new-relay="''"
              :relays="relayList"
              relay-validation-error=""
              :can-add-relay="false"
              empty-message="No relays configured."
              :show-toolbar="false"
              :show-secondary-action="false"
              :relay-toggles-disabled="true"
              :show-remove-relay-action="false"
              :relay-read-enabled="relayReadEnabled"
              :relay-write-enabled="relayWriteEnabled"
              :relay-icon-url="relayIconUrl"
              :is-relay-connected="isRelayConnected"
              :is-relay-info-loading="isRelayInfoLoading"
              :relay-info-error="relayInfoError"
              :relay-info="relayInfo"
              @relay-expand="handleRelayExpand"
              @retry-relay-info="retryRelayInfo"
              @relay-icon-error="handleRelayIconError"
            />
          </div>
        </q-expansion-item>
      </q-list>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { isValidPubkey, normalizeRelayUrl, type NDKRelayInformation } from '@nostr-dev-kit/ndk';
import { useQuasar } from 'quasar';
import AppTooltip from 'src/components/AppTooltip.vue';
import CachedAvatar from 'src/components/CachedAvatar.vue';
import RelayEditorPanel from 'src/components/RelayEditorPanel.vue';
import { contactsService } from 'src/services/contactsService';
import { useNostrStore } from 'src/stores/nostrStore';
import type { ContactRecord } from 'src/types/contact';
import {
  createEmptyContactProfileForm,
  type ContactProfileForm
} from 'src/types/contactProfile';
import { reportUiError } from 'src/utils/uiErrorHandler';

interface Props {
  modelValue: ContactProfileForm;
  pubkey: string;
  readOnly?: boolean;
  showHeader?: boolean;
  showPubkeyCopyActions?: boolean;
  showRelaysEditAction?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  readOnly: false,
  showHeader: false,
  showPubkeyCopyActions: false,
  showRelaysEditAction: false
});

const emit = defineEmits<{
  (event: 'update:modelValue', value: ContactProfileForm): void;
  (event: 'update:pubkey', value: string): void;
  (event: 'open-chat'): void;
  (event: 'open-relays-settings'): void;
}>();

const $q = useQuasar();
const nostrStore = useNostrStore();
const localPubkey = computed({
  get: () => props.pubkey ?? '',
  set: (value: string) => emit('update:pubkey', value)
});
const localProfile = reactive<ContactProfileForm>(cloneProfile(props.modelValue));
const isLoadingContact = ref(false);
const isRefreshingContact = ref(false);
const pubkeyError = ref('');
const pubkeyInfo = ref('');
const relayInfoByUrl = ref<Record<string, NDKRelayInformation | null>>({});
const relayInfoErrorByUrl = ref<Record<string, string>>({});
const relayInfoLoadingByUrl = ref<Record<string, boolean>>({});
const relayIconErrorByUrl = ref<Record<string, boolean>>({});
let lookupRequestId = 0;

const relayList = computed(() => uniqueRelays(localProfile.relays));
const normalizedDisplayPubkey = computed(() => normalizePubkeyInput(localPubkey.value));
const displayHexPubkey = computed(() => {
  return normalizedDisplayPubkey.value ?? localPubkey.value.trim();
});
const displayNpub = computed(() => {
  const pubkey = normalizedDisplayPubkey.value;
  return pubkey ? nostrStore.encodeNpub(pubkey) ?? '' : '';
});

const normalizedHeaderPubkey = computed(() => localPubkey.value.trim());

const headerName = computed(() => {
  const displayName = localProfile.display_name.trim();
  if (displayName) {
    return displayName;
  }

  const name = localProfile.name.trim();
  if (name) {
    return name;
  }

  return shortPubkey(normalizedHeaderPubkey.value) || 'Contact';
});

const headerSubtitle = computed(() => {
  const pubkey = normalizedHeaderPubkey.value;
  return pubkey ? `Pubkey ${shortPubkey(pubkey)}` : 'Contact profile';
});

const headerAvatar = computed(() => {
  return buildAvatar(headerName.value || normalizedHeaderPubkey.value || 'NA');
});

const headerPictureUrl = computed(() => {
  return localProfile.picture.trim();
});

watch(
  () => props.modelValue,
  (value) => {
    const nextProfile = cloneProfile(value);
    if (isSameProfile(nextProfile, localProfile)) {
      return;
    }

    Object.assign(localProfile, nextProfile);
  },
  { immediate: true }
);

watch(
  localProfile,
  (value) => {
    const nextProfile = cloneProfile(value);
    if (isSameProfile(nextProfile, props.modelValue)) {
      return;
    }

    emit('update:modelValue', nextProfile);
  },
  { deep: true }
);

watch(
  () => props.pubkey,
  (value) => {
    void loadContactFromPubkey(value ?? '');
  },
  { immediate: true }
);

watch(
  relayList,
  (relays) => {
    pruneRelayInfoCache(relays);
    void prepareRelayDecorations(relays);
  },
  { immediate: true }
);

function cloneProfile(value: ContactProfileForm): ContactProfileForm {
  return {
    ...(value ?? createEmptyContactProfileForm()),
    birthday: {
      year: value?.birthday?.year ?? null,
      month: value?.birthday?.month ?? null,
      day: value?.birthday?.day ?? null
    },
    relays: [...(value?.relays ?? [])]
  };
}

function normalizePubkeyInput(input: string): string | null {
  const value = input.trim();
  if (!value) {
    return null;
  }

  if (isValidPubkey(value)) {
    return value.toLowerCase();
  }

  const npubValidation = nostrStore.validateNpub(value);
  return npubValidation.isValid ? npubValidation.normalizedPubkey : null;
}

function shortPubkey(value: string): string {
  const compact = value.trim();
  if (compact.length <= 16) {
    return compact;
  }

  return `${compact.slice(0, 8)}...${compact.slice(-8)}`;
}

function buildAvatar(value: string): string {
  const compactValue = value.replace(/\s+/g, ' ').trim();
  if (!compactValue) {
    return 'NA';
  }

  const parts = compactValue.split(' ');
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return compactValue.slice(0, 2).toUpperCase();
}

function relayKey(relay: string): string {
  try {
    return normalizeRelayUrl(relay);
  } catch {
    return relay.trim().toLowerCase();
  }
}

function uniqueRelays(relays: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const relay of relays) {
    const normalized = relay.trim();
    if (!normalized) {
      continue;
    }

    const key = relayKey(normalized);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function pruneRelayInfoCache(relays: string[]): void {
  const activeRelayKeys = new Set(relays.map((relay) => relayKey(relay)));

  for (const key of Object.keys(relayInfoByUrl.value)) {
    if (!activeRelayKeys.has(key)) {
      delete relayInfoByUrl.value[key];
    }
  }

  for (const key of Object.keys(relayInfoErrorByUrl.value)) {
    if (!activeRelayKeys.has(key)) {
      delete relayInfoErrorByUrl.value[key];
    }
  }

  for (const key of Object.keys(relayInfoLoadingByUrl.value)) {
    if (!activeRelayKeys.has(key)) {
      delete relayInfoLoadingByUrl.value[key];
    }
  }

  for (const key of Object.keys(relayIconErrorByUrl.value)) {
    if (!activeRelayKeys.has(key)) {
      delete relayIconErrorByUrl.value[key];
    }
  }
}

async function prepareRelayDecorations(relays: string[]): Promise<void> {
  if (relays.length === 0) {
    return;
  }

  await nostrStore.ensureRelayConnections(relays).catch((error) => {
    console.warn('Failed to connect relays for status checks', error);
  });

  for (const relay of relays) {
    void loadRelayInfo(relay);
  }
}

function isRelayConnected(relay: string): boolean {
  void nostrStore.relayStatusVersion;
  return nostrStore.getRelayConnectionState(relay) === 'connected';
}

async function loadRelayInfo(relay: string, force = false): Promise<void> {
  const key = relayKey(relay);

  if (!force && relayInfoByUrl.value[key]) {
    return;
  }

  if (relayInfoLoadingByUrl.value[key]) {
    return;
  }

  relayInfoLoadingByUrl.value[key] = true;
  relayInfoErrorByUrl.value[key] = '';

  try {
    const nextRelayInfo = await nostrStore.fetchRelayNip11Info(relay, force);
    relayInfoByUrl.value[key] = nextRelayInfo;
    relayIconErrorByUrl.value[key] = false;
  } catch (error) {
    relayInfoByUrl.value[key] = null;
    relayInfoErrorByUrl.value[key] =
      error instanceof Error ? error.message : 'Failed to load relay NIP-11 data.';
  } finally {
    relayInfoLoadingByUrl.value[key] = false;
  }
}

function handleRelayExpand(relay: string): void {
  try {
    void loadRelayInfo(relay);
  } catch (error) {
    reportUiError('Failed to expand relay details in contact profile', error);
  }
}

function relayInfo(relay: string): NDKRelayInformation | null {
  return relayInfoByUrl.value[relayKey(relay)] ?? null;
}

function relayInfoError(relay: string): string {
  return relayInfoErrorByUrl.value[relayKey(relay)] ?? '';
}

function isRelayInfoLoading(relay: string): boolean {
  return relayInfoLoadingByUrl.value[relayKey(relay)] === true;
}

function retryRelayInfo(relay: string): void {
  try {
    void loadRelayInfo(relay, true);
  } catch (error) {
    reportUiError('Failed to retry relay info in contact profile', error);
  }
}

function relayIconUrl(relay: string): string | null {
  const key = relayKey(relay);
  if (relayIconErrorByUrl.value[key]) {
    return null;
  }

  const icon = relayInfo(relay)?.icon;
  if (typeof icon !== 'string') {
    return null;
  }

  const trimmed = icon.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function handleRelayIconError(relay: string): void {
  try {
    relayIconErrorByUrl.value[relayKey(relay)] = true;
  } catch (error) {
    reportUiError('Failed to handle relay icon error in contact profile', error);
  }
}

function relayReadEnabled(): boolean {
  return true;
}

function relayWriteEnabled(): boolean {
  return true;
}

function mapContactToProfile(contact: ContactRecord): ContactProfileForm {
  const picture = contact.meta.picture ?? '';

  return {
    ...createEmptyContactProfileForm(),
    name: contact.meta.name ?? contact.name ?? '',
    about: contact.meta.about ?? '',
    picture,
    nip05: contact.meta.nip05 ?? '',
    lud06: contact.meta.lud06 ?? '',
    lud16: contact.meta.lud16 ?? '',
    display_name: contact.meta.display_name ?? contact.given_name ?? '',
    website: contact.meta.website ?? '',
    banner: contact.meta.banner ?? '',
    bot: contact.meta.bot === true,
    birthday: {
      year: contact.meta.birthday?.year ?? null,
      month: contact.meta.birthday?.month ?? null,
      day: contact.meta.birthday?.day ?? null
    },
    relays: (contact.relays ?? []).map((relay) => relay.url)
  };
}

function handleOpenChat(): void {
  try {
    if (!normalizedHeaderPubkey.value) {
      return;
    }

    emit('open-chat');
  } catch (error) {
    reportUiError('Failed to open chat from contact profile', error);
  }
}

async function copyText(value: string): Promise<void> {
  const text = value.trim();
  if (!text) {
    return;
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === 'undefined') {
    throw new Error('Clipboard is not available.');
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

async function handleCopyProfileValue(value: string, label: string): Promise<void> {
  try {
    await copyText(value);
    $q.notify({
      type: 'positive',
      message: `${label} copied.`,
      position: 'top-right'
    });
  } catch (error) {
    reportUiError(
      `Failed to copy ${label.toLowerCase()}`,
      error,
      `Failed to copy ${label.toLowerCase()}.`
    );
  }
}

async function handleRefreshContactProfile(): Promise<void> {
  try {
    const normalizedPubkey = normalizePubkeyInput(localPubkey.value);
    if (!normalizedPubkey || isRefreshingContact.value) {
      return;
    }

    isRefreshingContact.value = true;
    pubkeyError.value = '';
    pubkeyInfo.value = '';

    await nostrStore.refreshContactByPublicKey(normalizedPubkey, headerName.value);
    await loadContactFromPubkey(normalizedPubkey);
  } catch (error) {
    reportUiError('Failed to refresh contact profile from header action', error, 'Failed to refresh profile.');
    pubkeyError.value =
      error instanceof Error ? error.message : 'Failed to refresh contact profile.';
    pubkeyInfo.value = '';
  } finally {
    isRefreshingContact.value = false;
  }
}

function isSameProfile(a: ContactProfileForm, b: ContactProfileForm): boolean {
  return (
    a.name === b.name &&
    a.about === b.about &&
    a.picture === b.picture &&
    a.nip05 === b.nip05 &&
    a.lud06 === b.lud06 &&
    a.lud16 === b.lud16 &&
    a.display_name === b.display_name &&
    a.website === b.website &&
    a.banner === b.banner &&
    a.bot === b.bot &&
    a.birthday.year === b.birthday.year &&
    a.birthday.month === b.birthday.month &&
    a.birthday.day === b.birthday.day &&
    a.relays.length === b.relays.length &&
    a.relays.every((relay, index) => relay === b.relays[index])
  );
}

async function loadContactFromPubkey(input: string): Promise<void> {
  const requestId = ++lookupRequestId;
  const normalizedPubkey = normalizePubkeyInput(input);

  if (!input.trim()) {
    isLoadingContact.value = false;
    pubkeyError.value = '';
    pubkeyInfo.value = '';
    return;
  }

  if (!normalizedPubkey) {
    isLoadingContact.value = false;
    pubkeyError.value = 'Enter a valid hex pubkey or npub.';
    pubkeyInfo.value = '';
    return;
  }

  isLoadingContact.value = true;
  pubkeyError.value = '';
  pubkeyInfo.value = '';

  try {
    await contactsService.init();
    const contact = await contactsService.getContactByPublicKey(normalizedPubkey);
    if (requestId !== lookupRequestId) {
      return;
    }

    if (!contact) {
      pubkeyInfo.value = 'No contact found for this public key.';
      return;
    }

    Object.assign(localProfile, mapContactToProfile(contact));
  } catch (error) {
    if (requestId !== lookupRequestId) {
      return;
    }

    pubkeyError.value = error instanceof Error ? error.message : 'Failed to load contact.';
    pubkeyInfo.value = '';
  } finally {
    if (requestId === lookupRequestId) {
      isLoadingContact.value = false;
    }
  }
}
</script>

<style scoped>
.contact-profile {
  width: 100%;
  min-height: 100%;
  background: transparent;
}

.profile-content--with-header {
  padding: 12px;
}

.profile-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--tg-border);
  background: var(--tg-panel-header-bg);
}

.profile-header__identity {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
  cursor: pointer;
}

.profile-header__identity--disabled {
  cursor: default;
}

.profile-header__meta {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.profile-header__name {
  font-weight: 600;
}

.profile-header__subtitle {
  font-size: 12px;
  opacity: 0.65;
}

.profile-header__action {
  color: #64748b;
}

.profile-lookup {
  display: grid;
  gap: 6px;
}

.profile-lookup--with-header {
  margin-top: 0;
}

.profile-sections {
  border-radius: 12px;
  background: color-mix(in srgb, var(--tg-sidebar) 92%, transparent);
}

.profile-sections :deep(.q-expansion-item + .q-expansion-item) {
  border-top: 1px solid var(--tg-border);
}

.profile-section__content {
  padding: 0 14px 14px;
}

.profile-card {
  background: color-mix(in srgb, var(--tg-sidebar) 92%, transparent);
}

.profile-card__section {
  display: grid;
  gap: 6px;
}

.profile-card__title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 4px;
}

.profile-card__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.profile-card__title-row .profile-card__title {
  margin-bottom: 0;
}

.profile-card__subtitle {
  font-size: 14px;
  font-weight: 600;
}

.profile-card__bot-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.profile-card__birthday-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

@media (max-width: 640px) {
  .profile-card__birthday-grid {
    grid-template-columns: 1fr;
  }
}
</style>
