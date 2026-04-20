import { useMockDelay } from '../composables/useMockDelay';
import { createInitialFeedState } from '../data/mockNotes';
import type { FeedPersistenceState } from '../types/nostr';

export async function loadMockFeedState(currentUserPubkey?: string | null): Promise<FeedPersistenceState> {
  await useMockDelay(60, 160);
  return createInitialFeedState(currentUserPubkey ?? undefined);
}
