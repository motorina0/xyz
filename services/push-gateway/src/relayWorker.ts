import { logDebug, logInfo, logWarn } from './logger.js';
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
    logDebug('Relay worker started.', {});
    this.refresh();
  }

  stop(): void {
    this.isStarted = false;
    logDebug('Relay worker stopping.', {
      connectionCount: this.connections.size,
    });
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
    logDebug('Refreshing relay subscription plan.', {
      relayCount: plans.length,
      plans: plans.map((plan) => ({
        relayUrl: plan.relayUrl,
        recipientPubkeyCount: plan.recipientPubkeys.length,
        recipientPubkeys: plan.recipientPubkeys,
      })),
    });

    for (const [relayUrl, connection] of this.connections.entries()) {
      if (!nextRelayUrls.has(relayUrl)) {
        logDebug('Closing relay subscription removed from watch plan.', {
          relayUrl,
        });
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
          logDebug('Relay subscription already matches watch plan.', {
            relayUrl: plan.relayUrl,
            recipientPubkeyCount: plan.recipientPubkeys.length,
          });
          continue;
        }

        logDebug('Reopening relay subscription with updated recipient list.', {
          relayUrl: plan.relayUrl,
          previousRecipientPubkeyCount: existing.recipientPubkeys.length,
          nextRecipientPubkeyCount: plan.recipientPubkeys.length,
        });
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
    logDebug('Opening relay WebSocket.', {
      relayUrl: connection.relayUrl,
      recipientPubkeyCount: connection.recipientPubkeys.length,
      recipientPubkeys: connection.recipientPubkeys,
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
      logDebug('Relay WebSocket connected; sending NIP-17 subscription.', {
        relayUrl: connection.relayUrl,
        recipientPubkeyCount: connection.recipientPubkeys.length,
      });
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
      logDebug('Received relay WebSocket message.', {
        relayUrl: connection.relayUrl,
        dataType: typeof message.data,
        dataLength: typeof message.data === 'string' ? message.data.length : undefined,
      });
      void this.handleRelayMessage(connection.relayUrl, message.data);
    });

    socket.addEventListener('close', () => {
      clearTimeout(connectTimeout);
      logDebug('Relay WebSocket closed.', {
        relayUrl: connection.relayUrl,
      });
      this.queueReconnect(connection);
    });

    socket.addEventListener('error', () => {
      logDebug('Relay WebSocket error; closing socket.', {
        relayUrl: connection.relayUrl,
      });
      socket.close();
    });
  }

  private async handleRelayMessage(relayUrl: string, data: unknown): Promise<void> {
    if (typeof data !== 'string') {
      logDebug('Ignored non-string relay message.', {
        relayUrl,
        dataType: typeof data,
      });
      return;
    }

    let message: unknown;
    try {
      message = JSON.parse(data);
    } catch {
      logDebug('Ignored relay message with invalid JSON.', {
        relayUrl,
        dataLength: data.length,
      });
      return;
    }

    if (!Array.isArray(message) || message[0] !== 'EVENT') {
      logDebug('Ignored relay message that is not an EVENT.', {
        relayUrl,
        messageType: Array.isArray(message) ? message[0] : typeof message,
      });
      return;
    }

    const event = message[2] as RelayEvent;
    logDebug('Received relay EVENT message.', {
      relayUrl,
      eventId: event.id,
      kind: event.kind,
      tagCount: Array.isArray(event.tags) ? event.tags.length : 0,
    });
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
      logDebug('Relay subscription idle timeout; closing socket.', {
        relayUrl: connection.relayUrl,
        idleRestartMs: this.config.relayIdleRestartMs,
      });
      connection.socket?.close();
    }, this.config.relayIdleRestartMs);
  }

  private closeConnection(connection: RelayConnection): void {
    this.clearTimers(connection);
    logDebug('Closing relay connection.', {
      relayUrl: connection.relayUrl,
    });
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
