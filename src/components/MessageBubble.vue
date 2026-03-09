<template>
  <div class="bubble-row" :class="isMine ? 'bubble-row--mine' : 'bubble-row--their'">
    <div
      class="bubble"
      :class="isMine ? 'bubble--mine' : 'bubble--their'"
      @click="handleBubbleTap"
    >
      <q-btn
        flat
        dense
        round
        size="sm"
        icon="arrow_drop_down"
        aria-label="Open message actions"
        class="bubble__menu-trigger"
        @click.stop="openActionMenu"
      />

      <q-menu
        v-model="isActionMenuOpen"
        anchor="bottom right"
        self="top right"
        class="tg-pop-menu"
      >
        <q-list dense separator class="tg-pop-menu__list">
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
          <q-item clickable v-close-popup @click="handleDelete">
            <q-item-section avatar>
              <q-icon name="delete" class="text-negative" />
            </q-item-section>
            <q-item-section class="text-negative">Delete</q-item-section>
          </q-item>
        </q-list>
      </q-menu>

      <p class="bubble__text">{{ message.text }}</p>
      <div class="bubble__meta">
        <span class="bubble__time">{{ formattedTime }}</span>
        <div
          v-if="isMine && hasRelayStatuses"
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
  </div>

  <AppDialog
    v-if="isMine"
    v-model="isStatusDialogOpen"
    title="Relay Status"
    max-width="460px"
  >
    <div
      v-if="contactStatusListItems.length === 0 && myStatusListItems.length === 0"
      class="bubble__status-empty"
    >
      No relay status recorded yet.
    </div>
    <template v-else>
      <div class="bubble__status-section">
        <div class="bubble__status-section-title">{{ contactRelaysTitle }}</div>
        <ul class="bubble__status-list bubble__status-list--dialog">
          <li
            v-for="item in contactStatusListItems"
            :key="item.key"
            class="bubble__status-list-item bubble__status-list-item--dialog"
          >
            <span class="bubble__status-list-item-main">
              <span class="bubble__status-list-dot" :class="item.dotClass" aria-hidden="true" />
              <span class="bubble__status-list-text">{{ item.relayUrl }}</span>
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
              :disable="isRetrying(item)"
              @click.stop="retryRelay(item)"
            />
          </li>
          <li
            v-if="contactStatusListItems.length === 0"
            class="bubble__status-list-item bubble__status-list-item--empty"
          >
            No relays
          </li>
        </ul>
      </div>

      <div class="bubble__status-section-separator" />

      <div class="bubble__status-section">
        <div class="bubble__status-section-title">{{ myRelaysTitle }}</div>
        <ul class="bubble__status-list bubble__status-list--dialog">
          <li
            v-for="item in myStatusListItems"
            :key="item.key"
            class="bubble__status-list-item bubble__status-list-item--dialog"
          >
            <span class="bubble__status-list-item-main">
              <span class="bubble__status-list-dot" :class="item.dotClass" aria-hidden="true" />
              <span class="bubble__status-list-text">{{ item.relayUrl }}</span>
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
              :disable="isRetrying(item)"
              @click.stop="retryRelay(item)"
            />
          </li>
          <li
            v-if="myStatusListItems.length === 0"
            class="bubble__status-list-item bubble__status-list-item--empty"
          >
            No relays
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
        <div class="bubble__info-value">{{ message.text }}</div>
      </div>
    </div>
  </AppDialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useQuasar } from 'quasar';
import AppDialog from 'src/components/AppDialog.vue';
import type { Message, MessageRelayStatus } from 'src/types/chat';
import { useNostrStore } from 'src/stores/nostrStore';
import { isMessageRelayStatus } from 'src/utils/messageRelayStatus';
import { reportUiError } from 'src/utils/uiErrorHandler';

const props = defineProps<{
  message: Message;
  contactName?: string;
}>();

const $q = useQuasar();
const nostrStore = useNostrStore();
const isMine = computed(() => props.message.sender === 'me');
const isActionMenuOpen = ref(false);
const isInfoDialogOpen = ref(false);

interface StatusSegment {
  key: 'published' | 'pending' | 'failed';
  className: string;
  weight: number;
}

interface StatusListItem {
  key: string;
  relayUrl: string;
  dotClass: string;
  scope: 'recipient' | 'self';
  status: 'published' | 'failed' | 'pending';
  retryable: boolean;
}

function formatRelayStatusItem(relayStatus: MessageRelayStatus): string {
  return relayStatus.relay_url;
}

