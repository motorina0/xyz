<template>
  <AppDialog
    v-model="dialogModel"
    :title="dialogTitle"
    :subtitle="dialogSubtitle"
    :persistent="isSubmitting"
    max-width="460px"
  >
    <q-input
      v-model="identifierInput"
      class="nc-input"
      data-testid="contact-lookup-identifier"
      dense
      outlined
      rounded
      autofocus
      clearable
      clear-icon="close"
      label="Identifier or Public key"
      :error="Boolean(identifierError)"
      :error-message="identifierError"
      @update:model-value="handleIdentifierInput"
      @keydown.enter.prevent="handleSubmit"
    />

    <div v-if="showSuggestions" class="contact-lookup-dialog__suggestions">
      <div class="contact-lookup-dialog__suggestions-scroll">
        <q-list separator>
          <q-item
            v-for="contact in filteredContacts"
            :key="contact.id"
            clickable
            class="contact-lookup-dialog__suggestion"
            :active="selectedContactPubkey === contact.public_key"
            active-class="contact-lookup-dialog__suggestion--active"
            @click="handleContactSelection(contact)"
          >
            <q-item-section avatar>
              <CachedAvatar
                v-if="contactPicture(contact)"
                :src="contactPicture(contact)"
                :alt="contactDisplayName(contact)"
                :fallback="buildAvatarText(contactDisplayName(contact) || contact.public_key)"
                size="36px"
                bordered
              />
              <q-avatar v-else size="36px" color="primary" text-color="white">
                {{ buildAvatarText(contactDisplayName(contact) || contact.public_key) }}
              </q-avatar>
            </q-item-section>
            <q-item-section>
              <q-item-label>{{ contactDisplayName(contact) }}</q-item-label>
              <q-item-label caption>{{ contactSubtitle(contact) }}</q-item-label>
            </q-item-section>
            <q-item-section side v-if="contact.type === 'group'">
              <q-badge rounded color="primary" label="Group" />
            </q-item-section>
          </q-item>
          <div v-if="filteredContacts.length === 0" class="contact-lookup-dialog__empty-state">
            {{ identifierInput.trim() ? 'No matching contacts. Enter a valid identifier to add one.' : 'No contacts available yet.' }}
          </div>
        </q-list>
      </div>
    </div>

    <q-input
      v-show="!selectedExistingContact"
      v-model="givenName"
      class="q-mt-sm nc-input"
      data-testid="contact-lookup-given-name"
      dense
      outlined
      rounded
      label="Given Name"
      @keydown.enter.prevent="handleSubmit"
    />

    <template #actions>
      <q-btn
        outline
        color="primary"
        no-caps
        label="Cancel"
        :disable="isSubmitting"
        @click="closeDialog"
      />
      <q-btn
        unelevated
        color="primary"
        no-caps
        data-testid="contact-lookup-submit"
        :label="submitLabel"
        :disable="!canSubmit || isSubmitting"
        :loading="isSubmitting"
        @click="handleSubmit"
      />
    </template>
  </AppDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import AppDialog from 'src/components/AppDialog.vue';
import CachedAvatar from 'src/components/CachedAvatar.vue';
import { contactsService } from 'src/services/contactsService';
import { useNostrStore } from 'src/stores/nostrStore';
import { useRelayStore } from 'src/stores/relayStore';
import type { ContactMetadata, ContactRecord, ContactType } from 'src/types/contact';
import { buildAvatarText } from 'src/utils/avatarText';
import { reportUiError } from 'src/utils/uiErrorHandler';

interface Props {
  modelValue: boolean;
  purpose: 'chat' | 'contact';
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void;
  (event: 'resolved', contact: ContactRecord): void;
}>();

const nostrStore = useNostrStore();
const relayStore = useRelayStore();

relayStore.init();

const dialogModel = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
});

