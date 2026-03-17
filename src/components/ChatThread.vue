<template>
  <div class="thread-root">
    <template v-if="chat">
      <div class="thread-header">
        <q-btn
          v-if="showBackButton"
          flat
          dense
          round
          icon="arrow_back"
          aria-label="Back"
          @click="handleBack"
        />
        <div class="thread-header__identity" @click="handleOpenProfile">
          <CachedAvatar
            :src="avatarImageUrl"
            :alt="chat.name"
            :fallback="chat.avatar"
            class="thread-header__avatar"
          />
          <div class="thread-header__meta">
            <div class="thread-header__name">{{ chat.name }}</div>
            <div class="thread-header__time">Last active {{ headerTime }}</div>
          </div>
        </div>
        <q-btn
          flat
          dense
          round
          icon="badge"
          aria-label="Open Profile"
          color="primary"
          class="thread-header__action"
          @click="handleOpenProfile"
        />
      </div>

      <div ref="threadBodyRef" class="thread-body" @scroll="handleThreadScroll">
        <div v-if="stickyDayLabel" class="thread-day-sticky" aria-hidden="true">
          <span class="thread-day-sticky__label">{{ stickyDayLabel }}</span>
        </div>
        <template v-for="item in threadItems" :key="item.key">
          <div v-if="item.type === 'separator'" class="thread-day-separator" aria-hidden="true">
            <span class="thread-day-separator__line" />
            <span class="thread-day-separator__label">{{ item.label }}</span>
            <span class="thread-day-separator__line" />
          </div>
          <div
            v-else-if="item.type === 'unread-separator'"
            class="thread-unread-separator"
            tabindex="-1"
            data-unread-separator="true"
          >
            <span class="thread-unread-separator__line" />
            <span class="thread-unread-separator__label">{{ item.label }}</span>
            <span class="thread-unread-separator__line" />
          </div>
          <div
            v-else
            class="thread-message-entry"
            :class="{
              'thread-message-entry--target':
                highlightedMessageId === item.message.id ||
                highlightedMessageId === item.message.eventId
            }"
            :data-day-key="item.dayKey"
            :data-day-label="item.dayLabel"
            :data-message-id="item.message.id"
            :data-message-event-id="item.message.eventId ?? ''"
          >
            <MessageBubble
              :message="item.message"
              :contact-name="chat.name"
              :contact-relay-urls="contactRelayUrls"
              @reply="handleReplyToMessage"
              @react="handleReactToMessage"
              @delete-message="handleDeleteMessage"
              @remove-reaction="handleRemoveReaction"
              @open-reply-target="handleOpenReplyTarget"
            />
          </div>
        </template>
      </div>

      <div class="thread-composer-anchor">
        <transition name="thread-scroll-jump">
          <div v-if="showJumpButtons" class="thread-jump-buttons">
            <q-btn
              v-if="showReactionJumpButton"
              flat
              dense
              aria-label="Jump to the first new reaction"
              class="thread-scroll-jump thread-scroll-jump--reaction"
              @click="handleReactionJump"
            >
              <span class="thread-reaction-jump__icon-shell" aria-hidden="true">
                <q-icon name="favorite" size="14px" class="thread-reaction-jump__icon" />
              </span>
              <span class="thread-reaction-jump__count">
                {{ formatReactionCount(unseenReactionCount) }}
              </span>
            </q-btn>

            <q-btn
              v-if="showScrollJumpButton"
              flat
              dense
              round
              icon="keyboard_double_arrow_down"
              aria-label="Jump to the latest messages"
              class="thread-scroll-jump"
              @click="handleScrollJump"
            />
          </div>
        </transition>

        <MessageComposer
          ref="composerRef"
          :chat-id="chat.id"
          :reply-to="activeReply"
          @send="handleSend"
          @cancel-reply="handleCancelReply"
        />
      </div>
    </template>

    <div v-else class="thread-empty" :class="{ 'thread-empty--loading': isInitializing }">
      <template v-if="isInitializing">
        <div class="thread-empty__progress">
          <q-linear-progress
            indeterminate
            rounded
            color="primary"
            track-color="grey-4"
          />
        </div>
        <div class="thread-empty__status">Restoring chats and messages...</div>
      </template>
      <template v-else>
        <div class="thread-empty__mark q-mb-md">...</div>
        <div>Select a chat to start messaging.</div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import MessageBubble from 'src/components/MessageBubble.vue';
