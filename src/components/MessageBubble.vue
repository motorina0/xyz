<template>
  <div
    class="bubble-row"
    :class="[
      isMine ? 'bubble-row--mine' : 'bubble-row--their',
      { 'bubble-row--show-author-mobile': showAuthorOnMobile }
    ]"
  >
    <div class="bubble-stack" :class="isMine ? 'bubble-stack--mine' : 'bubble-stack--their'">
      <button
        v-if="showAuthorName"
        type="button"
        class="bubble__author"
        :class="isMine ? 'bubble__author--mine' : 'bubble__author--their'"
        data-testid="thread-author-profile-link"
        :aria-label="`Open profile for ${authorLabel}`"
        @click.stop="handleOpenAuthorProfile"
      >
        <CachedAvatar
          :src="authorAvatarSrc"
          :alt="authorLabel"
          :fallback="authorAvatarFallback"
          class="bubble__author-avatar"
        />
        <span class="bubble__author-name">{{ authorLabel }}</span>
      </button>
      <div
        class="bubble"
        :class="isMine ? 'bubble--mine' : 'bubble--their'"
        @click.stop="openActionMenu"
      >
      <q-menu
        ref="actionMenuRef"
        v-model="isActionMenuOpen"
        no-parent-event
        touch-position
        class="tg-pop-menu"
        :transition-duration="0"
        @hide="handleActionMenuHide"
      >
        <div class="bubble__menu-stack">
          <q-list dense class="tg-pop-menu__list bubble__actions-list">
            <q-item clickable v-close-popup @click="handleReply">
              <q-item-section avatar>
                <q-icon name="reply" />
              </q-item-section>
              <q-item-section>Reply</q-item-section>
            </q-item>
            <q-item clickable v-close-popup @click="handleCopy">
              <q-item-section avatar>
                <q-icon name="content_copy" />
              </q-item-section>
              <q-item-section>Copy</q-item-section>
            </q-item>
            <q-item clickable v-close-popup @click="handlePin">
              <q-item-section avatar>
                <q-icon name="push_pin" />
              </q-item-section>
              <q-item-section>Pin</q-item-section>
            </q-item>
            <q-item clickable v-close-popup @click="handleInfo">
              <q-item-section avatar>
                <q-icon name="info" />
              </q-item-section>
              <q-item-section>Nostr Info</q-item-section>
            </q-item>
            <q-item v-if="canDeleteMessage" clickable v-close-popup @click="handleDelete">
              <q-item-section avatar>
                <q-icon name="delete" class="text-negative" />
              </q-item-section>
              <q-item-section class="text-negative">Delete</q-item-section>
            </q-item>
            <q-item
              v-else-if="isDeletedMessage"
              clickable
              v-close-popup
              @click="openDeletedMessageDialog"
            >
              <q-item-section avatar>
                <q-icon name="visibility" />
              </q-item-section>
              <q-item-section>View Deleted Message</q-item-section>
            </q-item>
          </q-list>

          <div class="bubble__quick-reactions" role="menu" aria-label="Quick emoji reactions">
            <button
              v-for="entry in quickReactionEntries"
              :key="entry.emoji"
              type="button"
              class="bubble__quick-reaction"
              @click="handleEmojiReaction(entry.emoji)"
              :title="entry.label"
              :aria-label="`React with ${entry.label}`"
            >
              {{ entry.emoji }}
            </button>

            <button
              type="button"
              class="bubble__quick-reaction bubble__quick-reaction--more"
              aria-label="Open more emoji"
              @click="openEmojiPickerMenu"
            >
              <q-icon name="more_horiz" size="18px" />
            </button>
          </div>
        </div>
      </q-menu>

      <q-menu
        ref="emojiPickerMenuRef"
        v-model="isEmojiPickerMenuOpen"
        no-parent-event
        touch-position
        class="tg-pop-menu"
        :transition-duration="0"
        @show="handleEmojiPickerMenuShow"
      >
        <EmojiPickerPanel
          ref="emojiPickerRef"
          width="264px"
          max-height="232px"
          :columns="5"
          item-min-height="46px"
          item-padding="8px 4px"
          @select="handleEmojiReaction"
        />
      </q-menu>

      <div class="bubble__content">
        <button
          v-if="replyPreview"
          type="button"
          class="bubble__reply-preview"
          aria-label="Open replied message"
          @click.stop="handleOpenReplyTarget"
        >
          <div class="bubble__reply-preview-accent" aria-hidden="true" />
          <div class="bubble__reply-preview-copy">
            <div class="bubble__reply-preview-title">{{ replyPreview.authorName }}</div>
            <div class="bubble__reply-preview-text">{{ replyPreview.text }}</div>
          </div>
        </button>

        <p
          class="bubble__text"
          :class="{
            'bubble__text--emoji': isSingleEmojiMessage,
            'bubble__text--deleted': isDeletedMessage
          }"
        >
          {{ bubbleMessageText }}
        </p>
        <button
          v-if="canExpandMessage && !isMessageExpanded"
          type="button"
          class="bubble__more"
          @click.stop="expandMessage"
        >
          More
        </button>
      </div>

      <div class="bubble__meta">
        <span class="bubble__time">{{ formattedTime }}</span>
        <div
          v-if="hasRelayStatuses"
          class="bubble__status-hitbox"
          tabindex="0"
          role="button"
          aria-haspopup="dialog"
          :aria-expanded="isStatusDialogOpen ? 'true' : 'false'"
          @click.stop="openStatusDialog"
          @keydown.enter.prevent="openStatusDialog"
          @keydown.space.prevent="openStatusDialog"
        >
          <div
            class="bubble__status"
            :class="{ 'bubble__status--pending': hasPendingRelayStatuses }"
          >
            <span
              v-for="segment in statusSegments"
              :key="segment.key"
              class="bubble__status-segment"
              :class="segment.className"
              :style="{ flex: `${segment.weight} 1 0` }"
            />
          </div>
        </div>
      </div>

      <div v-if="messageReactions.length > 0" class="bubble__reactions">
        <button
          v-for="item in messageReactionItems"
          :key="item.key"
          type="button"
          class="bubble__reaction-chip"
          :class="{
            'bubble__reaction-chip--fresh': isFreshReaction(item.key),
            'bubble__reaction-chip--removable': canRemoveReaction(item.reaction)
          }"
          :aria-label="
            canRemoveReaction(item.reaction)
              ? `Remove ${item.reaction.name} reaction`
              : `${item.reaction.name} reaction`
          "
          @click.stop="handleRemoveReaction(item.reaction)"
        >
          <span class="bubble__reaction-emoji">{{ item.reaction.emoji }}</span>
          <AppTooltip>{{ item.reaction.name }}</AppTooltip>
        </button>
      </div>
    </div>
  </div>
