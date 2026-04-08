import { describe, expect, it } from 'vitest';
import { __chatStoreTestUtils } from 'src/stores/chatStore';

const {
  buildAcceptedChatMeta,
  buildBlockedChatMeta,
  buildChatActivitySnapshotByPublicKey,
  buildUpdatedChatPreview,
  countUnreadMessagesAfter,
  resolveChatCategory,
  syncChatActivityMeta
} = __chatStoreTestUtils;

describe('chatStore logic', () => {
  it('classifies blocked chats ahead of accepted and request states', () => {
    expect(
      resolveChatCategory({
        inbox_state: 'blocked',
        accepted_at: '2026-01-01T00:00:00.000Z',
        last_incoming_message_at: '2026-01-02T00:00:00.000Z'
      })
    ).toBe('blocked');

    expect(
      resolveChatCategory({
        accepted_at: '2026-01-01T00:00:00.000Z'
      })
    ).toBe('chat');

    expect(
      resolveChatCategory({
        last_incoming_message_at: '2026-01-02T00:00:00.000Z'
      })
    ).toBe('request');
  });

  it('counts only incoming timestamps newer than the seen boundary', () => {
    const timestamps = [
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z',
      '2026-01-03T00:00:00.000Z'
    ];

    expect(countUnreadMessagesAfter(timestamps, '2026-01-02T00:00:00.000Z')).toBe(1);
    expect(countUnreadMessagesAfter(timestamps, '')).toBe(3);
    expect(countUnreadMessagesAfter(undefined, '2026-01-02T00:00:00.000Z')).toBe(0);
  });

  it('promotes a request chat to accepted when an outgoing message appears', () => {
    const nextMeta = syncChatActivityMeta(
      {
        last_incoming_message_at: '2026-01-01T00:00:00.000Z'
      },
      {
        lastIncomingMessageAt: '2026-01-02T00:00:00.000Z',
        lastOutgoingMessageAt: '2026-01-03T00:00:00.000Z'
      }
    );

    expect(nextMeta).toMatchObject({
      inbox_state: 'accepted',
      accepted_at: '2026-01-03T00:00:00.000Z',
      last_incoming_message_at: '2026-01-02T00:00:00.000Z',
      last_outgoing_message_at: '2026-01-03T00:00:00.000Z'
    });
  });

  it('does not unblock a blocked chat just because a later outgoing snapshot exists', () => {
    const originalMeta = {
      inbox_state: 'blocked',
      blocked_at: '2026-01-01T00:00:00.000Z',
      last_incoming_message_at: '2026-01-01T00:00:00.000Z'
    };

    const nextMeta = syncChatActivityMeta(originalMeta, {
      lastIncomingMessageAt: '',
      lastOutgoingMessageAt: '2026-01-03T00:00:00.000Z'
    });

    expect(nextMeta).toEqual(originalMeta);
    expect(nextMeta).not.toHaveProperty('last_outgoing_message_at');
  });

  it('builds the latest incoming and outgoing activity snapshot per chat', () => {
    const snapshots = buildChatActivitySnapshotByPublicKey(
      [
        {
          chat_public_key: 'chat-a',
          author_public_key: 'me',
          created_at: '2026-01-01T00:00:00.000Z'
        },
        {
          chat_public_key: 'chat-a',
          author_public_key: 'them',
          created_at: '2026-01-02T00:00:00.000Z'
        },
        {
          chat_public_key: 'chat-a',
          author_public_key: 'them',
          created_at: '2026-01-03T00:00:00.000Z'
        },
        {
          chat_public_key: 'chat-b',
          author_public_key: 'me',
          created_at: '2026-01-04T00:00:00.000Z'
        }
      ] as never,
      'me'
    );

    expect(snapshots.get('chat-a')).toEqual({
      lastIncomingMessageAt: '2026-01-03T00:00:00.000Z',
      lastOutgoingMessageAt: '2026-01-01T00:00:00.000Z'
    });
    expect(snapshots.get('chat-b')).toEqual({
      lastIncomingMessageAt: '',
      lastOutgoingMessageAt: '2026-01-04T00:00:00.000Z'
    });
  });

  it('builds accepted chat metadata from reply state without keeping blocked markers', () => {
    expect(
      buildAcceptedChatMeta(
        {
          inbox_state: 'blocked',
          blocked_at: '2026-01-01T00:00:00.000Z',
          last_outgoing_message_at: '2026-01-01T00:00:00.000Z'
        },
        '2026-01-03T00:00:00.000Z',
        '2026-01-02T00:00:00.000Z'
      )
    ).toEqual({
      inbox_state: 'accepted',
      accepted_at: '2026-01-03T00:00:00.000Z',
      last_outgoing_message_at: '2026-01-02T00:00:00.000Z'
    });
  });

  it('builds blocked chat metadata and preview updates with the right unread behavior', () => {
    expect(
      buildBlockedChatMeta(
        {
          inbox_state: 'accepted',
          accepted_at: '2026-01-01T00:00:00.000Z'
        },
        '2026-01-04T00:00:00.000Z'
      )
    ).toEqual({
      inbox_state: 'blocked',
      accepted_at: '2026-01-01T00:00:00.000Z',
      blocked_at: '2026-01-04T00:00:00.000Z'
    });

    expect(
      buildUpdatedChatPreview(
        {
          id: 'chat-a',
          publicKey: 'chat-a',
          epochPublicKey: null,
          type: 'user',
          name: 'Alice',
          avatar: 'A',
          lastMessage: 'old',
          lastMessageAt: '2026-01-01T00:00:00.000Z',
          unreadCount: 3,
          meta: {}
        },
        'new',
        '2026-01-05T00:00:00.000Z',
        true
      ).unreadCount
    ).toBe(0);

    expect(
      buildUpdatedChatPreview(
        {
          id: 'chat-a',
          publicKey: 'chat-a',
          epochPublicKey: null,
          type: 'user',
          name: 'Alice',
          avatar: 'A',
          lastMessage: 'old',
          lastMessageAt: '2026-01-01T00:00:00.000Z',
          unreadCount: 3,
          meta: {}
        },
        'new',
        '2026-01-05T00:00:00.000Z',
        false
      ).unreadCount
    ).toBe(3);
  });
});
