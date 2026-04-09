import type { Message, MessageRelayStatus } from 'src/types/chat';
import { isMessageRelayStatus } from 'src/utils/messageRelayStatus';
import { uniqueRelayUrls } from 'src/utils/relayUrls';
import { type ComputedRef, computed } from 'vue';

export interface StatusSegment {
  key:
    | 'published'
    | 'published-recipient'
    | 'published-self'
    | 'pending'
    | 'failed'
    | 'received'
    | 'missing';
  className: string;
  weight: number;
}

export type RetryableStatusScope = 'recipient' | 'self';
export type StatusListScope = MessageRelayStatus['scope'] | 'derived';

export interface StatusListItem {
  key: string;
  relayUrl: string;
  detail?: string;
  dotClass: string;
  scope: StatusListScope;
  status: StatusSegment['key'];
  retryable: boolean;
}

export interface StatusSection {
  key: string;
  title: string;
  items: StatusListItem[];
  emptyLabel: string;
}

function formatRelayStatusItem(relayStatus: Pick<MessageRelayStatus, 'relay_url'>): string {
  return relayStatus.relay_url;
}

function getStatusSegmentClassName(status: StatusSegment['key']): string {
  switch (status) {
    case 'published':
    case 'published-recipient':
    case 'received':
      return 'bubble__status-segment--green';
    case 'published-self':
      return 'bubble__status-segment--blue';
    case 'failed':
      return 'bubble__status-segment--red';
    default:
      return 'bubble__status-segment--gray';
  }
}

function getStatusDotClassName(
  status: StatusListItem['status'],
  scope: StatusListScope = 'derived'
): string {
  switch (status) {
    case 'published':
      return scope === 'self' ? 'bubble__status-list-dot--blue' : 'bubble__status-list-dot--green';
    case 'received':
      return 'bubble__status-list-dot--green';
    case 'failed':
      return 'bubble__status-list-dot--red';
    default:
      return 'bubble__status-list-dot--gray';
  }
}

function buildStatusListItems(
  relayStatuses: MessageRelayStatus[],
  predicate: (relayStatus: MessageRelayStatus) => boolean
): StatusListItem[] {
  const statusPriority: Record<'published' | 'failed' | 'pending', number> = {
    published: 0,
    failed: 1,
    pending: 2,
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
      dotClass: getStatusDotClassName(relayStatus.status, relayStatus.scope),
      scope: relayStatus.scope,
      status: relayStatus.status,
      retryable: relayStatus.status === 'failed',
    }));
}

export function isRetryableStatusScope(scope: StatusListScope): scope is RetryableStatusScope {
  return scope === 'recipient' || scope === 'self';
}

