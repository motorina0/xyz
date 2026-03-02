<template>
  <SettingsDetailLayout title="Profile" icon="face">
    <template #actions>
      <q-btn
        no-caps
        unelevated
        color="primary"
        label="Publish"
        :loading="isPublishing"
        @click="handlePublish"
      />
    </template>

    <div class="profile-content">
      <q-card flat bordered class="profile-card">
        <q-card-section class="profile-card__section">
          <div class="profile-card__title">User Metadata (NIP-01)</div>

          <q-input
            v-model="profileMetadata.name"
            class="tg-input"
            outlined
            dense
            rounded
            label="Name (`name`)"
            placeholder="Your profile name"
          />

          <q-input
            v-model="profileMetadata.about"
            class="tg-input q-mt-sm"
            outlined
            dense
            rounded
            type="textarea"
            autogrow
            label="About (`about`)"
            placeholder="Short bio"
          />

          <q-input
            v-model="profileMetadata.picture"
            class="tg-input q-mt-sm"
            outlined
            dense
            rounded
            label="Picture URL (`picture`)"
            placeholder="https://example.com/avatar.png"
          />

          <q-input
            v-model="profileMetadata.nip05"
            class="tg-input q-mt-sm"
            outlined
            dense
            rounded
            label="NIP-05 (`nip05`)"
            placeholder="name@example.com"
          />

          <q-input
            v-model="profileMetadata.lud16"
            class="tg-input q-mt-sm"
            outlined
            dense
            rounded
            label="Lightning Address (`lud16`)"
            placeholder="name@domain.com"
          />

          <q-input
            v-model="profileMetadata.lud06"
            class="tg-input q-mt-sm"
            outlined
            dense
            rounded
            label="LNURL (`lud06`)"
            placeholder="lnurl1..."
          />
        </q-card-section>
      </q-card>

      <q-card flat bordered class="profile-card q-mt-md">
        <q-card-section class="profile-card__section">
          <div class="profile-card__title">Extra Metadata Fields (NIP-24 Kind 0)</div>

          <q-input
            v-model="profileMetadata.display_name"
            class="tg-input"
            outlined
            dense
            rounded
            label="Display Name (`display_name`)"
            placeholder="Alternative display name"
          />

          <q-input
            v-model="profileMetadata.website"
            class="tg-input q-mt-sm"
            outlined
            dense
            rounded
            label="Website (`website`)"
            placeholder="https://example.com"
          />

          <q-input
            v-model="profileMetadata.banner"
            class="tg-input q-mt-sm"
            outlined
            dense
            rounded
            label="Banner URL (`banner`)"
            placeholder="https://example.com/banner.png"
          />

          <div class="profile-card__bot-row q-mt-sm">
            <div>
              <div class="text-body2">Bot (`bot`)</div>
              <div class="text-caption text-grey-6">
                Mark true if content is partially or fully automated.
              </div>
            </div>

            <q-toggle
              v-model="profileMetadata.bot"
              color="primary"
              checked-icon="smart_toy"
              unchecked-icon="person"
            />
          </div>

          <div class="profile-card__subtitle q-mt-md">Birthday (`birthday`)</div>
          <div class="profile-card__birthday-grid q-mt-sm">
            <q-input
              v-model.number="profileMetadata.birthday.year"
              class="tg-input"
              outlined
              dense
              rounded
              type="number"
              label="Year"
              placeholder="1990"
            />

            <q-input
              v-model.number="profileMetadata.birthday.month"
              class="tg-input"
              outlined
              dense
              rounded
              type="number"
              label="Month"
              placeholder="1-12"
              min="1"
              max="12"
            />

            <q-input
              v-model.number="profileMetadata.birthday.day"
              class="tg-input"
              outlined
              dense
              rounded
              type="number"
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
    </div>
  </SettingsDetailLayout>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useQuasar } from 'quasar';
import SettingsDetailLayout from 'src/components/SettingsDetailLayout.vue';
import type { PublishUserMetadataInput } from 'src/stores/nostrStore';
import { useNostrStore } from 'src/stores/nostrStore';
import { useRelayStore } from 'src/stores/relayStore';

interface ProfileMetadataForm {
  name: string;
  about: string;
  picture: string;
  nip05: string;
  lud06: string;
  lud16: string;
  display_name: string;
  website: string;
  banner: string;
  bot: boolean;
  birthday: {
    year: number | null;
    month: number | null;
    day: number | null;
  };
}

const $q = useQuasar();
const nostrStore = useNostrStore();
const relayStore = useRelayStore();
const isPublishing = ref(false);

const profileMetadata = reactive<ProfileMetadataForm>({
  name: '',
  about: '',
  picture: '',
  nip05: '',
  lud06: '',
  lud16: '',
  display_name: '',
  website: '',
  banner: '',
  bot: false,
  birthday: {
    year: null,
    month: null,
    day: null
  }
});

relayStore.init();

function cleanString(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeBirthday(input: ProfileMetadataForm['birthday']): PublishUserMetadataInput['birthday'] {
  const normalized: NonNullable<PublishUserMetadataInput['birthday']> = {};

  if (Number.isInteger(input.year) && Number(input.year) > 0) {
    normalized.year = Number(input.year);
  }

  if (
    Number.isInteger(input.month) &&
    Number(input.month) >= 1 &&
    Number(input.month) <= 12
  ) {
    normalized.month = Number(input.month);
  }

  if (Number.isInteger(input.day) && Number(input.day) >= 1 && Number(input.day) <= 31) {
    normalized.day = Number(input.day);
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function buildPublishPayload(): PublishUserMetadataInput {
  const payload: PublishUserMetadataInput = {
    bot: profileMetadata.bot
  };

  const fields: Array<keyof Omit<ProfileMetadataForm, 'bot' | 'birthday'>> = [
    'name',
    'about',
    'picture',
    'nip05',
    'lud06',
    'lud16',
    'display_name',
    'website',
    'banner'
  ];

  for (const field of fields) {
    const value = cleanString(profileMetadata[field]);
    if (value !== undefined) {
      payload[field] = value;
    }
  }

  const birthday = normalizeBirthday(profileMetadata.birthday);
  if (birthday) {
    payload.birthday = birthday;
  }

  return payload;
}

async function handlePublish(): Promise<void> {
  if (isPublishing.value) {
    return;
  }

  isPublishing.value = true;
  try {
    await nostrStore.publishUserMetadata(buildPublishPayload(), relayStore.relays);
    $q.notify({
      type: 'positive',
      message: 'Profile metadata published.'
    });
  } catch (error) {
    $q.notify({
      type: 'negative',
      message: error instanceof Error ? error.message : 'Failed to publish profile metadata.'
    });
  } finally {
    isPublishing.value = false;
  }
}
</script>

<style scoped>
.profile-content {
  width: 100%;
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
