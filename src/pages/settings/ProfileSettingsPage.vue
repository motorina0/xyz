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

    <ContactProfile
      v-model="profileMetadata"
      v-model:pubkey="profilePubkey"
      :read-only="false"
      :show-pubkey-copy-actions="true"
      :show-relays-edit-action="true"
      @open-relays-settings="handleOpenRelaysSettings"
    />
  </SettingsDetailLayout>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import ContactProfile from 'src/components/ContactProfile.vue';
import SettingsDetailLayout from 'src/components/SettingsDetailLayout.vue';
import { createEmptyContactProfileForm } from 'src/types/contactProfile';
import { useNostrStore } from 'src/stores/nostrStore';
import { useRelayStore } from 'src/stores/relayStore';
import { buildContactProfilePublishPayload } from 'src/utils/contactProfilePublish';
import { reportUiError } from 'src/utils/uiErrorHandler';

const $q = useQuasar();
const router = useRouter();
const nostrStore = useNostrStore();
const relayStore = useRelayStore();
const isPublishing = ref(false);
const profilePubkey = ref(nostrStore.getLoggedInPublicKeyHex() ?? '');
const profileMetadata = ref(createEmptyContactProfileForm());

relayStore.init();

function handleOpenRelaysSettings(): void {
  try {
    void router.push({ name: 'settings-relays' });
  } catch (error) {
    reportUiError('Failed to open relays settings', error);
  }
}

async function handlePublish(): Promise<void> {
  if (isPublishing.value) {
    return;
  }

  isPublishing.value = true;
  try {
    await nostrStore.publishUserMetadata(
      buildContactProfilePublishPayload(profileMetadata.value),
      relayStore.relays
    );
    $q.notify({
      type: 'positive',
      message: 'Profile metadata published.',
      position: 'top-right'
    });
  } catch (error) {
    reportUiError('Failed to publish profile metadata', error, 'Failed to publish profile metadata.');
  } finally {
    isPublishing.value = false;
  }
}
</script>
