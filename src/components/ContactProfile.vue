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
    </div>

    <div class="profile-content" :class="{ 'profile-content--with-header': showHeader }">
      <div class="profile-tabs-shell" :class="{ 'profile-tabs-shell--mobile': isMobileTabs }">
        <q-tabs
          v-if="!isMobileTabs && showTabSelection"
          v-model="activeTab"
          dense
          align="justify"
          active-color="primary"
          indicator-color="primary"
          class="profile-tabs"
        >
          <q-tab name="profile" label="Profile" no-caps class="profile-tab" />
          <q-tab v-if="isGroupContact" name="members" label="Members" no-caps class="profile-tab" />
          <q-tab
            v-if="isOwnedGroupContact"
            name="relays"
            label="Relays"
            no-caps
            class="profile-tab"
          />
        </q-tabs>

        <q-tab-panels
          v-model="activeTab"
          animated
          class="profile-tab-panels"
          :class="{ 'profile-tab-panels--mobile': isMobileTabs }"
        >
          <q-tab-panel name="profile" class="profile-tab-panel">
            <div v-if="showProfileTabActions" class="profile-tab-actions">
              <q-btn
                v-if="props.showHeader"
                no-caps
                outline
                color="primary"
                label="Refresh"
                class="profile-tab-actions__button"
                :disable="!normalizedHeaderPubkey || isRefreshingContact"
                :loading="isRefreshingContact"
                @click="handleRefreshContactProfile"
              />
              <q-btn
                v-if="props.showPublishAction"
                no-caps
                unelevated
                color="primary"
                label="Publish"
                class="profile-tab-actions__button"
                :disable="!normalizedHeaderPubkey"
                :loading="props.isPublishing"
                @click="emit('publish')"
              />
            </div>

            <div class="profile-lookup" :class="{ 'profile-lookup--with-header': showHeader }">
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
                <template #append>
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
                class="tg-input"
                outlined
                dense
                rounded
                readonly
                label="npub"
                placeholder="npub1..."
              >
                <template #append>
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
                expand-icon="keyboard_arrow_right"
                expanded-icon="keyboard_arrow_down"
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

              <q-expansion-item
                v-if="!isGroupContact"
                expand-separator
                switch-toggle-side
                expand-icon="keyboard_arrow_right"
                expanded-icon="keyboard_arrow_down"
                class="profile-section"
              >
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

                  <div class="profile-card__bot-row q-mt-sm">
                    <div>
                      <div class="text-body2">Group</div>
                      <div class="text-caption text-grey-6">
                        Profile represents a group identity.
                      </div>
                    </div>

                    <q-toggle
                      v-model="localProfile.group"
                      color="primary"
                      checked-icon="groups"
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

              <q-expansion-item
                expand-separator
                switch-toggle-side
                expand-icon="keyboard_arrow_right"
                expanded-icon="keyboard_arrow_down"
                class="profile-section"
              >
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
                  <div class="profile-card__bot-row">
                    <div>
                      <div class="text-body2">Send via App Relays</div>
                      <div class="text-caption text-grey-6">
                        Use app relays for outbound messages and reactions. If this contact later adds
                        relays, both relay lists are used.
                      </div>
                    </div>

                    <q-toggle
                      v-model="localProfile.sendMessagesToAppRelays"
                      color="primary"
                      checked-icon="cloud_upload"
                      unchecked-icon="cloud_off"
                      :disable="!normalizedHeaderPubkey"
                      @update:model-value="handleSendMessagesToAppRelaysUpdate"
                    />
                  </div>

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
          </q-tab-panel>

          <q-tab-panel v-if="isGroupContact" name="members" class="profile-tab-panel">
            <div class="profile-members">
              <div v-if="showMembersTabActions" class="profile-tab-actions">
                <q-btn
                  v-if="props.showHeader"
                  no-caps
                  outline
                  color="primary"
                  label="Refresh"
                  class="profile-tab-actions__button"
                  :disable="!normalizedHeaderPubkey || isRefreshingContact"
                  :loading="isRefreshingContact"
                  @click="handleRefreshContactProfile"
                />
                <q-btn
                  v-if="props.showPublishAction"
                  no-caps
                  unelevated
                  color="primary"
                  label="Publish"
                  class="profile-tab-actions__button"
                  :disable="!normalizedHeaderPubkey"
                  :loading="isPublishingMembersEpoch"
                  @click="handleMembersPublish"
                />
              </div>

              <div class="profile-members-toolbar">
                <q-input
                  v-model="newMemberIdentifier"
                  class="tg-input profile-members-toolbar__input"
                  outlined
                  dense
                  rounded
                  label="Member"
                  placeholder="hex pubkey, npub, or name@example.com"
                  :error="Boolean(newMemberIdentifierError)"
                  :error-message="newMemberIdentifierError"
                  @update:model-value="clearMemberIdentifierError"
                  @keydown.enter.prevent="handleAddMember"
                >
                  <template #append>
                    <q-btn
                      unelevated
                      round
                      dense
                      color="primary"
                      icon="add"
                      size="sm"
                      aria-label="Add member"
                      :disable="!canAddMember"
                      :loading="isAddingMember"
                      @click="handleAddMember"
                    />
                  </template>
                </q-input>
              </div>

              <div
                v-if="groupMembers.length === 0"
                class="profile-members-state"
                :class="{ 'q-mt-md': true }"
              >
                <div class="profile-members-state__title">Members</div>
                <div class="text-body2">No members added yet.</div>
              </div>

              <q-list v-else bordered separator class="profile-members-list q-mt-md">
                <q-item
                  v-for="(member, index) in groupMembers"
                  :key="member.public_key"
                  class="profile-members-list__item"
                >
                  <q-item-section avatar>
                    <CachedAvatar
                      :src="memberPictureUrl(member)"
                      :alt="memberListTitle(member)"
                      :fallback="memberAvatar(member)"
                    />
                  </q-item-section>

                  <q-item-section>
                    <q-item-label class="profile-members-list__name" lines="1">
                      {{ memberListTitle(member) }}
                    </q-item-label>
                    <q-item-label
                      v-if="memberListCaption(member)"
                      caption
                      class="profile-members-list__caption"
                      lines="1"
                    >
                      {{ memberListCaption(member) }}
                    </q-item-label>
                  </q-item-section>

                  <q-item-section side top class="profile-members-list__actions">
                    <q-btn
                      flat
                      round
                      dense
                      icon="refresh"
                      color="primary"
                      aria-label="Refresh member"
                      :loading="isMemberRefreshing(member.public_key)"
                      @click="handleRefreshMember(index)"
                    />
                    <q-btn
                      flat
                      round
                      dense
                      icon="delete"
                      color="negative"
                      aria-label="Remove member"
                      @click="handleRemoveMember(index)"
                    />
                  </q-item-section>
                </q-item>
              </q-list>
            </div>
          </q-tab-panel>

          <q-tab-panel v-if="isOwnedGroupContact" name="relays" class="profile-tab-panel">
            <div class="profile-group-relays">
              <div v-if="showRelaysTabActions" class="profile-tab-actions">
                <q-btn
                  v-if="props.showHeader"
                  no-caps
                  outline
                  color="primary"
                  label="Refresh"
                  class="profile-tab-actions__button"
                  :disable="!normalizedHeaderPubkey || isRefreshingGroupRelays"
                  :loading="isRefreshingGroupRelays"
                  @click="handleRefreshGroupRelays"
                />
                <q-btn
                  v-if="props.showPublishAction"
                  no-caps
                  unelevated
                  color="primary"
                  label="Publish"
                  class="profile-tab-actions__button"
                  :disable="!normalizedHeaderPubkey"
                  :loading="isPublishingGroupRelays"
                  @click="handlePublishGroupRelays"
                />
              </div>

              <RelayEditorPanel
                v-model:new-relay="newGroupRelay"
                :relays="groupRelayUrls"
                :relay-validation-error="groupRelayValidationError"
                :can-add-relay="canAddGroupRelay"
                empty-message="No NIP-65 relays configured."
                :secondary-action-disabled="!canUseDefaultGroupRelays"
                secondary-action-label="Use Default Relays"
                secondary-action-icon="restart_alt"
                :relay-read-enabled="groupRelayReadEnabled"
                :relay-write-enabled="groupRelayWriteEnabled"
                :relay-icon-url="relayIconUrl"
                :is-relay-connected="isRelayConnected"
                :is-relay-info-loading="isRelayInfoLoading"
                :relay-info-error="relayInfoError"
                :relay-info="relayInfo"
                @add-relay="handleAddGroupRelay"
                @remove-relay="handleRemoveGroupRelay"
                @secondary-action="handleUseDefaultGroupRelays"
                @relay-expand="handleRelayExpand"
                @retry-relay-info="retryRelayInfo"
                @relay-icon-error="handleRelayIconError"
                @update-relay-read="handleUpdateGroupRelayRead"
                @update-relay-write="handleUpdateGroupRelayWrite"
              />
            </div>
          </q-tab-panel>
        </q-tab-panels>
      </div>
    </div>

    <div v-if="isMobileTabs && showTabSelection" class="mobile-nav">
      <div class="mobile-nav__inner" :style="mobileNavGridStyle">
        <q-btn
          :flat="activeTab !== 'profile'"
          :unelevated="activeTab === 'profile'"
          :color="activeTab === 'profile' ? 'primary' : undefined"
          :text-color="activeTab === 'profile' ? 'white' : undefined"
          no-caps
          icon="badge"
          label="Profile"
          class="mobile-nav__btn"
          :class="{ 'mobile-nav__btn--active': activeTab === 'profile' }"
          @click="activeTab = 'profile'"
        />
        <q-btn
          v-if="isGroupContact"
          :flat="activeTab !== 'members'"
          :unelevated="activeTab === 'members'"
          :color="activeTab === 'members' ? 'primary' : undefined"
          :text-color="activeTab === 'members' ? 'white' : undefined"
          no-caps
          icon="groups"
          label="Members"
          class="mobile-nav__btn"
          :class="{ 'mobile-nav__btn--active': activeTab === 'members' }"
          @click="activeTab = 'members'"
        />
        <q-btn
          v-if="isOwnedGroupContact"
          :flat="activeTab !== 'relays'"
          :unelevated="activeTab === 'relays'"
          :color="activeTab === 'relays' ? 'primary' : undefined"
          :text-color="activeTab === 'relays' ? 'white' : undefined"
          no-caps
          icon="satellite_alt"
          label="Relays"
          class="mobile-nav__btn"
          :class="{ 'mobile-nav__btn--active': activeTab === 'relays' }"
          @click="activeTab = 'relays'"
        />
      </div>
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
import { DEFAULT_RELAYS } from 'src/constants/relays';
import { contactsService } from 'src/services/contactsService';
import { useNostrStore } from 'src/stores/nostrStore';
import type {
  ContactGroupMember,
  ContactMetadata,
  ContactRecord,
  ContactRelay
} from 'src/types/contact';
import {
  createEmptyContactProfileForm,
  type ContactProfileForm
} from 'src/types/contactProfile';
import { reportUiError } from 'src/utils/uiErrorHandler';

