# Repo Skills

This repo now includes project-specific skills and a compact architecture map meant to help Codex land in the right files faster.

## Use These Skills

- `nostr-runtime`
  - Use for auth, session restore, relay lists, NIP-17 messaging, inbound ingest, group invites, epoch rotation, or Nostr private storage.
- `chat-surface`
  - Use for routed pages, Quasar components, responsive shell behavior, `chatStore`, `messageStore`, dialogs, search, reactions, and thread UI.
- `validation`
  - Use for deciding what to run after a change, picking or adding tests, working with the local Playwright relay setup, and build verification.

Repo-local skill files live here:

- `skills/nostr-runtime/SKILL.md`
- `skills/chat-surface/SKILL.md`
- `skills/validation/SKILL.md`

## Current Reality

- Stack: Quasar 2, Vue 3.5, Pinia 2, TypeScript 5, NDK 3, Vitest, Playwright, Electron Builder
- The most reliable source of truth is the code under `src/`, the Nostr notes in `NIPS_USED.md`, and the existing unit/e2e tests

## Architecture Map

### Routing and app shell

- `src/router/routes.ts` defines auth, register, chats, contacts, and nested settings routes.
- `src/router/pageLoaders.ts` keeps page imports lazy.
- `src/layouts/MainLayout.vue` hosts the top-level shell.
- `src/pages/IndexPage.vue` is the main chat surface with desktop and mobile modes.

### UI and state

- `src/components/**` contains thread, list, profile, dialog, nav, relay, and message UI.
- `src/stores/chatStore.ts` owns chat-list categorization, previews, unread state, search matching, and contact-derived naming.
- `src/stores/messageStore.ts` owns message loading, pagination, search within a thread, reactions, deletions, and relay-send coordination.
- `src/composables/**` and `src/utils/**` carry reusable UI/state helpers.

### Nostr runtime

- `src/stores/nostrStore.ts` is the composition root that wires smaller runtimes together and exposes the public store API.
- `src/stores/nostr/*.ts` split protocol behavior into focused modules such as auth, relay connection, startup restore, private-message ingest, group invite handling, relay publishing, and diagnostics.
- `src/stores/nostr/valueUtils.ts` and `src/stores/nostr/testUtils.ts` are good places for pure logic that should stay easy to unit test.
- `NIPS_USED.md`, `nip171.md`, and `nip171b.md` explain the Nostr and group-chat protocol assumptions used by the code.

### Persistence and services

- `src/services/chatDataService.ts` is the IndexedDB boundary for chats and messages.
- `src/services/contactsService.ts` stores contact records and metadata.
- `src/services/nostrEventDataService.ts` stores raw or derived event data used by runtime and UI layers.
- `src/services/inputSanitizerService.ts` centralizes key, relay, and identifier normalization rules.

### Testing and desktop target

- `tests/unit/**/*.spec.ts` cover value helpers, stores, runtime logic, persistence helpers, and search behavior.
- `src/testing/e2eBridge.ts` exposes deterministic session bootstrap, refresh, logout, rotation, and message-send hooks used by Playwright.
- `e2e/*.spec.ts` provide smoke coverage for auth, contacts, DMs, groups, relays, and session restore.
- `src-electron/**` contains Electron main/preload code and packaging assets.

## Task To File Map

- Login, restore, session, private-key, or extension auth:
  - `src/stores/nostr/authIdentityRuntime.ts`
  - `src/stores/nostr/authSessionRuntime.ts`
  - `src/stores/nostr/startupRuntime.ts`
  - `src/stores/nostrStore.ts`
- Relay settings, connection state, relay diagnostics, or NIP-65 publication:
  - `src/stores/nostr/relayConnectionRuntime.ts`
  - `src/stores/nostr/relayPublishRuntime.ts`
  - `src/stores/nostr/myRelayListRuntime.ts`
  - `src/stores/nostr/contactRelayRuntime.ts`
  - `src/stores/relayStore.ts`
  - `src/stores/nip65RelayStore.ts`
- Incoming DM, reaction, deletion, or backfill behavior:
  - `src/stores/nostr/privateMessagesIngestRuntime.ts`
  - `src/stores/nostr/privateMessagesSubscriptionRuntime.ts`
  - `src/stores/nostr/privateMessagesBackfillRuntime.ts`
  - `src/stores/nostr/messageEventRuntime.ts`
  - `src/stores/messageStore.ts`
- Group invites, group membership, or epoch rotation:
  - `src/stores/nostr/groupInviteRuntime.ts`
  - `src/stores/nostr/groupEpochStateRuntime.ts`
  - `src/stores/nostr/groupEpochPublishRuntime.ts`
  - `src/utils/groupMembershipFollowSet.ts`
  - `src/utils/groupMemberTicketDelivery.ts`
- Chat list, thread UX, composer, reactions, profile cards, or responsive behavior:
  - `src/pages/IndexPage.vue`
  - `src/components/ChatList.vue`
  - `src/components/ChatThread.vue`
  - `src/components/MessageComposer.vue`
  - `src/components/MessageBubble.vue`
  - `src/stores/chatStore.ts`
  - `src/stores/messageStore.ts`
- IndexedDB schema or persistence bugs:
  - `src/services/chatDataService.ts`
  - `src/utils/indexedDbStorage.ts`
  - `tests/unit/chatDataService.spec.ts`
  - `tests/unit/nostrStorageSession.spec.ts`

## Command Map

- Install deps: `npm install`
- Run web dev server: `npm run dev`
- Run Electron dev build: `npm run dev:electron`
- Typecheck: `npm run typecheck`
- Format check only: `npm run format:check`
- Lint: `npm run lint`
- Full local quality sweep: `npm run quality:all`
- Unit tests: `npm run test:unit`
- Unit coverage: `npm run test:unit:coverage`
- Local relay-backed e2e: `npm run test:e2e:local`
- Targeted e2e smokes:
  - `npm run test:e2e:local:auth-smoke`
  - `npm run test:e2e:local:contacts-smoke`
  - `npm run test:e2e:local:dm-smoke`
  - `npm run test:e2e:local:groups-smoke`
  - `npm run test:e2e:local:relays-smoke`
  - `npm run test:e2e:local:session-smoke`

## Change Heuristics

- Prefer the narrowest owning runtime or helper instead of adding more branches to `src/stores/nostrStore.ts`.
- Preserve normalized lower-case identifiers across stores and persistence.
- Keep `data-testid` hooks stable for shared UI unless tests are updated in the same change.
- If behavior spans UI and runtime, update both the leaf unit tests and the smallest matching Playwright smoke test.
- When the README and source disagree, trust the source tree and current tests.