import MessageComposer from 'src/components/MessageComposer.vue';
import CachedAvatar from 'src/components/CachedAvatar.vue';
import { contactsService } from 'src/services/contactsService';
import { useChatStore } from 'src/stores/chatStore';
import { useMessageStore } from 'src/stores/messageStore';
import { useNostrStore } from 'src/stores/nostrStore';
import type { Chat, Message, MessageReaction, MessageReplyPreview } from 'src/types/chat';
import { resolvePreferredContactRelayUrls } from 'src/utils/contactRelayUrls';
import {
  countUnseenReactionsForAuthor,
  normalizeMessageReactions
} from 'src/utils/messageReactions';
import { reportUiError } from 'src/utils/uiErrorHandler';

const props = withDefaults(
  defineProps<{
    chat: Chat | null;
    messages: Message[];
    isInitializing?: boolean;
    showBackButton?: boolean;
  }>(),
  {
    isInitializing: false,
    showBackButton: false
  }
);

const emit = defineEmits<{
  (event: 'send', payload: { text: string; replyTo: MessageReplyPreview | null }): void;
  (event: 'back'): void;
  (event: 'open-profile', publicKey: string): void;
  (event: 'react', payload: { message: Message; emoji: string }): void;
  (event: 'delete-message', message: Message): void;
  (event: 'remove-reaction', payload: { message: Message; reaction: MessageReaction }): void;
}>();

const threadBodyRef = ref<HTMLElement | null>(null);
const composerRef = ref<{ focusInputAtEnd: () => void } | null>(null);
const stickyDayLabel = ref('');
const activeReply = ref<MessageReplyPreview | null>(null);
const highlightedMessageId = ref<string | null>(null);
const chatStore = useChatStore();
const messageStore = useMessageStore();
const nostrStore = useNostrStore();
const isThreadScrolledUp = ref(false);
const lastReadMessageId = ref<string | null>(null);
const hasJumpedToLastReadMessage = ref(false);
const pendingInitialPositionChatId = ref<string | null>(null);
const openedUnreadBoundaryAt = ref<string | null>(null);
const contactRelayUrls = ref<string[]>([]);
let scrollFrameId: number | null = null;
let highlightTimerId: number | null = null;
let visibleReactionSyncFrameId: number | null = null;
let visibleReactionSyncPromise: Promise<void> = Promise.resolve();
let pendingSentMessageReveal = false;
const LAST_SEEN_RECEIVED_ACTIVITY_AT_META_KEY = 'last_seen_received_activity_at';

type ThreadItem =
  | {
      type: 'separator';
      key: string;
      label: string;
    }
  | {
      type: 'unread-separator';
      key: string;
      label: string;
    }
  | {
      type: 'message';
      key: string;
      dayKey: string;
      dayLabel: string;
      message: Message;
    };

const headerTime = computed(() => {
  if (!props.chat) {
    return '';
  }

  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    day: 'numeric'
  }).format(new Date(props.chat.lastMessageAt));
});

const avatarImageUrl = computed(() => {
  if (!props.chat) {
    return '';
  }

  const picture = props.chat.meta.picture;
  if (typeof picture === 'string' && picture.trim()) {
    return picture.trim();
  }

  return '';
});

const loggedInPublicKey = computed(() => {
  return nostrStore.getLoggedInPublicKeyHex()?.trim().toLowerCase() ?? '';
});

const latestMessageId = computed(() => {
  return props.messages[props.messages.length - 1]?.id ?? null;
});

const showScrollJumpButton = computed(() => {
  return Boolean(props.chat && props.messages.length > 0 && isThreadScrolledUp.value);
});

const unseenReactionMessages = computed(() => {
  return props.messages.filter((message) => {
    if (message.sender !== 'me') {
      return false;
    }

    return (
      countUnseenReactionsForAuthor(
        normalizeMessageReactions(message.meta.reactions),
        message.authorPublicKey
      ) > 0
    );
  });
});

const unseenReactionCount = computed(() => {
  return unseenReactionMessages.value.reduce((count, message) => {
    return (
      count +
      countUnseenReactionsForAuthor(
        normalizeMessageReactions(message.meta.reactions),
        message.authorPublicKey
      )
    );
  }, 0);
});

function formatReactionCount(value: number): string {
  return value > 99 ? '99+' : String(value);
}

const showReactionJumpButton = computed(() => unseenReactionCount.value > 0);

const showJumpButtons = computed(() => {
  return showReactionJumpButton.value || showScrollJumpButton.value;
});

const reactionVisibilitySignature = computed(() => {
  return props.messages
    .map((message) => {
      const unseenReactionCountForMessage =
        message.sender === 'me'
          ? countUnseenReactionsForAuthor(
              normalizeMessageReactions(message.meta.reactions),
              message.authorPublicKey
            )
          : 0;
      return `${message.id}:${unseenReactionCountForMessage}`;
    })
    .join('|');
});

