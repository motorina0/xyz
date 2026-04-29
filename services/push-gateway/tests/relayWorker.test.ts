import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RelayWorker } from '../src/relayWorker.js';
import type { PushGatewayRepository } from '../src/repository.js';
import type { GatewayConfig, PushProvider } from '../src/types.js';
import { VALID_PUBKEY_A } from './helpers.js';

const config: GatewayConfig = {
  port: 8787,
  databasePath: ':memory:',
  publicGatewayBaseUrl: 'http://localhost:8787',
  firebaseProjectId: '',
  firebaseClientEmail: '',
  firebasePrivateKey: '',
  nip98MaxClockSkewSeconds: 60,
  relayConnectTimeoutMs: 1000,
  relayIdleRestartMs: 60_000,
};

type Listener = (event: unknown) => void;

class FakeWebSocket {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readyState = FakeWebSocket.OPEN;
  readonly send = vi.fn();
  readonly close = vi.fn(() => {
    this.dispatch('close');
  });
  private readonly listeners = new Map<string, Listener[]>();

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type: string, event: unknown = {}): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

describe('RelayWorker', () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-29T10:00:00.000Z'));
    FakeWebSocket.instances = [];
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
    vi.useRealTimers();
  });

  it('subscribes from the gateway-stamped plan timestamp and reuses it on reconnect', () => {
    const planSince = 1_777_456_800;
    const repository = {
      listRelayWatchPlans: vi.fn(() => [
        {
          relayUrl: 'wss://relay.example/',
          recipientPubkeys: [VALID_PUBKEY_A],
          since: planSince,
        },
      ]),
    } as unknown as PushGatewayRepository;
    const pushProvider = {
      sendNewMessageNotification: vi.fn(),
    } as unknown as PushProvider;
    const worker = new RelayWorker(config, repository, pushProvider);

    worker.start();
    const firstSocket = FakeWebSocket.instances[0];
    firstSocket?.dispatch('open');

    expect(firstSocket?.send).toHaveBeenCalledWith(
      JSON.stringify([
        'REQ',
        'push-gateway',
        {
          kinds: [1059],
          '#p': [VALID_PUBKEY_A],
          since: planSince,
        },
      ])
    );

    vi.setSystemTime(new Date('2026-04-29T10:05:00.000Z'));
    firstSocket?.dispatch('close');
    vi.advanceTimersByTime(2000);
    const secondSocket = FakeWebSocket.instances[1];
    secondSocket?.dispatch('open');

    expect(secondSocket?.send).toHaveBeenCalledWith(
      JSON.stringify([
        'REQ',
        'push-gateway',
        {
          kinds: [1059],
          '#p': [VALID_PUBKEY_A],
          since: planSince,
        },
      ])
    );

    worker.stop();
  });
});
