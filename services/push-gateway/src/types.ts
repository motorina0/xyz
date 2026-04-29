export interface GatewayConfig {
  port: number;
  databasePath: string;
  publicGatewayBaseUrl: string;
  firebaseProjectId: string;
  firebaseClientEmail: string;
  firebasePrivateKey: string;
  nip98MaxClockSkewSeconds: number;
  relayConnectTimeoutMs: number;
  relayIdleRestartMs: number;
}

export interface RelayRegistration {
  url: string;
  read: boolean;
}

export interface DeviceRegistrationInput {
  ownerPubkey: string;
  deviceId: string;
  platform: 'android';
  appVersion: string;
  fcmToken: string;
  relays: RelayRegistration[];
  watchedPubkeys: string[];
  notificationsEnabled: boolean;
}

export interface DeviceUnregisterInput {
  ownerPubkey: string;
  deviceId: string;
}

export interface ActiveDeliveryDevice {
  ownerPubkey: string;
  deviceId: string;
  fcmToken: string;
}

export interface RelayEvent {
  id?: string;
  kind?: number;
  tags?: unknown;
}

export interface PushSendInput {
  token: string;
  recipientPubkey: string;
  eventId: string;
}

export type PushSendResult = { ok: true } | { ok: false; invalidToken: boolean; error: unknown };

export interface PushProvider {
  sendNewMessageNotification(input: PushSendInput): Promise<PushSendResult>;
}