function toComparableTimestamp(value: string | null | undefined): number {
  if (typeof value !== 'string' || !value.trim()) {
    return 0;
  }

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function readCurrentLastSeenReceivedActivityAt(): string {
  const rawValue = props.chat?.meta?.[LAST_SEEN_RECEIVED_ACTIVITY_AT_META_KEY];
  return typeof rawValue === 'string' ? rawValue.trim() : '';
}

function getIncomingMessageTimestampAfter(message: Message, afterTimestamp: string): number | null {
  const afterComparableTimestamp = toComparableTimestamp(afterTimestamp);
  if (message.sender !== 'them') {
    return null;
  }

  const messageTimestamp = toComparableTimestamp(message.sentAt);
  return messageTimestamp > afterComparableTimestamp ? messageTimestamp : null;
}

const firstMessageAfterUnreadBoundaryId = computed(() => {
  const openedUnreadBoundaryTimestamp = openedUnreadBoundaryAt.value;
  const currentLastSeenReceivedActivityAt = readCurrentLastSeenReceivedActivityAt();
  const afterTimestamp =
    toComparableTimestamp(currentLastSeenReceivedActivityAt) >
      toComparableTimestamp(openedUnreadBoundaryTimestamp)
      ? currentLastSeenReceivedActivityAt
      : openedUnreadBoundaryTimestamp;
  if (!afterTimestamp || props.messages.length === 0) {
    return null;
  }

  let firstMatch: {
    messageId: string;
    activityTimestamp: number;
    index: number;
  } | null = null;

  props.messages.forEach((message, index) => {
    const activityTimestamp = getIncomingMessageTimestampAfter(message, afterTimestamp);
    if (activityTimestamp === null) {
      return;
    }

    if (
      !firstMatch ||
      activityTimestamp < firstMatch.activityTimestamp ||
      (activityTimestamp === firstMatch.activityTimestamp && index < firstMatch.index)
    ) {
      firstMatch = {
        messageId: message.id,
        activityTimestamp,
        index
      };
    }
  });

  return firstMatch?.messageId ?? null;
});

function getDayKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDayLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const isCurrentYear = date.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'long',
    ...(isCurrentYear ? {} : { year: 'numeric' })
  }).format(date);
}

const threadItems = computed<ThreadItem[]>(() => {
  const items: ThreadItem[] = [];
  let lastDayKey = '';
  const unreadBoundaryMessageId = firstMessageAfterUnreadBoundaryId.value;

  for (const message of props.messages) {
    const dayKey = getDayKey(message.sentAt);
    const dayLabel = formatDayLabel(message.sentAt);
    if (dayKey !== lastDayKey) {
      items.push({
        type: 'separator',
        key: `separator-${dayKey}`,
        label: dayLabel
      });
      lastDayKey = dayKey;
    }

    if (unreadBoundaryMessageId && message.id === unreadBoundaryMessageId) {
      items.push({
        type: 'unread-separator',
        key: `unread-separator-${message.id}`,
        label: 'Unread Messages'
      });
    }

    items.push({
      type: 'message',
      key: message.id,
      dayKey,
      dayLabel,
      message
    });
  }

  return items;
});

let contactRelayRefreshToken = 0;

async function refreshContactRelayUrls(chatPublicKey: string | null): Promise<void> {
  const refreshToken = ++contactRelayRefreshToken;
  if (!chatPublicKey) {
    contactRelayUrls.value = [];
    return;
  }

  try {
    await contactsService.init();
    const contact = await contactsService.getContactByPublicKey(chatPublicKey);
    if (refreshToken !== contactRelayRefreshToken) {
      return;
    }

    contactRelayUrls.value = resolvePreferredContactRelayUrls(contact?.relays);
  } catch (error) {
    if (refreshToken !== contactRelayRefreshToken) {
      return;
    }

    contactRelayUrls.value = [];
    console.error('Failed to load contact relay urls for chat thread', chatPublicKey, error);
  }
}

async function scrollToBottom(): Promise<void> {
  await nextTick();

  const revealLatestMessage = (): void => {
    const threadBody = threadBodyRef.value;
    if (!threadBody) {
      return;
    }

    const latestMessage = latestMessageId.value;
    const latestEntry = latestMessage ? findThreadMessageEntry(latestMessage) : null;
    if (latestEntry) {
      const latestEntryTop = latestEntry.offsetTop;
      const latestEntryHeight = latestEntry.offsetHeight;
      const targetScrollTop = Math.max(
        0,
        latestEntryTop + latestEntryHeight - threadBody.clientHeight + 16
      );
      threadBody.scrollTop = targetScrollTop;
      return;
    }

    threadBody.scrollTop = threadBody.scrollHeight;
  };

  revealLatestMessage();
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      revealLatestMessage();
      resolve();
    });
  });

  isThreadScrolledUp.value = false;
  lastReadMessageId.value = latestMessageId.value;
  hasJumpedToLastReadMessage.value = false;
  updateStickyDayLabel();
  scheduleVisibleReactionViewSync();
}

