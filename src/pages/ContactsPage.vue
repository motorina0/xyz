<template>
  <q-page class="contacts-page" :style-fn="contactsPageStyleFn">
    <div class="contacts-shell" :class="{ 'contacts-shell--mobile': isMobile }">
      <aside v-if="!isMobile" class="rail-panel">
        <AppNavRail active="contacts" @select="handleRailSelect" />
      </aside>

      <aside v-if="!isMobile || !isMobileProfileOpen" class="contacts-sidebar">
        <div class="contacts-sidebar__top">
          <div class="contacts-sidebar__row" :class="{ 'contacts-sidebar__row--mobile': isMobile }">
            <div v-if="!isMobile" class="contacts-sidebar__title">Contacts</div>
            <q-input
              v-if="isMobile"
              v-model="contactQueryModel"
              class="tg-input contacts-sidebar__search contacts-sidebar__search--mobile"
              dense
              outlined
              rounded
              clearable
              clear-icon="close"
              placeholder="Filter contacts"
            />
            <div class="contacts-sidebar__actions">
              <q-btn
                dense
                flat
                round
                icon="refresh"
                aria-label="Refresh Contacts"
                :loading="isRefreshingContacts"
                @click="handleRefreshContacts"
              >
                <AppTooltip>Refresh Contacts</AppTooltip>
              </q-btn>
              <q-btn
                dense
                flat
                round
                icon="person_add_alt"
                aria-label="Add Contact"
                @click="openAddContactDialog"
              >
                <AppTooltip>Add Contact</AppTooltip>
              </q-btn>
            </div>
          </div>

          <q-input
            v-if="!isMobile"
            v-model="contactQueryModel"
            class="tg-input"
            dense
            outlined
            rounded
            clearable
            clear-icon="close"
            placeholder="Filter contacts"
          />
        </div>

        <q-scroll-area class="contacts-list">
          <q-list>
            <q-item
              v-for="contact in contacts"
              :key="contact.id"
              clickable
              class="contact-item"
              :active="contact.id === selectedContactId"
              active-class="contact-item--active"
              @click="handleSelectContact(contact)"
            >
              <q-item-section avatar>
                <CachedAvatar
                  :src="contactPictureUrl(contact)"
                  :alt="contactListTitle(contact)"
                  :fallback="contactAvatar(contact)"
                />
              </q-item-section>

              <q-item-section class="contact-item__main">
                <q-item-label class="contact-item__name" lines="1">{{ contactListTitle(contact) }}</q-item-label>
                <q-item-label
                  v-if="contactListCaption(contact)"
                  caption
                  class="contact-item__caption"
                  lines="1"
                >
                  {{ contactListCaption(contact) }}
                </q-item-label>
              </q-item-section>

              <q-item-section side>
                <q-btn
                  flat
                  dense
                  round
                  icon="more_vert"
                  class="contact-item__more"
                  aria-label="Contact actions"
                  @click.stop
                >
                  <q-menu anchor="bottom right" self="top right" class="tg-pop-menu">
                    <q-list dense class="tg-pop-menu__list">
                      <q-item clickable v-close-popup @click="handleContactMenuChat(contact)">
                        <q-item-section>Chat</q-item-section>
                      </q-item>
                      <q-item clickable v-close-popup @click="handleContactMenuRefreshProfile(contact)">
                        <q-item-section>Refresh Profile</q-item-section>
                      </q-item>
                      <q-item clickable v-close-popup @click="handleContactMenuDelete(contact)">
                        <q-item-section class="text-negative">Delete Contact</q-item-section>
                      </q-item>
                    </q-list>
                  </q-menu>
                </q-btn>
              </q-item-section>
            </q-item>

            <div v-if="isLoadingContacts" class="contacts-empty">Loading contacts...</div>

            <div v-else-if="contacts.length === 0" class="contacts-empty">
              No contacts found.
            </div>
          </q-list>
        </q-scroll-area>
        <AppStatus />
      </aside>

      <section
        v-if="!isMobile || isMobileProfileOpen"
        class="contacts-detail-panel"
        :class="{ 'contacts-detail-panel--mobile': isMobile }"
      >
        <q-scroll-area class="contacts-detail-panel__scroll">
          <div v-if="selectedContactPubkey" class="contacts-detail-panel__content">
            <div v-if="isMobile" class="contacts-detail-mobile-header">
              <q-btn
                flat
                dense
                round
                icon="arrow_back"
                aria-label="Back to contacts"
                @click="handleBackToContactsList"
              />
              <div class="contacts-detail-mobile-header__title">{{ selectedContactHeaderTitle }}</div>
              <div class="contacts-detail-mobile-header__spacer" aria-hidden="true" />
            </div>
            <ContactProfile
              v-model="selectedContactProfile"
              v-model:pubkey="selectedContactPubkey"
              :read-only="true"
              :show-header="true"
              @update:send-messages-to-app-relays="handleSendMessagesToAppRelaysUpdate"
              @open-chat="handleOpenChat"
            />
          </div>
          <div v-else class="contacts-empty-state">Select a contact to view profile.</div>
        </q-scroll-area>
      </section>
    </div>

    <q-dialog v-model="isAddContactDialogOpen">
      <q-card class="add-contact-dialog">
        <q-card-section class="add-contact-dialog__header">
          <div class="add-contact-dialog__title">Add Contact</div>
        </q-card-section>

        <q-card-section>
          <q-input
            v-model="newContactIdentifier"
            class="tg-input"
            dense
            outlined
            rounded
            autofocus
            label="Identfier or Public Key"
            :error="Boolean(newContactIdentifierError)"
            :error-message="newContactIdentifierError"
            @update:model-value="clearPublicKeyError"
            @keydown.enter.prevent="handleAddContact"
          />

          <q-input
            v-model="newContactGivenName"
            class="q-mt-sm tg-input"
            dense
            outlined
            rounded
            label="Given Name"
            @keydown.enter.prevent="handleAddContact"
          />
        </q-card-section>

        <q-card-actions align="right" class="add-contact-dialog__actions">
          <q-btn
            outline
            color="primary"
            no-caps
            label="Cancel"
            class="add-contact-dialog__action"
            @click="closeAddContactDialog"
          />
          <q-btn
            unelevated
            color="primary"
            no-caps
            label="Add"
            class="add-contact-dialog__action"
            :disable="newContactIdentifier.trim().length === 0 || isCreatingContact"
            :loading="isCreatingContact"
            @click="handleAddContact"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import AppStatus from 'src/components/AppStatus.vue';