type ProfileTab = 'profile' | 'members' | 'relays';
type RelayTogglePayload = {
  index: number;
  value: boolean;
};

type GroupMemberDraft = ContactGroupMember;

interface Props {
  modelValue: ContactProfileForm;
  pubkey: string;
  readOnly?: boolean;
  showHeader?: boolean;
  showRelaysEditAction?: boolean;
  showPublishAction?: boolean;
  isPublishing?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  readOnly: false,
  showHeader: false,
  showRelaysEditAction: false,
  showPublishAction: false,
  isPublishing: false
});

const emit = defineEmits<{
  (event: 'update:modelValue', value: ContactProfileForm): void;
  (event: 'update:pubkey', value: string): void;
  (event: 'update:send-messages-to-app-relays', value: boolean): void;
  (event: 'open-chat'): void;
  (event: 'open-relays-settings'): void;
  (event: 'publish'): void;
}>();

const $q = useQuasar();
const nostrStore = useNostrStore();
const localPubkey = computed({
  get: () => props.pubkey ?? '',
  set: (value: string) => emit('update:pubkey', value)
});
const localProfile = reactive<ContactProfileForm>(cloneProfile(props.modelValue));
const activeTab = ref<ProfileTab>('profile');
const currentContact = ref<ContactRecord | null>(null);
const isLoadingContact = ref(false);
const isRefreshingContact = ref(false);
const pubkeyError = ref('');
const pubkeyInfo = ref('');
const relayInfoByUrl = ref<Record<string, NDKRelayInformation | null>>({});
const relayInfoErrorByUrl = ref<Record<string, string>>({});
const relayInfoLoadingByUrl = ref<Record<string, boolean>>({});
const relayIconErrorByUrl = ref<Record<string, boolean>>({});
const newMemberIdentifier = ref('');
const newMemberIdentifierError = ref('');
const isAddingMember = ref(false);
const isPublishingMembersEpoch = ref(false);
const newGroupRelay = ref('');
const isRefreshingGroupRelays = ref(false);
const isPublishingGroupRelays = ref(false);
const groupMembers = ref<GroupMemberDraft[]>([]);
const groupRelayEntries = ref<ContactRelay[]>([]);
const refreshingMemberPubkeys = ref<Record<string, boolean>>({});
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
const isMobileTabs = computed(() => $q.screen.lt.md);
const isGroupContact = computed(() => currentContact.value?.type === 'group');
const isOwnedGroupContact = computed(() => {
  const loggedInPubkey = nostrStore.getLoggedInPublicKeyHex()?.trim().toLowerCase() ?? '';
  if (!loggedInPubkey || currentContact.value?.type !== 'group') {
    return false;
  }

  return (currentContact.value.meta.owner_public_key?.trim().toLowerCase() ?? '') === loggedInPubkey;
});
const showTabSelection = computed(() => isGroupContact.value);
const canAddMember = computed(() => newMemberIdentifier.value.trim().length > 0 && !isAddingMember.value);
const groupRelayUrls = computed(() => groupRelayEntries.value.map((entry) => entry.url));
const groupRelayValidationError = computed(() => validateGroupRelayUrl(newGroupRelay.value.trim()));
const canAddGroupRelay = computed(() => {
  const value = newGroupRelay.value.trim();
  return value.length > 0 && groupRelayValidationError.value.length === 0;
});
const canUseDefaultGroupRelays = computed(() => {
  if (groupRelayEntries.value.length !== DEFAULT_RELAYS.length) {
    return true;
  }

  if (groupRelayEntries.value.some((relay, index) => relay.url !== DEFAULT_RELAYS[index])) {
    return true;
  }

  return groupRelayEntries.value.some((relay) => relay.read !== true || relay.write !== true);
});
const mobileNavGridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${isGroupContact.value ? (isOwnedGroupContact.value ? 3 : 2) : 1}, minmax(0, 1fr))`
}));
const showProfileTabActions = computed(() => props.showHeader || props.showPublishAction);
const showMembersTabActions = computed(() => props.showHeader || props.showPublishAction);
const showRelaysTabActions = computed(() => props.showHeader || props.showPublishAction);
const allKnownRelays = computed(() => uniqueRelays([...relayList.value, ...groupRelayUrls.value]));

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
  allKnownRelays,
  (relays) => {
    pruneRelayInfoCache(relays);
    void prepareRelayDecorations(relays);
  },
  { immediate: true }
);

watch(isGroupContact, (value) => {
  if (!value && activeTab.value !== 'profile') {
    activeTab.value = 'profile';
  }
});

watch(isOwnedGroupContact, (value) => {
  if (!value && activeTab.value === 'relays') {
    activeTab.value = 'profile';
  }
});

watch(
  currentContact,
  (contact) => {
    syncGroupMembersFromContact(contact);
    syncGroupRelayEntriesFromContact(contact);
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
    relays: [...(value?.relays ?? [])],
    sendMessagesToAppRelays: value?.sendMessagesToAppRelays === true
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

function handleSendMessagesToAppRelaysUpdate(value: boolean): void {
  emit('update:send-messages-to-app-relays', value === true);
}

function clearMemberIdentifierError(): void {
  if (newMemberIdentifierError.value) {
    newMemberIdentifierError.value = '';
  }
}

function validateGroupRelayUrl(value: string): string {
  if (!value) {
    return '';
  }

  try {
    const normalizedRelay = normalizeRelayUrl(value);
    if (groupRelayEntries.value.some((entry) => relayKey(entry.url) === relayKey(normalizedRelay))) {
      return 'Relay already added.';
    }

    return '';
  } catch {
    return 'Relay must be a valid ws:// or wss:// URL';
  }
}

function memberIdentifierErrorMessage(resolution: {
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

async function handleAddMember(): Promise<void> {
  if (isAddingMember.value) {
    return;
  }

  const identifier = newMemberIdentifier.value.trim();
  if (!identifier) {
    newMemberIdentifierError.value = 'Enter a valid hex pubkey, npub, or NIP-05 email.';
    return;
  }

  isAddingMember.value = true;

  try {
    const resolution = await nostrStore.resolveIdentifier(identifier);
    if (!resolution.isValid || !resolution.normalizedPubkey) {
      newMemberIdentifierError.value = memberIdentifierErrorMessage(resolution);
      return;
    }

    const normalizedPublicKey = resolution.normalizedPubkey;
    if (groupMembers.value.some((member) => member.public_key === normalizedPublicKey)) {
      newMemberIdentifierError.value = 'This member is already in the list.';
      return;
    }

    const fallbackName =
      resolution.resolvedName?.trim() ||
      identifier.slice(0, 32) ||
      normalizedPublicKey.slice(0, 16);
    const memberPreview =
      (await nostrStore.fetchContactPreviewByPublicKey(normalizedPublicKey, fallbackName)) ?? {
        public_key: normalizedPublicKey,
        name: fallbackName,
        given_name: null,
        meta: {}
      };

    const trimmedIdentifier = identifier.trim();
    await persistGroupMembers([
      ...groupMembers.value,
      buildStoredGroupMember(
        memberPreview,
        resolution.identifierType,
        trimmedIdentifier.startsWith('nprofile1') ? trimmedIdentifier : null,
        resolution.identifierType === 'nip05' ? trimmedIdentifier : null
      )
    ]);

    const groupPublicKey = currentContact.value?.public_key?.trim() ?? '';
    if (groupPublicKey) {
      try {
        await nostrStore.sendGroupEpochTicket(
          groupPublicKey,
          normalizedPublicKey,
          resolution.relays
        );
      } catch (error) {
        reportUiError(
          'Failed to send group epoch ticket',
          error,
          'Member added, but the epoch ticket could not be sent.'
        );
      }
    }

    newMemberIdentifier.value = '';
    newMemberIdentifierError.value = '';
  } catch (error) {
    reportUiError('Failed to validate group member', error, 'Failed to add member.');
  } finally {
    isAddingMember.value = false;
  }
}

async function handleRemoveMember(index: number): Promise<void> {
  try {
    const nextMembers = groupMembers.value.filter((_, memberIndex) => memberIndex !== index);
    await persistGroupMembers(nextMembers);
  } catch (error) {
    reportUiError('Failed to remove group member', error, 'Failed to remove member.');
  }
}

async function handleRefreshMember(index: number): Promise<void> {
  const member = groupMembers.value[index];
  if (!member) {
    return;
  }

  const memberPubkey = member.public_key;
  if (refreshingMemberPubkeys.value[memberPubkey]) {
    return;
  }

  refreshingMemberPubkeys.value = {
    ...refreshingMemberPubkeys.value,
    [memberPubkey]: true
  };

  try {
    const refreshedMember =
      (await nostrStore.fetchContactPreviewByPublicKey(memberPubkey, member.name)) ?? member;
    await persistGroupMembers(groupMembers.value.map((entry, memberIndex) =>
      memberIndex === index
        ? buildStoredGroupMember(refreshedMember, null, entry.nprofile ?? null, entry.nip05 ?? null)
        : entry
    ));
  } catch (error) {
    reportUiError('Failed to refresh group member profile', error, 'Failed to refresh member profile.');
  } finally {
    const nextRefreshingState = {
      ...refreshingMemberPubkeys.value
    };
    delete nextRefreshingState[memberPubkey];
    refreshingMemberPubkeys.value = nextRefreshingState;
  }
}

async function handleMembersPublish(): Promise<void> {
  const groupPublicKey = currentContact.value?.public_key?.trim() ?? '';
  if (!groupPublicKey || isPublishingMembersEpoch.value) {
    return;
  }

  isPublishingMembersEpoch.value = true;

  try {
    const publishResult = await nostrStore.rotateGroupEpochAndSendTickets(
      groupPublicKey,
      groupMembers.value.map((member) => member.public_key)
    );

    await loadContactFromPubkey(groupPublicKey);

    if (publishResult.failedMemberPubkeys.length === 0) {
      $q.notify({
        type: 'positive',
        message:
          publishResult.attemptedMemberCount > 0
            ? `Epoch ${publishResult.epochNumber} published to ${publishResult.deliveredMemberCount} member${publishResult.deliveredMemberCount === 1 ? '' : 's'}.`
            : `Epoch ${publishResult.epochNumber} created locally. No members to notify.`,
        caption: `Published to ${publishResult.publishedRelayUrls.length} relay${publishResult.publishedRelayUrls.length === 1 ? '' : 's'}.`,
        position: 'top-right'
      });
      return;
    }

    $q.notify({
      type: 'warning',
      message: `Epoch ${publishResult.epochNumber} published with partial delivery.`,
      caption: `${publishResult.deliveredMemberCount} delivered, ${publishResult.failedMemberPubkeys.length} failed, ${publishResult.publishedRelayUrls.length} relay${publishResult.publishedRelayUrls.length === 1 ? '' : 's'}.`,
      position: 'top-right',
      timeout: 6000
    });
  } catch (error) {
    reportUiError(
      'Failed to publish group epoch to members',
      error,
      'Failed to publish group epoch.'
    );
  } finally {
    isPublishingMembersEpoch.value = false;
  }
}

function cloneGroupRelayEntries(relays: ContactRelay[] | undefined): ContactRelay[] {
  return relays ? relays.map((relay) => ({ ...relay })) : [];
}

function syncGroupRelayEntriesFromContact(contact: ContactRecord | null): void {
  newGroupRelay.value = '';
  groupRelayEntries.value =
    contact && contact.type === 'group'
      ? cloneGroupRelayEntries(contact.relays ?? [])
      : [];
}

function handleAddGroupRelay(): void {
  try {
    const value = newGroupRelay.value.trim();
    if (!value || groupRelayValidationError.value) {
      return;
    }

    const normalizedRelay = normalizeRelayUrl(value);
    groupRelayEntries.value = [
      ...groupRelayEntries.value,
      {
        url: normalizedRelay,
        read: true,
        write: true
      }
    ];
    newGroupRelay.value = '';
  } catch (error) {
    reportUiError('Failed to add group relay', error, 'Failed to add relay.');
  }
}

function handleRemoveGroupRelay(index: number): void {
  try {
    groupRelayEntries.value = groupRelayEntries.value.filter((_, relayIndex) => relayIndex !== index);
  } catch (error) {
    reportUiError('Failed to remove group relay', error, 'Failed to remove relay.');
  }
}

function handleUseDefaultGroupRelays(): void {
  try {
    newGroupRelay.value = '';
    groupRelayEntries.value = DEFAULT_RELAYS.map((url) => ({
      url,
      read: true,
      write: true
    }));
  } catch (error) {
    reportUiError(
      'Failed to reset group relays to defaults',
      error,
      'Failed to use default relays.'
    );
  }
}

function groupRelayReadEnabled(index: number): boolean {
  return groupRelayEntries.value[index]?.read ?? true;
}

function groupRelayWriteEnabled(index: number): boolean {
  return groupRelayEntries.value[index]?.write ?? true;
}

function handleUpdateGroupRelayRead({ index, value }: RelayTogglePayload): void {
  try {
    groupRelayEntries.value = groupRelayEntries.value.map((entry, relayIndex) =>
      relayIndex === index
        ? {
            ...entry,
            read: value
          }
        : entry
    );
  } catch (error) {
    reportUiError('Failed to update group relay read flag', error, 'Failed to update relay.');
  }
}

function handleUpdateGroupRelayWrite({ index, value }: RelayTogglePayload): void {
  try {
    groupRelayEntries.value = groupRelayEntries.value.map((entry, relayIndex) =>
      relayIndex === index
        ? {
            ...entry,
            write: value
          }
        : entry
    );
  } catch (error) {
    reportUiError('Failed to update group relay write flag', error, 'Failed to update relay.');
  }
}

async function handleRefreshGroupRelays(): Promise<void> {
  const groupPublicKey = currentContact.value?.public_key?.trim() ?? '';
  if (!groupPublicKey || isRefreshingGroupRelays.value) {
    return;
  }

  isRefreshingGroupRelays.value = true;

  try {
    await nostrStore.refreshContactRelayList(groupPublicKey);
    await loadContactFromPubkey(groupPublicKey);
  } catch (error) {
    reportUiError('Failed to refresh group relays', error, 'Failed to refresh group relays.');
  } finally {
    isRefreshingGroupRelays.value = false;
  }
}

async function handlePublishGroupRelays(): Promise<void> {
  const contact = currentContact.value;
  if (!contact || contact.type !== 'group' || isPublishingGroupRelays.value) {
    return;
  }

  isPublishingGroupRelays.value = true;

  try {
    const nextRelayEntries = groupRelayEntries.value.map((relay) => ({ ...relay }));
    const updatedContact = await contactsService.updateContact(contact.id, {
      relays: nextRelayEntries
    });
    if (!updatedContact) {
      throw new Error('Failed to persist group relay list.');
    }

    currentContact.value = updatedContact;
    groupRelayEntries.value = cloneGroupRelayEntries(updatedContact.relays ?? []);
    localProfile.relays = (updatedContact.relays ?? []).map((relay) => relay.url);

    const relaySaveStatus = await nostrStore.publishGroupRelayList(
      updatedContact.public_key,
      nextRelayEntries,
      nextRelayEntries.map((relay) => relay.url)
    );

    if (relaySaveStatus.publishedRelayUrls.length > 0 && relaySaveStatus.failedRelayUrls.length === 0) {
      $q.notify({
        type: 'positive',
        message: 'Group relays published.',
        caption: `Published to ${relaySaveStatus.publishedRelayUrls.length} relay${relaySaveStatus.publishedRelayUrls.length === 1 ? '' : 's'}.`,
        position: 'top-right'
      });
      return;
    }

    $q.notify({
      type: relaySaveStatus.publishedRelayUrls.length > 0 ? 'warning' : 'negative',
      message:
        relaySaveStatus.publishedRelayUrls.length > 0
          ? 'Group relays published with partial delivery.'
          : 'Failed to publish group relays.',
      caption:
        `Published to ${relaySaveStatus.publishedRelayUrls.length} relay${relaySaveStatus.publishedRelayUrls.length === 1 ? '' : 's'}.` +
        (relaySaveStatus.errorMessage ? ` ${relaySaveStatus.errorMessage}` : ''),
      position: 'top-right',
      timeout: 6000
    });
  } catch (error) {
    reportUiError('Failed to publish group relays', error, 'Failed to publish group relays.');
  } finally {
    isPublishingGroupRelays.value = false;
  }
}

function resetMembersEditor(): void {
  newMemberIdentifier.value = '';
  newMemberIdentifierError.value = '';
  groupMembers.value = [];
  refreshingMemberPubkeys.value = {};
}

function isMemberRefreshing(pubkey: string): boolean {
  return refreshingMemberPubkeys.value[pubkey] === true;
}

function buildStoredGroupMember(
  preview: Pick<ContactRecord, 'public_key' | 'name' | 'given_name' | 'meta'>,
  identifierType: string | null,
  nprofile: string | null,
  nip05: string | null
): GroupMemberDraft {
  const name =
    preview.meta?.name?.trim() ||
    preview.meta?.display_name?.trim() ||
    preview.name.trim() ||
    preview.public_key;
  const about = preview.meta?.about?.trim() || '';

  return {
    public_key: preview.public_key,
    name,
    given_name: preview.given_name?.trim() || null,
    ...(about ? { about } : {}),
    ...(identifierType === 'nip05' && nip05 ? { nip05 } : {}),
    ...(nprofile ? { nprofile } : {}),
    ...(identifierType === null && nip05 ? { nip05 } : {})
  };
}

function cloneGroupMember(member: ContactGroupMember): GroupMemberDraft {
  return {
    public_key: member.public_key,
    name: member.name,
    given_name: member.given_name ?? null,
    about: member.about,
    nip05: member.nip05,
    nprofile: member.nprofile
  };
}

function cloneGroupMembers(members: ContactGroupMember[] | undefined): GroupMemberDraft[] {
  return Array.isArray(members) ? members.map((member) => cloneGroupMember(member)) : [];
}

function syncGroupMembersFromContact(contact: ContactRecord | null): void {
  resetMembersEditor();
  if (!contact || contact.type !== 'group') {
    return;
  }

  groupMembers.value = cloneGroupMembers(contact.meta.group_members);
}

async function persistGroupMembers(nextMembers: GroupMemberDraft[]): Promise<void> {
  const contact = currentContact.value;
  if (!contact || contact.type !== 'group') {
    groupMembers.value = cloneGroupMembers(nextMembers);
    return;
  }

  await contactsService.init();

  const nextMeta: ContactMetadata = {
    ...(contact.meta ?? {})
  };
  const storedMembers = cloneGroupMembers(nextMembers);

  if (storedMembers.length > 0) {
    nextMeta.group_members = storedMembers;
  } else {
    delete nextMeta.group_members;
  }

  const updatedContact = await contactsService.updateContact(contact.id, {
    meta: nextMeta
  });
  if (!updatedContact) {
    throw new Error('Failed to persist group members.');
  }

  currentContact.value = updatedContact;
  groupMembers.value = cloneGroupMembers(updatedContact.meta.group_members);
}

function memberDisplayName(member: GroupMemberDraft): string {
  const givenName = member.given_name?.trim();
  if (givenName) {
    return givenName;
  }

  return member.name || member.public_key;
}

function memberAvatar(member: GroupMemberDraft): string {
  return buildAvatar(memberDisplayName(member) || member.public_key);
}

function memberPictureUrl(member: GroupMemberDraft): string {
  void member;
  return '';
}

function memberListCandidates(member: GroupMemberDraft): string[] {
  const npub = nostrStore.encodeNpub(member.public_key) || '';
  const storedIdentifier = member.nip05?.trim() || member.nprofile?.trim() || '';

  return [member.name.trim(), member.about?.trim() ?? '', storedIdentifier, npub].filter((value) => value.length > 0);
}

function isLoggedInMember(member: GroupMemberDraft): boolean {
  const loggedInPubkey = nostrStore.getLoggedInPublicKeyHex();
  if (!loggedInPubkey) {
    return false;
  }

  return member.public_key.trim().toLowerCase() === loggedInPubkey;
}

function memberPubkeySnippet(member: GroupMemberDraft): string {
  return member.public_key.trim().slice(0, 32);
}

function memberListTitle(member: GroupMemberDraft): string {
  if (isLoggedInMember(member)) {
    return 'My Self';
  }

  return memberListCandidates(member)[0] ?? memberPubkeySnippet(member);
}

function memberListCaption(member: GroupMemberDraft): string {
  const candidates = memberListCandidates(member);
  if (isLoggedInMember(member)) {
    return candidates[0] ?? '';
  }

  return candidates[1] ?? '';
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
    group: contact.meta.group === true,
    birthday: {
      year: contact.meta.birthday?.year ?? null,
      month: contact.meta.birthday?.month ?? null,
      day: contact.meta.birthday?.day ?? null
    },
    relays: (contact.relays ?? []).map((relay) => relay.url),
    sendMessagesToAppRelays: contact.sendMessagesToAppRelays === true
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
    reportUiError('Failed to refresh profile', error, 'Failed to refresh profile.');
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
    a.group === b.group &&
    a.birthday.year === b.birthday.year &&
    a.birthday.month === b.birthday.month &&
    a.birthday.day === b.birthday.day &&
    a.relays.length === b.relays.length &&
    a.relays.every((relay, index) => relay === b.relays[index]) &&
    a.sendMessagesToAppRelays === b.sendMessagesToAppRelays
  );
}

async function loadContactFromPubkey(input: string): Promise<void> {
  const requestId = ++lookupRequestId;
  const normalizedPubkey = normalizePubkeyInput(input);

  if (!input.trim()) {
    currentContact.value = null;
    isLoadingContact.value = false;
    pubkeyError.value = '';
    pubkeyInfo.value = '';
    return;
  }

  if (!normalizedPubkey) {
    currentContact.value = null;
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
      currentContact.value = null;
      pubkeyInfo.value = 'No contact found for this public key.';
      return;
    }

    currentContact.value = contact;
    Object.assign(localProfile, mapContactToProfile(contact));
  } catch (error) {
    if (requestId !== lookupRequestId) {
      return;
    }

    currentContact.value = null;
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
  flex: 1 1 auto;
  width: 100%;
  min-height: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: transparent;
}

.profile-content {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.profile-content--with-header {
  padding: 12px;
}

.profile-tabs-shell {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  gap: 12px;
}

.profile-tabs-shell--mobile {
  justify-content: space-between;
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

.profile-tabs {
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--tg-border) 88%, #8ea4c0 12%);
  background: color-mix(in srgb, var(--tg-panel-header-bg) 92%, rgba(255, 255, 255, 0.08));
}

.profile-tab-panels {
  background: transparent;
  flex: 1 1 auto;
  min-height: 0;
}

.profile-tab-panels--mobile {
  padding-bottom: 4px;
}

.profile-tab-panel {
  padding: 0;
}

.profile-tab-panels--mobile :deep(.q-panel) {
  min-height: 100%;
}

.profile-tab-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.profile-tab-actions__button {
  flex-shrink: 0;
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
  margin: 6px 12px 12px;
  padding: 12px 14px 14px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--tg-sidebar) 88%, var(--tg-border) 12%);
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

.profile-members-state {
  padding: 18px 16px;
  border: 1px solid color-mix(in srgb, var(--tg-border) 88%, #8ea4c0 12%);
  border-radius: 14px;
  background: color-mix(in srgb, var(--tg-panel-sidebar-bg) 94%, rgba(255, 255, 255, 0.04));
  display: grid;
  gap: 8px;
}

.profile-members-state__title {
  font-size: 16px;
  font-weight: 700;
}

.profile-members {
  display: flex;
  flex-direction: column;
}

.profile-group-relays {
  display: flex;
  flex-direction: column;
}

.profile-members-toolbar {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.profile-members-toolbar__input {
  flex: 1 1 auto;
  min-width: 0;
}

.profile-members-list {
  border-radius: 14px;
  background: color-mix(in srgb, var(--tg-sidebar) 92%, transparent);
}

.profile-members-list__item {
  min-height: 64px;
}

.profile-members-list__name {
  font-weight: 600;
}

.profile-members-list__caption {
  word-break: break-word;
}

.profile-members-list__actions {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  padding-left: 8px;
}

.mobile-nav {
  position: sticky;
  bottom: 0;
  z-index: 3;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--tg-sidebar) 78%, transparent), var(--tg-sidebar));
  border-top: 1px solid color-mix(in srgb, var(--tg-border) 84%, #6b7d96 16%);
  padding-bottom: env(safe-area-inset-bottom);
  backdrop-filter: blur(var(--tg-glass-blur-strong));
}

.mobile-nav__inner {
  display: grid;
  align-items: center;
  gap: 6px;
  padding: 6px 8px 5px;
}

.mobile-nav__btn {
  color: #55697f;
  border-radius: 12px;
  min-height: 42px;
  padding: 0 8px;
  border: 1px solid color-mix(in srgb, var(--tg-border) 74%, transparent);
  background: color-mix(in srgb, var(--tg-sidebar) 90%, #eef5ff 10%);
  transition:
    transform 0.2s ease,
    background-color 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    color 0.2s ease;
}

.mobile-nav__btn :deep(.q-btn__content) {
  gap: 5px;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.mobile-nav__btn :deep(.q-icon) {
  font-size: 18px;
}

.mobile-nav__btn:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--tg-border) 72%, #6d8db8 28%);
  background: color-mix(in srgb, var(--tg-sidebar) 82%, #dce9ff 18%);
}

.mobile-nav__btn--active {
  border-color: rgba(33, 110, 236, 0.68);
  box-shadow: 0 8px 18px rgba(30, 102, 214, 0.24);
}

body.body--dark .mobile-nav__btn {
  color: #a5b6c9;
  border-color: color-mix(in srgb, var(--tg-border) 72%, transparent);
  background: color-mix(in srgb, var(--tg-sidebar) 90%, #102035 10%);
}

body.body--dark .mobile-nav__btn--active {
  border-color: rgba(128, 193, 255, 0.62);
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.38);
}

@media (max-width: 640px) {
  .profile-card__birthday-grid {
    grid-template-columns: 1fr;
  }

  .profile-members-toolbar {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
