import { onBeforeUnmount, onMounted, ref } from 'vue';

function readVisibleViewportHeight(fallbackHeight: number): number {
  if (typeof window === 'undefined') {
    return fallbackHeight;
  }

  return Math.round(window.visualViewport?.height ?? window.innerHeight ?? fallbackHeight);
}

export function useVisibleViewportHeight(getFallbackHeight: () => number) {
  const visibleViewportHeight = ref<number | null>(null);

  function updateVisibleViewportHeight(): void {
    visibleViewportHeight.value = readVisibleViewportHeight(getFallbackHeight());
  }

  onMounted(() => {
    updateVisibleViewportHeight();

    const visualViewport = window.visualViewport;
    window.addEventListener('resize', updateVisibleViewportHeight);
    window.addEventListener('orientationchange', updateVisibleViewportHeight);
    visualViewport?.addEventListener('resize', updateVisibleViewportHeight);
    visualViewport?.addEventListener('scroll', updateVisibleViewportHeight);
  });

  onBeforeUnmount(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const visualViewport = window.visualViewport;
    window.removeEventListener('resize', updateVisibleViewportHeight);
    window.removeEventListener('orientationchange', updateVisibleViewportHeight);
    visualViewport?.removeEventListener('resize', updateVisibleViewportHeight);
    visualViewport?.removeEventListener('scroll', updateVisibleViewportHeight);
  });

  return {
    visibleViewportHeight,
    updateVisibleViewportHeight
  };
}
