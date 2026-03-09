const THEME_MODE_STORAGE_KEY = 'ui-theme-mode';
const PANEL_OPACITY_STORAGE_KEY = 'ui-panel-opacity';
const DEFAULT_PANEL_OPACITY = 75;

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function canUseDocument(): boolean {
  return typeof document !== 'undefined';
}

function normalizePanelOpacityPreference(value: unknown): number {
  const parsedValue =
    typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);

  if (!Number.isFinite(parsedValue)) {
    return DEFAULT_PANEL_OPACITY;
  }

  return Math.min(100, Math.max(0, Math.round(parsedValue)));
}

export function readDarkModePreference(): boolean | null {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const value = window.localStorage.getItem(THEME_MODE_STORAGE_KEY);
    if (value === 'dark') {
      return true;
    }

    if (value === 'light') {
      return false;
    }
  } catch (error) {
    console.error('Failed to read saved theme mode.', error);
  }

  return null;
}

export function saveDarkModePreference(isDark: boolean): void {
  if (!canUseStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(THEME_MODE_STORAGE_KEY, isDark ? 'dark' : 'light');
  } catch (error) {
    console.error('Failed to persist theme mode.', error);
  }
}

export function clearDarkModePreference(): void {
  if (!canUseStorage()) {
    return;
  }

  try {
    window.localStorage.removeItem(THEME_MODE_STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear saved theme mode.', error);
  }
}

export function readPanelOpacityPreference(): number {
  if (!canUseStorage()) {
    return DEFAULT_PANEL_OPACITY;
  }

  try {
    const value = window.localStorage.getItem(PANEL_OPACITY_STORAGE_KEY);
    if (value === null) {
      return DEFAULT_PANEL_OPACITY;
    }

    return normalizePanelOpacityPreference(value);
  } catch (error) {
    console.error('Failed to read saved panel opacity.', error);
  }

  return DEFAULT_PANEL_OPACITY;
}

export function applyPanelOpacityPreference(opacity: number): void {
  if (!canUseDocument()) {
    return;
  }

  document.documentElement.style.setProperty(
    '--tg-panel-opacity',
    String(normalizePanelOpacityPreference(opacity))
  );
}

export function savePanelOpacityPreference(opacity: number): void {
  const normalizedOpacity = normalizePanelOpacityPreference(opacity);

  if (!canUseStorage()) {
    applyPanelOpacityPreference(normalizedOpacity);
    return;
  }

  try {
    window.localStorage.setItem(PANEL_OPACITY_STORAGE_KEY, String(normalizedOpacity));
  } catch (error) {
    console.error('Failed to persist panel opacity.', error);
  }

  applyPanelOpacityPreference(normalizedOpacity);
}

export function clearPanelOpacityPreference(): void {
  if (canUseStorage()) {
    try {
      window.localStorage.removeItem(PANEL_OPACITY_STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear saved panel opacity.', error);
    }
  }

  applyPanelOpacityPreference(DEFAULT_PANEL_OPACITY);
}
