import { useMessageBubbleStatus } from 'src/composables/useMessageBubbleStatus';
import { computed, ref } from 'vue';
import { describe, expect, it } from 'vitest';

describe('useMessageBubbleStatus', () => {
  it('omits the backup relay section when an outbound message has no self-copy relay statuses', () => {
    const message = ref({
      id: '1',
      chatId: 'self-chat',
      text: 'hello',
      sender: 'me' as const,
      sentAt: '2026-01-01T00:00:00.000Z',
      authorPublicKey: 'self-chat',
      eventId: 'event-1',
      nostrEvent: {
        direction: 'out' as const,
        event: {
          id: 'event-1',
          kind: 14,
          content: 'hello',
          tags: [],
          pubkey: 'self-chat',
          created_at: 1700000000,
          sig: '',
        },
        relay_statuses: [
          {
            relay_url: 'wss://self.example',
            direction: 'outbound' as const,
            scope: 'recipient' as const,
            status: 'published' as const,
            updated_at: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
      meta: {},
    });

    const { statusSections } = useMessageBubbleStatus({
      contactName: computed(() => 'My Self'),
      contactRelayUrls: computed(() => ['wss://self.example']),
      isMine: computed(() => true),
      message,
    });

    expect(statusSections.value).toEqual([
      expect.objectContaining({
        key: 'recipient',
        title: 'My Self Relays',
      }),
    ]);
    expect(statusSections.value.some((section) => section.key === 'self')).toBe(false);
  });
});