</div>

  <AppDialog
    v-if="hasRelayStatuses"
    v-model="isStatusDialogOpen"
    :title="statusDialogTitle"
    plain
    max-width="460px"
  >
    <div v-if="statusSections.length === 0" class="bubble__status-empty">
      No relay status recorded yet.
    </div>
    <template v-else>
      <div
        v-for="(section, sectionIndex) in statusSections"
        :key="section.key"
        class="bubble__status-section"
      >
        <div v-if="sectionIndex > 0" class="bubble__status-section-separator" />
        <div class="bubble__status-section-title">{{ section.title }}</div>
        <ul class="bubble__status-list bubble__status-list--dialog">
          <li
            v-for="item in section.items"
            :key="item.key"
            class="bubble__status-list-item bubble__status-list-item--dialog"
          >
            <span class="bubble__status-list-item-main">
              <span class="bubble__status-list-dot" :class="item.dotClass" aria-hidden="true" />
              <span class="bubble__status-list-copy">
                <span class="bubble__status-list-text">{{ item.relayUrl }}</span>
                <span v-if="item.detail" class="bubble__status-list-detail">{{ item.detail }}</span>
              </span>
            </span>
            <q-btn
              v-if="item.retryable"
              flat
              dense
              no-caps
              size="sm"
              color="primary"
              label="Retry"
              class="bubble__status-retry"
              :loading="isRetrying(item)"
              :disable="isRetrying(item) || !item.retryable"
              @click.stop="retryRelay(item)"
            />
          </li>
          <li
            v-if="section.items.length === 0"
            class="bubble__status-list-item bubble__status-list-item--empty"
          >
            {{ section.emptyLabel }}
          </li>
        </ul>
      </div>
    </template>
  </AppDialog>

  <AppDialog
    v-model="isInfoDialogOpen"
    max-width="460px"
  >
    <template #title>
      <div class="bubble__info-dialog-title">
        <q-btn
          v-if="isEventJsonViewOpen"
          flat
          dense
          no-caps
          icon="arrow_back"
          label="Back"
          class="bubble__info-back"
          @click="handleBackToInfo"
        />
        <div class="bubble__info-dialog-title-text">Nostr Info</div>
      </div>
    </template>

    <div v-if="!isEventJsonViewOpen" class="bubble__info">
      <div class="bubble__info-row">
        <div class="bubble__info-label">Sent</div>
        <div class="bubble__info-value">{{ formattedInfoTime }}</div>
      </div>
      <div class="bubble__info-row">
        <div class="bubble__info-label">Sender</div>
        <div class="bubble__info-value">{{ isMine ? 'You' : 'Contact' }}</div>
      </div>
      <div class="bubble__info-row">
        <div class="bubble__info-label">Author Pubkey</div>
        <div class="bubble__info-value bubble__info-value--mono">{{ message.authorPublicKey }}</div>
      </div>
      <div class="bubble__info-row">
        <div class="bubble__info-label">Event ID</div>
        <div class="bubble__info-value bubble__info-value--mono">
          {{ message.eventId || 'Not available' }}
        </div>
      </div>
      <div class="bubble__info-row">
        <div class="bubble__info-label">Message</div>
        <div class="bubble__info-value">{{ baseVisibleMessageText }}</div>
      </div>
      <q-btn
        flat
        no-caps
        color="primary"
        label="Show Event Json"
        class="bubble__info-json-button"
        @click="handleShowEventJson"
      />
    </div>

    <div v-else class="bubble__event-json-panel">
      <pre v-if="formattedEventJson" class="bubble__event-json">{{ formattedEventJson }}</pre>
      <div v-else class="bubble__event-json-empty">Event JSON is not available for this message.</div>
    </div>
  </AppDialog>

  <AppDialog
    v-model="isDeletedMessageDialogOpen"
    title="Deleted Message"
    max-width="460px"
  >
    <div class="bubble__deleted-message-dialog">{{ message.text }}</div>
  </AppDialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, toRef, watch } from 'vue';
