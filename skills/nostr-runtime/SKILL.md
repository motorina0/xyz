---
name: nostr-runtime
description: Use when a task touches Nostr auth, relay lists, subscriptions, private-message ingest, group invites, epoch rotation, or other code under src/stores/nostr and src/stores/nostrStore.ts.
---

# Nostr Runtime

## Overview

This skill is for the protocol and runtime layer of the app. Use it when the change involves login or restore flows, relays, private messaging, group-chat epoch logic, Nostr publication, or runtime diagnostics.

## Start From The Right Boundary

- `src/stores/nostrStore.ts` is the composition root. Read its imports and exported methods first to find the runtime module that owns the behavior.
- Prefer targeted edits in `src/stores/nostr/*.ts` or `src/stores/nostr/valueUtils.ts` instead of growing the root store.
- Use persistence services such as `src/services/chatDataService.ts`, `src/services/contactsService.ts`, and `src/services/nostrEventDataService.ts` instead of writing ad hoc storage logic in runtime modules.

## Runtime Invariants

- Normalize pubkeys, event ids, relay URLs, and user-entered identifiers through existing sanitizer/value helpers before storing or comparing them.
- Keep timestamps as ISO strings unless a Nostr API explicitly needs unix seconds.
- Preserve metadata keys on chats, contacts, and messages unless a schema change is intentional and tested.
- Group chat messages route through the current epoch public key. Group-invite and epoch logic should stay aligned with `NIPS_USED.md`, `nip171.md`, and `nip171b.md`.
- When logic is pure normalization or resolution, prefer adding or reusing helpers in `valueUtils.ts` so the behavior is easy to unit test.

## Typical Workflow

1. Locate the public entry point in `src/stores/nostrStore.ts`.
2. Find the narrowest owning runtime under `src/stores/nostr/`.
3. Check nearby unit tests for the same behavior or helper family.
4. Make the smallest leaf change first.
5. Only widen the public store API if the UI or e2e layer truly needs it.

## High-Value Files

- Auth and session:
  - `src/stores/nostr/authIdentityRuntime.ts`
  - `src/stores/nostr/authSessionRuntime.ts`
  - `src/stores/nostr/startupRuntime.ts`
  - `src/stores/nostr/storageSession.ts`
- Relay behavior:
  - `src/stores/nostr/relayConnectionRuntime.ts`
  - `src/stores/nostr/relayPublishRuntime.ts`
  - `src/stores/nostr/myRelayListRuntime.ts`
  - `src/stores/nostr/contactRelayRuntime.ts`
- Private-message flow:
  - `src/stores/nostr/privateMessagesSubscriptionRuntime.ts`
  - `src/stores/nostr/privateMessagesBackfillRuntime.ts`
  - `src/stores/nostr/privateMessagesIngestRuntime.ts`
  - `src/stores/nostr/privateMessagesUiRuntime.ts`
  - `src/stores/nostr/messageEventRuntime.ts`
  - `src/stores/nostr/messageMutationRuntime.ts`
- Groups:
  - `src/stores/nostr/groupInviteRuntime.ts`
  - `src/stores/nostr/groupEpochStateRuntime.ts`
  - `src/stores/nostr/groupEpochPublishRuntime.ts`
  - `src/stores/nostr/privateContactMembershipRuntime.ts`

## Validation

- Minimum: `npm run typecheck` and `npm run test:unit`
- For session, DM, group, or relay changes, run the closest matching local e2e smoke test when feasible
- When touching shared normalization or value helpers, add or update unit coverage first

## References

- `references/protocol-map.md`