const contacts = ref<ContactRecord[]>([]);
const selectedContactPubkey = ref<string | null>(null);
const identifierInput = ref('');
const givenName = ref('');
const identifierError = ref('');
const isSubmitting = ref(false);

const allowedContactTypes = computed<ContactType[] | null>(() => {
  return props.purpose === 'chat' ? ['user'] : null;
});

const selectedExistingContact = computed(() => {
  return findContactByPubkey(selectedContactPubkey.value);
});
const filteredContacts = computed(() => {
  return buildFilteredContacts(identifierInput.value).slice(0, 3);
});
const showSuggestions = computed(() => {
  return props.modelValue && identifierInput.value.trim().length > 0;
});
const canSubmit = computed(() => {
  return Boolean(selectedExistingContact.value || identifierInput.value.trim());
});
const dialogTitle = computed(() => (props.purpose === 'chat' ? 'New Chat' : 'Add Contact'));
const dialogSubtitle = computed(() => {
  return props.purpose === 'chat'
    ? 'Search your contacts or enter a valid identifier to start chatting.'
    : 'Search your contacts or enter a valid identifier to add someone new.';
});
const submitLabel = computed(() => {
  if (selectedExistingContact.value) {
    return props.purpose === 'chat' ? 'Open Chat' : 'Open';
  }

  return props.purpose === 'chat' ? 'Add and Chat' : 'Add Contact';
});

watch(
  () => props.modelValue,
  (isOpen) => {
    if (!isOpen) {
      resetDialog();
      return;
    }

    resetDialog();
    void loadContacts();
  }
);

watch(
  () => nostrStore.contactListVersion,
  () => {
    if (!props.modelValue) {
      return;
    }

    void loadContacts(identifierInput.value);
  }
);

function contactDisplayName(contact: ContactRecord): string {
  return (
    contact.meta.display_name?.trim() ||
    contact.given_name?.trim() ||
    contact.meta.name?.trim() ||
    contact.name.trim() ||
    contact.public_key
  );
}

function contactPicture(contact: ContactRecord): string {
  return contact.meta.picture?.trim() || '';
}

function contactNpub(contact: ContactRecord): string {
  return contact.meta.npub?.trim() || nostrStore.encodeNpub(contact.public_key) || '';
}

function contactSubtitle(contact: ContactRecord): string {
  return contact.meta.nip05?.trim() || contactNpub(contact) || contact.public_key.slice(0, 32);
}

function contactSearchValues(contact: ContactRecord): string[] {
  return [
    contact.public_key,
    contact.name,
    contact.given_name ?? '',
    contact.meta.name ?? '',
    contact.meta.display_name ?? '',
    contact.meta.nip05 ?? '',
    contactNpub(contact)
  ]
    .map((value) => value.trim())
    .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index);
}

function contactMatchesQuery(contact: ContactRecord, query: string): boolean {
  if (!query.trim()) {
    return true;
  }

  const normalizedQuery = query.trim().toLowerCase();
  return contactSearchValues(contact).some((value) => value.toLowerCase().includes(normalizedQuery));
}

function contactMatchesExactInput(contact: ContactRecord, value: string): boolean {
  const normalizedValue = value.trim().toLowerCase();
  if (!normalizedValue) {
    return false;
  }

  return contactSearchValues(contact).some((entry) => entry.toLowerCase() === normalizedValue);
}

function canUseContact(contact: ContactRecord): boolean {
  const allowedTypes = allowedContactTypes.value;
  return !allowedTypes || allowedTypes.includes(contact.type);
}

function unsupportedContactMessage(): string {
  return props.purpose === 'chat'
    ? 'New Chat only supports direct contacts. Open the group from Chats instead.'
    : 'This contact cannot be used here.';
}

function findContactByPubkey(pubkey: string | null | undefined): ContactRecord | null {
  const normalizedPubkey = pubkey?.trim().toLowerCase() ?? '';
  if (!normalizedPubkey) {
    return null;
  }

  return (
    contacts.value.find((contact) => contact.public_key.trim().toLowerCase() === normalizedPubkey) ?? null
  );
}