import { useQuasar } from 'quasar';
import AppDialog from 'src/components/AppDialog.vue';
import AppTooltip from 'src/components/AppTooltip.vue';
import CachedAvatar from 'src/components/CachedAvatar.vue';
import EmojiPickerPanel from 'src/components/EmojiPickerPanel.vue';
import {
  isRetryableStatusScope,
  type StatusListItem,
  useMessageBubbleStatus
} from 'src/composables/useMessageBubbleStatus';
import { getEmojiEntryByValue, type EmojiOption } from 'src/data/topEmojis';
import type {
  DeletedMessageMetadata,
  Message,
  MessageReaction,
  MessageReplyPreview
} from 'src/types/chat';
import { useNostrStore } from 'src/stores/nostrStore';
import { isReactionUnseenForAuthor } from 'src/utils/messageReactions';
import { reportUiError } from 'src/utils/uiErrorHandler';

const props = defineProps<{
  message: Message;
  authorAvatarFallback?: string;
  authorAvatarSrc?: string;
  authorLabel?: string;
  contactName?: string;
  contactRelayUrls?: string[];
  showAuthorName?: boolean;
  showAuthorOnMobile?: boolean;
}>();

const emit = defineEmits<{
  (event: 'reply', message: Message): void;
  (event: 'open-reply-target', messageId: string, referenceSentAt?: string): void;
  (event: 'open-profile', publicKey: string): void;
  (event: 'react', payload: { message: Message; emoji: string }): void;
  (event: 'delete-message', message: Message): void;
  (event: 'remove-reaction', payload: { message: Message; reaction: MessageReaction }): void;
}>();

const $q = useQuasar();
const nostrStore = useNostrStore();
const isMine = computed(() => props.message.sender === 'me');
const showAuthorOnMobile = computed(() => props.showAuthorOnMobile === true);
const loggedInPublicKey = computed(() => nostrStore.getLoggedInPublicKeyHex()?.toLowerCase() ?? '');
const actionMenuRef = ref<{ show: (evt?: Event) => void } | null>(null);
const emojiPickerMenuRef = ref<{ show: (evt?: Event) => void } | null>(null);
const isActionMenuOpen = ref(false);
const isEmojiPickerMenuOpen = ref(false);
const isInfoDialogOpen = ref(false);
const isEventJsonViewOpen = ref(false);
const isDeletedMessageDialogOpen = ref(false);
const shouldOpenEmojiPickerAfterActionMenu = ref(false);
const lastActionMenuClickPosition = ref<{ left: number; top: number } | null>(null);
const emojiPickerRef = ref<{ reset: () => void } | null>(null);

interface MessageReactionItem {
  key: string;
  reaction: MessageReaction;
  isFreshCandidate: boolean;
}

function isMessageReaction(value: unknown): value is MessageReaction {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<MessageReaction>;
  return (
    typeof candidate.emoji === 'string' &&
    candidate.emoji.trim().length > 0 &&
    typeof candidate.name === 'string' &&
    candidate.name.trim().length > 0 &&
    typeof candidate.reactorPublicKey === 'string' &&
    candidate.reactorPublicKey.trim().length > 0
  );
}

function isMessageReplyPreview(value: unknown): value is MessageReplyPreview {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<MessageReplyPreview>;
  return (
    typeof candidate.messageId === 'string' &&
    typeof candidate.text === 'string' &&
    (candidate.sender === 'me' || candidate.sender === 'them') &&
    typeof candidate.authorName === 'string' &&
    typeof candidate.authorPublicKey === 'string' &&
    typeof candidate.sentAt === 'string' &&
    (typeof candidate.eventId === 'string' || candidate.eventId === null)
  );
}

function isDeletedMessageMetadata(value: unknown): value is DeletedMessageMetadata {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<DeletedMessageMetadata>;
  return (
    typeof candidate.deletedAt === 'string' &&
    candidate.deletedAt.trim().length > 0 &&
    typeof candidate.deletedByPublicKey === 'string' &&
    candidate.deletedByPublicKey.trim().length > 0 &&
    typeof candidate.deletedEventKind === 'number'
  );
}

