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

    <ContactProfile v-model="profileMetadata" v-model:pubkey="profilePubkey" :read-only="false" />
  </SettingsDetailLayout>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useQuasar } from 'quasar';
import ContactProfile from 'src/components/ContactProfile.vue';
import SettingsDetailLayout from 'src/components/SettingsDetailLayout.vue';
import { createEmptyContactProfileForm } from 'src/types/contactProfile';
import type { PublishUserMetadataInput } from 'src/stores/nostrStore';
import { useNostrStore } from 'src/stores/nostrStore';
import { useRelayStore } from 'src/stores/relayStore';

const $q = useQuasar();
const nostrStore = useNostrStore();
const relayStore = useRelayStore();
const isPublishing = ref(false);
const profilePubkey = ref(nostrStore.getLoggedInPublicKeyHex() ?? '');
const profileMetadata = ref(createEmptyContactProfileForm());

relayStore.init();

function cleanString(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeBirthday(
  input: (typeof profileMetadata.value)['birthday']
): PublishUserMetadataInput['birthday'] {
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
  const value = profileMetadata.value;
  const payload: PublishUserMetadataInput = {
    bot: value.bot
  };

  const fields: Array<
    keyof Omit<(typeof profileMetadata.value), 'bot' | 'birthday' | 'relays'>
  > = [
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
    const fieldValue = cleanString(value[field]);
    if (fieldValue !== undefined) {
      payload[field] = fieldValue;
    }
  }

  const birthday = normalizeBirthday(value.birthday);
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
