import { describe, expect, it } from 'vitest';
import { __messageStoreTestUtils } from 'src/stores/messageStore';

const {
  applyMessageUpsert,
  buildChatMetaWithUnseenReactionCount,
  buildDeletedMessageMeta,
  buildInitialMessageWindowFromUnreadAnchor,
  buildMessageCursorFromMessage,
  compareMessageCursors,
  countOwnUnseenReactions,
  mergeMessagesById,
  readUnseenReactionCountFromMeta,
  resolveChatRecipientPublicKey,
  takeLeadingRowsWithAuthor,
  takeTrailingRowsWithAuthor
} = __messageStoreTestUtils;

describe('messageStore logic', () => {
  it('adds and clears unseen reaction counts in chat metadata', () => {
    expect(
      buildChatMetaWithUnseenReactionCount(
        { name: 'chat' },
        3
      )
    ).toEqual({
      name: 'chat',
      unseen_reaction_count: 3
    });

    expect(
      buildChatMetaWithUnseenReactionCount(
        { unseen_reaction_count: 2, name: 'chat' },
        0
      )
    ).toEqual({
      name: 'chat'
    });

    expect(readUnseenReactionCountFromMeta({ unseen_reaction_count: '4' })).toBe(4);
    expect(readUnseenReactionCountFromMeta({ unseen_reaction_count: 'bad' })).toBe(0);
  });

  it('compares message cursors by timestamp first and id second', () => {
    expect(
      compareMessageCursors(
        { id: 1, created_at: '2026-01-01T00:00:00.000Z' },
        { id: 2, created_at: '2026-01-02T00:00:00.000Z' }
      )
    ).toBeLessThan(0);

    expect(
      compareMessageCursors(
        { id: 1, created_at: '2026-01-02T00:00:00.000Z' },
        { id: 2, created_at: '2026-01-02T00:00:00.000Z' }
      )
    ).toBeLessThan(0);
  });

  it('deduplicates merged messages by id and keeps chronological order', () => {
    const merged = mergeMessagesById(
      [
        {
          id: '2',
          chatId: 'chat',
          text: 'older',
          sender: 'them',
          sentAt: '2026-01-02T00:00:00.000Z',
          authorPublicKey: 'b',
          eventId: null,
          nostrEvent: null,
          meta: {}
        },
        {
          id: '3',
          chatId: 'chat',
          text: 'newest',
          sender: 'me',
          sentAt: '2026-01-03T00:00:00.000Z',
          authorPublicKey: 'a',
          eventId: null,
          nostrEvent: null,
          meta: {}
        }
      ],
      [
        {
          id: '1',
          chatId: 'chat',
          text: 'oldest',
          sender: 'them',
          sentAt: '2026-01-01T00:00:00.000Z',
          authorPublicKey: 'b',
          eventId: null,
          nostrEvent: null,
          meta: {}
        },
        {
          id: '2',
          chatId: 'chat',
          text: 'older-edited',
          sender: 'them',
          sentAt: '2026-01-02T00:00:00.000Z',
          authorPublicKey: 'b',
          eventId: null,
          nostrEvent: null,
          meta: {
            edited: true
          }
        }
      ]
    );

    expect(merged.map((message) => message.id)).toEqual(['1', '2', '3']);
    expect(merged.find((message) => message.id === '2')?.meta).toEqual({ edited: true });
  });

  it('keeps contiguous author runs at both pagination boundaries', () => {
    const rows = [
      { author_public_key: 'alice' },
      { author_public_key: 'alice' },
      { author_public_key: 'bob' },
      { author_public_key: 'bob' }
    ];

    expect(takeLeadingRowsWithAuthor(rows as never, 'alice')).toHaveLength(2);
    expect(takeTrailingRowsWithAuthor(rows as never, 'bob')).toHaveLength(2);
    expect(takeLeadingRowsWithAuthor(rows as never, 'bob')).toHaveLength(0);
  });

  it('resolves delivery targets for user chats, group chats, and deleted metadata', () => {
    expect(
      resolveChatRecipientPublicKey({
        public_key: 'user-chat',
        type: 'user',
        meta: {}
      } as never)
    ).toBe('user-chat');

    expect(
      resolveChatRecipientPublicKey({
        public_key: 'group-chat',
        type: 'group',
        meta: {
          current_epoch_public_key: 'ABCD'
        }
      } as never)
    ).toBe('abcd');

    expect(
      buildDeletedMessageMeta('author', 5, '2026-01-02T00:00:00.000Z', 'ABC123')
    ).toEqual({
      deletedAt: '2026-01-02T00:00:00.000Z',
      deletedByPublicKey: 'author',
      deletedEventKind: 5,
      deleteEventId: 'abc123'
    });

    expect(
      buildMessageCursorFromMessage({
        id: '12',
        sentAt: '2026-01-02T00:00:00.000Z'
      })
    ).toEqual({
      id: 12,
      created_at: '2026-01-02T00:00:00.000Z'
    });
  });

  it('counts unseen reactions only on messages authored by the logged-in user', () => {
    expect(
      countOwnUnseenReactions(
        [
          {
            author_public_key: 'me',
            meta: {
              reactions: [
                {
                  emoji: '👍',
                  name: 'thumbs up',
                  reactorPublicKey: 'other-user'
                },
                {
                  emoji: '🔥',
                  name: 'fire',
                  reactorPublicKey: 'me'
                }
              ]
            }
          },
          {
            author_public_key: 'them',
            meta: {
              reactions: [
                {
                  emoji: '👍',
                  name: 'thumbs up',
                  reactorPublicKey: 'another-user'
                }
              ]
            }
          }
        ] as never,
        'me'
      )
    ).toBe(1);
  });

  it('builds the initial unread message window around the first unread anchor', () => {
    expect(
      buildInitialMessageWindowFromUnreadAnchor(
        [
          { id: 1, message: 'older-1' },
          { id: 2, message: 'older-2' }
        ] as never,
        { id: 3, message: 'first-unread' } as never,
        [
          { id: 4, message: 'newer-1' },
          { id: 5, message: 'newer-2' }
        ] as never,
        true,
        false
      )
    ).toMatchObject({
      hasOlder: true,
      hasNewer: false,
      rows: [
        { id: 1, message: 'older-1' },
        { id: 2, message: 'older-2' },
        { id: 3, message: 'first-unread' },
        { id: 4, message: 'newer-1' },
        { id: 5, message: 'newer-2' }
      ]
    });
  });

  it('ignores out-of-window inserts when pagination says older history is still hidden', () => {
    const existingMessages = [
      {
        id: '2',
        chatId: 'chat',
        text: 'middle',
        sender: 'them',
        sentAt: '2026-01-02T00:00:00.000Z',
        authorPublicKey: 'b',
        eventId: null,
        nostrEvent: null,
        meta: {}
      },
      {
        id: '3',
        chatId: 'chat',
        text: 'newer',
        sender: 'them',
        sentAt: '2026-01-03T00:00:00.000Z',
        authorPublicKey: 'b',
        eventId: null,
        nostrEvent: null,
        meta: {}
      }
    ];

    const result = applyMessageUpsert(
      existingMessages as never,
      {
        oldestCursor: { id: 2, created_at: '2026-01-02T00:00:00.000Z' },
        newestCursor: { id: 3, created_at: '2026-01-03T00:00:00.000Z' },
        hasOlder: true,
        hasNewer: false,
        isLoadingOlder: false,
        isLoadingNewer: false
      },
      {
        id: '1',
        chatId: 'chat',
        text: 'older',
        sender: 'them',
        sentAt: '2026-01-01T00:00:00.000Z',
        authorPublicKey: 'b',
        eventId: null,
        nostrEvent: null,
        meta: {}
      },
      {
        allowOutsideLoadedWindow: false
      }
    );

    expect(result.ignored).toBe(true);
    expect(result.messages).toEqual(existingMessages);
  });

  it('updates pagination when an in-range or explicitly allowed message is upserted', () => {
    const result = applyMessageUpsert(
      [
        {
          id: '2',
          chatId: 'chat',
          text: 'middle',
          sender: 'them',
          sentAt: '2026-01-02T00:00:00.000Z',
          authorPublicKey: 'b',
          eventId: null,
          nostrEvent: null,
          meta: {}
        }
      ] as never,
      {
        oldestCursor: { id: 2, created_at: '2026-01-02T00:00:00.000Z' },
        newestCursor: { id: 2, created_at: '2026-01-02T00:00:00.000Z' },
        hasOlder: false,
        hasNewer: false,
        isLoadingOlder: false,
        isLoadingNewer: false
      },
      {
        id: '3',
        chatId: 'chat',
        text: 'newer',
        sender: 'them',
        sentAt: '2026-01-03T00:00:00.000Z',
        authorPublicKey: 'b',
        eventId: null,
        nostrEvent: null,
        meta: {}
      },
      {
        allowOutsideLoadedWindow: false
      }
    );

    expect(result.ignored).toBe(false);
    expect(result.messages.map((message) => message.id)).toEqual(['2', '3']);
    expect(result.paginationState.newestCursor).toEqual({
      id: 3,
      created_at: '2026-01-03T00:00:00.000Z'
    });
  });
});