const isStatusDialogOpen = ref(false);
const showAuthorName = computed(() => props.showAuthorName === true);
const authorLabel = computed(() => {
  const explicitLabel = props.authorLabel?.trim();
  if (explicitLabel) {
    return explicitLabel;
  }

  if (isMine.value) {
    return 'You';
  }

  return props.contactName?.trim() || 'Contact';
});
const authorAvatarSrc = computed(() => props.authorAvatarSrc?.trim() || '');
const authorAvatarFallback = computed(() => {
  const explicitFallback = props.authorAvatarFallback?.trim();
  if (explicitFallback) {
    return explicitFallback;
  }

  return authorLabel.value;
});
const {
  hasPendingRelayStatuses,
  hasRelayStatuses,
  statusDialogTitle,
  statusSections,
  statusSegments
} = useMessageBubbleStatus({
  contactName: computed(() => props.contactName?.trim() || ''),
  contactRelayUrls: computed(() => props.contactRelayUrls ?? []),
  isMine,
  message: toRef(props, 'message')
});
const retryingRelayKeys = ref<string[]>([]);
const replyPreview = computed(() => {
  const candidate = props.message.meta.reply;
  return isMessageReplyPreview(candidate) ? candidate : null;
});
const messageReactions = computed<MessageReaction[]>(() => {
  const candidate = props.message.meta.reactions;
  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate.filter(isMessageReaction);
});

function buildMessageReactionBaseKey(reaction: MessageReaction): string {
  const normalizedEventId =
    typeof reaction.eventId === 'string' ? reaction.eventId.trim().toLowerCase() : '';
  if (normalizedEventId) {
    return normalizedEventId;
  }

  return [
    reaction.emoji.trim(),
    reaction.name.trim().toLowerCase(),
    reaction.reactorPublicKey.trim().toLowerCase()
  ].join('::');
}

const messageReactionItems = computed<MessageReactionItem[]>(() => {
  const reactionCounts = new Map<string, number>();

  return messageReactions.value.map((reaction) => {
    const baseKey = buildMessageReactionBaseKey(reaction);
    const occurrence = reactionCounts.get(baseKey) ?? 0;
    reactionCounts.set(baseKey, occurrence + 1);

    return {
      key: `${baseKey}::${occurrence}`,
      reaction,
      isFreshCandidate:
        isMine.value && isReactionUnseenForAuthor(reaction, props.message.authorPublicKey)
    };
  });
});

const freshReactionKeys = ref<Set<string>>(new Set());
const freshReactionTimers = new Map<string, ReturnType<typeof setTimeout>>();
const hasReactionSnapshot = ref(false);

function markReactionFresh(key: string): void {
  const existingTimer = freshReactionTimers.get(key);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const nextKeys = new Set(freshReactionKeys.value);
  nextKeys.add(key);
  freshReactionKeys.value = nextKeys;

  const timerId = setTimeout(() => {
    freshReactionTimers.delete(key);
    const pendingKeys = new Set(freshReactionKeys.value);
    pendingKeys.delete(key);
    freshReactionKeys.value = pendingKeys;
  }, 5000);

  freshReactionTimers.set(key, timerId);
}

function isFreshReaction(key: string): boolean {
  return freshReactionKeys.value.has(key);
}

function canRemoveReaction(reaction: MessageReaction): boolean {
  return reaction.reactorPublicKey.trim().toLowerCase() === loggedInPublicKey.value;
}
const deletedMessageMeta = computed<DeletedMessageMetadata | null>(() => {
  const candidate = props.message.meta.deleted;
  return isDeletedMessageMetadata(candidate) ? candidate : null;
});
const isDeletedMessage = computed(() => deletedMessageMeta.value !== null);
const canDeleteMessage = computed(() => {
  return isMine.value && !isDeletedMessage.value && Boolean(props.message.eventId);
});
const MAX_EXPANDED_MESSAGE_CHARACTERS = 360;
const MAX_EXPANDED_MESSAGE_LINES = 8;
const isMessageExpanded = ref(false);

function isMessageTooLong(text: string): boolean {
  const normalizedText = text.replace(/\r\n/g, '\n');
  const lineCount = normalizedText.split('\n').length;
  return (
    normalizedText.length > MAX_EXPANDED_MESSAGE_CHARACTERS ||
    lineCount > MAX_EXPANDED_MESSAGE_LINES
  );
}

function truncateMessageText(text: string): string {
  const normalizedText = text.replace(/\r\n/g, '\n');
  const lines = normalizedText.split('\n');
  let nextText =
    lines.length > MAX_EXPANDED_MESSAGE_LINES
      ? lines.slice(0, MAX_EXPANDED_MESSAGE_LINES).join('\n')
      : normalizedText;

  if (nextText.length > MAX_EXPANDED_MESSAGE_CHARACTERS) {
    nextText = nextText.slice(0, MAX_EXPANDED_MESSAGE_CHARACTERS);
  }

  return `${nextText.trimEnd()}...`;
}

const baseVisibleMessageText = computed(() => {
  if (!isDeletedMessage.value) {
    return props.message.text;
  }

  const [firstLine = ''] = props.message.text.split(/\r?\n/u);
  return firstLine;
});
const DEFAULT_QUICK_REACTION_EMOJIS = ['👍', '👎', '🙏', '❤️', '😂'] as const;

