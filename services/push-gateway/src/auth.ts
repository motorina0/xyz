import { createHash } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type { Event } from 'nostr-tools';
import { verifyEvent } from 'nostr-tools';
import { normalizePubkey } from './validation.js';

export interface Nip98AuthResult {
  pubkey: string;
  event: Event;
}

interface Nip98AuthOptions {
  maxClockSkewSeconds: number;
  publicGatewayBaseUrl: string;
}

export class Nip98AuthError extends Error {
  constructor(message = 'Invalid NIP-98 authorization.') {
    super(message);
    this.name = 'Nip98AuthError';
  }
}

function readFirstTagValue(tags: string[][], tagName: string): string | null {
  for (const tag of tags) {
    if (tag[0] === tagName && typeof tag[1] === 'string') {
      return tag[1];
    }
  }

  return null;
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function parseAuthorizationHeader(value: unknown): unknown {
  if (typeof value !== 'string') {
    throw new Nip98AuthError('Missing authorization header.');
  }

  const match = value.match(/^Nostr\s+(.+)$/i);
  if (!match) {
    throw new Nip98AuthError('Authorization header must use the Nostr scheme.');
  }

  try {
    return JSON.parse(Buffer.from(match[1], 'base64').toString('utf8')) as unknown;
  } catch {
    throw new Nip98AuthError('Authorization event is not valid base64 JSON.');
  }
}

function normalizeTags(value: unknown): string[][] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((tag): tag is unknown[] => Array.isArray(tag))
    .map((tag) => tag.map((entry) => String(entry)));
}

function buildAbsoluteRequestUrl(request: FastifyRequest, publicGatewayBaseUrl: string): string {
  return `${publicGatewayBaseUrl}${request.url}`;
}

export function verifyNip98Request(
  request: FastifyRequest,
  rawBody: string,
  options: Nip98AuthOptions
): Nip98AuthResult {
  const event = parseAuthorizationHeader(request.headers.authorization);
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw new Nip98AuthError();
  }

  const record = event as Record<string, unknown>;
  if (record.kind !== 27235) {
    throw new Nip98AuthError('Authorization event must be kind 27235.');
  }

  const pubkey = normalizePubkey(record.pubkey);
  if (!pubkey) {
    throw new Nip98AuthError('Authorization event has an invalid pubkey.');
  }

  if (typeof record.created_at !== 'number' || !Number.isInteger(record.created_at)) {
    throw new Nip98AuthError('Authorization event has an invalid created_at.');
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - record.created_at) > options.maxClockSkewSeconds) {
    throw new Nip98AuthError('Authorization event is outside the allowed clock skew.');
  }

  const tags = normalizeTags(record.tags);
  const requestUrl = buildAbsoluteRequestUrl(request, options.publicGatewayBaseUrl);
  if (readFirstTagValue(tags, 'u') !== requestUrl) {
    throw new Nip98AuthError('Authorization event URL does not match the request URL.');
  }

  if (readFirstTagValue(tags, 'method')?.toUpperCase() !== request.method.toUpperCase()) {
    throw new Nip98AuthError('Authorization event method does not match the request method.');
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const expectedPayloadHash = sha256Hex(rawBody);
    if (readFirstTagValue(tags, 'payload') !== expectedPayloadHash) {
      throw new Nip98AuthError('Authorization event payload hash does not match the request body.');
    }
  }

  if (!verifyEvent(record as unknown as Event)) {
    throw new Nip98AuthError('Authorization event signature is invalid.');
  }

  return {
    pubkey,
    event: record as unknown as Event,
  };
}
