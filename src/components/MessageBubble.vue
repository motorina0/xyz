<template>
  <div class="bubble-row" :class="isMine ? 'bubble-row--mine' : 'bubble-row--their'">
    <div class="bubble-stack" :class="isMine ? 'bubble-stack--mine' : 'bubble-stack--their'">
      <div
        class="bubble"
        :class="isMine ? 'bubble--mine' : 'bubble--their'"
      >
      <q-btn
        flat
        dense
        round
        size="sm"
        icon="more_horiz"
        aria-label="Open message actions"
        class="bubble__menu-trigger"
        @click.stop="openActionMenu"
      />

      <q-menu
        v-model="isActionMenuOpen"
        anchor="bottom right"
        self="top right"
        class="tg-pop-menu"
        :transition-duration="0"
        @before-hide="handleActionMenuHide"
      >
        <div class="bubble__menu-stack">
          <q-list dense class="tg-pop-menu__list bubble__actions-list">
            <q-item clickable v-close-popup @click="handleReply">
              <q-item-section avatar>
                <q-icon name="reply" />
              </q-item-section>
              <q-item-section>Reply</q-item-section>
            </q-item>
            <q-item clickable v-close-popup @click="handleForward">
              <q-item-section avatar>
                <q-icon name="forward" />
              </q-item-section>
              <q-item-section>Forward</q-item-section>
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
              <q-item-section>Info</q-item-section>
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
        v-model="isEmojiPickerMenuOpen"
        anchor="bottom right"
        self="top right"
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

      <div class="bubble__content" @click.stop="handleBubbleTap">
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

  <AppDialog
    v-if="hasRelayStatuses"
    v-model="isStatusDialogOpen"
    :title="statusDialogTitle"
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
    title="Message Info"
    max-width="460px"
  >
    <div class="bubble__info">
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
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import AppDialog from 'src/components/AppDialog.vue';
import AppTooltip from 'src/components/AppTooltip.vue';
import EmojiPickerPanel from 'src/components/EmojiPickerPanel.vue';
import { getEmojiEntryByValue, type EmojiOption } from 'src/data/topEmojis';
import type {
  DeletedMessageMetadata,
  Message,
  MessageReaction,
  MessageRelayStatus,
  MessageReplyPreview
} from 'src/types/chat';
import { useNostrStore } from 'src/stores/nostrStore';
import { isReactionUnseenForAuthor } from 'src/utils/messageReactions';
import { isMessageRelayStatus } from 'src/utils/messageRelayStatus';
import { reportUiError } from 'src/utils/uiErrorHandler';

const props = defineProps<{
  message: Message;
  contactName?: string;
  contactRelayUrls?: string[];
}>();

const emit = defineEmits<{
  (event: 'reply', message: Message): void;
  (event: 'open-reply-target', messageId: string): void;
  (event: 'react', payload: { message: Message; emoji: string }): void;
  (event: 'delete-message', message: Message): void;
  (event: 'remove-reaction', payload: { message: Message; reaction: MessageReaction }): void;
}>();

const $q = useQuasar();
const nostrStore = useNostrStore();
const isMine = computed(() => props.message.sender === 'me');
const loggedInPublicKey = computed(() => nostrStore.getLoggedInPublicKeyHex()?.toLowerCase() ?? '');
const isActionMenuOpen = ref(false);
const isEmojiPickerMenuOpen = ref(false);
const isInfoDialogOpen = ref(false);
const isDeletedMessageDialogOpen = ref(false);
const shouldOpenEmojiPickerAfterActionMenu = ref(false);
const emojiPickerRef = ref<{ reset: () => void } | null>(null);

interface StatusSegment {
  key: 'published' | 'pending' | 'failed' | 'received' | 'missing';
  className: string;
  weight: number;
}

type RetryableStatusScope = 'recipient' | 'self';
type StatusListScope = MessageRelayStatus['scope'] | 'derived';

interface StatusListItem {
  key: string;
  relayUrl: string;
  detail?: string;
  dotClass: string;
  scope: StatusListScope;
  status: StatusSegment['key'];
  retryable: boolean;
}

interface StatusSection {
  key: string;
  title: string;
  items: StatusListItem[];
  emptyLabel: string;
}

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

function formatRelayStatusItem(relayStatus: Pick<MessageRelayStatus, 'relay_url'>): string {
  return relayStatus.relay_url;
}

function getStatusSegmentClassName(status: StatusSegment['key']): string {
  switch (status) {
    case 'published':
    case 'received':
      return 'bubble__status-segment--green';
    case 'failed':
      return 'bubble__status-segment--red';
    case 'pending':
    case 'missing':
    default:
      return 'bubble__status-segment--gray';
  }
}