const outboundRelayStatuses = computed(() => {
  const relayStatuses = props.message.nostrEvent?.relay_statuses;
  if (!Array.isArray(relayStatuses)) {
    return [] as MessageRelayStatus[];
  }

  return relayStatuses
    .filter(isMessageRelayStatus)
    .filter((relayStatus) => relayStatus.direction === 'outbound')
    .sort((first, second) => {
      const byRelayUrl = first.relay_url.localeCompare(second.relay_url);
      if (byRelayUrl !== 0) {
        return byRelayUrl;
      }

      return first.scope.localeCompare(second.scope);
    });
});

const hasPendingRelayStatuses = computed(() => {
  return outboundRelayStatuses.value.some((relayStatus) => relayStatus.status === 'pending');
});

const hasRelayStatuses = computed(() => {
  return outboundRelayStatuses.value.length > 0;
});

const contactRelaysTitle = computed(() => {
  const label = props.contactName?.trim();
  return `${label || 'Contact'} Relays`;
});

const isStatusDialogOpen = ref(false);
const retryingRelayKeys = ref<string[]>([]);

const statusSegments = computed<StatusSegment[]>(() => {
  const relayStatuses = outboundRelayStatuses.value;
  if (relayStatuses.length === 0) {
    return [
      {
        key: 'pending',
        className: 'bubble__status-segment--gray',
        weight: 1
      }
    ];
  }

  function countByStatus(status: MessageRelayStatus['status']) {
    return relayStatuses.filter((relayStatus) => relayStatus.status === status).length;
  }

  const published = countByStatus('published');
  const pending = countByStatus('pending');
  const failed = countByStatus('failed');

  return [
    {
      key: 'published',
      className: 'bubble__status-segment--green',
      weight: published
    },
    {
      key: 'pending',
      className: 'bubble__status-segment--gray',
      weight: pending
    },
    {
      key: 'failed',
      className: 'bubble__status-segment--red',
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
  const dotClassByStatus: Record<'published' | 'failed' | 'pending', string> = {
    published: 'bubble__status-list-dot--green',
    failed: 'bubble__status-list-dot--red',
    pending: 'bubble__status-list-dot--gray'
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
      dotClass: dotClassByStatus[relayStatus.status],
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

function openStatusDialog(): void {
  if (!isMine.value || !hasRelayStatuses.value) {
    return;
  }

  isStatusDialogOpen.value = true;
}

function canUseTapToOpenMenu(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  return window.matchMedia('(hover: none)').matches;
}

function openActionMenu(): void {
  isActionMenuOpen.value = true;
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
  notifyUnimplemented('Reply');
}

function handleForward(): void {
  notifyUnimplemented('Forward');
}

async function handleCopy(): Promise<void> {
  try {
    await copyText(props.message.text);
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
  notifyUnimplemented('Delete');
}

function isRetrying(item: StatusListItem): boolean {
  return retryingRelayKeys.value.includes(item.key);
}

async function retryRelay(item: StatusListItem): Promise<void> {
  const messageId = Number.parseInt(props.message.id, 10);
  if (!Number.isInteger(messageId) || messageId <= 0 || !item.retryable || isRetrying(item)) {
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
</script>

<style scoped>
.bubble-row {
  display: flex;
  margin-bottom: 10px;
}

.bubble-row--mine {
  justify-content: flex-end;
}

.bubble-row--their {
  justify-content: flex-start;
}

.bubble {
  position: relative;
  max-width: min(82%, 560px);
  border-radius: 16px;
  padding: 10px 36px 10px 12px;
  box-shadow: 0 3px 10px rgba(15, 23, 42, 0.08);
  animation: bubble-in 180ms ease both;
}

.bubble__menu-trigger {
  position: absolute;
  top: 6px;
  right: 6px;
  color: color-mix(in srgb, currentColor 68%, #64748b 32%);
  background: color-mix(in srgb, var(--tg-sidebar) 74%, transparent);
  opacity: 0;
  pointer-events: none;
  transform: translateY(-2px);
  transition:
    opacity 0.18s ease,
    transform 0.18s ease,
    background-color 0.18s ease;
}

.bubble__menu-trigger:hover {
  background: color-mix(in srgb, var(--tg-sidebar) 88%, transparent);
}

.bubble-row:hover .bubble__menu-trigger,
.bubble-row:focus-within .bubble__menu-trigger {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
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
