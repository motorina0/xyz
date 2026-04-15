# Repo Guide

## Project Snapshot

- Quasar 2 + Vue 3.5 + TypeScript app for Nostr chat, with both web and Electron targets.
- Primary state lives in Pinia stores backed by IndexedDB persistence and NDK-based relay/runtime code.
- `README.md` still reflects an older mock-data version of the app. Trust `src/`, `package.json`, `NIPS_USED.md`, and the test suite first.

## Code Map

- `src/stores/nostrStore.ts`: composition root for auth, relay, subscription, ingest, and group runtimes.
- `src/stores/nostr/*.ts`: focused runtime modules. Prefer adding behavior here instead of growing the root store.
- `src/stores/chatStore.ts` and `src/stores/messageStore.ts`: UI-facing Pinia state for chat lists, thread state, pagination, reactions, and search.
- `src/services/chatDataService.ts` and `src/services/contactsService.ts`: persistence boundary for IndexedDB-backed records.
- `src/pages/**`, `src/components/**`, `src/layouts/MainLayout.vue`: routed UI surface and responsive shell.
- `src/testing/e2eBridge.ts` and `e2e/*.spec.ts`: deterministic browser-test hooks and smoke coverage.
- `src-electron/**`: Electron bootstrap and packaging-specific code.

## Working Rules

- Normalize pubkeys, event ids, relay URLs, and user-entered identifiers through the existing sanitizer and value helpers before comparing or persisting them.
- Keep timestamps as ISO strings unless a Nostr API explicitly requires unix seconds.
- Preserve chat/contact/message metadata keys unless a schema change is deliberate and backed by tests.
- When changing Nostr or group flows, review `NIPS_USED.md`, `nip171.md`, and `nip171b.md` before changing protocol behavior.
- For pure logic, prefer small helpers in `src/stores/nostr/valueUtils.ts` or `src/utils/**` plus unit tests instead of embedding more branching into components or watchers.
- When changing UI flows, preserve both desktop split-view behavior and the mobile route-driven shell.
- Keep existing `data-testid` hooks stable unless the e2e suite is updated in the same change.

## Validation

- Default safety check: `npm run typecheck` and `npm run test:unit`
- Formatting/lint check: `npm run format:check`, `npm run lint`
- Protocol, session, relay, DM, contacts, or group flows: run the matching `npm run test:e2e:local:*` smoke test when feasible
- Web build changes: `npm run build`
- Electron packaging changes: `npm run build:electron:dir` or a platform-specific build script

## Repo Skills

- Start with `SKILLS.md` for the task map.
- Repo-local skills live in `skills/`:
  - `skills/nostr-runtime/`
  - `skills/chat-surface/`
  - `skills/validation/`