function getStatusDotClassName(status: StatusListItem['status']): string {
  switch (status) {
    case 'published':
    case 'received':
      return 'bubble__status-list-dot--green';
    case 'failed':
      return 'bubble__status-list-dot--red';
    case 'pending':
    case 'missing':
    default:
      return 'bubble__status-list-dot--gray';
  }
}

function isRetryableStatusScope(scope: StatusListScope): scope is RetryableStatusScope {
  return scope === 'recipient' || scope === 'self';
}

const relayStatuses = computed(() => {
  const relayStatuses = props.message.nostrEvent?.relay_statuses;
  if (!Array.isArray(relayStatuses)) {
    return [] as MessageRelayStatus[];
  }

  return relayStatuses
    .filter(isMessageRelayStatus)
    .sort((first, second) => {
      const byRelayUrl = first.relay_url.localeCompare(second.relay_url);
      if (byRelayUrl !== 0) {
        return byRelayUrl;
      }

      const byDirection = first.direction.localeCompare(second.direction);
      if (byDirection !== 0) {
        return byDirection;
      }

      return first.scope.localeCompare(second.scope);
    });
});

const outboundRelayStatuses = computed(() => {
  return relayStatuses.value.filter((relayStatus) => relayStatus.direction === 'outbound');
});

const inboundReceivedRelayStatuses = computed(() => {
  return relayStatuses.value.filter(
    (
      relayStatus
    ): relayStatus is MessageRelayStatus & {
      direction: 'inbound';
      status: 'received';
    } => relayStatus.direction === 'inbound' && relayStatus.status === 'received'
  );
});

const normalizedContactRelayUrls = computed(() => {
  const uniqueRelayUrls = new Set<string>();
  const relayUrls = Array.isArray(props.contactRelayUrls) ? props.contactRelayUrls : [];

  for (const relayUrl of relayUrls) {
    const normalizedRelayUrl = typeof relayUrl === 'string' ? relayUrl.trim() : '';
    if (!normalizedRelayUrl) {
      continue;
    }

    uniqueRelayUrls.add(normalizedRelayUrl);
  }

  return Array.from(uniqueRelayUrls);
});

const inboundReceivedRelayUrls = computed(() => {
  const uniqueRelayUrls = new Set<string>();

  for (const relayStatus of inboundReceivedRelayStatuses.value) {
    const relayUrl = formatRelayStatusItem(relayStatus).trim();
    if (!relayUrl) {
      continue;
    }

    uniqueRelayUrls.add(relayUrl);
  }

  return Array.from(uniqueRelayUrls).sort((first, second) => first.localeCompare(second));
});

const inboundReceivedRelayUrlSet = computed(() => {
  return new Set(inboundReceivedRelayUrls.value);
});

const inboundMissingRelayUrls = computed(() => {
  return normalizedContactRelayUrls.value.filter(
    (relayUrl) => !inboundReceivedRelayUrlSet.value.has(relayUrl)
  );
});

const hasPendingRelayStatuses = computed(() => {
  return outboundRelayStatuses.value.some((relayStatus) => relayStatus.status === 'pending');
});

const hasRelayStatuses = computed(() => {
  return isMine.value
    ? outboundRelayStatuses.value.length > 0
    : inboundReceivedRelayUrls.value.length > 0;
});

const contactRelaysTitle = computed(() => {
  const label = props.contactName?.trim();
  return `${label || 'Contact'} Relays`;
});

const statusDialogTitle = computed(() => {
  return isMine.value ? 'Relay Status' : 'Received Relay Status';
});

const isStatusDialogOpen = ref(false);
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

const statusSegments = computed<StatusSegment[]>(() => {
  if (!isMine.value) {
    return [
      {
        key: 'received',
        className: getStatusSegmentClassName('received'),
        weight: inboundReceivedRelayUrls.value.length
      },
      {
        key: 'missing',
        className: getStatusSegmentClassName('missing'),
        weight: inboundMissingRelayUrls.value.length
      }
    ].filter((segment) => segment.weight > 0);
  }

  const relayStatuses = outboundRelayStatuses.value;
  function countByStatus(status: MessageRelayStatus['status']) {
    return relayStatuses.filter((relayStatus) => relayStatus.status === status).length;
  }

  const published = countByStatus('published');
  const pending = countByStatus('pending');
  const failed = countByStatus('failed');

  return [
    {
      key: 'published',
      className: getStatusSegmentClassName('published'),
      weight: published
    },
    {
      key: 'pending',
      className: getStatusSegmentClassName('pending'),
      weight: pending
    },
    {
      key: 'failed',
      className: getStatusSegmentClassName('failed'),
      weight: failed
    }
  ].filter((segment) => segment.weight > 0);
});