function buildFilteredContacts(query: string): ContactRecord[] {
  const normalizedQuery = query.trim();
  return contacts.value
    .filter((contact) => canUseContact(contact))
    .filter((contact) => contactMatchesQuery(contact, normalizedQuery));
}

function newContactIdentifierErrorMessage(resolution: {
  identifierType: string | null;
  error: string | null;
}): string {
  if (resolution.identifierType === 'nip05') {
    return resolution.error === 'nip05_unresolved'
      ? 'NIP-05 could not be resolved. Please verify the identifier.'
      : 'Enter a valid NIP-05 identifier (name@domain).';
  }

  return 'Enter a valid hex pubkey, npub, or NIP-05 email.';
}

function closeDialog(): void {
  if (isSubmitting.value) {
    return;
  }

  dialogModel.value = false;
}

function resetDialog(): void {
  selectedContactPubkey.value = null;
  identifierInput.value = '';
  givenName.value = '';
  identifierError.value = '';
}

async function loadContacts(query = ''): Promise<void> {
  try {
    await contactsService.init();
    contacts.value = await contactsService.listContacts();
  } catch (error) {
    console.error('Failed to load contacts for lookup dialog', error);
  }
}

function handleIdentifierInput(value: string | number | null): void {
  identifierInput.value = typeof value === 'string' ? value : '';
  if (identifierError.value) {
    identifierError.value = '';
  }

  const selectedContact = selectedExistingContact.value;
  if (selectedContact && !contactMatchesExactInput(selectedContact, identifierInput.value)) {
    selectedContactPubkey.value = null;
  }
}

async function finalizeResolvedContact(contact: ContactRecord): Promise<void> {
  if (isSubmitting.value) {
    return;
  }

  isSubmitting.value = true;

  try {
    const resolvedContact = await ensureContactInPrivateContactList(contact);
    emit('resolved', resolvedContact);
    dialogModel.value = false;
  } catch (error) {
    reportUiError(
      props.purpose === 'chat' ? 'Failed to open chat contact' : 'Failed to add contact',
      error,
      props.purpose === 'chat' ? 'Failed to continue to chat.' : 'Failed to add contact.'
    );
  } finally {
    isSubmitting.value = false;
  }
}

async function handleContactSelection(contact: ContactRecord): Promise<void> {
  selectedContactPubkey.value = contact.public_key;
  identifierInput.value = contact.meta.nip05?.trim() || contactNpub(contact) || contact.public_key;

  if (identifierError.value) {
    identifierError.value = '';
  }

  if (props.purpose === 'chat') {
    await finalizeResolvedContact(contact);
  }
}

async function ensureContactInPrivateContactList(contact: ContactRecord): Promise<ContactRecord> {
  if (contact.meta.private_contact_list_member === true) {
    return contact;
  }

  const nextMeta: ContactMetadata = {
    ...(contact.meta ?? {}),
    private_contact_list_member: true
  };
  const updatedContact = await contactsService.updateContact(contact.id, {
    meta: nextMeta
  });
  const contactToUse = updatedContact ?? contact;

  try {
    await nostrStore.publishPrivateContactList(relayStore.relays);
  } catch (error) {
    reportUiError(
      'Failed to publish private contact list after selecting contact',
      error,
      'Contact saved, but contact list sync failed.'
    );
  }

  return contactToUse;
}

