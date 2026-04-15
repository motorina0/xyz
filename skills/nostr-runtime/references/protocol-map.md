# Nostr Runtime Map

## Core Ownership

- `src/stores/nostrStore.ts`
  - Composition root for runtime modules and public store methods
  - Re-exports `__nostrStoreTestUtils` for unit tests around pure helper logic
- `src/stores/nostr/valueUtils.ts`
  - Best home for pure normalization, comparison, and resolution helpers
- `src/stores/nostr/types.ts`
  - Shared runtime-facing types and result objects

## Protocol-Specific Areas

- Private messaging and gift-wrap ingest:
  - `src/stores/nostr/privateMessagesIngestRuntime.ts`
  - `src/stores/nostr/privateMessagesSubscriptionRuntime.ts`
  - `src/stores/nostr/privateMessagesBackfillRuntime.ts`
  - `src/stores/nostr/privateMessagesUiRuntime.ts`
- Group invites and epoch rotation:
  - `src/stores/nostr/groupInviteRuntime.ts`
  - `src/stores/nostr/groupEpochStateRuntime.ts`
  - `src/stores/nostr/groupEpochPublishRuntime.ts`
  - `src/utils/groupMembershipFollowSet.ts`
  - `src/utils/groupMemberTicketDelivery.ts`
- Relay and profile publication:
  - `src/stores/nostr/relayPublishRuntime.ts`
  - `src/stores/nostr/myRelayListRuntime.ts`
  - `src/stores/nostr/contactProfileRuntime.ts`
  - `src/stores/nostr/contactRelayRuntime.ts`

## Invariants Worth Preserving

- Hex keys and event ids are generally stored normalized and lower-case.
- Relay URLs should flow through sanitizer or normalizer helpers rather than raw string comparisons.
- Chat, contact, and message metadata carry behavior-critical flags; avoid renaming keys casually.
- ISO timestamp strings are used broadly across persistence, UI, and runtime code.
- Many runtime changes have both unit and e2e implications because the UI consumes persisted state after async relay work.

## Useful Supporting Docs

- `NIPS_USED.md`
  - High-level list of the NIPs actively used in this repo
- `nip171.md`
  - Group-chat draft notes
- `nip171b.md`
  - Additional draft notes for the group scheme

## Good Test Anchors

- `tests/unit/nostrStore.spec.ts`
  - Pure helper and value-logic coverage via `__nostrStoreTestUtils`
- `tests/unit/privateMessagesIngestRuntime.spec.ts`
  - Inbound DM and related ingest behavior
- `tests/unit/privateStateRuntime.spec.ts`
  - Private-state restore and related runtime behavior
- `tests/unit/contactProfileRuntime.spec.ts`
  - Contact profile sync behavior
- `tests/unit/userActions.spec.ts`
  - Higher-level user-facing Nostr actions
- `e2e/session.spec.ts`
  - Restore and session behavior
- `e2e/dm.spec.ts`
  - Direct-message flows
- `e2e/groups.spec.ts`
  - Group invite and epoch-related flows
- `e2e/relays.spec.ts`
  - Relay settings and publication flows
