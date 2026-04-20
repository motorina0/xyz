import { useMockDelay } from '../composables/useMockDelay';
import { createInitialProfiles } from '../data/mockProfiles';
import type { NostrProfile } from '../types/nostr';

export async function loadMockProfiles(currentUserPubkey?: string | null): Promise<NostrProfile[]> {
  await useMockDelay(40, 120);
  return JSON.parse(JSON.stringify(createInitialProfiles(currentUserPubkey ?? undefined))) as NostrProfile[];
}