const quickReactionEntries = DEFAULT_QUICK_REACTION_EMOJIS
  .map((emoji) => getEmojiEntryByValue(emoji))
  .filter((entry): entry is EmojiOption => entry !== null);
const SINGLE_EMOJI_PATTERN =
  /^(?:\p{Regional_Indicator}{2}|(?:[#*0-9]\uFE0F?\u20E3)|\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\p{Emoji_Modifier})?)*)$/u;
const isSingleEmojiMessage = computed(() => {
  if (isDeletedMessage.value) {
    return false;
  }

  const trimmedText = props.message.text.trim();
  return trimmedText.length > 0 && SINGLE_EMOJI_PATTERN.test(trimmedText);
});
const canExpandMessage = computed(() => {
  return (
    !isDeletedMessage.value &&
    !isSingleEmojiMessage.value &&
    isMessageTooLong(baseVisibleMessageText.value)
  );
});
const bubbleMessageText = computed(() => {
  if (!canExpandMessage.value || isMessageExpanded.value) {
    return baseVisibleMessageText.value;
  }

  return truncateMessageText(baseVisibleMessageText.value);
});

function openStatusDialog(): void {
  if (!hasRelayStatuses.value) {
    return;
  }

  isStatusDialogOpen.value = true;
}

function openActionMenu(event: MouseEvent): void {
  if (event.button !== 0) {
    return;
  }

  lastActionMenuClickPosition.value = {
    left: event.clientX,
    top: event.clientY
  };
  shouldOpenEmojiPickerAfterActionMenu.value = false;
  isEmojiPickerMenuOpen.value = false;
  actionMenuRef.value?.show(event);
}

function openEmojiPickerMenu(): void {
  shouldOpenEmojiPickerAfterActionMenu.value = true;
  isActionMenuOpen.value = false;
}

function handleActionMenuHide(): void {
  if (!shouldOpenEmojiPickerAfterActionMenu.value) {
    return;
  }

  shouldOpenEmojiPickerAfterActionMenu.value = false;
  const positionEvent = createMenuPositionEvent();
  if (positionEvent) {
    emojiPickerMenuRef.value?.show(positionEvent);
    return;
  }

  isEmojiPickerMenuOpen.value = true;
}

function handleEmojiPickerMenuShow(): void {
  void nextTick(() => {
    emojiPickerRef.value?.reset();
  });
}

function createMenuPositionEvent(): MouseEvent | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const position = lastActionMenuClickPosition.value;
  if (!position) {
    return null;
  }

  return new MouseEvent('click', {
    bubbles: true,
    button: 0,
    clientX: position.left,
    clientY: position.top,
    view: window
  });
}

function notifyUnimplemented(label: string): void {
  $q.notify({
    type: 'info',
    message: `${label} is not implemented yet.`,
    position: 'top',
    timeout: 1800
  });
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

function handleReply(): void {
  emit('reply', props.message);
}

function handleOpenAuthorProfile(): void {
  const publicKey = props.message.authorPublicKey.trim();
  if (!publicKey) {
    return;
  }

  try {
    emit('open-profile', publicKey);
  } catch (error) {
    reportUiError('Failed to open author profile from message bubble', error);
  }
}

function handleOpenReplyTarget(): void {
  if (!replyPreview.value) {
    return;
  }

  emit('open-reply-target', replyPreview.value.messageId, props.message.sentAt);
}

function handleEmojiReaction(emoji: string): void {
  try {
    isActionMenuOpen.value = false;
    isEmojiPickerMenuOpen.value = false;
    emit('react', {
      message: props.message,
      emoji
    });
  } catch (error) {
    reportUiError('Failed to emit message reaction', error, 'Failed to add reaction.');
  }
}

function handleRemoveReaction(reaction: MessageReaction): void {
  if (!canRemoveReaction(reaction)) {
    return;
  }

  try {
    emit('remove-reaction', {
      message: props.message,
      reaction
    });
  } catch (error) {
    reportUiError('Failed to emit message reaction removal', error, 'Failed to remove reaction.');
  }
}

async function handleCopy(): Promise<void> {
  try {
    await copyText(baseVisibleMessageText.value);
    $q.notify({
      type: 'positive',
      message: 'Message copied.',
      position: 'top',
      timeout: 1600
    });
  } catch (error) {
    reportUiError('Failed to copy message text', error, 'Failed to copy message.');
  }
}

function handlePin(): void {
  notifyUnimplemented('Pin');
}

function handleInfo(): void {
  isEventJsonViewOpen.value = false;
  isInfoDialogOpen.value = true;
}

function handleShowEventJson(): void {
  isEventJsonViewOpen.value = true;
}

function handleBackToInfo(): void {
  isEventJsonViewOpen.value = false;
}

function handleDelete(): void {
  if (!canDeleteMessage.value) {
    return;
  }

  emit('delete-message', props.message);
}

function openDeletedMessageDialog(): void {
  if (!isDeletedMessage.value) {
    return;
  }

  isDeletedMessageDialogOpen.value = true;
}

function expandMessage(): void {
  isMessageExpanded.value = true;
}

function isRetrying(item: StatusListItem): boolean {
  return retryingRelayKeys.value.includes(item.key);
}

async function retryRelay(item: StatusListItem): Promise<void> {
  const messageId = Number.parseInt(props.message.id, 10);
  if (
    !Number.isInteger(messageId) ||
    messageId <= 0 ||
    !item.retryable ||
    !isRetryableStatusScope(item.scope) ||
    isRetrying(item)
  ) {
    return;
  }

  retryingRelayKeys.value = [...retryingRelayKeys.value, item.key];
  try {
    await nostrStore.retryDirectMessageRelay(messageId, item.relayUrl, item.scope);
  } catch (error) {
    reportUiError('Failed to retry direct message relay publish', error, 'Failed to retry relay.');
  } finally {
    retryingRelayKeys.value = retryingRelayKeys.value.filter((key) => key !== item.key);
  }
}

const formattedTime = computed(() => {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(props.message.sentAt));
});

const formattedInfoTime = computed(() => {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(props.message.sentAt));
});

const formattedEventJson = computed(() => {
  const event = props.message.nostrEvent?.event;
  if (!event) {
    return '';
  }

  try {
    return JSON.stringify(event, null, 2);
  } catch {
    return '';
  }
});

watch(
  () => messageReactionItems.value.map((item) => item.key),
  (nextKeys, previousKeys) => {
    if (!hasReactionSnapshot.value) {
      hasReactionSnapshot.value = true;
      return;
    }

    const previousKeySet = new Set(previousKeys ?? []);
    messageReactionItems.value.forEach((item) => {
      if (item.isFreshCandidate && !previousKeySet.has(item.key)) {
        markReactionFresh(item.key);
      }
    });
  }
);

watch(
  () => [props.message.id, props.message.text, isDeletedMessage.value],
  () => {
    isMessageExpanded.value = false;
  }
);

watch(isInfoDialogOpen, (isOpen) => {
  if (!isOpen) {
    isEventJsonViewOpen.value = false;
  }
});

onBeforeUnmount(() => {
  freshReactionTimers.forEach((timerId) => {
    clearTimeout(timerId);
  });
  freshReactionTimers.clear();
});
</script>

<style scoped>
.bubble-row,
.bubble-stack,
.bubble {
  --bubble-author-avatar-size: 36px;
  --bubble-author-gap: 10px;
  --bubble-author-indent: calc(var(--bubble-author-avatar-size) + var(--bubble-author-gap));
}

.bubble-row {
  display: flex;
  width: 100%;
  margin-bottom: 2px;
}

.bubble-stack {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 100%;
}

.bubble-stack--mine {
  align-items: flex-start;
}

.bubble-stack--their {
  align-items: flex-start;
}

.bubble-row--mine {
  justify-content: flex-start;
}

.bubble-row--their {
  justify-content: flex-start;
}

.bubble {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px;
  width: 100%;
  max-width: 100%;
  padding: 2px 10px 2px 0;
  border-radius: 0;
  box-shadow: none;
  background: transparent;
  animation: bubble-in 180ms ease both;
  transition: background-color 0.2s ease;
  cursor: pointer;
  z-index: 0;
}

.bubble::before {
  content: '';
  position: absolute;
  inset: 0 0 0 calc(var(--bubble-author-indent) - 3px);
  background: var(--tg-hover);
  border-radius: inherit;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}

.bubble__author {
  display: inline-flex;
  align-items: center;
  gap: var(--bubble-author-gap);
  margin: 0 0 4px;
  padding: 0;
  border: 0;
  background: transparent;
  opacity: 1;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.bubble__author:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--q-primary) 58%, transparent);
  outline-offset: 3px;
}

