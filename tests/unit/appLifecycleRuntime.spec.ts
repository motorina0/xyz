import {
  createAppLifecycleRuntime,
  type NativeAppLifecycleRuntimeHandlers,
} from 'src/stores/nostr/appLifecycleRuntime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const CHAT_PUBLIC_KEY = 'a'.repeat(64);

describe('appLifecycleRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal('document', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      hasFocus: vi.fn(() => true),
      visibilityState: 'visible',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('tracks foreground state, visible chat state, and reconnect-healing lifecycle notifications', () => {
    const notifyReconnectHealingBrowserOnline = vi.fn();
    const notifyReconnectHealingVisibilityHidden = vi.fn();
    const notifyReconnectHealingVisibilityRegain = vi.fn();
    const notifyReconnectHealingWindowBlur = vi.fn();
    const notifyReconnectHealingWindowFocus = vi.fn();
    const setIsAppForeground = vi.fn();
    const setVisibleChatId = vi.fn();

    const runtime = createAppLifecycleRuntime({
      notifyReconnectHealingBrowserOnline,
      notifyReconnectHealingVisibilityHidden,
      notifyReconnectHealingVisibilityRegain,
      notifyReconnectHealingWindowBlur,
      notifyReconnectHealingWindowFocus,
      setIsAppForeground,
      setVisibleChatId,
    });

    runtime.setRouteChatId(CHAT_PUBLIC_KEY);
    runtime.startAppLifecycleRuntime();

    expect(setIsAppForeground).toHaveBeenLastCalledWith(true);
    expect(setVisibleChatId).toHaveBeenLastCalledWith(CHAT_PUBLIC_KEY);
    expect(window.addEventListener).toHaveBeenCalledWith('online', expect.any(Function));
    expect(window.addEventListener).toHaveBeenCalledWith('focus', expect.any(Function));
    expect(window.addEventListener).toHaveBeenCalledWith('blur', expect.any(Function));
    expect(document.addEventListener).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function)
    );

    const onlineHandler = vi
      .mocked(window.addEventListener)
      .mock.calls.find(([eventName]) => eventName === 'online')?.[1] as (() => void) | undefined;
    const focusHandler = vi
      .mocked(window.addEventListener)
      .mock.calls.find(([eventName]) => eventName === 'focus')?.[1] as (() => void) | undefined;
    const blurHandler = vi
      .mocked(window.addEventListener)
      .mock.calls.find(([eventName]) => eventName === 'blur')?.[1] as (() => void) | undefined;
    const visibilityHandler = vi
      .mocked(document.addEventListener)
      .mock.calls.find(([eventName]) => eventName === 'visibilitychange')?.[1] as
      | (() => void)
      | undefined;

    blurHandler?.();
    expect(setIsAppForeground).toHaveBeenLastCalledWith(false);
    expect(setVisibleChatId).toHaveBeenLastCalledWith(null);
    expect(notifyReconnectHealingWindowBlur).toHaveBeenCalledTimes(1);

    focusHandler?.();
    expect(setIsAppForeground).toHaveBeenLastCalledWith(true);
    expect(setVisibleChatId).toHaveBeenLastCalledWith(CHAT_PUBLIC_KEY);
    expect(notifyReconnectHealingWindowFocus).toHaveBeenCalledTimes(1);

    (
      document as {
        visibilityState: 'hidden' | 'visible';
      }
    ).visibilityState = 'hidden';
    visibilityHandler?.();
    expect(setIsAppForeground).toHaveBeenLastCalledWith(false);
    expect(setVisibleChatId).toHaveBeenLastCalledWith(null);
    expect(notifyReconnectHealingVisibilityHidden).toHaveBeenCalledTimes(1);

    (
      document as {
        visibilityState: 'hidden' | 'visible';
      }
    ).visibilityState = 'visible';
    visibilityHandler?.();
    expect(setIsAppForeground).toHaveBeenLastCalledWith(true);
    expect(setVisibleChatId).toHaveBeenLastCalledWith(CHAT_PUBLIC_KEY);
    expect(notifyReconnectHealingVisibilityRegain).toHaveBeenCalledTimes(1);

    onlineHandler?.();
    expect(notifyReconnectHealingBrowserOnline).toHaveBeenCalledTimes(1);

    runtime.resetAppLifecycleRuntimeState();
    expect(setIsAppForeground).toHaveBeenLastCalledWith(false);
    expect(setVisibleChatId).toHaveBeenLastCalledWith(null);
    expect(window.removeEventListener).toHaveBeenCalledWith('online', onlineHandler);
    expect(window.removeEventListener).toHaveBeenCalledWith('focus', focusHandler);
    expect(window.removeEventListener).toHaveBeenCalledWith('blur', blurHandler);
    expect(document.removeEventListener).toHaveBeenCalledWith(
      'visibilitychange',
      visibilityHandler
    );
  });

  it('uses native app active state as a reconnect-healing fallback', () => {
    const notifyReconnectHealingBrowserOnline = vi.fn();
    const notifyReconnectHealingVisibilityHidden = vi.fn();
    const notifyReconnectHealingVisibilityRegain = vi.fn();
    const notifyReconnectHealingWindowBlur = vi.fn();
    const notifyReconnectHealingWindowFocus = vi.fn();
    const setIsAppForeground = vi.fn();
    const setVisibleChatId = vi.fn();
    const stopNativeAppLifecycleRuntime = vi.fn();
    let nativeHandlers: NativeAppLifecycleRuntimeHandlers | null = null;

    const runtime = createAppLifecycleRuntime({
      notifyReconnectHealingBrowserOnline,
      notifyReconnectHealingVisibilityHidden,
      notifyReconnectHealingVisibilityRegain,
      notifyReconnectHealingWindowBlur,
      notifyReconnectHealingWindowFocus,
      setIsAppForeground,
      setVisibleChatId,
      startNativeAppLifecycleRuntime: (handlers) => {
        nativeHandlers = handlers;
        return stopNativeAppLifecycleRuntime;
      },
    });

    runtime.setRouteChatId(CHAT_PUBLIC_KEY);
    runtime.startAppLifecycleRuntime();

    expect(nativeHandlers).not.toBeNull();
    expect(setIsAppForeground).toHaveBeenLastCalledWith(true);
    expect(setVisibleChatId).toHaveBeenLastCalledWith(CHAT_PUBLIC_KEY);

    nativeHandlers?.setNativeAppActive(false);
    expect(setIsAppForeground).toHaveBeenLastCalledWith(false);
    expect(setVisibleChatId).toHaveBeenLastCalledWith(null);
    expect(notifyReconnectHealingVisibilityHidden).toHaveBeenCalledTimes(1);
    expect(notifyReconnectHealingWindowBlur).toHaveBeenCalledTimes(1);

    nativeHandlers?.setNativeAppActive(false);
    expect(notifyReconnectHealingVisibilityHidden).toHaveBeenCalledTimes(1);
    expect(notifyReconnectHealingWindowBlur).toHaveBeenCalledTimes(1);

    nativeHandlers?.setNativeAppActive(true);
    expect(setIsAppForeground).toHaveBeenLastCalledWith(true);
    expect(setVisibleChatId).toHaveBeenLastCalledWith(CHAT_PUBLIC_KEY);
    expect(notifyReconnectHealingVisibilityRegain).toHaveBeenCalledTimes(1);
    expect(notifyReconnectHealingWindowFocus).toHaveBeenCalledTimes(1);

    runtime.resetAppLifecycleRuntimeState();
    expect(stopNativeAppLifecycleRuntime).toHaveBeenCalledTimes(1);
  });
});
