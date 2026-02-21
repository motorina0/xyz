const THEME_MODE_STORAGE_KEY = 'ui-theme-mode';

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
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
