import { developerTraceDataService } from 'src/services/developerTraceDataService';
import { hasStorage } from 'src/stores/nostr/shared';
import type { DeveloperTraceEntry, DeveloperTraceLevel } from 'src/stores/nostr/types';
import type { Ref } from 'vue';

interface DeveloperTraceRuntimeState {
  developerTraceCounter: number;
}

interface DeveloperTraceRuntimeDeps {
  developerDiagnosticsEnabled: Ref<boolean>;
  developerDiagnosticsVersion: Ref<number>;
  developerTraceState: DeveloperTraceRuntimeState;
  developerTraceVersion: Ref<number>;
  developerDiagnosticsStorageKey: string;
  getLoggedInPublicKeyHex: () => string | null;
}

export function readDeveloperDiagnosticsEnabledFromStorage(
  developerDiagnosticsStorageKey: string
): boolean {
  if (!hasStorage()) {
    return true;
  }

  return window.localStorage.getItem(developerDiagnosticsStorageKey) !== '0';
}

export function createDeveloperTraceRuntime({
  developerDiagnosticsEnabled,
  developerDiagnosticsVersion,
  getLoggedInPublicKeyHex,
  developerTraceState,
  developerTraceVersion,
  developerDiagnosticsStorageKey,
}: DeveloperTraceRuntimeDeps) {
  function readDeveloperDiagnosticsEnabled(): boolean {
    return readDeveloperDiagnosticsEnabledFromStorage(developerDiagnosticsStorageKey);
  }

  function bumpDeveloperDiagnosticsVersion(): void {
    developerDiagnosticsVersion.value += 1;
  }

  function bumpDeveloperTraceVersion(): void {
    developerTraceVersion.value += 1;
  }

  function toOptionalIsoTimestampFromUnix(value: number | null | undefined): string | null {
    if (!Number.isInteger(value) || Number(value) <= 0) {
      return null;
    }

    return new Date(Number(value) * 1000).toISOString();
  }

  function serializeDeveloperTraceValue(value: unknown, depth = 0): unknown {
    if (depth > 4) {
      return '[max-depth]';
    }

    if (
      value === null ||
      value === undefined ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value ?? null;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack ?? null,
      };
    }

    if (Array.isArray(value)) {
      return value.slice(0, 30).map((entry) => serializeDeveloperTraceValue(entry, depth + 1));
    }

    if (typeof value === 'object') {
      const result: Record<string, unknown> = {};

      for (const [key, entryValue] of Object.entries(value as Record<string, unknown>).slice(
        0,
        50
      )) {
        result[key] = serializeDeveloperTraceValue(entryValue, depth + 1);
      }

      return result;
    }

    return String(value);
  }

  function normalizeDeveloperTraceDetails(
    details: Record<string, unknown>
  ): Record<string, unknown> {
    const normalized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(details)) {
      normalized[key] = serializeDeveloperTraceValue(value);
    }

    return normalized;
  }

  function shouldEchoDeveloperTraceToConsole(scope: string, phase: string): boolean {
    if (scope.startsWith('subscription:')) {
      return (
        phase === 'start' ||
        phase === 'req' ||
        phase === 'backfill-window-subscribe' ||
        phase === 'epoch-history-subscribe'
      );
    }

    return (
      scope === 'inbound' &&
      (phase === 'epoch-ticket-received' ||
        phase === 'group-message-received' ||
        phase === 'private-message-received')
    );
  }

  function buildConsoleTracePrefixArgs(
    scope: string,
    phase: string,
    details: Record<string, unknown>
  ): unknown[] {
    if (scope !== 'subscription:private-messages' || phase !== 'req') {
      return [];
    }

    const prefixArgs: unknown[] = [];
    const relayUrls = Array.isArray(details.relayUrls)
      ? details.relayUrls.filter(
          (relayUrl): relayUrl is string =>
            typeof relayUrl === 'string' && relayUrl.trim().length > 0
        )
      : [];
    if (relayUrls.length > 0) {
      prefixArgs.push(`relays=${relayUrls.join(', ')}`);
    }

    if (Array.isArray(details.reqStatement)) {
      prefixArgs.push(`reqStatement=${JSON.stringify(details.reqStatement)}`);
    }

    return prefixArgs;
  }

  function echoDeveloperTraceToConsole(
    level: DeveloperTraceLevel,
    scope: string,
    phase: string,
    details: Record<string, unknown>
  ): void {
    const label = `[${scope}] ${phase}`;
    const prefixArgs = buildConsoleTracePrefixArgs(scope, phase, details);
    if (level === 'error') {
      console.error(label, ...prefixArgs, details);
      return;
    }

    if (level === 'warn') {
      console.warn(label, ...prefixArgs, details);
      return;
    }

    console.info(label, ...prefixArgs, details);
  }

  function logDeveloperTrace(
    level: DeveloperTraceLevel,
    scope: string,
    phase: string,
    details: Record<string, unknown> = {}
  ): void {
    const normalizedDetails = normalizeDeveloperTraceDetails(details);
    if (shouldEchoDeveloperTraceToConsole(scope, phase)) {
      echoDeveloperTraceToConsole(level, scope, phase, normalizedDetails);
    }

    if (!developerDiagnosticsEnabled.value || !getLoggedInPublicKeyHex()) {
      return;
    }

    developerTraceState.developerTraceCounter += 1;
    const entry: DeveloperTraceEntry = {
      id: `${Date.now()}-${developerTraceState.developerTraceCounter}`,
      timestamp: new Date().toISOString(),
      level,
      scope,
      phase,
      details: normalizedDetails,
    };

    void developerTraceDataService
      .appendEntry(entry)
      .then(() => {
        bumpDeveloperTraceVersion();
      })
      .catch((error) => {
        console.error('Failed to persist developer trace entry.', error);
      });
  }

  async function listDeveloperTraceEntries(): Promise<DeveloperTraceEntry[]> {
    return developerTraceDataService.listEntries();
  }

  async function clearDeveloperTraceEntries(): Promise<void> {
    await developerTraceDataService.clearEntries();
    bumpDeveloperTraceVersion();
  }

  function setDeveloperDiagnosticsEnabled(enabled: boolean): void {
    developerDiagnosticsEnabled.value = enabled;

    if (hasStorage()) {
      window.localStorage.setItem(developerDiagnosticsStorageKey, enabled ? '1' : '0');
    }

    if (!enabled) {
      void clearDeveloperTraceEntries().catch((error) => {
        console.error('Failed to clear developer trace entries.', error);
      });
    }

    developerDiagnosticsVersion.value += 1;
  }

  return {
    bumpDeveloperDiagnosticsVersion,
    bumpDeveloperTraceVersion,
    clearDeveloperTraceEntries,
    buildConsoleTracePrefixArgs,
    echoDeveloperTraceToConsole,
    listDeveloperTraceEntries,
    logDeveloperTrace,
    normalizeDeveloperTraceDetails,
    readDeveloperDiagnosticsEnabled,
    serializeDeveloperTraceValue,
    setDeveloperDiagnosticsEnabled,
    shouldEchoDeveloperTraceToConsole,
    toOptionalIsoTimestampFromUnix,
  };
}
