<template>
  <div class="bubble-row" :class="isMine ? 'bubble-row--mine' : 'bubble-row--their'">
    <div class="bubble" :class="isMine ? 'bubble--mine' : 'bubble--their'">
      <p class="bubble__text">{{ message.text }}</p>
      <div class="bubble__meta">
        <span class="bubble__time">{{ formattedTime }}</span>
        <div
          v-if="isMine"
          class="bubble__status"
          :class="{ 'bubble__status--pending': hasPendingRelayStatuses }"
        >
          <span
            v-for="segment in statusSegments"
            :key="segment.key"
            class="bubble__status-segment"
            :class="segment.className"
            :style="{ flex: `${segment.weight} 1 0` }"
            tabindex="0"
            role="button"
            :aria-expanded="activeStatusSegment?.key === segment.key ? 'true' : 'false'"
            @click.stop="toggleStatusSegment(segment.key)"
            @keydown.enter.prevent="toggleStatusSegment(segment.key)"
            @keydown.space.prevent="toggleStatusSegment(segment.key)"
          />
        </div>
      </div>
      <div
        v-if="activeStatusSegment"
        class="bubble__status-panel"
        :class="`bubble__status-panel--${activeStatusSegment.key}`"
      >
        <div v-if="!activeStatusSegment.hasItems" class="bubble__status-panel-empty">
          {{ activeStatusSegment.emptyText }}
        </div>
        <template v-else>
          <div class="bubble__status-section">
            <div class="bubble__status-section-title">
              {{ contactRelaysTitle }}
            </div>
            <ul class="bubble__status-list">
              <li
                v-for="item in activeStatusSegment.recipientItems"
                :key="`${activeStatusSegment.key}-panel-recipient-${item}`"
                class="bubble__status-list-item bubble__status-panel-item"
              >
                {{ item }}
              </li>
              <li
                v-if="activeStatusSegment.recipientItems.length === 0"
                class="bubble__status-list-item bubble__status-list-item--empty bubble__status-panel-item"
              >
                No relays
              </li>
            </ul>
          </div>
          <div class="bubble__status-section-separator" />
          <div class="bubble__status-section">
            <div class="bubble__status-section-title">My Relays:</div>
            <ul class="bubble__status-list">
              <li
                v-for="item in activeStatusSegment.selfItems"
                :key="`${activeStatusSegment.key}-panel-self-${item}`"
                class="bubble__status-list-item bubble__status-panel-item"
              >
                {{ item }}
              </li>
              <li
                v-if="activeStatusSegment.selfItems.length === 0"
                class="bubble__status-list-item bubble__status-list-item--empty bubble__status-panel-item"
              >
                No relays
              </li>
            </ul>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Message, MessageRelayStatus } from 'src/types/chat';

const props = defineProps<{
  message: Message;
  contactName?: string;
}>();

const isMine = computed(() => props.message.sender === 'me');

interface StatusSegment {
  key: 'published' | 'pending' | 'failed';
  className: string;
  weight: number;
  recipientItems: string[];
  selfItems: string[];
  hasItems: boolean;
  emptyText: string;
}

function isMessageRelayStatus(value: unknown): value is MessageRelayStatus {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const status = value as Partial<MessageRelayStatus>;
  return (
    typeof status.relay_url === 'string' &&
    (status.direction === 'outbound' || status.direction === 'inbound') &&
    (status.status === 'pending' ||
      status.status === 'published' ||
      status.status === 'failed' ||
      status.status === 'received') &&
    (status.scope === 'recipient' || status.scope === 'self' || status.scope === 'subscription')
  );
}

function formatRelayStatusItem(relayStatus: MessageRelayStatus): string {
  return relayStatus.relay_url;
}

