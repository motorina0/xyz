import type { App } from 'firebase-admin/app';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import type { GatewayConfig, PushProvider, PushSendInput, PushSendResult } from './types.js';

function isInvalidTokenError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const code = 'code' in error ? String(error.code) : '';
  return (
    code === 'messaging/invalid-registration-token' ||
    code === 'messaging/registration-token-not-registered'
  );
}

export class FcmPushProvider implements PushProvider {
  private app: App | null = null;

  constructor(private readonly config: GatewayConfig) {}

  async sendNewMessageNotification(input: PushSendInput): Promise<PushSendResult> {
    try {
      await getMessaging(this.getApp()).send({
        token: input.token,
        notification: {
          title: 'Nostr Chat',
          body: 'New message',
        },
        data: {
          recipientPubkey: input.recipientPubkey,
          eventId: input.eventId,
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'nostr_chat_messages',
          },
        },
      });

      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        invalidToken: isInvalidTokenError(error),
        error,
      };
    }
  }

  private getApp(): App {
    if (this.app) {
      return this.app;
    }

    const existingApp = getApps()[0];
    if (existingApp) {
      this.app = existingApp;
      return existingApp;
    }

    this.app = initializeApp({
      credential: cert({
        projectId: this.config.firebaseProjectId,
        clientEmail: this.config.firebaseClientEmail,
        privateKey: this.config.firebasePrivateKey,
      }),
    });
    return this.app;
  }
}
