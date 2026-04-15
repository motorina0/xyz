# Validation Matrix

## Core Commands

- Typecheck:
  - `npm run typecheck`
- Formatting and lint:
  - `npm run format:check`
  - `npm run lint`
- Full local sweep:
  - `npm run quality:all`
- Unit tests:
  - `npm run test:unit`
  - `npm run test:unit:coverage`
- Local relay-backed e2e:
  - `npm run test:e2e:local`

## Targeted Smoke Tests

- Auth:
  - `npm run test:e2e:local:auth-smoke`
- Contacts:
  - `npm run test:e2e:local:contacts-smoke`
- Direct messages:
  - `npm run test:e2e:local:dm-smoke`
- Groups:
  - `npm run test:e2e:local:groups-smoke`
- Relays:
  - `npm run test:e2e:local:relays-smoke`
- Session restore:
  - `npm run test:e2e:local:session-smoke`

## File Area To Test Area

- `src/stores/nostr/**`
  - Start with `npm run typecheck` and `npm run test:unit`
  - Add the nearest relay, DM, group, or session smoke test when the change affects async runtime behavior
- `src/stores/chatStore.ts` or `src/stores/messageStore.ts`
  - Start with `npm run typecheck` and `npm run test:unit`
  - Add DM, contacts, or groups smoke coverage for browser-visible behavior
- `src/components/**`, `src/pages/**`, `src/layouts/**`
  - Start with `npm run typecheck` and `npm run test:unit`
  - Prefer the closest browser smoke test if interaction or layout behavior changed
- `src/services/chatDataService.ts` or IndexedDB helpers
  - Start with `npm run typecheck` and `npm run test:unit`
  - Consider session or DM smoke tests if persistence timing matters
- `src-electron/**`
  - Start with `npm run typecheck`
  - Add `npm run build:electron:dir` or a platform-specific package build when feasible

## Useful Debug Clues

- Playwright traces, screenshots, and videos are retained by config and local runs
- The local relay setup resets its Docker volume on each `test:e2e:local` run, so flakes caused by leftover relay state are less likely
- `src/testing/e2eBridge.ts` is the fastest way to understand how tests seed users, relays, and group state
