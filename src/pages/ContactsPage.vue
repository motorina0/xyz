<template>
  <q-page class="contacts-page">
    <div class="contacts-shell" :class="{ 'contacts-shell--mobile': isMobile }">
      <aside v-if="!isMobile" class="rail-panel">
        <AppNavRail active="contacts" @select="handleRailSelect" />
      </aside>

      <aside class="contacts-sidebar">
        <div class="contacts-sidebar__top">
          <div class="contacts-sidebar__row">
            <div class="contacts-sidebar__title">Contacts</div>
            <q-btn
              dense
              flat
              round
              icon="person_add_alt"
              aria-label="Add Contact"
              @click="openAddContactDialog"
            >
              <q-tooltip>Add Contact</q-tooltip>
            </q-btn>
          </div>

          <q-input
            v-model="contactQuery"
            class="tg-input"
            dense
            outlined
            rounded
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
                <q-avatar color="primary" text-color="white">{{ contactAvatar(contact) }}</q-avatar>
              </q-item-section>

              <q-item-section>
                <q-item-label class="contact-item__name">{{ contactListTitle(contact) }}</q-item-label>
                <q-item-label
                  v-if="contactListCaption(contact)"
                  caption
                  class="contact-item__caption"
                >
                  {{ contactListCaption(contact) }}
                </q-item-label>
              </q-item-section>
            </q-item>

            <div v-if="isLoadingContacts" class="contacts-empty">Loading contacts...</div>

            <div v-else-if="contacts.length === 0" class="contacts-empty">
              No contacts found.
            </div>
          </q-list>
        </q-scroll-area>
      </aside>

      <section v-if="!isMobile" class="contacts-thread-panel">
        <ChatThread :chat="chatStore.selectedChat" :messages="currentMessages" @send="handleSend" />
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
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import AppNavRail from 'src/components/AppNavRail.vue';
import ChatThread from 'src/components/ChatThread.vue';
import { contactsService } from 'src/services/contactsService';
import { useChatStore } from 'src/stores/chatStore';
import { useMessageStore } from 'src/stores/messageStore';
import { useNostrStore } from 'src/stores/nostrStore';
import type { ContactMetadata, ContactRecord } from 'src/types/contact';

const $q = useQuasar();
const router = useRouter();
const chatStore = useChatStore();
const messageStore = useMessageStore();
const nostrStore = useNostrStore();

const isMobile = computed(() => $q.screen.lt.md);
const contactQuery = ref('');
const isAddContactDialogOpen = ref(false);
const isLoadingContacts = ref(false);
const isCreatingContact = ref(false);
const newContactIdentifier = ref('');
const newContactGivenName = ref('');
const newContactIdentifierError = ref('');
const selectedContactId = ref<number | null>(null);
const contacts = ref<ContactRecord[]>([]);

let latestSearchRequestId = 0;

onMounted(() => {
  void chatStore.init();
  void messageStore.init();
  void initializeContacts();
});

watch(contactQuery, (query) => {
  void loadContacts(query);
});

watch(
  () => chatStore.selectedChatId,
  () => {
    syncSelectedContact();
  }
);

const currentMessages = computed(() => messageStore.getMessages(chatStore.selectedChatId));

