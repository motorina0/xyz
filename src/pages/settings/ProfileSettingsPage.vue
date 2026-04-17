<template>
  <SettingsDetailLayout title="Profile" icon="face">
    <ContactProfile
      v-model="profileMetadata"
      v-model:pubkey="profilePubkey"
      :read-only="false"
      :show-relays-edit-action="true"
      :show-share-action="true"
      :show-publish-action="true"
      :is-publishing="isPublishing"
      @open-relays-settings="handleOpenRelaysSettings"
      @publish="handlePublish"
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

async function handlePublish(nextProfile: typeof profileMetadata.value): Promise<void> {
  if (isPublishing.value) {
    return;
  }

  isPublishing.value = true;
  try {
    profileMetadata.value = nextProfile;
    await nostrStore.publishUserMetadata(buildContactProfilePublishPayload(nextProfile), relayStore.relays);
    $q.notify({
      type: 'positive',
      message: 'Profile metadata published.',
      position: 'top'
    });
  } catch (error) {
    reportUiError('Failed to publish profile metadata', error, 'Failed to publish profile metadata.');
  } finally {
    isPublishing.value = false;
  }
}
</script>