.bubble__author--mine {
  color: var(--tg-text-secondary);
}

.bubble__author--their {
  color: #79c0ff;
}

.bubble__author-avatar {
  width: var(--bubble-author-avatar-size);
  height: var(--bubble-author-avatar-size);
  min-width: var(--bubble-author-avatar-size);
  min-height: var(--bubble-author-avatar-size);
  font-size: 14px;
}

.bubble__author-name {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1.2;
}

.bubble:hover::before,
.bubble:focus-within::before {
  opacity: 1;
}

.bubble--mine {
  background: transparent;
}

.bubble--their {
  background: transparent;
}

.bubble__text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  cursor: pointer;
  color: var(--tg-text);
  line-height: 1.5;
}

.bubble__more {
  margin-top: 6px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--q-primary);
  font-size: 0.88rem;
  font-weight: 600;
  line-height: 1.2;
  cursor: pointer;
}

.bubble__more:hover {
  text-decoration: underline;
}

.bubble__text--deleted {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  filter: blur(4px);
  user-select: none;
}

.bubble__text--emoji {
  font-size: clamp(2.4rem, 5vw, 3.8rem);
  line-height: 1.1;
}

.bubble__content {
  display: flex;
  flex: 0 1 auto;
  flex-direction: column;
  min-width: 0;
  margin-left: var(--bubble-author-indent);
  max-width: min(82%, 560px);
  cursor: inherit;
  position: relative;
  z-index: 1;
}

