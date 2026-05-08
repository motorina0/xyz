# Repo Guide

## Project Snapshot

- Quasar 2 + Vue 3.5 + TypeScript app for Nostr chat, with both web and Electron targets.
- Primary state lives in Pinia stores backed by IndexedDB persistence and NDK-based relay/runtime code.
- `README.md` still reflects an older mock-data version of the app. Trust `src/`, `package.json`, `NIPS_USED.md`, and the test suite first.

## Session Bootstrap

- For any fresh checkout, container, cloud session, or AI coding tool session, install dependencies before running project scripts.
- Run `npm install` from the repo root when `node_modules/` is missing, after dependency changes in `package.json` or `package-lock.json`, or when npm scripts fail because local binaries are unavailable.
- This repo uses npm with `package-lock.json`; do not switch to yarn or pnpm unless the user explicitly asks.
- If `npm install` cannot run because of network, sandbox, or registry access, report that blocker before attempting validation commands that depend on installed packages.

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

- Validation is part of the change, not optional cleanup.
- After every code change, run the post-change loop before considering the task complete:
  - `npm run quality:all`
  - `npm run test:unit`
  - the closest matching `npm run test:e2e:local:*` smoke test
- If the change spans multiple user-visible or relay-sensitive areas, or there is no narrow smoke test, run `npm run test:e2e:local`
- Protocol, session, relay, DM, contacts, or group flows should default to a targeted local e2e smoke test even if unit coverage already passes
- Web build changes: `npm run build`
- Electron packaging changes: `npm run build:electron:dir` or a platform-specific build script
- If a validation step cannot run, report exactly what was attempted, what was skipped, and why

## Repo Skills

- Start with `SKILLS.md` for the task map.
- Repo-local skills live in `skills/`:
  - `skills/nostr-runtime/`
  - `skills/chat-surface/`
  - `skills/validation/`
