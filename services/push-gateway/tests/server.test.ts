import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { migrateDatabase } from '../src/database.js';
import { PushGatewayRepository } from '../src/repository.js';
import { createServer } from '../src/server.js';
import type { GatewayConfig } from '../src/types.js';
import { createKeypair, signNip98Header, VALID_PUBKEY_B } from './helpers.js';

const config: GatewayConfig = {
  port: 8787,
  databasePath: ':memory:',
  publicGatewayBaseUrl: 'http://localhost:8787',
  firebaseProjectId: '',
  firebaseClientEmail: '',
  firebasePrivateKey: '',
  nip98MaxClockSkewSeconds: 60,
  relayConnectTimeoutMs: 1000,
  relayIdleRestartMs: 1000,
};

function createTestServer() {
  const database = new DatabaseSync(':memory:');
  migrateDatabase(database);
  const repository = new PushGatewayRepository(database);
  const relayWorker = {
    refresh: vi.fn(),
  };
  const server = createServer({
    config,
    repository,
    relayWorker: relayWorker as never,
  });
  return { server, repository, relayWorker };
}

describe('push gateway HTTP API', () => {
  it('answers CORS preflight requests for device registration', async () => {
    const { server, relayWorker } = createTestServer();
    const response = await server.inject({
      method: 'OPTIONS',
      url: '/v1/devices/register',
      headers: {
        origin: 'capacitor://localhost',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(response.headers['access-control-allow-methods']).toContain('POST');
    expect(response.headers['access-control-allow-methods']).toContain('OPTIONS');
    expect(response.headers['access-control-allow-headers']).toContain('authorization');
    expect(response.headers['access-control-allow-headers']).toContain('content-type');
    expect(response.headers['access-control-max-age']).toBe('600');
    expect(relayWorker.refresh).not.toHaveBeenCalled();
  });

  it('answers CORS preflight before routing for unknown device paths', async () => {
    const { server, relayWorker } = createTestServer();
    const response = await server.inject({
      method: 'OPTIONS',
      url: '/v1/devices/register/',
      headers: {
        origin: 'capacitor://localhost',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(response.headers['access-control-allow-methods']).toContain('POST');
    expect(response.headers['access-control-allow-headers']).toContain('authorization');
    expect(relayWorker.refresh).not.toHaveBeenCalled();
  });

  it('rejects registration without NIP-98 auth', async () => {
    const { server } = createTestServer();
    const response = await server.inject({
      method: 'POST',
      url: '/v1/devices/register',
      payload: {},
    });

    expect(response.statusCode).toBe(401);
    expect(response.headers['access-control-allow-origin']).toBe('*');
  });

  it('adds CORS headers on route misses', async () => {
    const { server } = createTestServer();
    const response = await server.inject({
      method: 'GET',
      url: '/missing',
      headers: {
        origin: 'capacitor://localhost',
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers['access-control-allow-origin']).toBe('*');
  });

  it('registers a device with valid NIP-98 auth', async () => {
    const { secretKey, pubkey } = createKeypair();
    const { server, repository, relayWorker } = createTestServer();
    const body = JSON.stringify({
      ownerPubkey: pubkey,
      deviceId: 'device-1',
      platform: 'android',
      appVersion: '0.1.0',
      fcmToken: 'token',
      relays: [{ url: 'wss://relay.example', read: true }],
      watchedPubkeys: [pubkey, VALID_PUBKEY_B],
      notificationsEnabled: true,
    });
    const url = `${config.publicGatewayBaseUrl}/v1/devices/register`;

    const response = await server.inject({
      method: 'POST',
      url: '/v1/devices/register',
      headers: {
        authorization: signNip98Header({
          secretKey,
          url,
          method: 'POST',
          body,
        }),
        'content-type': 'application/json',
      },
      payload: body,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ relayCount: 1, watchedPubkeyCount: 2 });
    expect(repository.listDeliveryDevices(VALID_PUBKEY_B)).toHaveLength(1);
    expect(relayWorker.refresh).toHaveBeenCalledTimes(1);
  });

  it('rejects mismatched owner pubkey', async () => {
    const { secretKey } = createKeypair();
    const { server } = createTestServer();
    const body = JSON.stringify({
      ownerPubkey: VALID_PUBKEY_B,
      deviceId: 'device-1',
      platform: 'android',
      appVersion: '0.1.0',
      fcmToken: 'token',
      relays: [{ url: 'wss://relay.example', read: true }],
      watchedPubkeys: [VALID_PUBKEY_B],
      notificationsEnabled: true,
    });

    const response = await server.inject({
      method: 'POST',
      url: '/v1/devices/register',
      headers: {
        authorization: signNip98Header({
          secretKey,
          url: `${config.publicGatewayBaseUrl}/v1/devices/register`,
          method: 'POST',
          body,
        }),
        'content-type': 'application/json',
      },
      payload: body,
    });

    expect(response.statusCode).toBe(401);
  });
});