.bubble__reply-preview {
  display: flex;
  width: 100%;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 8px;
  padding: 0;
  border: 0;
  border-radius: 0;
  color: inherit;
  text-align: left;
  background: transparent;
  cursor: pointer;
}

.bubble__menu-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 6px;
}

.bubble__actions-list {
  padding: 0;
  min-width: 204px;
}

.bubble__quick-reactions {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px;
  border-radius: 12px;
  background: var(--tg-surface-soft-strong);
  border: 1px solid var(--tg-border);
}

.bubble__quick-reaction {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  box-shadow: none;
  color: inherit;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    color 0.18s ease,
    opacity 0.18s ease;
}

.bubble__quick-reaction:hover {
  transform: none;
  color: var(--q-primary);
  opacity: 1;
}

.bubble__quick-reaction:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--q-primary) 54%, transparent);
  outline-offset: 2px;
}

.bubble__quick-reaction--more {
  color: var(--tg-text-secondary);
  font-size: 0;
}

.bubble__reactions {
  display: flex;
  flex: 0 0 100%;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 6px;
  margin-top: 0;
  padding-left: var(--bubble-author-indent);
  position: relative;
  z-index: 1;
}

.bubble__reaction-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid var(--tg-btn-round-border);
  border-radius: 999px;
  background: var(--tg-btn-round-bg);
  transition:
    transform 0.18s ease,
    background-color 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease;
}

.bubble__reaction-chip--fresh {
  background: var(--tg-reaction-accent-bg);
  border-color: var(--tg-reaction-accent-border);
  color: var(--tg-reaction-accent-text);
  transform-origin: center;
  animation: bubble-reaction-fresh-shake 720ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.bubble__reaction-chip--removable {
  cursor: pointer;
}

.bubble__reaction-chip--removable:hover {
  transform: none;
  background: var(--tg-chip-hover-bg);
}

.bubble__reaction-emoji {
  font-size: 16px;
  line-height: 1;
}

@keyframes bubble-reaction-fresh-shake {
  0%,
  100% {
    transform: translateX(0) rotate(0deg);
  }

  15% {
    transform: translateX(-2px) rotate(-5deg);
  }

  30% {
    transform: translateX(2px) rotate(5deg);
  }

  45% {
    transform: translateX(-2px) rotate(-4deg);
  }

  60% {
    transform: translateX(2px) rotate(4deg);
  }

  75% {
    transform: translateX(-1px) rotate(-2deg);
  }
}

.bubble__deleted-message-dialog {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
}

.bubble__reply-preview-accent {
  flex: 0 0 3px;
  align-self: stretch;
  border-radius: 999px;
  background: var(--q-primary);
}

.bubble__reply-preview-copy {
  min-width: 0;
  flex: 1;
}

.bubble__reply-preview-title {
  font-size: 11px;
  font-weight: 700;
  line-height: 1.25;
  color: var(--q-primary);
}

.bubble__reply-preview-text {
  font-size: 11px;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--tg-text-secondary);
}

.bubble__meta {
  display: flex;
  align-items: center;
  align-self: flex-end;
  margin-left: auto;
  gap: 6px;
  padding-bottom: 2px;
  white-space: nowrap;
  position: relative;
  z-index: 1;
}

@media (max-width: 1023px) {
  .bubble-row,
  .bubble-stack,
  .bubble {
    --bubble-author-indent: 0px;
  }

  .bubble-row {
    width: auto;
    margin-bottom: 10px;
  }

  .bubble-stack {
    width: auto;
    max-width: min(82%, 560px);
  }

  .bubble-stack--mine {
    align-items: flex-end;
  }

  .bubble-stack--their {
    align-items: flex-start;
  }

  .bubble-row--mine {
    justify-content: flex-end;
  }

  .bubble-row--their {
    justify-content: flex-start;
  }

  .bubble {
    display: block;
    width: auto;
    max-width: 100%;
    border-radius: 16px;
    padding: 10px 36px 10px 12px;
    box-shadow: none;
  }

  .bubble::before {
    display: none;
  }

  .bubble--mine {
    background: var(--tg-sent);
    border-bottom-right-radius: 6px;
  }

  .bubble--their {
    background: var(--tg-received);
    border-bottom-left-radius: 6px;
  }

  .bubble__author {
    display: none;
  }

  .bubble-row--show-author-mobile .bubble__author {
    display: inline-flex;
    gap: 8px;
    margin-bottom: 6px;
  }

  .bubble-row--show-author-mobile .bubble__author-avatar {
    width: 28px;
    height: 28px;
    min-width: 28px;
    min-height: 28px;
    font-size: 12px;
  }

  .bubble-row--show-author-mobile .bubble__author-name {
    font-size: 12px;
  }

  .bubble__content {
    display: block;
    flex: none;
    margin-left: 0;
    max-width: none;
  }

  .bubble__reply-preview {
    padding: 6px 8px;
    border-radius: 12px;
    background: var(--tg-surface-soft-strong);
  }

  .bubble__reactions {
    flex: none;
    margin-top: -8px;
    padding-left: 0;
  }

  .bubble__meta {
    align-self: auto;
    justify-content: flex-end;
    margin-top: 4px;
    margin-left: 0;
    padding-bottom: 0;
  }
}