export function useMessageBubbleStatus(options: {
  contactName: ComputedRef<string>;
  contactRelayUrls: ComputedRef<string[]>;
  isMine: ComputedRef<boolean>;
  message: ComputedRef<Message>;
}) {
  const relayStatuses = computed(() => {
    const value = options.message.value.nostrEvent?.relay_statuses;
    if (!Array.isArray(value)) {
      return [] as MessageRelayStatus[];
    }

    return value.filter(isMessageRelayStatus).sort((first, second) => {
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

  const normalizedContactRelayUrls = computed(() =>
    uniqueRelayUrls(options.contactRelayUrls.value)
  );

  const inboundReceivedRelayUrls = computed(() => {
    const uniqueRelayUrlSet = new Set<string>();

    for (const relayStatus of inboundReceivedRelayStatuses.value) {
      const relayUrl = formatRelayStatusItem(relayStatus).trim();
      if (!relayUrl) {
        continue;
      }

      uniqueRelayUrlSet.add(relayUrl);
    }

    return Array.from(uniqueRelayUrlSet).sort((first, second) => first.localeCompare(second));
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
    return options.isMine.value
      ? outboundRelayStatuses.value.length > 0
      : inboundReceivedRelayUrls.value.length > 0;
  });

  const contactRelaysTitle = computed(() => {
    return `${options.contactName.value || 'Contact'} Relays`;
  });

  const statusDialogTitle = computed(() => {
    return options.isMine.value ? 'Relay Status' : 'Received Relay Status';
  });

  const statusSegments = computed<StatusSegment[]>(() => {
    if (!options.isMine.value) {
      return [
        {
          key: 'received',
          className: getStatusSegmentClassName('received'),
          weight: inboundReceivedRelayUrls.value.length,
        },
        {
          key: 'missing',
          className: getStatusSegmentClassName('missing'),
          weight: inboundMissingRelayUrls.value.length,
        },
      ].filter((segment) => segment.weight > 0);
    }

    function countByStatus(
      status: MessageRelayStatus['status'],
      scope?: MessageRelayStatus['scope']
    ) {
      return outboundRelayStatuses.value.filter((relayStatus) => {
        if (relayStatus.status !== status) {
          return false;
        }

        return scope ? relayStatus.scope === scope : true;
      }).length;
    }

    const publishedRecipient = countByStatus('published', 'recipient');
    const publishedSelf = countByStatus('published', 'self');
    const pending = countByStatus('pending');
    const failed = countByStatus('failed');

    return [
      {
        key: 'published-recipient',
        className: getStatusSegmentClassName('published-recipient'),
        weight: publishedRecipient,
      },
      {
        key: 'published-self',
        className: getStatusSegmentClassName('published-self'),
        weight: publishedSelf,
      },
      {
        key: 'pending',
        className: getStatusSegmentClassName('pending'),
        weight: pending,
      },
      {
        key: 'failed',
        className: getStatusSegmentClassName('failed'),
        weight: failed,
      },
    ].filter((segment) => segment.weight > 0);
  });

  const contactStatusListItems = computed<StatusListItem[]>(() => {
    return buildStatusListItems(
      outboundRelayStatuses.value,
      (relayStatus) => relayStatus.scope === 'recipient'
    );
  });

  const myStatusListItems = computed<StatusListItem[]>(() => {
    return buildStatusListItems(
      outboundRelayStatuses.value,
      (relayStatus) => relayStatus.scope === 'self'
    );
  });

  const inboundContactStatusListItems = computed<StatusListItem[]>(() => {
    return normalizedContactRelayUrls.value.map((relayUrl) => {
      const status: StatusListItem['status'] = inboundReceivedRelayUrlSet.value.has(relayUrl)
        ? 'received'
        : 'missing';

      return {
        key: `${status}-contact-${relayUrl}`,
        relayUrl,
        detail: status === 'missing' ? 'This message was not received from this relay.' : undefined,
        dotClass: getStatusDotClassName(status),
        scope: 'derived',
        status,
        retryable: false,
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
      retryable: false,
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
        retryable: false,
      }));
  });

  const statusSections = computed<StatusSection[]>(() => {
    if (options.isMine.value) {
      return [
        {
          key: 'recipient',
          title: contactRelaysTitle.value,
          items: contactStatusListItems.value,
          emptyLabel: 'No relays',
        },
        {
          key: 'self',
          title: 'My Relays (message backup)',
          items: myStatusListItems.value,
          emptyLabel: 'No relays',
        },
      ];
    }

    if (normalizedContactRelayUrls.value.length > 0) {
      const sections: StatusSection[] = [
        {
          key: 'contact',
          title: contactRelaysTitle.value,
          items: inboundContactStatusListItems.value,
          emptyLabel: 'No relays',
        },
      ];

      if (inboundExtraReceivedStatusListItems.value.length > 0) {
        sections.push({
          key: 'extra-received',
          title: 'Other Received Relays',
          items: inboundExtraReceivedStatusListItems.value,
          emptyLabel: 'No relays',
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
            emptyLabel: 'No relays',
          },
        ]
      : [];
  });

  return {
    hasPendingRelayStatuses,
    hasRelayStatuses,
    statusDialogTitle,
    statusSections,
    statusSegments,
  };
}