import AppNavRail from 'src/components/AppNavRail.vue';
import AppTooltip from 'src/components/AppTooltip.vue';
import ContactProfile from 'src/components/ContactProfile.vue';
import CachedAvatar from 'src/components/CachedAvatar.vue';
import { contactsService } from 'src/services/contactsService';
import { useChatStore } from 'src/stores/chatStore';
import { useNostrStore } from 'src/stores/nostrStore';
import { useRelayStore } from 'src/stores/relayStore';
import type { ContactRecord } from 'src/types/contact';
import {
  createEmptyContactProfileForm,
  type ContactProfileForm
} from 'src/types/contactProfile';
import { reportUiError } from 'src/utils/uiErrorHandler';

const $q = useQuasar();
const route = useRoute();
const router = useRouter();
const chatStore = useChatStore();
const nostrStore = useNostrStore();
const relayStore = useRelayStore();

const isMobile = computed(() => $q.screen.lt.md);
const isMobileProfileOpen = computed(() => isMobile.value && Boolean(selectedContactPubkey.value.trim()));
const contactQuery = ref('');
const contactQueryModel = computed({
  get: () => contactQuery.value,
  set: (value: string | null) => {
    contactQuery.value = typeof value === 'string' ? value : '';
  }
});
const isAddContactDialogOpen = ref(false);
const isLoadingContacts = ref(false);
const isCreatingContact = ref(false);
const isRefreshingContacts = ref(false);
const newContactIdentifier = ref('');
const newContactGivenName = ref('');
const newContactIdentifierError = ref('');
const selectedContactId = ref<number | null>(null);
const selectedContactPubkey = ref('');
const selectedContactProfile = ref(createEmptyContactProfileForm());
const contacts = ref<ContactRecord[]>([]);
const selectedContactHeaderTitle = computed(() => {
  const displayName = selectedContactProfile.value.display_name.trim();
  if (displayName) {
    return displayName;
  }

  const name = selectedContactProfile.value.name.trim();
  if (name) {
    return name;
  }

  return selectedContactPubkey.value.trim().slice(0, 32) || 'Contact';
});

