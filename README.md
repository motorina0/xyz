# Quasar Telegram-like UI

Telegram-style chat UI built with Quasar (Vue 3 + TypeScript + Pinia).

## Features

- Left chat list with avatar, last message preview, unread badge
- Main chat thread with sent/received rounded bubbles
- Message composer with send button
- Pinia stores: `chatStore` and `messageStore`
- Local mock data for chats/messages
- Chat selection updates thread
- Sending messages appends to current chat
- Auto-scrolls to latest message
- Responsive behavior:
  - Desktop: sidebar + thread side by side
  - Mobile: route-based navigation (`/` list, `/chat/:chatId` thread)
- Bonus:
  - Dark mode toggle
  - Search input placeholder (no filtering logic yet)

## Run

Node.js 18+ is recommended for current Quasar + `@quasar/app-vite`.

1. Install dependencies:

```bash
npm install
```

2. Start dev server:

```bash
npm run dev
```

This runs `quasar dev` via the npm script.

## Project Structure

```text
index.html
package.json
quasar.config.ts
tsconfig.json
src/
  components/
    ChatItem.vue
    ChatList.vue
    ChatThread.vue
    MessageBubble.vue
    MessageComposer.vue
  data/
    mockData.ts
  layouts/
    MainLayout.vue
  pages/
    IndexPage.vue
    ChatPage.vue
    ErrorNotFound.vue
  router/
    index.ts
    routes.ts
  stores/
    index.ts
    chatStore.ts
    messageStore.ts
  types/
    chat.ts
  css/
    app.css
  App.vue
```
