import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const ENV_KEYS = [
  'PORT',
  'DATABASE_PATH',
  'PUBLIC_GATEWAY_BASE_URL',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'DEBUG',
  'NIP98_MAX_CLOCK_SKEW_SECONDS',
  'RELAY_CONNECT_TIMEOUT_MS',
  'RELAY_IDLE_RESTART_MS',
];

const originalEnv = new Map<string, string | undefined>();
const tempDirectories: string[] = [];

function writeEnvFile(content: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'push-gateway-env-'));
  tempDirectories.push(directory);
  const envFilePath = join(directory, '.env');
  writeFileSync(envFilePath, content);
  return envFilePath;
}

describe('loadConfig', () => {
  beforeEach(() => {
    originalEnv.clear();

    for (const key of ENV_KEYS) {
      originalEnv.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = originalEnv.get(key);

      if (value === undefined) {
        delete process.env[key];
        continue;
      }

      process.env[key] = value;
    }

    while (tempDirectories.length > 0) {
      const directory = tempDirectories.pop();

      if (directory) {
        rmSync(directory, { force: true, recursive: true });
      }
    }
  });

  it('loads gateway configuration from a .env file', () => {
    const envFilePath = writeEnvFile(`
PORT=9876
DATABASE_PATH=./data/test.sqlite
PUBLIC_GATEWAY_BASE_URL=https://push.example
FIREBASE_PROJECT_ID=firebase-project
FIREBASE_CLIENT_EMAIL=firebase@example.com
FIREBASE_PRIVATE_KEY=line-one\\nline-two
DEBUG=true
NIP98_MAX_CLOCK_SKEW_SECONDS=90
RELAY_CONNECT_TIMEOUT_MS=15000
RELAY_IDLE_RESTART_MS=600000
`);

    const config = loadConfig({ envFilePath });

    expect(config).toEqual({
      port: 9876,
      databasePath: './data/test.sqlite',
      publicGatewayBaseUrl: 'https://push.example',
      firebaseProjectId: 'firebase-project',
      firebaseClientEmail: 'firebase@example.com',
      firebasePrivateKey: 'line-one\nline-two',
      nip98MaxClockSkewSeconds: 90,
      relayConnectTimeoutMs: 15_000,
      relayIdleRestartMs: 600_000,
    });
    expect(process.env.DEBUG).toBe('true');
  });

  it('keeps existing environment variables ahead of .env values', () => {
    const envFilePath = writeEnvFile('PUBLIC_GATEWAY_BASE_URL=https://from-file.example\n');
    process.env.PUBLIC_GATEWAY_BASE_URL = 'https://from-env.example';

    const config = loadConfig({ envFilePath });

    expect(config.publicGatewayBaseUrl).toBe('https://from-env.example');
  });
});