let latestSearchRequestId = 0;

onMounted(() => {
  void chatStore.init();
  void initializeContacts();
});

watch(contactQuery, (query) => {
  void loadContacts(query);
});

watch(
  () => parsePubkeyRouteParam(route.params.pubkey),
  (pubkey) => {
    syncSelectedContactFromRoute(pubkey);
  },
  { immediate: true }
);

watch(
  () => nostrStore.contactListVersion,
  () => {
    void loadContacts(contactQuery.value);
  }
);

function contactsPageStyleFn(offset: number, height: number): Record<string, string> {
  const pageHeight = Math.max(height - offset, 0);

  return {
    height: `${pageHeight}px`,
    minHeight: `${pageHeight}px`
  };
}

function handleRailSelect(section: 'chats' | 'contacts' | 'settings'): void {
  try {
    if (section === 'chats') {
      void router.push({ name: 'chats' });
      return;
    }

    if (section === 'settings') {
      void router.push({ name: 'settings' });
    }
  } catch (error) {
    reportUiError('Failed to navigate from contacts rail', error);
  }
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

function contactAvatar(contact: ContactRecord): string {
  const meta = contact.meta;
  if (meta.avatar?.trim()) {
    return meta.avatar.trim().slice(0, 2).toUpperCase();
  }

  return buildAvatar(contactDisplayName(contact) || contact.public_key);
}

function contactPictureUrl(contact: ContactRecord): string {
  const picture = contact.meta.picture?.trim();
  if (picture) {
    return picture;
  }

  return '';
}

function contactDisplayName(contact: ContactRecord): string {
  const displayName = contact.meta.display_name?.trim();
  if (displayName) {
    return displayName;
  }

  const givenName = contact.given_name?.trim();
  if (givenName) {
    return givenName;
  }

  return contact.name || contact.public_key;
}

function contactPubkeySnippet(contact: ContactRecord): string {
  return contact.public_key.trim().slice(0, 32);
}

function contactListCandidates(contact: ContactRecord): string[] {
  const npub = contact.meta.npub?.trim() || nostrStore.encodeNpub(contact.public_key) || '';

  return [contact.meta.name?.trim() ?? '', contact.meta.about?.trim() ?? '', contact.meta.nip05?.trim() ?? '', npub].filter(
    (value) => value.length > 0
  );
}

function isLoggedInContact(contact: ContactRecord): boolean {
  const loggedInPubkey = nostrStore.getLoggedInPublicKeyHex();
  if (!loggedInPubkey) {
    return false;
  }

  return contact.public_key.trim().toLowerCase() === loggedInPubkey;
}

function contactListTitle(contact: ContactRecord): string {
  if (isLoggedInContact(contact)) {
    return 'My Self';
  }

  return contactListCandidates(contact)[0] ?? contactPubkeySnippet(contact);
}

function contactListCaption(contact: ContactRecord): string {
  const candidates = contactListCandidates(contact);
  if (isLoggedInContact(contact)) {
    return candidates[0] ?? '';
  }

  return candidates[1] ?? '';
}

function mapContactToProfileForm(contact: ContactRecord): ContactProfileForm {
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
    relays: (contact.relays ?? []).map((relay) => relay.url),
    sendMessagesToAppRelays: contact.sendMessagesToAppRelays === true
  };
}

function updateContactInState(updatedContact: ContactRecord): void {
  contacts.value = contacts.value.map((contact) =>
    contact.id === updatedContact.id ? updatedContact : contact
  );

  if (selectedContactId.value === updatedContact.id) {
    selectedContactPubkey.value = updatedContact.public_key;
    selectedContactProfile.value = mapContactToProfileForm(updatedContact);
  }
}

async function initializeContacts(): Promise<void> {
  try {
    await contactsService.init();
    await loadContacts();
  } catch (error) {
    console.error('Failed to initialize contacts service', error);
  }
}