function isThreadNearBottom(): boolean {
  const threadBody = threadBodyRef.value;
  if (!threadBody) {
    return true;
  }

  return threadBody.scrollHeight - (threadBody.scrollTop + threadBody.clientHeight) <= 72;
}

function updateScrollJumpState(): void {
  const latestMessage = latestMessageId.value;
  if (!latestMessage) {
    isThreadScrolledUp.value = false;
    lastReadMessageId.value = null;
    hasJumpedToLastReadMessage.value = false;
    return;
  }

  if (isThreadNearBottom()) {
    isThreadScrolledUp.value = false;
    lastReadMessageId.value = latestMessage;
    hasJumpedToLastReadMessage.value = false;
    return;
  }

  if (!isThreadScrolledUp.value) {
    lastReadMessageId.value = latestMessage;
    hasJumpedToLastReadMessage.value = false;
  }

  isThreadScrolledUp.value = true;
}

function updateStickyDayLabel(): void {
  const threadBody = threadBodyRef.value;
  if (!threadBody) {
    stickyDayLabel.value = '';
    return;
  }

  const threadRect = threadBody.getBoundingClientRect();
  const messageEntries = threadBody.querySelectorAll<HTMLElement>('.thread-message-entry');

  for (const entry of messageEntries) {
    const rect = entry.getBoundingClientRect();
    if (rect.bottom > threadRect.top) {
      stickyDayLabel.value = entry.dataset.dayLabel?.trim() ?? '';
      return;
    }
  }

  stickyDayLabel.value =
    messageEntries[messageEntries.length - 1]?.dataset.dayLabel?.trim() ?? '';
}

function handleThreadScroll(): void {
  if (scrollFrameId !== null) {
    cancelAnimationFrame(scrollFrameId);
  }

  scrollFrameId = window.requestAnimationFrame(() => {
    scrollFrameId = null;
    updateStickyDayLabel();
    updateScrollJumpState();
    scheduleVisibleReactionViewSync();
  });
}

function handleBack(): void {
  try {
    emit('back');
  } catch (error) {
    reportUiError('Failed to go back from chat thread', error);
  }
}

function handleSend(payload: { text: string }): void {
  try {
    pendingSentMessageReveal = true;
    emit('send', {
      text: payload.text,
      replyTo: activeReply.value
    });
    activeReply.value = null;
  } catch (error) {
    reportUiError('Failed to emit chat thread send event', error);
  }
}

function handleReplyToMessage(message: Message): void {
  try {
    activeReply.value = {
      messageId: message.id,
      text: message.text,
      sender: message.sender,
      authorName: message.sender === 'me' ? 'You' : props.chat?.name?.trim() || 'Contact',
      authorPublicKey: message.authorPublicKey,
      sentAt: message.sentAt,
      eventId: message.eventId
    };
    queueComposerFocus();
  } catch (error) {
    reportUiError('Failed to prepare reply target', error);
  }
}

function queueComposerFocus(): void {
  void nextTick(() => {
    window.setTimeout(() => {
      composerRef.value?.focusInputAtEnd();
    }, 0);
  });
}

function handleReactToMessage(payload: { message: Message; emoji: string }): void {
  try {
    emit('react', payload);
  } catch (error) {
    reportUiError('Failed to emit message reaction', error);
  }
}

function handleRemoveReaction(payload: {
  message: Message;
  reaction: MessageReaction;
}): void {
  try {
    emit('remove-reaction', payload);
  } catch (error) {
    reportUiError('Failed to emit message reaction removal', error);
  }
}

function handleDeleteMessage(message: Message): void {
  try {
    emit('delete-message', message);
  } catch (error) {
    reportUiError('Failed to emit message deletion', error);
  }
}

function handleCancelReply(): void {
  activeReply.value = null;
}

function clearReplyTargetHighlight(): void {
  highlightedMessageId.value = null;
  if (highlightTimerId !== null) {
    window.clearTimeout(highlightTimerId);
    highlightTimerId = null;
  }
}

function findThreadMessageEntry(targetId: string): HTMLElement | null {
  const threadBody = threadBodyRef.value;
  if (!threadBody) {
    return null;
  }

  return Array.from(threadBody.querySelectorAll<HTMLElement>('.thread-message-entry'))
    .find((entry) => {
      return (
        entry.dataset.messageId === targetId ||
        entry.dataset.messageEventId === targetId
      );
    }) ?? null;
}

