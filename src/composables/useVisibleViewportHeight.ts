import { onBeforeUnmount, onMounted, ref } from 'vue';

const KEYBOARD_HEIGHT_THRESHOLD_PX = 80;
const KEYBOARD_HEIGHT_RATIO = 0.18;

export interface VisibleViewportMetrics {
  height: number;
  offsetTop: number;
  layoutHeight: number;
  keyboardInset: number;
  isKeyboardVisible: boolean;
}

function readRoundedViewportValue(value: number | undefined, fallbackValue: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return Math.max(0, Math.round(fallbackValue));
  }

  return Math.max(0, Math.round(value));
}

export function readVisibleViewportMetrics(fallbackHeight: number): VisibleViewportMetrics {
  if (typeof window === 'undefined') {
    const height = Math.max(0, Math.round(fallbackHeight));
    return {
      height,
      offsetTop: 0,
      layoutHeight: height,
      keyboardInset: 0,
      isKeyboardVisible: false,
    };
  }

  const layoutHeight = readRoundedViewportValue(window.innerHeight, fallbackHeight);
  const visualViewportHeight = readRoundedViewportValue(
    window.visualViewport?.height,
    layoutHeight
  );
  const visualViewportOffsetTop = readRoundedViewportValue(window.visualViewport?.offsetTop, 0);
  const keyboardInset = Math.max(0, layoutHeight - visualViewportHeight - visualViewportOffsetTop);
  const heightDelta = Math.max(0, layoutHeight - visualViewportHeight);
  const keyboardHeightThreshold = Math.max(
    KEYBOARD_HEIGHT_THRESHOLD_PX,
    Math.round(layoutHeight * KEYBOARD_HEIGHT_RATIO)
  );

  return {
    height: visualViewportHeight,
    offsetTop: visualViewportOffsetTop,
    layoutHeight,
    keyboardInset,
    isKeyboardVisible:
      keyboardInset >= KEYBOARD_HEIGHT_THRESHOLD_PX || heightDelta >= keyboardHeightThreshold,
  };
}

export function useVisibleViewportHeight(getFallbackHeight: () => number) {
  const visibleViewportHeight = ref<number | null>(null);
  const visibleViewportOffsetTop = ref(0);
  const visibleViewportKeyboardInset = ref(0);
  const isVisualViewportKeyboardVisible = ref(false);
  let pendingAnimationFrameId: number | null = null;
  const pendingTimeoutIds = new Set<number>();

  function updateVisibleViewportHeight(): void {
    const metrics = readVisibleViewportMetrics(getFallbackHeight());
    visibleViewportHeight.value = metrics.height;
    visibleViewportOffsetTop.value = metrics.offsetTop;
    visibleViewportKeyboardInset.value = metrics.keyboardInset;
    isVisualViewportKeyboardVisible.value = metrics.isKeyboardVisible;
  }

  function scheduleVisibleViewportHeightUpdate(): void {
    updateVisibleViewportHeight();

    if (typeof window === 'undefined') {
      return;
    }

    if (pendingAnimationFrameId === null) {
      pendingAnimationFrameId = window.requestAnimationFrame(() => {
        pendingAnimationFrameId = null;
        updateVisibleViewportHeight();
      });
    }

    [80, 220, 420].forEach((delay) => {
      const timeoutId = window.setTimeout(() => {
        pendingTimeoutIds.delete(timeoutId);
        updateVisibleViewportHeight();
      }, delay);
      pendingTimeoutIds.add(timeoutId);
    });
  }

  function clearPendingViewportUpdates(): void {
    if (typeof window === 'undefined') {
      return;
    }

    if (pendingAnimationFrameId !== null) {
      window.cancelAnimationFrame(pendingAnimationFrameId);
      pendingAnimationFrameId = null;
    }

    pendingTimeoutIds.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    pendingTimeoutIds.clear();
  }

  onMounted(() => {
    scheduleVisibleViewportHeightUpdate();

    const visualViewport = window.visualViewport;
    window.addEventListener('resize', scheduleVisibleViewportHeightUpdate);
    window.addEventListener('orientationchange', scheduleVisibleViewportHeightUpdate);
    window.addEventListener('focusin', scheduleVisibleViewportHeightUpdate);
    window.addEventListener('focusout', scheduleVisibleViewportHeightUpdate);
    visualViewport?.addEventListener('resize', scheduleVisibleViewportHeightUpdate);
    visualViewport?.addEventListener('scroll', scheduleVisibleViewportHeightUpdate);
  });

  onBeforeUnmount(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const visualViewport = window.visualViewport;
    window.removeEventListener('resize', scheduleVisibleViewportHeightUpdate);
    window.removeEventListener('orientationchange', scheduleVisibleViewportHeightUpdate);
    window.removeEventListener('focusin', scheduleVisibleViewportHeightUpdate);
    window.removeEventListener('focusout', scheduleVisibleViewportHeightUpdate);
    visualViewport?.removeEventListener('resize', scheduleVisibleViewportHeightUpdate);
    visualViewport?.removeEventListener('scroll', scheduleVisibleViewportHeightUpdate);
    clearPendingViewportUpdates();
  });

  return {
    visibleViewportHeight,
    visibleViewportOffsetTop,
    visibleViewportKeyboardInset,
    isVisualViewportKeyboardVisible,
    updateVisibleViewportHeight,
    scheduleVisibleViewportHeightUpdate,
  };
}
