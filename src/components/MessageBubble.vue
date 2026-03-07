<template>
  <div class="bubble-row" :class="isMine ? 'bubble-row--mine' : 'bubble-row--their'">
    <div class="bubble" :class="isMine ? 'bubble--mine' : 'bubble--their'">
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
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import AppDialog from 'src/components/AppDialog.vue';
import type { Message, MessageRelayStatus } from 'src/types/chat';
import { useNostrStore } from 'src/stores/nostrStore';
import { isMessageRelayStatus } from 'src/utils/messageRelayStatus';
import { reportUiError } from 'src/utils/uiErrorHandler';

const props = defineProps<{
  message: Message;
  contactName?: string;
}>();

const nostrStore = useNostrStore();
const isMine = computed(() => props.message.sender === 'me');

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
  max-width: min(82%, 560px);
  border-radius: 16px;
  padding: 10px 12px;
  box-shadow: 0 3px 10px rgba(15, 23, 42, 0.08);
  animation: bubble-in 180ms ease both;
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