function findUnreadSeparatorEntry(): HTMLElement | null {
  const threadBody = threadBodyRef.value;
  if (!threadBody) {
    return null;
  }

  return threadBody.querySelector<HTMLElement>('[data-unread-separator="true"]');
}

async function scrollToMessageEntry(
  targetId: string,
  block: ScrollLogicalPosition,
  behavior: ScrollBehavior = 'smooth'
): Promise<boolean> {
  await nextTick();

  const targetEntry = findThreadMessageEntry(targetId);
  if (!targetEntry) {
    return false;
  }

  targetEntry.scrollIntoView({
    behavior,
    block
  });

  return true;
}

async function scrollToUnreadSeparator(
  block: ScrollLogicalPosition,
  behavior: ScrollBehavior = 'smooth'
): Promise<boolean> {
  await nextTick();

  const separatorEntry = findUnreadSeparatorEntry();
  if (!separatorEntry) {
    return false;
  }

  separatorEntry.scrollIntoView({
    behavior,
    block
  });
  separatorEntry.focus({ preventScroll: true });
  return true;
}

function getClosestUnseenReactionMessageId(): string | null {
  const fallbackMessageId = unseenReactionMessages.value[0]?.id ?? null;
  const threadBody = threadBodyRef.value;

  if (!threadBody || unseenReactionMessages.value.length <= 1) {
    return fallbackMessageId;
  }

  const threadRect = threadBody.getBoundingClientRect();
  const viewportCenter = threadRect.top + threadRect.height / 2;
  let closestMatch: { messageId: string; distance: number; isVisible: boolean } | null = null;

  unseenReactionMessages.value.forEach((message) => {
    const entry = findThreadMessageEntry(message.id);
    if (!entry) {
      return;
    }

    const entryRect = entry.getBoundingClientRect();
    const entryCenter = entryRect.top + entryRect.height / 2;
    const distance = Math.abs(entryCenter - viewportCenter);
    const isVisible = isEntryVisibleWithinThread(entry);

    if (
      !closestMatch ||
      distance < closestMatch.distance ||
      (distance === closestMatch.distance && isVisible && !closestMatch.isVisible)
    ) {
      closestMatch = {
        messageId: message.id,
        distance,
        isVisible
      };
    }
  });

  return closestMatch?.messageId ?? fallbackMessageId;
}

async function initializeThreadPosition(): Promise<void> {
  const currentChatId = props.chat?.id ?? null;
  if (!currentChatId || pendingInitialPositionChatId.value !== currentChatId) {
    return;
  }

  if (props.messages.length === 0) {
    return;
  }

  if (firstMessageAfterUnreadBoundaryId.value && (await scrollToUnreadSeparator('center', 'auto'))) {
    isThreadScrolledUp.value = true;
    lastReadMessageId.value = firstMessageAfterUnreadBoundaryId.value;
    hasJumpedToLastReadMessage.value = true;
    updateStickyDayLabel();
    scheduleVisibleReactionViewSync();
    pendingInitialPositionChatId.value = null;
    return;
  }

  pendingInitialPositionChatId.value = null;
  await scrollToBottom();
}

function isEntryVisibleWithinThread(entry: HTMLElement): boolean {
  const threadBody = threadBodyRef.value;
  if (!threadBody) {
    return false;
  }

  const threadRect = threadBody.getBoundingClientRect();
  const entryRect = entry.getBoundingClientRect();

  return entryRect.bottom > threadRect.top && entryRect.top < threadRect.bottom;
}

function scheduleVisibleReactionViewSync(): void {
  if (visibleReactionSyncFrameId !== null) {
    cancelAnimationFrame(visibleReactionSyncFrameId);
  }

  visibleReactionSyncFrameId = window.requestAnimationFrame(() => {
    visibleReactionSyncFrameId = null;
    void syncVisibleReactionViews();
  });
}