async function loadContacts(query = ''): Promise<void> {
  const requestId = ++latestSearchRequestId;
  isLoadingContacts.value = true;
  const normalizedQuery = typeof query === 'string' ? query : '';

  try {
    const nextContacts = normalizedQuery.trim()
      ? await contactsService.searchContacts(normalizedQuery)
      : await contactsService.listContacts();

    if (requestId !== latestSearchRequestId) {
      return;
    }

    contacts.value = nextContacts;

    if (
      selectedContactId.value !== null &&
      !nextContacts.some((contact) => contact.id === selectedContactId.value)
    ) {
      selectedContactId.value = null;
      selectedContactPubkey.value = '';
      selectedContactProfile.value = createEmptyContactProfileForm();
    }

    syncSelectedContactFromRoute(parsePubkeyRouteParam(route.params.pubkey));
  } catch (error) {
    console.error('Failed to load contacts', error);
  } finally {
    if (requestId === latestSearchRequestId) {
      isLoadingContacts.value = false;
    }
  }
}

function handleSelectContact(contact: ContactRecord, syncRoute = true): void {
  try {
    selectedContactId.value = contact.id;
    selectedContactPubkey.value = contact.public_key;
    selectedContactProfile.value = mapContactToProfileForm(contact);

    if (!syncRoute) {
      return;
    }

    const routePubkey = parsePubkeyRouteParam(route.params.pubkey).toLowerCase();
    const selectedPubkey = contact.public_key.toLowerCase();
    if (routePubkey === selectedPubkey) {
      return;
    }

    if (isMobile.value) {
      void router.push({
        name: 'contacts',
        params: {
          pubkey: contact.public_key
        }
      });
      return;
    }

    void router.replace({
      name: 'contacts',
      params: {
        pubkey: contact.public_key
      }
    });
  } catch (error) {
    reportUiError('Failed to select contact', error);
  }
}

function openAddContactDialog(): void {
  try {
    isAddContactDialogOpen.value = true;
  } catch (error) {
    reportUiError('Failed to open add contact dialog', error);
  }
}

function closeAddContactDialog(): void {
  try {
    isAddContactDialogOpen.value = false;
    newContactIdentifier.value = '';
    newContactGivenName.value = '';
    newContactIdentifierError.value = '';
  } catch (error) {
    reportUiError('Failed to close add contact dialog', error);
  }
}

function clearPublicKeyError(): void {
  try {
    if (newContactIdentifierError.value) {
      newContactIdentifierError.value = '';
    }
  } catch (error) {
    reportUiError('Failed to clear contact identifier error', error);
  }
}