function buildStatusListItems(
  relayStatuses: MessageRelayStatus[],
  predicate: (relayStatus: MessageRelayStatus) => boolean
): StatusListItem[] {
  const statusPriority: Record<'published' | 'failed' | 'pending', number> = {
    published: 0,
    failed: 1,
    pending: 2
  };

  return relayStatuses
    .filter(
      (
        relayStatus
      ): relayStatus is MessageRelayStatus & {
        status: 'published' | 'failed' | 'pending';
      } =>
        predicate(relayStatus) &&
        (relayStatus.status === 'published' ||
          relayStatus.status === 'failed' ||
          relayStatus.status === 'pending')
    )
    .slice()
    .sort((first, second) => {
      const byStatus = statusPriority[first.status] - statusPriority[second.status];
      if (byStatus !== 0) {
        return byStatus;
      }

      return first.relay_url.localeCompare(second.relay_url);
    })
    .map((relayStatus) => ({
      key: `${relayStatus.status}-${relayStatus.scope}-${relayStatus.relay_url}`,
      relayUrl: formatRelayStatusItem(relayStatus),
      detail: relayStatus.detail,
      dotClass: getStatusDotClassName(relayStatus.status),
      scope: relayStatus.scope,
      status: relayStatus.status,
      retryable: relayStatus.status === 'failed'
    }));
}

const contactStatusListItems = computed<StatusListItem[]>(() => {
  return buildStatusListItems(
    outboundRelayStatuses.value,
    (relayStatus) => relayStatus.scope === 'recipient'
  );
});

const myRelaysTitle = 'My Relays (message backup)';

const myStatusListItems = computed<StatusListItem[]>(() => {
  return buildStatusListItems(
    outboundRelayStatuses.value,
    (relayStatus) => relayStatus.scope === 'self'
  );
});

const inboundContactStatusListItems = computed<StatusListItem[]>(() => {
  const receivedRelayUrlSet = inboundReceivedRelayUrlSet.value;

  return normalizedContactRelayUrls.value.map((relayUrl) => {
    const status: StatusListItem['status'] = receivedRelayUrlSet.has(relayUrl)
      ? 'received'
      : 'missing';

    return {
      key: `${status}-contact-${relayUrl}`,
      relayUrl,
      detail:
        status === 'missing' ? 'This message was not received from this relay.' : undefined,
      dotClass: getStatusDotClassName(status),
      scope: 'derived',
      status,
      retryable: false
    };
  });
});

const inboundReceivedStatusListItems = computed<StatusListItem[]>(() => {
  return inboundReceivedRelayUrls.value.map((relayUrl) => ({
    key: `received-${relayUrl}`,
    relayUrl,
    dotClass: getStatusDotClassName('received'),
    scope: 'subscription',
    status: 'received',
    retryable: false
  }));
});

const inboundExtraReceivedStatusListItems = computed<StatusListItem[]>(() => {
  const contactRelayUrlSet = new Set(normalizedContactRelayUrls.value);

  return inboundReceivedRelayUrls.value
    .filter((relayUrl) => !contactRelayUrlSet.has(relayUrl))
    .map((relayUrl) => ({
      key: `received-extra-${relayUrl}`,
      relayUrl,
      detail: 'Received from a relay outside the contact relay list.',
      dotClass: getStatusDotClassName('received'),
      scope: 'subscription',
      status: 'received',
      retryable: false
    }));
});

const statusSections = computed<StatusSection[]>(() => {
  if (isMine.value) {
    return [
      {
        key: 'recipient',
        title: contactRelaysTitle.value,
        items: contactStatusListItems.value,
        emptyLabel: 'No relays'
      },
      {
        key: 'self',
        title: myRelaysTitle,
        items: myStatusListItems.value,
        emptyLabel: 'No relays'
      }
    ];
  }

  if (normalizedContactRelayUrls.value.length > 0) {
    const sections: StatusSection[] = [
      {
        key: 'contact',
        title: contactRelaysTitle.value,
        items: inboundContactStatusListItems.value,
        emptyLabel: 'No relays'
      }
    ];

    if (inboundExtraReceivedStatusListItems.value.length > 0) {
      sections.push({
        key: 'extra-received',
        title: 'Other Received Relays',
        items: inboundExtraReceivedStatusListItems.value,
        emptyLabel: 'No relays'
      });
    }

    return sections;
  }

  return inboundReceivedStatusListItems.value.length > 0
    ? [
        {
          key: 'received',
          title: 'Received From',
          items: inboundReceivedStatusListItems.value,
          emptyLabel: 'No relays'
        }
      ]
    : [];
});

function openStatusDialog(): void {
  if (!hasRelayStatuses.value) {
    return;
  }

  isStatusDialogOpen.value = true;
}

