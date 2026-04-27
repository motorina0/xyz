import type { GatewayConfig } from './types.js';

function readString(name: string, fallback = ''): string {
  return (process.env[name] ?? fallback).trim();
}

function readInteger(name: string, fallback: number): number {
  const value = Number.parseInt(readString(name), 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

export function loadConfig(): GatewayConfig {
  return {
    port: readInteger('PORT', 8787),
    databasePath: readString('DATABASE_PATH', './data/push-gateway.sqlite'),
    publicGatewayBaseUrl: normalizeBaseUrl(
      readString('PUBLIC_GATEWAY_BASE_URL', 'http://localhost:8787')
    ),
    firebaseProjectId: readString('FIREBASE_PROJECT_ID'),
    firebaseClientEmail: readString('FIREBASE_CLIENT_EMAIL'),
    firebasePrivateKey: readString('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
    nip98MaxClockSkewSeconds: readInteger('NIP98_MAX_CLOCK_SKEW_SECONDS', 60),
    relayConnectTimeoutMs: readInteger('RELAY_CONNECT_TIMEOUT_MS', 10_000),
    relayIdleRestartMs: readInteger('RELAY_IDLE_RESTART_MS', 300_000),
  };
}
