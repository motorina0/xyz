import { inputSanitizerService } from 'src/services/inputSanitizerService';
import type { ContactRelay } from 'src/types/contact';

export function resolvePreferredContactRelayUrls(relays: ContactRelay[] | undefined): string[] {
  const contactRelays = Array.isArray(relays) ? relays : [];
  const preferredRelays = contactRelays
    .filter((relay) => relay.write !== false)
    .map((relay) => relay.url);
  const fallbackRelays = contactRelays.map((relay) => relay.url);

  return inputSanitizerService.normalizeStringArray(
    preferredRelays.length > 0 ? preferredRelays : fallbackRelays
  );
}
