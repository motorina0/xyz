export const STARTUP_STEP_DEFINITIONS = [
  { id: 'my-relays-restore', order: 1, label: 'Restore My NIP-65 relay list' },
  { id: 'my-relays-subscribe', order: 2, label: 'Subscribe to My relay-list updates' },
  { id: 'outbound-message-replay', order: 3, label: 'Start outbound message replay' },
  { id: 'private-preferences', order: 4, label: 'Restore encrypted private preferences' },
  { id: 'private-contact-list-restore', order: 5, label: 'Restore encrypted private contact list' },
  { id: 'group-identity-secrets', order: 6, label: 'Restore group identity secrets' },
  { id: 'group-relay-lists-refresh', order: 7, label: 'Refresh group relay lists' },
  { id: 'contact-cursor-state', order: 8, label: 'Restore per-contact cursor state' },
  { id: 'logged-in-contact-profile', order: 9, label: 'Sync logged-in contact profile' },
  { id: 'recent-chat-contacts-sync', order: 10, label: 'Sync recent chat contacts' },
  {
    id: 'private-contact-list-subscribe',
    order: 11,
    label: 'Subscribe to private contact-list updates',
  },
  { id: 'private-messages-subscribe', order: 12, label: 'Subscribe to private messages' },
  { id: 'group-rosters-subscribe', order: 13, label: 'Subscribe to group rosters' },
  { id: 'contact-profile-subscribe', order: 14, label: 'Subscribe to contact profile updates' },
  {
    id: 'contact-relay-list-subscribe',
    order: 15,
    label: 'Subscribe to contact relay-list updates',
  },
] as const;

export type StartupStepId = (typeof STARTUP_STEP_DEFINITIONS)[number]['id'];
export const STARTUP_INTERNAL_TASK_DEFINITIONS = [
  {
    id: 'my-relay-list',
    parentId: 'my-relays-restore',
    label: 'Fetch and apply NIP-65 relay list',
  },
  {
    id: 'private-contact-list',
    parentId: 'private-contact-list-restore',
    label: 'Fetch, decrypt, and apply contact list',
  },
  {
    id: 'private-contact-profiles',
    parentId: 'private-contact-list-restore',
    label: 'Private contact profile metadata',
  },
  {
    id: 'private-contact-relays',
    parentId: 'private-contact-list-restore',
    label: 'Private contact relay lists',
  },
  {
    id: 'contact-cursor-data',
    parentId: 'contact-cursor-state',
    label: 'Fetch and apply contact cursor data',
  },
  {
    id: 'logged-in-profile',
    parentId: 'logged-in-contact-profile',
    label: 'Logged-in user profile metadata',
  },
  {
    id: 'logged-in-relays',
    parentId: 'logged-in-contact-profile',
    label: 'Logged-in user relay list',
  },
  {
    id: 'recent-chat-profiles',
    parentId: 'recent-chat-contacts-sync',
    label: 'Recent chat contact profiles',
  },
  {
    id: 'recent-chat-relays',
    parentId: 'recent-chat-contacts-sync',
    label: 'Recent chat contact relay lists',
  },
  {
    id: 'private-message-events',
    parentId: 'private-messages-subscribe',
    label: 'Live private-message relay sync',
    completeParentOnFinish: true,
  },
] as const satisfies readonly {
  id: string;
  parentId: StartupStepId;
  label: string;
  completeParentOnFinish?: boolean;
}[];

export type StartupInternalTaskId = (typeof STARTUP_INTERNAL_TASK_DEFINITIONS)[number]['id'];
export type StartupTrackId = StartupStepId | StartupInternalTaskId;
export type StartupStepStatus = 'pending' | 'in_progress' | 'success' | 'error';

export interface StartupTimedSnapshot {
  id: string;
  label: string;
  status: StartupStepStatus;
  startedAt: number | null;
  completedAt: number | null;
  durationMs: number | null;
  errorMessage: string | null;
  eventCount: number | null;
}

export interface StartupInternalTaskSnapshot extends StartupTimedSnapshot {
  id: string;
}

export interface StartupStepSnapshot extends StartupTimedSnapshot {
  id: StartupStepId;
  order: number;
  internalTasks: StartupInternalTaskSnapshot[];
}

export interface StartupDisplaySnapshot {
  stepId: StartupStepId | null;
  label: string | null;
  status: StartupStepStatus | null;
  showProgress: boolean;
}

export function createInitialStartupStepSnapshots(): StartupStepSnapshot[] {
  return STARTUP_STEP_DEFINITIONS.map((step) => ({
    ...step,
    status: 'pending',
    startedAt: null,
    completedAt: null,
    durationMs: null,
    errorMessage: null,
    eventCount: null,
    internalTasks: [],
  }));
}

export function beginStartupTimedSnapshotValue<TSnapshot extends StartupTimedSnapshot>(
  step: TSnapshot,
  now: number
): TSnapshot {
  if (step.status === 'in_progress') {
    return step;
  }

  return {
    ...step,
    status: 'in_progress',
    startedAt: now,
    completedAt: null,
    durationMs: null,
    errorMessage: null,
    eventCount: step.eventCount ?? null,
  } as TSnapshot;
}

export function completeStartupTimedSnapshotValue<TSnapshot extends StartupTimedSnapshot>(
  step: TSnapshot,
  now: number
): TSnapshot {
  const startedAt = step.startedAt ?? now;
  return {
    ...step,
    status: 'success',
    startedAt,
    completedAt: now,
    durationMs: Math.max(0, now - startedAt),
    errorMessage: null,
    eventCount: step.eventCount ?? null,
  } as TSnapshot;
}

export function failStartupTimedSnapshotValue<TSnapshot extends StartupTimedSnapshot>(
  step: TSnapshot,
  error: unknown,
  now: number
): TSnapshot {
  const startedAt = step.startedAt ?? now;
  return {
    ...step,
    status: 'error',
    startedAt,
    completedAt: now,
    durationMs: Math.max(0, now - startedAt),
    errorMessage: error instanceof Error ? error.message : String(error),
    eventCount: step.eventCount ?? null,
  } as TSnapshot;
}

export const beginStartupStepSnapshotValue = beginStartupTimedSnapshotValue<StartupStepSnapshot>;
export const completeStartupStepSnapshotValue =
  completeStartupTimedSnapshotValue<StartupStepSnapshot>;
export const failStartupStepSnapshotValue = failStartupTimedSnapshotValue<StartupStepSnapshot>;

export function resolveStartupStepIdValue(trackId: StartupTrackId): StartupStepId {
  const directStep = STARTUP_STEP_DEFINITIONS.find((step) => step.id === trackId);
  if (directStep) {
    return directStep.id;
  }

  const internalTask = STARTUP_INTERNAL_TASK_DEFINITIONS.find((task) => task.id === trackId);
  if (!internalTask) {
    throw new Error(`Unknown startup step: ${trackId}`);
  }

  return internalTask.parentId;
}

export function getStartupInternalTaskDefinitionValue(
  trackId: string
): (typeof STARTUP_INTERNAL_TASK_DEFINITIONS)[number] | null {
  return STARTUP_INTERNAL_TASK_DEFINITIONS.find((task) => task.id === trackId) ?? null;
}

export function resetStartupStepSnapshotsValue(): StartupStepSnapshot[] {
  return createInitialStartupStepSnapshots();
}