function canUseTapToOpenMenu(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  return window.matchMedia('(hover: none), (pointer: coarse)').matches;
}

function openActionMenu(): void {
  shouldOpenEmojiPickerAfterActionMenu.value = false;
  isEmojiPickerMenuOpen.value = false;
  isActionMenuOpen.value = true;
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
  isEmojiPickerMenuOpen.value = true;
}

function handleEmojiPickerMenuShow(): void {
  void nextTick(() => {
    emojiPickerRef.value?.reset();
  });
}

function handleBubbleTap(): void {
  if (!canUseTapToOpenMenu()) {
    return;
  }

  openActionMenu();
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

function handleOpenReplyTarget(): void {
  if (!replyPreview.value) {
    return;
  }

  emit('open-reply-target', replyPreview.value.messageId);
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

function handleForward(): void {
  notifyUnimplemented('Forward');
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
  isInfoDialogOpen.value = true;
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

onBeforeUnmount(() => {
  freshReactionTimers.forEach((timerId) => {
    clearTimeout(timerId);
  });
  freshReactionTimers.clear();
});
</script>

<style scoped>
.bubble-row {
  display: flex;
  margin-bottom: 10px;
}

.bubble-stack {
  display: flex;
  flex-direction: column;
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
  position: relative;
  max-width: 100%;
  border-radius: 16px;
  padding: 10px 36px 10px 12px;
  box-shadow: 0 3px 10px rgba(15, 23, 42, 0.08);
  animation: bubble-in 180ms ease both;
}

.q-btn.bubble__menu-trigger {
  position: absolute;
  top: 6px;
  right: 6px;
  color: color-mix(in srgb, currentColor 68%, #64748b 32%);
  background: transparent !important;
  box-shadow: none !important;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-2px);
  transition:
    opacity 0.18s ease,
    transform 0.18s ease,
    color 0.18s ease;
  border-radius: 999px;
}

.q-btn.bubble__menu-trigger::before {
  border-color: transparent !important;
}

.q-btn.bubble__menu-trigger:hover {
  background: transparent !important;
  box-shadow: none !important;
}

.bubble-row:hover .bubble__menu-trigger,
.bubble-row:focus-within .bubble__menu-trigger {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

@media (hover: none), (pointer: coarse) {
  .bubble__menu-trigger {
    display: none;
  }
}

.bubble--mine {
  background: var(--tg-sent);
  border-bottom-right-radius: 6px;
}

.bubble--their {
  background: var(--tg-received);
  border-bottom-left-radius: 6px;
}

.bubble__text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  cursor: pointer;
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
  min-width: 0;
}

.bubble__reply-preview {
  display: flex;
  width: 100%;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 8px;
  padding: 6px 8px;
  border: 0;
  border-radius: 12px;
  color: inherit;
  text-align: left;
  background: color-mix(in srgb, currentColor 7%, transparent);
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
  background: color-mix(in srgb, var(--tg-sidebar) 86%, transparent);
  border: 1px solid color-mix(in srgb, var(--tg-border) 88%, transparent);
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
  transform: translateY(-1px);
  color: var(--q-primary);
  opacity: 1;
}

.bubble__quick-reaction:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--q-primary) 54%, transparent);
  outline-offset: 2px;
}

.bubble__quick-reaction--more {
  color: color-mix(in srgb, currentColor 76%, #5b6f86 24%);
  font-size: 0;
}

.bubble__reactions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: -8px;
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
  box-shadow: var(--tg-btn-soft-shadow);
  transition:
    transform 0.18s ease,
    background-color 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    color 0.18s ease;
}

.bubble__reaction-chip--fresh {
  background: var(--tg-reaction-accent-bg);
  border-color: var(--tg-reaction-accent-border);
  box-shadow: var(--tg-reaction-accent-shadow);
  color: var(--tg-reaction-accent-text);
  transform-origin: center;
  animation: bubble-reaction-fresh-shake 720ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.bubble__reaction-chip--removable {
  cursor: pointer;
}

.bubble__reaction-chip--removable:hover {
  transform: translateY(-1px);
  background: color-mix(in srgb, var(--q-primary) 16%, var(--tg-sidebar) 84%);
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
  opacity: 0.82;
}

.bubble__meta {
  margin-top: 4px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

.bubble__time {
  font-size: 11px;
  opacity: 0.65;
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
  opacity: 0.72;
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
  color: rgba(100, 116, 139, 0.95);
  word-break: break-word;
}

.bubble__status-retry {
  flex: 0 0 auto;
  min-height: 22px;
}

.bubble__status-empty {
  font-size: 12px;
  line-height: 1.45;
  opacity: 0.72;
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
  opacity: 0.72;
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
