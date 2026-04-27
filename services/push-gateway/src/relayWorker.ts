import { logInfo, logWarn } from './logger.js';
import { processRelayEvent } from './notificationProcessor.js';
import type { PushGatewayRepository } from './repository.js';
import type { GatewayConfig, PushProvider, RelayEvent } from './types.js';

interface RelayConnection {
  relayUrl: string;
  recipientPubkeys: string[];
  socket: WebSocket | null;
  reconnectAttempts: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

export class RelayWorker {
  private readonly connections = new Map<string, RelayConnection>();
  private isStarted = false;

  constructor(
    private readonly config: GatewayConfig,
    private readonly repository: PushGatewayRepository,
    private readonly pushProvider: PushProvider
  ) {}

  start(): void {
    this.isStarted = true;
    this.refresh();
  }

  stop(): void {
    this.isStarted = false;
    for (const connection of this.connections.values()) {
      this.closeConnection(connection);
    }
    this.connections.clear();
  }

  refresh(): void {
    if (!this.isStarted) {
      return;
    }

    const plans = this.repository.listRelayWatchPlans();
    const nextRelayUrls = new Set(plans.map((plan) => plan.relayUrl));

    for (const [relayUrl, connection] of this.connections.entries()) {
      if (!nextRelayUrls.has(relayUrl)) {
        this.closeConnection(connection);
        this.connections.delete(relayUrl);
      }
    }

    for (const plan of plans) {
      const existing = this.connections.get(plan.relayUrl);
      if (existing) {
        const currentSignature = existing.recipientPubkeys.join('|');
        const nextSignature = plan.recipientPubkeys.join('|');
        if (currentSignature === nextSignature) {
          continue;
        }

        this.closeConnection(existing);
      }

      const connection: RelayConnection = {
        relayUrl: plan.relayUrl,
        recipientPubkeys: plan.recipientPubkeys,
        socket: null,
        reconnectAttempts: 0,
        reconnectTimer: null,
        idleTimer: null,
      };
      this.connections.set(plan.relayUrl, connection);
      this.connect(connection);
    }
  }

  private connect(connection: RelayConnection): void {
    if (!this.isStarted || connection.recipientPubkeys.length === 0) {
      return;
    }

    logInfo('Opening relay subscription.', {
      relayUrl: connection.relayUrl,
      recipientPubkeyCount: connection.recipientPubkeys.length,
    });

    const socket = new WebSocket(connection.relayUrl);
    connection.socket = socket;

    const connectTimeout = setTimeout(() => {
      if (socket.readyState !== WebSocket.OPEN) {
        socket.close();
      }
    }, this.config.relayConnectTimeoutMs);

    socket.addEventListener('open', () => {
      clearTimeout(connectTimeout);
      connection.reconnectAttempts = 0;
      socket.send(
        JSON.stringify([
          'REQ',
          'push-gateway',
          {
            kinds: [1059],
            '#p': connection.recipientPubkeys,
          },
        ])
      );
      this.resetIdleTimer(connection);
    });

    socket.addEventListener('message', (message) => {
      this.resetIdleTimer(connection);
      void this.handleRelayMessage(connection.relayUrl, message.data);
    });

    socket.addEventListener('close', () => {
      clearTimeout(connectTimeout);
      this.queueReconnect(connection);
    });

    socket.addEventListener('error', () => {
      socket.close();
    });
  }

  private async handleRelayMessage(relayUrl: string, data: unknown): Promise<void> {
    if (typeof data !== 'string') {
      return;
    }

    let message: unknown;
    try {
      message = JSON.parse(data);
    } catch {
      return;
    }

    if (!Array.isArray(message) || message[0] !== 'EVENT') {
      return;
    }

    const event = message[2] as RelayEvent;
    await processRelayEvent({
      event,
      relayUrl,
      repository: this.repository,
      pushProvider: this.pushProvider,
    });
  }

  private queueReconnect(connection: RelayConnection): void {
    if (!this.isStarted || !this.connections.has(connection.relayUrl)) {
      return;
    }

    this.clearTimers(connection);
    connection.socket = null;
    connection.reconnectAttempts += 1;

    const delayMs = Math.min(30_000, 1000 * 2 ** Math.min(connection.reconnectAttempts, 5));
    logWarn('Relay subscription closed; reconnecting.', {
      relayUrl: connection.relayUrl,
      delayMs,
    });

    connection.reconnectTimer = setTimeout(() => {
      connection.reconnectTimer = null;
      this.connect(connection);
    }, delayMs);
  }

  private resetIdleTimer(connection: RelayConnection): void {
    if (connection.idleTimer) {
      clearTimeout(connection.idleTimer);
    }

    connection.idleTimer = setTimeout(() => {
      connection.socket?.close();
    }, this.config.relayIdleRestartMs);
  }

  private closeConnection(connection: RelayConnection): void {
    this.clearTimers(connection);
    try {
      connection.socket?.send(JSON.stringify(['CLOSE', 'push-gateway']));
    } catch {
      // ignore close-send failures
    }
    connection.socket?.close();
    connection.socket = null;
  }

  private clearTimers(connection: RelayConnection): void {
    if (connection.reconnectTimer) {
      clearTimeout(connection.reconnectTimer);
      connection.reconnectTimer = null;
    }

    if (connection.idleTimer) {
      clearTimeout(connection.idleTimer);
      connection.idleTimer = null;
    }
  }
}
