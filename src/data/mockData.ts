import type { Chat, Message } from 'src/types/chat';

export const mockChats: Chat[] = [
  {
    id: 'chat-1',
    name: 'Elena Rivera x',
    avatar: 'ER',
    lastMessage: 'Can we sync before the release?',
    lastMessageAt: '2026-02-21T08:15:00.000Z',
    unreadCount: 2
  },
  {
    id: 'chat-2',
    name: 'Design Team',
    avatar: 'DT',
    lastMessage: 'New icon set is uploaded.',
    lastMessageAt: '2026-02-21T07:42:00.000Z',
    unreadCount: 0
  },
  {
    id: 'chat-3',
    name: 'Noah Clark',
    avatar: 'NC',
    lastMessage: 'Thanks! That fixed it.',
    lastMessageAt: '2026-02-20T19:11:00.000Z',
    unreadCount: 1
  },
  {
    id: 'chat-4',
    name: 'Family Group',
    avatar: 'FG',
    lastMessage: 'Dinner at 7?',
    lastMessageAt: '2026-02-20T17:33:00.000Z',
    unreadCount: 0
  }
];

export const mockMessages: Message[] = [
  {
    id: 'm-1',
    chatId: 'chat-1',
    text: 'Hey, did you push the latest branch?',
    sender: 'them',
    sentAt: '2026-02-21T08:05:00.000Z'
  },
  {
    id: 'm-2',
    chatId: 'chat-1',
    text: 'Yes, and I added migration notes too.',
    sender: 'me',
    sentAt: '2026-02-21T08:07:00.000Z'
  },
  {
    id: 'm-3',
    chatId: 'chat-1',
    text: 'Can we sync before the release?',
    sender: 'them',
    sentAt: '2026-02-21T08:15:00.000Z'
  },
  {
    id: 'm-4',
    chatId: 'chat-2',
    text: 'Morning! Please review the updated spacing.',
    sender: 'them',
    sentAt: '2026-02-21T07:15:00.000Z'
  },
  {
    id: 'm-5',
    chatId: 'chat-2',
    text: 'Looks good. I only left one note.',
    sender: 'me',
    sentAt: '2026-02-21T07:26:00.000Z'
  },
  {
    id: 'm-6',
    chatId: 'chat-2',
    text: 'New icon set is uploaded.',
    sender: 'them',
    sentAt: '2026-02-21T07:42:00.000Z'
  },
  {
    id: 'm-7',
    chatId: 'chat-3',
    text: 'The API was timing out on my side.',
    sender: 'them',
    sentAt: '2026-02-20T18:52:00.000Z'
  },
  {
    id: 'm-8',
    chatId: 'chat-3',
    text: 'Try the retry strategy from this morning.',
    sender: 'me',
    sentAt: '2026-02-20T19:03:00.000Z'
  },
  {
    id: 'm-9',
    chatId: 'chat-3',
    text: 'Thanks! That fixed it.',
    sender: 'them',
    sentAt: '2026-02-20T19:11:00.000Z'
  },
  {
    id: 'm-10',
    chatId: 'chat-4',
    text: 'Dinner at 7?',
    sender: 'them',
    sentAt: '2026-02-20T17:33:00.000Z'
  }
];

export function buildMessagesByChat(messages: Message[]): Record<string, Message[]> {
  return messages.reduce<Record<string, Message[]>>((accumulator, message) => {
    if (!accumulator[message.chatId]) {
      accumulator[message.chatId] = [];
    }

    accumulator[message.chatId].push(message);
    return accumulator;
  }, {});
}
