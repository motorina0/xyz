<template>
  <SettingsDetailLayout title="Profile" icon="face">
    <div class="profile-content">
      <q-card flat bordered class="profile-card">
        <q-card-section class="profile-card__section">
          <div class="profile-card__title">NIP-01 Kind 0: User Metadata</div>

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
        </q-card-section>
      </q-card>

      <q-card flat bordered class="profile-card q-mt-md">
        <q-card-section class="profile-card__section">
          <div class="profile-card__title">NIP-24 Kind 0: Extra Metadata Fields</div>

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
import { reactive } from 'vue';
import SettingsDetailLayout from 'src/components/SettingsDetailLayout.vue';

interface ProfileMetadataForm {
  name: string;
  about: string;
  picture: string;
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

const profileMetadata = reactive<ProfileMetadataForm>({
  name: '',
  about: '',
  picture: '',
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