async function syncVisibleReactionViews(): Promise<void> {
  const currentChatId = props.chat?.id ?? null;
  if (!currentChatId) {
    return;
  }
  const currentLastSeenReceivedActivityAt = readCurrentLastSeenReceivedActivityAt();

  const visibleMessages = props.messages.filter((message) => {
    const entry = findThreadMessageEntry(message.id);
    return entry ? isEntryVisibleWithinThread(entry) : false;
  });

  let latestVisibleReceivedActivity: {
    at: string;
    eventId: string | null;
  } | null = null;
  visibleMessages.forEach((message) => {
    if (message.sender === 'them') {
      if (
        !latestVisibleReceivedActivity ||
        toComparableTimestamp(message.sentAt) > toComparableTimestamp(latestVisibleReceivedActivity.at)
      ) {
        latestVisibleReceivedActivity = {
          at: message.sentAt,
          eventId: message.eventId ?? null
        };
      }
    }

    const normalizedAuthorPublicKey = message.authorPublicKey.trim().toLowerCase();
    normalizeMessageReactions(message.meta.reactions).forEach((reaction) => {
      const isIncomingReaction = loggedInPublicKey.value
        ? reaction.reactorPublicKey !== loggedInPublicKey.value
        : message.sender === 'me'
          ? reaction.reactorPublicKey !== normalizedAuthorPublicKey
          : reaction.reactorPublicKey === normalizedAuthorPublicKey;
      if (!isIncomingReaction || !reaction.createdAt) {
        return;
      }

      if (
        !latestVisibleReceivedActivity ||
        toComparableTimestamp(reaction.createdAt) >
          toComparableTimestamp(latestVisibleReceivedActivity.at)
      ) {
        latestVisibleReceivedActivity = {
          at: reaction.createdAt,
          eventId: reaction.eventId ?? null
        };
      }
    });
  });

  if (latestVisibleReceivedActivity) {
    const latestVisibleActivityTimestamp = toComparableTimestamp(latestVisibleReceivedActivity.at);
    const currentLastSeenTimestamp = toComparableTimestamp(currentLastSeenReceivedActivityAt);
    const effectiveLastSeenReceivedActivityAt =
      latestVisibleActivityTimestamp > currentLastSeenTimestamp
        ? latestVisibleReceivedActivity.at
        : currentLastSeenReceivedActivityAt;

    if (latestVisibleActivityTimestamp > currentLastSeenTimestamp) {
      await chatStore.setLastSeenReceivedActivityAt(currentChatId, latestVisibleReceivedActivity.at);
      nostrStore.scheduleContactCursorPublish(currentChatId, latestVisibleReceivedActivity);
    }

    const nextUnreadMessageCount = props.messages.reduce((count, message) => {
      if (
        message.sender !== 'them' ||
        toComparableTimestamp(message.sentAt) <=
          toComparableTimestamp(effectiveLastSeenReceivedActivityAt)
      ) {
        return count;
      }

      return count + 1;
    }, 0);

    if (nextUnreadMessageCount !== (props.chat?.unreadCount ?? 0)) {
      await chatStore.setUnreadCount(currentChatId, nextUnreadMessageCount);
    }
  }

  if (unseenReactionMessages.value.length === 0) {
    return;
  }

  const visibleMessageIds = unseenReactionMessages.value
    .filter((message) => {
      const entry = findThreadMessageEntry(message.id);
      return entry ? isEntryVisibleWithinThread(entry) : false;
    })
    .map((message) => message.id);

  if (visibleMessageIds.length === 0) {
    return;
  }

  visibleReactionSyncPromise = visibleReactionSyncPromise
    .catch(() => undefined)
    .then(async () => {
      await messageStore.markMessagesReactionsViewed(currentChatId, visibleMessageIds);
    });

  await visibleReactionSyncPromise;
}

async function handleScrollJump(): Promise<void> {
  try {
    if (!props.messages.length) {
      return;
    }

    if (!hasJumpedToLastReadMessage.value && lastReadMessageId.value) {
      const didScrollToLastReadMessage = await scrollToMessageEntry(lastReadMessageId.value, 'start');
      if (didScrollToLastReadMessage) {
        hasJumpedToLastReadMessage.value = true;
        return;
      }
    }

    hasJumpedToLastReadMessage.value = false;
    await scrollToBottom();
  } catch (error) {
    reportUiError('Failed to jump to the latest messages', error);
  }
}

async function handleReactionJump(): Promise<void> {
  try {
    const closestUnseenReactionMessageId = getClosestUnseenReactionMessageId();
    if (!closestUnseenReactionMessageId) {
      return;
    }

    await scrollToMessageEntry(closestUnseenReactionMessageId, 'center');
    window.setTimeout(() => {
      scheduleVisibleReactionViewSync();
    }, 220);
  } catch (error) {
    reportUiError('Failed to jump to the closest new reaction', error);
  }
}

async function handleOpenReplyTarget(messageId: string): Promise<void> {
  try {
    const targetEntry = findThreadMessageEntry(messageId);
    if (!targetEntry) {
      return;
    }

    clearReplyTargetHighlight();
    highlightedMessageId.value = messageId;
    targetEntry.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });

    highlightTimerId = window.setTimeout(() => {
      if (highlightedMessageId.value === messageId) {
        highlightedMessageId.value = null;
      }
      highlightTimerId = null;
    }, 1800);
  } catch (error) {
    reportUiError('Failed to focus replied message', error);
  }
}

