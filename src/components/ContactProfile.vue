<template>
  <div class="contact-profile">
    <div class="profile-lookup">
      <div class="profile-card__title">Contact Lookup</div>
      <q-input
        v-model="localPubkey"
        class="tg-input"
        outlined
        dense
        rounded
        :readonly="readOnly"
        label="Public Key"
        placeholder="hex pubkey or npub"
        :loading="isLoadingContact"
        :error="Boolean(pubkeyError)"
        :error-message="pubkeyError"
      />
      <div v-if="pubkeyInfo" class="text-caption text-grey-6">{{ pubkeyInfo }}</div>
    </div>

    <q-card flat bordered class="profile-card q-mt-md">
      <q-card-section class="profile-card__section">
        <div class="profile-card__title">User Metadata (NIP-01)</div>

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
      </q-card-section>
    </q-card>

    <q-card flat bordered class="profile-card q-mt-md">
      <q-card-section class="profile-card__section">
        <div class="profile-card__title">Extra Metadata Fields (NIP-24)</div>

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
              Mark true if content is partially or fully automated.
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

        <div class="text-caption text-grey-6 q-mt-sm">
          Each `birthday` field is optional in NIP-24.
        </div>
      </q-card-section>
    </q-card>

    <q-card flat bordered class="profile-card q-mt-md">
      <q-card-section class="profile-card__section">
        <div class="profile-card__title">Relays (NIP-65)</div>
        <q-input
          v-model="relayListCsv"
          class="tg-input"
          outlined
          dense
          rounded
          :readonly="readOnly"
          label="Relay URLs"
          placeholder="wss://relay.one, wss://relay.two"
        />
      </q-card-section>
    </q-card>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { isValidPubkey } from '@nostr-dev-kit/ndk';
import { contactsService } from 'src/services/contactsService';
import { useNostrStore } from 'src/stores/nostrStore';
import type { ContactRecord } from 'src/types/contact';
import {
  createEmptyContactProfileForm,
  type ContactProfileForm
} from 'src/types/contactProfile';

interface Props {
  modelValue: ContactProfileForm;
  pubkey: string;
  readOnly?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  readOnly: false
});

const emit = defineEmits<{
  (event: 'update:modelValue', value: ContactProfileForm): void;
  (event: 'update:pubkey', value: string): void;
}>();

const nostrStore = useNostrStore();
const localPubkey = computed({
  get: () => props.pubkey ?? '',
  set: (value: string) => emit('update:pubkey', value)
});
const localProfile = reactive<ContactProfileForm>(cloneProfile(props.modelValue));
const isLoadingContact = ref(false);
const pubkeyError = ref('');
const pubkeyInfo = ref('');
let lookupRequestId = 0;

const relayListCsv = computed({
  get: () => localProfile.relays.join(', '),
  set: (value: string) => {
    localProfile.relays = value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
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

function mapContactToProfile(contact: ContactRecord): ContactProfileForm {
  return {
    ...createEmptyContactProfileForm(),
    name: contact.meta.name ?? contact.name ?? '',
    about: contact.meta.about ?? '',
    picture: contact.meta.picture ?? '',
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
    pubkeyInfo.value = 'Contact loaded from local database.';
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
}

.profile-lookup {
  display: grid;
  gap: 6px;
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
