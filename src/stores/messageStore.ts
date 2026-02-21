import { defineStore } from 'pinia';
import { ref } from 'vue';
import { buildMessagesByChat, mockMessages } from 'src/data/mockData';
import type { Message } from 'src/types/chat';

export const useMessageStore = defineStore('messageStore', () => {
  const messagesByChat = ref<Record<string, Message[]>>(buildMessagesByChat(mockMessages));

  function getMessages(chatId: string | null): Message[] {
    if (!chatId) {
      return [];
    }

    return messagesByChat.value[chatId] ?? [];
  }

  function sendMessage(chatId: string, text: string): Message | null {
    const cleanText = text.trim();

    if (!cleanText) {
      return null;
    }

    const newMessage: Message = {
      id: `m-${Date.now()}`,
      chatId,
      text: cleanText,
      sender: 'me',
      sentAt: new Date().toISOString()
    };

    if (!messagesByChat.value[chatId]) {
      messagesByChat.value[chatId] = [];
    }

    messagesByChat.value[chatId] = [...messagesByChat.value[chatId], newMessage];
    return newMessage;
  }

  return {
    messagesByChat,
    getMessages,
    sendMessage
  };
});