async function createContactFromIdentifier(identifier: string): Promise<ContactRecord | null> {
  const resolution = await nostrStore.resolveIdentifier(identifier);
  if (!resolution.isValid || !resolution.normalizedPubkey) {
    identifierError.value = newContactIdentifierErrorMessage(resolution);
    return null;
  }

  const existingContact = await contactsService.getContactByPublicKey(resolution.normalizedPubkey);
  if (existingContact) {
    if (!canUseContact(existingContact)) {
      identifierError.value = unsupportedContactMessage();
      return null;
    }

    return ensureContactInPrivateContactList(existingContact);
  }

  const trimmedIdentifier = identifier.trim();
  const fallbackName =
    resolution.resolvedName?.trim() ||
    trimmedIdentifier.slice(0, 32) ||
    resolution.normalizedPubkey.slice(0, 16);
  const created = await contactsService.createContact({
    public_key: resolution.normalizedPubkey,
    name: fallbackName,
    given_name: givenName.value.trim() || null,
    meta: {
      private_contact_list_member: true,
      ...(resolution.identifierType === 'nip05' ? { nip05: trimmedIdentifier } : {})
    },
    relays: resolution.relays.map((url) => ({
      url,
      read: true,
      write: true
    }))
  });

  if (!created) {
    throw new Error('Failed to create contact.');
  }

  let nextContact = created;
  try {
    await nostrStore.refreshContactByPublicKey(resolution.normalizedPubkey, fallbackName, {
      refreshRelayList: true,
      relayListSeedRelayUrls: resolution.relays
    });
    const refreshedContact = await contactsService.getContactByPublicKey(resolution.normalizedPubkey);
    if (refreshedContact) {
      nextContact = refreshedContact;
    }
  } catch (error) {
    reportUiError(
      'Failed to refresh contact profile after create',
      error,
      'Contact added, but profile refresh failed.'
    );
  }

  if (!canUseContact(nextContact)) {
    identifierError.value = unsupportedContactMessage();
    return null;
  }

  try {
    await nostrStore.publishPrivateContactList(relayStore.relays);
  } catch (error) {
    reportUiError(
      'Failed to publish private contact list after adding contact',
      error,
      'Contact added, but contact list sync failed.'
    );
  }

  return nextContact;
}

function resolveExistingContactFromInput(value: string): ContactRecord | null {
  const exactMatch = contacts.value.find((contact) => {
    return canUseContact(contact) && contactMatchesExactInput(contact, value);
  });
  if (exactMatch) {
    return exactMatch;
  }

  if (filteredContacts.value.length === 1) {
    return filteredContacts.value[0] ?? null;
  }

  return null;
}

async function handleSubmit(): Promise<void> {
  if (isSubmitting.value) {
    return;
  }

  const selectedContact =
    selectedExistingContact.value ?? resolveExistingContactFromInput(identifierInput.value);
  if (!selectedContact && !identifierInput.value.trim()) {
    identifierError.value = 'Enter a valid hex pubkey, npub, or NIP-05 email.';
    return;
  }

  isSubmitting.value = true;

  try {
    const resolvedContact = selectedContact
      ? await ensureContactInPrivateContactList(selectedContact)
      : await createContactFromIdentifier(identifierInput.value.trim());
    if (!resolvedContact) {
      return;
    }

    await loadContacts();
    emit('resolved', resolvedContact);
    dialogModel.value = false;
  } catch (error) {
    reportUiError(
      props.purpose === 'chat' ? 'Failed to open chat contact' : 'Failed to add contact',
      error,
      props.purpose === 'chat' ? 'Failed to continue to chat.' : 'Failed to add contact.'
    );
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<style scoped>
.contact-lookup-dialog__suggestions {
  margin-top: 10px;
  border: 1px solid var(--nc-border);
  border-radius: 16px;
  background: var(--nc-panel-sidebar-bg);
  overflow: hidden;
}

.contact-lookup-dialog__suggestions-scroll {
  max-height: 188px;
  overflow-y: auto;
}

.contact-lookup-dialog__suggestion--active {
  background: color-mix(in srgb, var(--nc-accent) 10%, transparent);
}

.contact-lookup-dialog__empty-state {
  padding: 14px;
  color: var(--nc-text-secondary);
  text-align: center;
}
</style>
