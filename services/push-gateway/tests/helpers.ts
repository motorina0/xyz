import { createHash } from 'node:crypto';
import { type EventTemplate, finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools';

export const VALID_PUBKEY_A = 'a'.repeat(64);
export const VALID_PUBKEY_B = 'b'.repeat(64);
export const VALID_EVENT_ID = 'c'.repeat(64);

export function createKeypair(): { secretKey: Uint8Array; pubkey: string } {
  const secretKey = generateSecretKey();
  return {
    secretKey,
    pubkey: getPublicKey(secretKey),
  };
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function signNip98Header(input: {
  secretKey: Uint8Array;
  url: string;
  method: string;
  body?: string;
  createdAt?: number;
}): string {
  const tags = [
    ['u', input.url],
    ['method', input.method.toUpperCase()],
  ];

  if (input.body !== undefined) {
    tags.push(['payload', sha256Hex(input.body)]);
  }

  const template: EventTemplate = {
    kind: 27235,
    created_at: input.createdAt ?? Math.floor(Date.now() / 1000),
    content: '',
    tags,
  };
  const event = finalizeEvent(template, input.secretKey);
  return `Nostr ${Buffer.from(JSON.stringify(event), 'utf8').toString('base64')}`;
}