function handleRailSelect(section: 'chats' | 'contacts' | 'settings'): void {
  if (section === 'chats') {
    void router.push({ name: 'home' });
    return;
  }

  if (section === 'settings') {
    void router.push({ name: 'settings' });
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

function contactListTitle(contact: ContactRecord): string {
  const givenName = contact.given_name?.trim();
  if (givenName) {
    return givenName;
  }

  const name = contact.name.trim();
  if (name) {
    return name;
  }

  return contactPubkeySnippet(contact);
}

function contactListCaption(contact: ContactRecord): string {
  const givenName = contact.given_name?.trim();
  if (givenName) {
    return contact.name.trim();
  }

  const name = contact.name.trim();
  if (name) {
    return contactPubkeySnippet(contact);
  }

  return '';
}

function syncSelectedContact(): void {
  const selectedChatId = chatStore.selectedChatId;
  if (!selectedChatId) {
    selectedContactId.value = null;
    return;
  }

  const linkedContact = contacts.value.find(
    (contact) => contact.meta.chatId === selectedChatId
  );

  selectedContactId.value = linkedContact?.id ?? null;
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

  try {
    const nextContacts = query.trim()
      ? await contactsService.searchContacts(query)
      : await contactsService.listContacts();

    if (requestId !== latestSearchRequestId) {
      return;
    }

    contacts.value = nextContacts;
    syncSelectedContact();
  } catch (error) {
    console.error('Failed to load contacts', error);
  } finally {
    if (requestId === latestSearchRequestId) {
      isLoadingContacts.value = false;
    }
  }
}

async function ensureChatForContact(contact: ContactRecord): Promise<string | null> {
  const meta = contact.meta;
  const chatId = meta.chatId;

  if (chatId && chatStore.chats.some((chat) => chat.id === chatId)) {
    return chatId;
  }

  const createdChat = await chatStore.addContact(
    contactDisplayName(contact) || contact.public_key,
    contact.public_key
  );
  if (!createdChat) {
    return null;
  }

  const nextMeta: ContactMetadata = {
    ...meta,
    chatId: createdChat.id,
    avatar: createdChat.avatar
  };

  const updatedContact = await contactsService.updateContact(contact.id, { meta: nextMeta });
  if (updatedContact) {
    const index = contacts.value.findIndex((entry) => entry.id === contact.id);
    if (index >= 0) {
      contacts.value[index] = updatedContact;
    }
  }

  return createdChat.id;
}

async function handleSelectContact(contact: ContactRecord): Promise<void> {
  const chatId = await ensureChatForContact(contact);
  if (!chatId) {
    return;
  }

  selectedContactId.value = contact.id;
  chatStore.selectChat(chatId);

  if (isMobile.value) {
    void router.push({ name: 'chat', params: { chatId } });
  }
}

function openAddContactDialog(): void {
  isAddContactDialogOpen.value = true;
}

function closeAddContactDialog(): void {
  isAddContactDialogOpen.value = false;
  newContactIdentifier.value = '';
  newContactGivenName.value = '';
  newContactIdentifierError.value = '';
}

function clearPublicKeyError(): void {
  if (newContactIdentifierError.value) {
    newContactIdentifierError.value = '';
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
      meta: {}
    });

    if (!created) {
      return;
    }

    closeAddContactDialog();
    contactQuery.value = '';
    await loadContacts();
    await handleSelectContact(created);
  } catch (error) {
    console.error('Failed to create contact', error);
  } finally {
    isCreatingContact.value = false;
  }
}

async function handleSend(text: string): Promise<void> {
  if (!chatStore.selectedChatId) {
    return;
  }

  const created = await messageStore.sendMessage(chatStore.selectedChatId, text);

  if (created) {
    await chatStore.updateChatPreview(chatStore.selectedChatId, created.text, created.sentAt);
  }
}
</script>

<style scoped>
.contacts-page {
  height: calc(100vh - env(safe-area-inset-top));
  padding: 10px;
}

.contacts-shell {
  display: grid;
  grid-template-columns: 88px 340px minmax(0, 1fr);
  gap: 10px;
  height: 100%;
}

.contacts-shell--mobile {
  grid-template-columns: 1fr;
}

.rail-panel,
.contacts-sidebar,
.contacts-thread-panel {
  border: 1px solid var(--tg-border);
  border-radius: 16px;
  overflow: hidden;
  background: var(--tg-sidebar);
}

.rail-panel {
  background: var(--tg-rail);
}

.contacts-sidebar {
  display: flex;
  flex-direction: column;
}

.contacts-sidebar__top {
  padding: 12px;
  border-bottom: 1px solid var(--tg-border);
}

.contacts-sidebar__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.contacts-sidebar__title {
  font-size: 22px;
  font-weight: 700;
}

.contacts-list {
  flex: 1;
}

.contact-item {
  border-radius: 12px;
  margin: 4px 8px;
}

.contact-item__name {
  font-weight: 600;
}

.contact-item__caption {
  opacity: 0.78;
}

.contact-item--active {
  background: rgba(55, 119, 245, 0.12);
}

.contacts-empty {
  padding: 14px;
  text-align: center;
  opacity: 0.7;
}

.add-contact-dialog {
  width: min(92vw, 420px);
}

.add-contact-dialog__header {
  border-bottom: 1px solid var(--tg-border);
  background: var(--tg-sidebar);
  padding: 10px 14px;
}

.add-contact-dialog__title {
  font-size: 16px;
  font-weight: 600;
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
}
</style>