async function handleAddContact(): Promise<void> {
  if (isCreatingContact.value) {
    return;
  }

  isCreatingContact.value = true;

  try {
    const resolution = await nostrStore.resolveIdentifier(newContactIdentifier.value);
    if (!resolution.isValid || !resolution.normalizedPubkey) {
      if (resolution.identifierType === 'nip05') {
        newContactIdentifierError.value =
          resolution.error === 'nip05_unresolved'
            ? 'NIP-05 could not be resolved. Please verify the identifier.'
            : 'Enter a valid NIP-05 identifier (name@domain).';
      } else {
        newContactIdentifierError.value = 'Enter a valid hex pubkey, npub, or NIP-05 email.';
      }

      return;
    }

    newContactIdentifierError.value = '';
    const normalizedPublicKey = resolution.normalizedPubkey;

    const alreadyExists = await contactsService.publicKeyExists(normalizedPublicKey);
    if (alreadyExists) {
      newContactIdentifierError.value = 'This public key already exists.';
      $q.notify({
        type: 'warning',
        message: 'Contact already exists',
        caption: 'This public key is already in your contacts.',
        position: 'top',
        timeout: 2600
      });
      return;
    }

    const fallbackName = newContactIdentifier.value.trim().slice(0, 32) || normalizedPublicKey.slice(0, 32);
    const resolvedName = resolution.resolvedName?.trim() || fallbackName;

    const created = await contactsService.createContact({
      public_key: normalizedPublicKey,
      name: resolvedName,
      given_name: newContactGivenName.value.trim() || null,
      meta: {},
      relays: resolution.relays.map((url) => ({
        url,
        read: true,
        write: true
      }))
    });

    if (!created) {
      return;
    }

    let nextSelectedContact = created;

    try {
      await nostrStore.refreshContactByPublicKey(normalizedPublicKey, resolvedName);

      const refreshedContact = await contactsService.getContactByPublicKey(normalizedPublicKey);
      if (refreshedContact) {
        nextSelectedContact = refreshedContact;
      }
    } catch (error) {
      reportUiError(
        'Failed to refresh new contact profile after create',
        error,
        'Contact added, but profile refresh failed.'
      );
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

    closeAddContactDialog();
    contactQuery.value = '';
    await loadContacts();
    handleSelectContact(nextSelectedContact, true);
  } catch (error) {
    reportUiError('Failed to create contact', error, 'Failed to add contact.');
  } finally {
    isCreatingContact.value = false;
  }
}

function parsePubkeyRouteParam(value: unknown): string {
  if (Array.isArray(value)) {
    return parsePubkeyRouteParam(value[0]);
  }

  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function clearSelectedContact(): void {
  selectedContactId.value = null;
  selectedContactPubkey.value = '';
  selectedContactProfile.value = createEmptyContactProfileForm();
}

function syncSelectedContactFromRoute(pubkey: string): void {
  const normalizedPubkey = pubkey.trim().toLowerCase();
  if (!normalizedPubkey) {
    clearSelectedContact();
    return;
  }

  selectContactByPublicKey(normalizedPubkey);
}

function selectContactByPublicKey(pubkey: string): void {
  const normalizedPubkey = pubkey.trim().toLowerCase();
  if (!normalizedPubkey) {
    clearSelectedContact();
    return;
  }

  const matchedContact = contacts.value.find(
    (contact) => contact.public_key.trim().toLowerCase() === normalizedPubkey
  );

  if (matchedContact) {
    handleSelectContact(matchedContact, false);
    return;
  }

  selectedContactId.value = null;
  selectedContactPubkey.value = pubkey.trim();
  selectedContactProfile.value = createEmptyContactProfileForm();
}

async function openChatForContact(contact: ContactRecord): Promise<void> {
  const contactPubkey = contact.public_key.trim();
  if (!contactPubkey) {
    return;
  }

  await chatStore.init();

  const fallbackName = contactPubkey.slice(0, 32);
  const chatName = contactDisplayName(contact) || contact.public_key || fallbackName;

  const chat = await chatStore.addContact(chatName, contactPubkey);
  if (!chat) {
    return;
  }

  chatStore.selectChat(chat.id);

  void router.push({ name: 'chats', params: { pubkey: chat.publicKey } });
}

async function handleOpenChat(): Promise<void> {
  try {
    const contactPubkey = selectedContactPubkey.value.trim().toLowerCase();
    if (!contactPubkey) {
      return;
    }

    const selectedContact = contacts.value.find(
      (contact) => contact.public_key.trim().toLowerCase() === contactPubkey
    );
    if (!selectedContact) {
      return;
    }

    await openChatForContact(selectedContact);
  } catch (error) {
    reportUiError('Failed to open chat for contact', error);
  }
}

function removeRoutePubkeyIfMatches(publicKey: string): void {
  const routePubkey = parsePubkeyRouteParam(route.params.pubkey).trim().toLowerCase();
  if (!routePubkey || routePubkey !== publicKey.trim().toLowerCase()) {
    return;
  }

  void router.replace({
    name: 'contacts'
  });
}

function handleBackToContactsList(): void {
  try {
    void router.replace({ name: 'contacts' });
  } catch (error) {
    reportUiError('Failed to navigate back to contacts list', error);
  }
}

async function handleContactMenuChat(contact: ContactRecord): Promise<void> {
  try {
    handleSelectContact(contact, true);
    await openChatForContact(contact);
  } catch (error) {
    reportUiError('Failed to open contact chat from menu', error);
  }
}

async function refreshStoredContact(contact: ContactRecord): Promise<ContactRecord | null> {
  await nostrStore.refreshContactByPublicKey(contact.public_key, contactDisplayName(contact));
  return contactsService.getContactByPublicKey(contact.public_key);
}

async function handleRefreshContacts(): Promise<void> {
  if (isRefreshingContacts.value) {
    return;
  }

  isRefreshingContacts.value = true;

  try {
    await contactsService.init();
    const storedContacts = await contactsService.listContacts();

    if (storedContacts.length === 0) {
      await loadContacts(contactQuery.value);
      $q.notify({
        type: 'info',
        message: 'No contacts to refresh.',
        position: 'top'
      });
      return;
    }

    let refreshedCount = 0;
    let failedCount = 0;

    for (const contact of storedContacts) {
      try {
        await refreshStoredContact(contact);
        refreshedCount += 1;
      } catch (error) {
        failedCount += 1;
        console.warn('Failed to refresh contact profile from contacts header', contact.public_key, error);
      }
    }

    await loadContacts(contactQuery.value);

    if (failedCount === 0) {
      $q.notify({
        type: 'positive',
        message: `Refreshed ${refreshedCount} contact${refreshedCount === 1 ? '' : 's'}.`,
        position: 'top'
      });
      return;
    }

    $q.notify({
      type: refreshedCount > 0 ? 'warning' : 'negative',
      message:
        refreshedCount > 0
          ? `Refreshed ${refreshedCount} contact${refreshedCount === 1 ? '' : 's'}; ${failedCount} failed.`
          : 'Failed to refresh contacts.',
      position: 'top'
    });
  } catch (error) {
    reportUiError('Failed to refresh contacts from header', error, 'Failed to refresh contacts.');
  } finally {
    isRefreshingContacts.value = false;
  }
}

async function handleContactMenuRefreshProfile(contact: ContactRecord): Promise<void> {
  try {
    await refreshStoredContact(contact);
    await loadContacts(contactQuery.value);

    const refreshedContact = await contactsService.getContactByPublicKey(contact.public_key);
    if (refreshedContact && refreshedContact.id === selectedContactId.value) {
      selectedContactProfile.value = mapContactToProfileForm(refreshedContact);
    }
  } catch (error) {
    reportUiError('Failed to refresh contact profile from menu', error, 'Failed to refresh profile.');
  }
}

async function handleSendMessagesToAppRelaysUpdate(value: boolean): Promise<void> {
  const normalizedPubkey = selectedContactPubkey.value.trim().toLowerCase();
  if (!normalizedPubkey) {
    return;
  }

  const currentContact =
    contacts.value.find((contact) => contact.public_key.trim().toLowerCase() === normalizedPubkey) ??
    null;
  const previousValue = currentContact?.sendMessagesToAppRelays ?? false;

  try {
    const updatedContact = await contactsService.updateSendMessagesToAppRelays(
      normalizedPubkey,
      value
    );
    if (!updatedContact) {
      throw new Error('Contact not found.');
    }

    updateContactInState(updatedContact);
  } catch (error) {
    if (currentContact) {
      updateContactInState(currentContact);
    } else {
      selectedContactProfile.value = {
        ...selectedContactProfile.value,
        sendMessagesToAppRelays: previousValue
      };
    }

    reportUiError(
      'Failed to update contact app relay preference',
      error,
      'Failed to update relay preference.'
    );
  }
}

async function handleContactMenuDelete(contact: ContactRecord): Promise<void> {
  try {
    const deleted = await contactsService.deleteContact(contact.id);
    if (!deleted) {
      return;
    }

    if (selectedContactId.value === contact.id) {
      selectedContactId.value = null;
      selectedContactPubkey.value = '';
      selectedContactProfile.value = createEmptyContactProfileForm();
    }

    removeRoutePubkeyIfMatches(contact.public_key);
    try {
      await nostrStore.publishPrivateContactList(relayStore.relays);
    } catch (error) {
      reportUiError(
        'Failed to publish private contact list after deleting contact',
        error,
        'Contact deleted, but contact list sync failed.'
      );
    }

    await loadContacts(contactQuery.value);
  } catch (error) {
    reportUiError('Failed to delete contact from menu', error);
  }
}
</script>

<style scoped>
.contacts-page {
  height: calc(100vh - env(safe-area-inset-top));
  padding: 12px;
  overflow: hidden;
  width: 100%;
  max-width: 100%;
}

.contacts-shell {
  display: grid;
  grid-template-columns: 76px 340px minmax(0, 1fr);
  gap: 12px;
  height: 100%;
  min-height: 0;
  width: 100%;
  max-width: 100%;
}

.contacts-shell--mobile {
  grid-template-columns: 1fr;
}

.rail-panel,
.contacts-sidebar,
.contacts-detail-panel {
  border: 1px solid color-mix(in srgb, var(--tg-border) 88%, #8ea4c0 12%);
  border-radius: 18px;
  overflow: hidden;
  background: var(--tg-panel-sidebar-bg);
  box-shadow: var(--tg-shadow-sm);
}

.rail-panel {
  background: var(--tg-panel-rail-bg);
}

.contacts-sidebar {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.contacts-detail-panel {
  background: var(--tg-panel-thread-bg);
  min-height: 0;
}

.contacts-detail-panel__scroll {
  height: 100%;
}

.contacts-detail-panel__content {
  padding: 0;
}

.contacts-detail-mobile-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--tg-border) 88%, #8ea4c0 12%);
  background: var(--tg-panel-header-bg);
  backdrop-filter: blur(var(--tg-glass-blur));
}

.contacts-detail-mobile-header__title {
  flex: 1;
  min-width: 0;
  font-size: 16px;
  font-weight: 700;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.contacts-detail-mobile-header__spacer {
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
}

.contacts-sidebar__top {
  padding: 13px;
  border-bottom: 1px solid color-mix(in srgb, var(--tg-border) 90%, #8fa5c1 10%);
  background: var(--tg-panel-header-bg);
  backdrop-filter: blur(var(--tg-glass-blur));
}

.contacts-sidebar__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.contacts-sidebar__row--mobile {
  gap: 8px;
  margin-bottom: 0;
}

.contacts-sidebar__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.contacts-sidebar__title {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.1;
}

.contacts-sidebar__search--mobile {
  flex: 1;
  min-width: 0;
}

.contacts-list {
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
}

.contacts-list :deep(.q-scrollarea__container),
.contacts-list :deep(.q-scrollarea__content),
.contacts-list :deep(.q-list) {
  overflow-x: hidden !important;
  min-width: 0;
  width: 100%;
}

.contact-item {
  min-width: 0;
  border-radius: 14px;
  margin: 6px 8px;
  border: 1px solid transparent;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.q-btn.contact-item__more {
  color: color-mix(in srgb, var(--tg-border) 20%, #5f718a 80%);
  background: transparent !important;
  box-shadow: none !important;
  transition: color 0.2s ease, opacity 0.2s ease;
}

.q-btn.contact-item__more::before {
  border-color: transparent !important;
}

.q-btn.contact-item__more:hover {
  color: color-mix(in srgb, var(--tg-border) 10%, #4f637e 90%);
  background: transparent !important;
  box-shadow: none !important;
  transform: none !important;
}

.contact-item__main {
  flex: 1 1 auto;
  min-width: 0;
}

.contact-item__name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.contact-item:hover {
  background: linear-gradient(130deg, rgba(52, 137, 255, 0.1), rgba(28, 186, 137, 0.08));
  border-color: color-mix(in srgb, var(--tg-border) 78%, #8aa5c5 22%);
  box-shadow: 0 8px 16px rgba(53, 110, 186, 0.1);
}

.contact-item__caption {
  opacity: 0.78;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.contact-item--active {
  background: linear-gradient(130deg, rgba(52, 137, 255, 0.18), rgba(28, 186, 137, 0.14));
  border-color: rgba(56, 136, 255, 0.34);
  box-shadow: 0 10px 20px rgba(53, 110, 186, 0.14);
}

.contacts-empty {
  padding: 14px;
  text-align: center;
  opacity: 0.7;
}

.contacts-empty-state {
  min-height: 100%;
  display: grid;
  place-items: center;
  text-align: center;
  padding: 20px;
  opacity: 0.7;
}

.add-contact-dialog {
  width: min(92vw, 420px);
  border-radius: 16px;
  overflow: hidden;
  background: color-mix(in srgb, var(--tg-sidebar) 92%, #eef6ff 8%);
  border: 1px solid color-mix(in srgb, var(--tg-border) 84%, #8ea4c0 16%);
  box-shadow: var(--tg-shadow-md);
}

.add-contact-dialog__header {
  border-bottom: 1px solid color-mix(in srgb, var(--tg-border) 90%, #8fa5c1 10%);
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--tg-sidebar) 88%, #dbe9ff 12%),
      color-mix(in srgb, var(--tg-sidebar) 96%, #dbe9ff 4%)
    );
  padding: 11px 14px;
}

.add-contact-dialog__title {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.add-contact-dialog__actions {
  gap: 8px;
}

.add-contact-dialog__action {
  border-radius: 999px;
  min-width: 74px;
}

@media (max-width: 1023px) {
  .contacts-page {
    padding: 0;
  }

  .contacts-sidebar {
    border-radius: 0;
    border-left: 0;
    border-right: 0;
    border-top: 0;
  }

  .contacts-detail-panel--mobile {
    border-radius: 0;
    border-left: 0;
    border-right: 0;
    border-bottom: 0;
    border-top: 0;
  }
}
</style>