.bubble__time {
  font-size: 11px;
  color: var(--tg-text-secondary);
}

.bubble__status {
  display: inline-flex;
  align-items: center;
  width: 28px;
  height: 6px;
  border-radius: 999px;
  overflow: hidden;
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.08);
  cursor: pointer;
}

.bubble__status-hitbox {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  min-height: 16px;
  padding: 5px 0;
  margin: -5px 0;
  cursor: pointer;
}

.bubble__status--pending {
  animation: bubble-status-pulse 1.8s ease-in-out infinite;
  transform-origin: center;
}

.bubble__status-segment {
  display: block;
  height: 100%;
  min-width: 4px;
}

.bubble__status-segment--green {
  flex: 2 1 0;
  background: #16a34a;
}

.bubble__status-segment--blue {
  flex: 2 1 0;
  background: #2563eb;
}

.bubble__status-segment--gray {
  flex: 1 1 0;
  background: rgba(100, 116, 139, 0.5);
}

.bubble__status-segment--red {
  flex: 1 1 0;
  background: #dc2626;
}

.bubble__status-list {
  margin: 0;
  padding-left: 16px;
}

.bubble__status-section-title {
  font-size: 10px;
  font-weight: 700;
  margin-bottom: 4px;
}

.bubble__status-section-separator {
  height: 1px;
  margin: 7px 0;
  background: rgba(148, 163, 184, 0.2);
}

.bubble__status-list-item {
  font-size: 10px;
  line-height: 1.35;
}

.bubble__status-list--dialog {
  list-style: none;
  padding-left: 0;
}

.bubble__status-list-item--dialog {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 7px;
}

.bubble__status-list-item--dialog + .bubble__status-list-item--dialog {
  margin-top: 4px;
}

.bubble__status-list-item-main {
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 7px;
}

.bubble__status-list-copy {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.bubble__status-list-item--empty {
  list-style: none;
  color: var(--tg-text-secondary);
  opacity: 1;
  padding-left: 0;
}

.bubble__status-list-dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  margin-top: 3px;
  border-radius: 999px;
}

.bubble__status-list-dot--green {
  background: #16a34a;
}

.bubble__status-list-dot--blue {
  background: #2563eb;
}

.bubble__status-list-dot--red {
  background: #dc2626;
}

.bubble__status-list-dot--gray {
  background: rgba(100, 116, 139, 0.75);
}

.bubble__status-list-text {
  min-width: 0;
  word-break: break-word;
}

.bubble__status-list-detail {
  min-width: 0;
  color: var(--tg-text-secondary);
  word-break: break-word;
}

.bubble__status-retry {
  flex: 0 0 auto;
  min-height: 22px;
}

.bubble__status-empty {
  font-size: 12px;
  line-height: 1.45;
  color: var(--tg-text-secondary);
}

.bubble__info-dialog-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.bubble__info-dialog-title-text {
  min-width: 0;
  font-family: var(--tg-title-font);
  font-size: 17px;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: 0.02em;
  color: var(--tg-text);
}

.bubble__info-back {
  flex: 0 0 auto;
}

.bubble__info {
  display: grid;
  gap: 12px;
}

.bubble__info-row {
  display: grid;
  gap: 4px;
}

.bubble__info-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--tg-text-secondary);
  opacity: 1;
}

.bubble__info-value {
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word;
}

.bubble__info-value--mono {
  font-family: 'SFMono-Regular', 'Menlo', 'Consolas', monospace;
  font-size: 12px;
}

.bubble__info-json-button {
  justify-self: start;
  align-self: start;
}

.bubble__event-json-panel {
  display: grid;
}

.bubble__event-json {
  margin: 0;
  padding: 12px;
  border-radius: 16px;
  overflow: auto;
  max-height: min(56vh, 460px);
  background: var(--tg-surface-soft-strong);
  border: 1px solid var(--tg-border);
  font-family: 'SFMono-Regular', 'Menlo', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.bubble__event-json-empty {
  font-size: 14px;
  line-height: 1.5;
  color: var(--tg-text-secondary);
}

@media (hover: none) {
  .bubble__menu-trigger {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0);
  }
}

@keyframes bubble-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes bubble-status-pulse {
  0%,
  100% {
    opacity: 0.72;
    box-shadow:
      inset 0 0 0 1px rgba(15, 23, 42, 0.08),
      0 0 0 0 rgba(100, 116, 139, 0.08);
  }

  50% {
    opacity: 1;
    box-shadow:
      inset 0 0 0 1px rgba(15, 23, 42, 0.08),
      0 0 0 4px rgba(100, 116, 139, 0.18);
  }
}
</style>
