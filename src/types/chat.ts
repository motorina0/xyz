export interface Chat {
  id: string;
  name: string;
  avatar: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
}

export interface Message {
  id: string;
  chatId: string;
  text: string;
  sender: 'me' | 'them';
  sentAt: string;
}
