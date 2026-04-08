import type { Ref } from 'vue';
import {
  beginStartupStepSnapshotValue,
  completeStartupStepSnapshotValue,
  failStartupStepSnapshotValue,
  resetStartupStepSnapshotsValue,
  type StartupDisplaySnapshot,
  type StartupStepId,
  type StartupStepSnapshot
} from 'src/stores/nostr/startupState';

interface StartupRuntimeState {
  startupDisplayShownAt: number;
  startupDisplayTimer: ReturnType<typeof globalThis.setTimeout> | null;
  startupDisplayToken: number;
}

interface StartupRuntimeDeps {
  startupDisplay: Ref<StartupDisplaySnapshot>;
  startupState: StartupRuntimeState;
  startupSteps: Ref<StartupStepSnapshot[]>;
  startupStepMinProgressMs: number;
}

export function createStartupRuntime({
  startupDisplay,
  startupState,
  startupSteps,
  startupStepMinProgressMs
}: StartupRuntimeDeps) {
  function clearStartupDisplayTimer(): void {
    if (startupState.startupDisplayTimer !== null) {
      globalThis.clearTimeout(startupState.startupDisplayTimer);
      startupState.startupDisplayTimer = null;
    }
  }

  function getStartupStepSnapshot(stepId: StartupStepId): StartupStepSnapshot {
    const step = startupSteps.value.find((entry) => entry.id === stepId);
    if (!step) {
      throw new Error(`Unknown startup step: ${stepId}`);
    }

    return step;
  }

  function showStartupStepProgress(stepId: StartupStepId): void {
    const step = getStartupStepSnapshot(stepId);
    startupState.startupDisplayToken += 1;
    startupState.startupDisplayShownAt = Date.now();
    clearStartupDisplayTimer();
    startupDisplay.value = {
      stepId,
      label: step.label,
      status: 'in_progress',
      showProgress: true
    };
  }

  function finalizeStartupStepDisplay(stepId: StartupStepId, status: 'success' | 'error'): void {
    const step = getStartupStepSnapshot(stepId);
    if (startupDisplay.value.stepId !== stepId) {
      return;
    }

    const displayToken = ++startupState.startupDisplayToken;
    const applyFinalState = () => {
      if (displayToken !== startupState.startupDisplayToken) {
        return;
      }

      startupDisplay.value = {
        stepId,
        label: step.label,
        status,
        showProgress: false
      };
      startupState.startupDisplayTimer = null;
    };

    const elapsedMs =
      startupState.startupDisplayShownAt > 0 ? Date.now() - startupState.startupDisplayShownAt : 0;
    const remainingProgressMs = Math.max(startupStepMinProgressMs - elapsedMs, 0);
    clearStartupDisplayTimer();

    if (remainingProgressMs > 0) {
      startupState.startupDisplayTimer = globalThis.setTimeout(
        applyFinalState,
        remainingProgressMs
      );
      return;
    }

    applyFinalState();
  }

  function beginStartupStep(stepId: StartupStepId): void {
    const step = getStartupStepSnapshot(stepId);
    const nextStep = beginStartupStepSnapshotValue(step, Date.now());
    if (nextStep === step) {
      return;
    }
    Object.assign(step, nextStep);
    showStartupStepProgress(stepId);
  }

  function completeStartupStep(stepId: StartupStepId): void {
    const step = getStartupStepSnapshot(stepId);
    Object.assign(step, completeStartupStepSnapshotValue(step, Date.now()));
    finalizeStartupStepDisplay(stepId, 'success');
  }

  function failStartupStep(stepId: StartupStepId, error: unknown): void {
    const step = getStartupStepSnapshot(stepId);
    Object.assign(step, failStartupStepSnapshotValue(step, error, Date.now()));
    finalizeStartupStepDisplay(stepId, 'error');
  }

  function resetStartupStepTracking(): void {
    clearStartupDisplayTimer();
    startupState.startupDisplayToken += 1;
    startupState.startupDisplayShownAt = 0;
    startupSteps.value = resetStartupStepSnapshotsValue();
    startupDisplay.value = {
      stepId: null,
      label: null,
      status: null,
      showProgress: false
    };
  }

  function createStartupBatchTracker(stepId: StartupStepId): {
    beginItem: () => void;
    finishItem: (error?: unknown) => void;
    seal: () => void;
  } {
    let started = false;
    let sealed = false;
    let inFlightCount = 0;

    const maybeComplete = () => {
      if (!sealed || inFlightCount > 0) {
        return;
      }

      const step = getStartupStepSnapshot(stepId);
      if (step.status === 'in_progress') {
        completeStartupStep(stepId);
      }
    };

    return {
      beginItem() {
        if (!started) {
          beginStartupStep(stepId);
          started = true;
        }
        inFlightCount += 1;
      },
      finishItem(error?: unknown) {
        if (!started) {
          beginStartupStep(stepId);
          started = true;
        }

        inFlightCount = Math.max(0, inFlightCount - 1);
        if (error) {
          failStartupStep(stepId, error);
          return;
        }

        maybeComplete();
      },
      seal() {
        sealed = true;
        if (!started) {
          beginStartupStep(stepId);
          completeStartupStep(stepId);
          return;
        }

        maybeComplete();
      }
    };
  }

  return {
    beginStartupStep,
    clearStartupDisplayTimer,
    completeStartupStep,
    createStartupBatchTracker,
    failStartupStep,
    finalizeStartupStepDisplay,
    getStartupStepSnapshot,
    resetStartupStepTracking,
    showStartupStepProgress
  };
}

