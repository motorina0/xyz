---
name: chat-surface
description: Use when a task touches routed pages, Quasar components, responsive shell behavior, chatStore, messageStore, or other chat UI state and rendering logic.
---

# Chat Surface

## Overview

This skill is for the UI-facing side of the app: routed pages, Quasar components, responsive layout behavior, chat/thread state, and the bridge between persistence and what the user sees.

## Ownership Guide

- Routes and page-level behavior live under `src/router/**`, `src/layouts/**`, and `src/pages/**`.
- Shared UI lives under `src/components/**`.
- Chat-list derived state belongs in `src/stores/chatStore.ts`.
- Thread, pagination, reactions, deletions, and thread search belong in `src/stores/messageStore.ts`.
- Persistent chat/message records live behind `src/services/chatDataService.ts`, not directly in components.

## UI Invariants

- Preserve both desktop split-view behavior and the mobile route-driven flow.
- Keep existing `data-testid` hooks stable unless the matching Playwright test is updated in the same change.
- Prefer changing store logic or composables when multiple components depend on the same behavior.
- Keep route names and navigation behavior aligned with `src/router/routes.ts`.
- Reuse existing Quasar patterns and the repo's current visual language instead of introducing an unrelated design system.

## Typical Workflow

1. Start at the route, page, or component the user interacts with.
2. Trace any derived state into `chatStore`, `messageStore`, or the relevant composable.
3. If the issue is really persisted data shape or runtime output, move one layer deeper instead of patching the component.
4. Update the narrowest unit or e2e coverage that matches the user-visible behavior.

## High-Value Files

- Main chat shell:
  - `src/pages/IndexPage.vue`
  - `src/layouts/MainLayout.vue`
  - `src/components/ChatList.vue`
  - `src/components/ChatThread.vue`
  - `src/components/MessageComposer.vue`
  - `src/components/MessageBubble.vue`
- Auxiliary UI:
  - `src/components/ContactLookupDialog.vue`
  - `src/components/ContactProfile.vue`
  - `src/components/ChatRequestsPage.vue`
  - `src/components/AppNavRail.vue`
  - `src/components/RelayEditorPanel.vue`
- State and helpers:
  - `src/stores/chatStore.ts`
  - `src/stores/messageStore.ts`
  - `src/composables/**`
  - `src/utils/messageSearch.ts`
  - `src/utils/messageWindowRange.ts`
  - `src/utils/messageReactions.ts`

## Validation

- Minimum: `npm run typecheck` and `npm run test:unit`
- For changes visible in browser workflows, run the closest e2e smoke test when feasible
- For component changes tied to thread state, check both the UI file and the owning store tests

## References

- `references/ui-map.md`