function handleOpenProfile(): void {
  try {
    if (!props.chat?.publicKey) {
      return;
    }

    emit('open-profile', props.chat.publicKey);
  } catch (error) {
    reportUiError('Failed to open profile from chat thread', error);
  }
}

watch(
  () => [props.chat?.id ?? null, nostrStore.contactListVersion] as const,
  ([chatId]) => {
    void refreshContactRelayUrls(chatId);
  },
  { immediate: true }
);

watch(
  () => props.chat?.id ?? null,
  (chatId) => {
    activeReply.value = null;
    clearReplyTargetHighlight();
    pendingSentMessageReveal = false;
    pendingInitialPositionChatId.value = chatId;
    openedUnreadBoundaryAt.value =
      chatId && props.chat
        ? typeof props.chat.meta[LAST_SEEN_RECEIVED_ACTIVITY_AT_META_KEY] === 'string' &&
          props.chat.meta[LAST_SEEN_RECEIVED_ACTIVITY_AT_META_KEY].trim()
          ? String(props.chat.meta[LAST_SEEN_RECEIVED_ACTIVITY_AT_META_KEY]).trim()
          : null
        : null;
    lastReadMessageId.value = null;
    hasJumpedToLastReadMessage.value = false;
    isThreadScrolledUp.value = false;

    if (!chatId) {
      pendingInitialPositionChatId.value = null;
      void scrollToBottom();
      return;
    }

    void initializeThreadPosition();
  },
  { immediate: true }
);

watch(
  () => props.messages.length,
  (nextLength, previousLength) => {
    if (pendingInitialPositionChatId.value === (props.chat?.id ?? null)) {
      void initializeThreadPosition();
      return;
    }

    if (nextLength === previousLength) {
      return;
    }

    if (pendingSentMessageReveal) {
      pendingSentMessageReveal = false;
      void scrollToBottom();
      return;
    }

    const shouldStickToBottom = isThreadNearBottom();

    if (shouldStickToBottom) {
      void scrollToBottom();
      return;
    }

    void nextTick(() => {
      updateStickyDayLabel();
      updateScrollJumpState();
      scheduleVisibleReactionViewSync();
    });
  }
);

watch(
  reactionVisibilitySignature,
  () => {
    scheduleVisibleReactionViewSync();
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  clearReplyTargetHighlight();
  if (scrollFrameId !== null) {
    cancelAnimationFrame(scrollFrameId);
  }
  if (visibleReactionSyncFrameId !== null) {
    cancelAnimationFrame(visibleReactionSyncFrameId);
  }
});
</script>

<style scoped>
.thread-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  min-width: 0;
  width: 100%;
  overflow: hidden;
  background: transparent;
}

.thread-header {
  position: sticky;
  top: 0;
  z-index: 6;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--tg-border);
  background: var(--tg-panel-header-bg);
  backdrop-filter: blur(var(--tg-glass-blur));
}

.thread-header__identity {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
  cursor: pointer;
}