const outboundRelayStatuses = computed(() => {
  const relayStatuses = props.message.meta?.relay_statuses;
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

const contactRelaysTitle = computed(() => {
  const label = props.contactName?.trim();
  return `${label || 'Contact'} Relays:`;
});

const activeStatusSegmentKey = ref<StatusSegment['key'] | null>(null);

const statusSegments = computed<StatusSegment[]>(() => {
  const relayStatuses = outboundRelayStatuses.value;
  if (relayStatuses.length === 0) {
    return [
      {
        key: 'pending',
        className: 'bubble__status-segment--gray',
        weight: 1,
        recipientItems: [],
        selfItems: [],
        hasItems: false,
        emptyText: 'No relay status recorded yet.'
      }
    ];
  }

  function splitItemsByScope(status: MessageRelayStatus['status']) {
    const matchingRelayStatuses = relayStatuses.filter((relayStatus) => relayStatus.status === status);

    return {
      recipientItems: matchingRelayStatuses
        .filter((relayStatus) => relayStatus.scope === 'recipient')
        .map((relayStatus) => formatRelayStatusItem(relayStatus)),
      selfItems: matchingRelayStatuses
        .filter((relayStatus) => relayStatus.scope === 'self')
        .map((relayStatus) => formatRelayStatusItem(relayStatus))
    };
  }

  const published = splitItemsByScope('published');
  const pending = splitItemsByScope('pending');
  const failed = splitItemsByScope('failed');

  return [
    {
      key: 'published',
      className: 'bubble__status-segment--green',
      weight: published.recipientItems.length + published.selfItems.length,
      recipientItems: published.recipientItems,
      selfItems: published.selfItems,
      hasItems: published.recipientItems.length + published.selfItems.length > 0,
      emptyText: 'No relays confirmed.'
    },
    {
      key: 'pending',
      className: 'bubble__status-segment--gray',
      weight: pending.recipientItems.length + pending.selfItems.length,
      recipientItems: pending.recipientItems,
      selfItems: pending.selfItems,
      hasItems: pending.recipientItems.length + pending.selfItems.length > 0,
      emptyText: 'No relays pending.'
    },
    {
      key: 'failed',
      className: 'bubble__status-segment--red',
      weight: failed.recipientItems.length + failed.selfItems.length,
      recipientItems: failed.recipientItems,
      selfItems: failed.selfItems,
      hasItems: failed.recipientItems.length + failed.selfItems.length > 0,
      emptyText: 'No relays failed.'
    }
  ].filter((segment) => segment.weight > 0);
});

const activeStatusSegment = computed(() => {
  if (!activeStatusSegmentKey.value) {
    return null;
  }

  return statusSegments.value.find((segment) => segment.key === activeStatusSegmentKey.value) ?? null;
});

function toggleStatusSegment(segmentKey: StatusSegment['key']): void {
  activeStatusSegmentKey.value =
    activeStatusSegmentKey.value === segmentKey ? null : segmentKey;
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
}

.bubble__status--pending {
  animation: bubble-status-pulse 1.8s ease-in-out infinite;
  transform-origin: center;
}

.bubble__status-segment {
  display: block;
  height: 100%;
  min-width: 4px;
  cursor: pointer;
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

.bubble__status-section-title {
  font-size: 10px;
  font-weight: 700;
  margin-bottom: 4px;
}

.bubble__status-section-separator {
  height: 1px;
  margin: 7px 0;
  background: rgba(226, 232, 240, 0.24);
}

.bubble__status-list {
  margin: 0;
  padding-left: 16px;
}

.bubble__status-list-item {
  font-size: 10px;
  line-height: 1.35;
}

.bubble__status-list-item--empty {
  list-style: disc;
  opacity: 0.72;
}

.bubble__status-panel {
  margin-top: 8px;
  border-radius: 10px;
  padding: 8px 10px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: rgba(255, 255, 255, 0.48);
  backdrop-filter: blur(8px);
}

.bubble__status-panel--published {
  border-color: rgba(22, 163, 74, 0.34);
  box-shadow: inset 3px 0 0 #16a34a;
}

.bubble__status-panel--pending {
  border-color: rgba(100, 116, 139, 0.34);
  box-shadow: inset 3px 0 0 rgba(100, 116, 139, 0.7);
}

.bubble__status-panel--failed {
  border-color: rgba(220, 38, 38, 0.34);
  box-shadow: inset 3px 0 0 #dc2626;
}

.bubble__status-panel-empty,
.bubble__status-panel-item {
  font-size: 10px;
  line-height: 1.4;
}

.bubble__status-panel .bubble__status-section-separator {
  background: rgba(148, 163, 184, 0.2);
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
