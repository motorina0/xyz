# Chat Surface Map

## Routing And Shell

- `src/router/routes.ts`
  - Defines auth, register, chats, contacts, and nested settings routes
- `src/router/pageLoaders.ts`
  - Lazy-load helpers for larger route surfaces
- `src/layouts/MainLayout.vue`
  - Top-level layout shell
- `src/pages/IndexPage.vue`
  - Main chat experience, including responsive list/thread behavior, request routing, dialogs, and thread actions

## State Ownership

- `src/stores/chatStore.ts`
  - Chat-list sorting
  - Search matching
  - Request or blocked categorization
  - Chat preview and unread bookkeeping
  - Contact-derived display data
- `src/stores/messageStore.ts`
  - Message pagination
  - Thread search
  - Reaction state
  - Deletion handling
  - Send flow coordination with relay or store layers

## Component Clusters

- Thread and composer:
  - `src/components/ChatThread.vue`
  - `src/components/MessageBubble.vue`
  - `src/components/MessageComposer.vue`
  - `src/components/EmojiPickerPanel.vue`
- List and navigation:
  - `src/components/ChatList.vue`
  - `src/components/ChatItem.vue`
  - `src/components/AppNavRail.vue`
  - `src/components/ChatRequestsPage.vue`
  - `src/components/ChatRequestItem.vue`
- Profiles and settings:
  - `src/components/ContactProfile.vue`
  - `src/components/ContactLookupDialog.vue`
  - `src/components/RelayEditorPanel.vue`
  - `src/pages/settings/*.vue`

## UI Behaviors That Often Break Together

- Search behavior can involve `IndexPage.vue`, `chatStore.ts`, and `threadSearch` or message-search helpers.
- Reaction or deletion UI changes often span `MessageBubble.vue`, `ChatThread.vue`, `messageStore.ts`, and `src/utils/messageReactions.ts`.
- Request and blocked chat behavior can span `chatStore.ts`, `IndexPage.vue`, and group-invite or inbound-message runtime logic.
- Responsive shell changes should be checked against desktop split view and mobile back-navigation behavior.

## Good Test Anchors

- `tests/unit/chatStore.spec.ts`
  - Chat-list state and behavior
- `tests/unit/messageStore.spec.ts`
  - Message-store behavior
- `tests/unit/threadSearch.spec.ts`
  - Thread search helpers
- `tests/unit/useMessageBubbleStatus.spec.ts`
  - Bubble-level status derivation
- `tests/unit/messageSearch.spec.ts`
  - Search indexing behavior
- `e2e/contacts.spec.ts`
  - Contact and profile flows
- `e2e/dm.spec.ts`
  - Direct-message chat UX
- `e2e/groups.spec.ts`
  - Group chat UX
- `e2e/auth.spec.ts`
  - Login and auth surface