.thread-header__meta {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.thread-header__name {
  font-weight: 600;
}

.thread-header__time {
  font-size: 12px;
  opacity: 0.65;
}

.thread-header__action {
  color: #64748b;
}

.thread-body {
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 14px;
  position: relative;
}

.thread-composer-anchor {
  position: sticky;
  bottom: 0;
  z-index: 6;
  flex: 0 0 auto;
}

.thread-jump-buttons {
  position: absolute;
  right: 18px;
  bottom: 72px;
  z-index: 4;
  display: flex;
  align-items: center;
  gap: 8px;
}

.q-btn.thread-scroll-jump {
  background: color-mix(in srgb, var(--tg-sidebar) 92%, #eef6ff 8%) !important;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.5),
    0 10px 24px rgba(15, 56, 104, 0.16) !important;
  border: 1px solid color-mix(in srgb, var(--tg-border) 84%, #8ea5c1 16%);
  color: color-mix(in srgb, var(--q-primary) 80%, #0f5ea9 20%);
}

.q-btn.thread-scroll-jump::before {
  border-color: transparent !important;
}

.q-btn.thread-scroll-jump:hover {
  background: color-mix(in srgb, var(--tg-sidebar) 86%, #dcecff 14%) !important;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.58),
    0 12px 28px rgba(15, 56, 104, 0.18) !important;
  transform: translateY(-1px);
}

.q-btn.thread-scroll-jump--reaction {
  min-height: 36px;
  padding: 0 12px 0 6px;
  border-radius: 999px;
  background: var(--tg-reaction-accent-bg) !important;
  border-color: var(--tg-reaction-accent-border);
  box-shadow: var(--tg-reaction-accent-shadow) !important;
  color: var(--tg-reaction-accent-text);
}

.q-btn.thread-scroll-jump--reaction .q-btn__content {
  gap: 6px;
}

.q-btn.thread-scroll-jump--reaction:hover {
  background: var(--tg-reaction-accent-bg-hover) !important;
  box-shadow: var(--tg-reaction-accent-shadow-hover) !important;
}

.thread-reaction-jump__icon-shell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: var(--tg-reaction-accent-icon-bg);
  box-shadow: var(--tg-reaction-accent-icon-shadow);
}

.thread-reaction-jump__icon {
  color: #ffffff;
}

.thread-reaction-jump__count {
  display: inline-block;
  min-width: 1.4em;
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0;
  font-variant-numeric: tabular-nums;
}

.thread-scroll-jump-enter-active,
.thread-scroll-jump-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.thread-scroll-jump-enter-from,
.thread-scroll-jump-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

body.body--dark .q-btn.thread-scroll-jump {
  background: color-mix(in srgb, var(--tg-sidebar) 90%, #22344c 10%) !important;
  border-color: color-mix(in srgb, var(--tg-border) 84%, #6f88a8 16%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 14px 28px rgba(0, 0, 0, 0.28) !important;
  color: #9ed0ff;
}

body.body--dark .q-btn.thread-scroll-jump:hover {
  background: color-mix(in srgb, var(--tg-sidebar) 82%, #27446a 18%) !important;
}


.thread-day-sticky {
  position: sticky;
  top: 0;
  z-index: 3;
  display: flex;
  justify-content: center;
  padding: 2px 0 8px;
  pointer-events: none;
}

.thread-day-sticky__label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 4px 12px;
  border-radius: 999px;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--tg-sidebar) 94%, #dbe8ff 6%),
      color-mix(in srgb, var(--tg-sidebar) 98%, #ffffff 2%)
    );
  border: 1px solid color-mix(in srgb, var(--tg-border) 84%, #8ca3bf 16%);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.14);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: color-mix(in srgb, var(--q-primary) 40%, var(--tg-text) 60%);
  backdrop-filter: blur(var(--tg-glass-blur));
}

.thread-day-separator {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 14px 0 12px;
}

.thread-day-separator__line {
  flex: 1;
  height: 1px;
  background: color-mix(in srgb, var(--tg-border) 76%, transparent);
}

.thread-day-separator__label {
  flex: 0 0 auto;
  padding: 4px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--tg-sidebar) 72%, transparent);
  border: 1px solid color-mix(in srgb, var(--tg-border) 70%, transparent);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: color-mix(in srgb, var(--q-primary) 45%, var(--tg-text) 55%);
  white-space: nowrap;
}

.thread-unread-separator {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 18px 0 14px;
  outline: none;
}

.thread-unread-separator__line {
  flex: 1;
  height: 1px;
  background: color-mix(in srgb, var(--q-primary) 34%, var(--tg-border) 66%);
}

.thread-unread-separator__label {
  flex: 0 0 auto;
  padding: 5px 12px;
  border-radius: 999px;
  background: var(--tg-reaction-accent-bg);
  border: 1px solid var(--tg-reaction-accent-border);
  box-shadow: var(--tg-reaction-accent-shadow-soft);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--tg-reaction-accent-text);
  white-space: nowrap;
}

.thread-unread-separator:focus-visible .thread-unread-separator__label,
.thread-unread-separator:focus .thread-unread-separator__label {
  box-shadow:
    var(--tg-reaction-accent-shadow-soft),
    0 0 0 2px color-mix(in srgb, var(--q-primary) 24%, transparent);
}

.thread-message-entry {
  scroll-margin-top: 88px;
  scroll-margin-bottom: 16px;
}

.thread-message-entry--target :deep(.bubble) {
  animation: thread-message-target 1.8s ease;
}

@keyframes thread-message-target {
  0% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--q-primary) 42%, transparent);
  }

  30% {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--q-primary) 42%, transparent);
  }

  100% {
    box-shadow: 0 0 0 0 transparent;
  }
}

.thread-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 100%;
  padding: 24px;
  text-align: center;
  opacity: 0.7;
}

.thread-empty--loading {
  opacity: 1;
}

.thread-empty__mark {
  font-size: 48px;
  line-height: 1;
}

.thread-empty__progress {
  width: min(220px, 72%);
}

.thread-empty__status {
  font-weight: 600;
  color: color-mix(in srgb, var(--q-primary) 55%, currentColor 45%);
}
</style>
