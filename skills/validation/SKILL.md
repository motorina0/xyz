---
name: validation
description: Use when choosing checks to run after a change, adding tests, debugging failures, or working with the local Playwright and build workflows in this repo.
---

# Validation

## Overview

This skill helps pick the smallest useful validation plan for a change in this repo. Use it for typecheck or lint decisions, unit-test targeting, relay-backed Playwright runs, build verification, and failure triage.

## Validation Rules Of Thumb

- Default safety check for most code changes: `npm run typecheck` and `npm run test:unit`
- If the change affects shared formatting or lint rules: add `npm run format:check` and `npm run lint`
- If the change affects auth, session restore, contacts, relays, DMs, or groups: run the nearest `npm run test:e2e:local:*` smoke test when feasible
- If the change affects packaging or platform entry points: run the smallest matching build command

## E2E Notes

- Local e2e runs use `scripts/run-e2e-local.cjs`
- That script brings up the relay stack from `docker-compose.e2e.yml`, waits for relay ports `7000` and `7001`, runs Playwright, and tears the stack down again
- `src/testing/e2eBridge.ts` exposes deterministic browser hooks for bootstrap, refresh, logout, group epoch rotation, and scripted message sends
- `playwright.config.ts` starts the app with `npm run dev:e2e`, uses Chromium, and records traces, screenshots, and video

## Typical Workflow

1. Map the changed files to the nearest owning tests.
2. Run the smallest useful unit coverage first.
3. Add an e2e smoke test only when the behavior is browser-visible or relay-timing-sensitive.
4. If a test fails, check whether the bug belongs in UI state, runtime output, or persistence before broadening the fix.

## Build Targets

- Web build: `npm run build`
- Electron dev build: `npm run dev:electron`
- Electron package directory output: `npm run build:electron:dir`
- Platform packages:
  - `npm run build:electron:mac`
  - `npm run build:electron:win`
  - `npm run build:electron:linux`

## References

- `references/test-matrix.md`
