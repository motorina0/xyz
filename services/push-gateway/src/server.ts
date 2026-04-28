import { Buffer } from 'node:buffer';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import Fastify from 'fastify';
import { Nip98AuthError, verifyNip98Request } from './auth.js';
import { logDebug, logWarn } from './logger.js';
import type { RelayWorker } from './relayWorker.js';
import type { PushGatewayRepository } from './repository.js';
import type { DeviceRegistrationInput, GatewayConfig } from './types.js';
import { parseDeviceRegistrationInput, parseDeviceUnregisterInput } from './validation.js';

type JsonRequest = FastifyRequest & {
  rawBody?: string;
  authPubkey?: string;
};

interface ServerDeps {
  config: GatewayConfig;
  repository: PushGatewayRepository;
  relayWorker: RelayWorker;
}

const CORS_ALLOWED_HEADERS = 'authorization,content-type';
const CORS_ALLOWED_METHODS = 'GET,POST,OPTIONS';
const CORS_MAX_AGE_SECONDS = '600';

function buildRawBodyJsonParser() {
  return (
    _request: FastifyRequest,
    body: string,
    done: (error: Error | null, value?: unknown) => void
  ) => {
    try {
      done(null, JSON.parse(body) as unknown);
    } catch (error) {
      done(error instanceof Error ? error : new Error('Invalid JSON body.'));
    }
  };
}

function getRawBody(request: JsonRequest): string {
  return request.rawBody ?? '';
}

function summarizeRegistrationInput(input: DeviceRegistrationInput): Record<string, unknown> {
  return {
    ownerPubkey: input.ownerPubkey,
    deviceId: input.deviceId,
    platform: input.platform,
    appVersion: input.appVersion,
    notificationsEnabled: input.notificationsEnabled,
    relayCount: input.relays.length,
    relayUrls: input.relays.map((relay) => relay.url),
    watchedPubkeyCount: input.watchedPubkeys.length,
    watchedPubkeys: input.watchedPubkeys,
  };
}

async function authenticateRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  config: GatewayConfig
): Promise<void> {
  const jsonRequest = request as JsonRequest;
  try {
    const auth = verifyNip98Request(request, getRawBody(jsonRequest), {
      maxClockSkewSeconds: config.nip98MaxClockSkewSeconds,
      publicGatewayBaseUrl: config.publicGatewayBaseUrl,
    });
    jsonRequest.authPubkey = auth.pubkey;
    logDebug('Authenticated gateway API request.', {
      requestId: request.id,
      method: request.method,
      url: request.url,
      authPubkey: auth.pubkey,
    });
  } catch (error) {
    if (error instanceof Nip98AuthError) {
      logDebug('Rejected gateway API authentication.', {
        requestId: request.id,
        method: request.method,
        url: request.url,
        error: error.message,
      });
      await reply.code(401).send({ error: error.message });
      return;
    }

    throw error;
  }
}

function ensureOwnerMatchesAuth(request: JsonRequest, ownerPubkey: string): void {
  if (request.authPubkey !== ownerPubkey) {
    throw new Nip98AuthError('ownerPubkey does not match the authorization event pubkey.');
  }
}

function addCorsHeaders(reply: FastifyReply): void {
  reply
    .header('access-control-allow-origin', '*')
    .header('access-control-allow-methods', CORS_ALLOWED_METHODS)
    .header('access-control-allow-headers', CORS_ALLOWED_HEADERS)
    .header('access-control-max-age', CORS_MAX_AGE_SECONDS);
}

function handleCorsPreflight(_request: FastifyRequest, reply: FastifyReply): FastifyReply {
  return reply.code(204).send();
}

export function createServer({ config, repository, relayWorker }: ServerDeps): FastifyInstance {
  const server = Fastify({
    logger: false,
    bodyLimit: 64 * 1024,
  });

  server.addHook('onRequest', (request, reply, done) => {
    addCorsHeaders(reply);
    logDebug('Gateway API request received.', {
      requestId: request.id,
      method: request.method,
      url: request.url,
      remoteAddress: request.ip,
      userAgent: request.headers['user-agent'],
      contentLength: request.headers['content-length'],
    });
    done();
  });

  server.addHook('onResponse', (request, reply, done) => {
    logDebug('Gateway API request completed.', {
      requestId: request.id,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
    });
    done();
  });

  server.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    const rawBody = typeof body === 'string' ? body : body.toString('utf8');
    (request as JsonRequest).rawBody = rawBody;
    logDebug('Parsed gateway API request body.', {
      requestId: request.id,
      method: request.method,
      url: request.url,
      rawBodyBytes: Buffer.byteLength(rawBody),
    });
    buildRawBodyJsonParser()(request, rawBody, done);
  });

  server.get('/healthz', async () => ({
    ok: true,
  }));

  server.options('/v1/devices/register', handleCorsPreflight);
  server.options('/v1/devices/refresh', handleCorsPreflight);
  server.options('/v1/devices/unregister', handleCorsPreflight);

  server.post('/v1/devices/register', async (request, reply) => {
    await authenticateRequest(request, reply, config);
    if (reply.sent) {
      return;
    }

    try {
      const input = parseDeviceRegistrationInput(request.body);
      logDebug('Register device request parsed.', {
        requestId: request.id,
        ...summarizeRegistrationInput(input),
      });
      ensureOwnerMatchesAuth(request as JsonRequest, input.ownerPubkey);
      const result = repository.registerDevice(input);
      relayWorker.refresh();
      logDebug('Registered device and refreshed relay subscriptions.', {
        requestId: request.id,
        ownerPubkey: input.ownerPubkey,
        deviceId: input.deviceId,
        ...result,
      });
      return result;
    } catch (error) {
      if (error instanceof Nip98AuthError) {
        return reply.code(401).send({ error: error.message });
      }

      logWarn('Rejected device registration.', { error });
      return reply
        .code(400)
        .send({ error: error instanceof Error ? error.message : 'Invalid request.' });
    }
  });

  server.post('/v1/devices/refresh', async (request, reply) => {
    await authenticateRequest(request, reply, config);
    if (reply.sent) {
      return;
    }

    try {
      const input = parseDeviceRegistrationInput(request.body);
      logDebug('Refresh device request parsed.', {
        requestId: request.id,
        ...summarizeRegistrationInput(input),
      });
      ensureOwnerMatchesAuth(request as JsonRequest, input.ownerPubkey);
      const result = repository.registerDevice(input);
      relayWorker.refresh();
      logDebug('Refreshed device registration and relay subscriptions.', {
        requestId: request.id,
        ownerPubkey: input.ownerPubkey,
        deviceId: input.deviceId,
        ...result,
      });
      return result;
    } catch (error) {
      if (error instanceof Nip98AuthError) {
        return reply.code(401).send({ error: error.message });
      }

      logWarn('Rejected device refresh.', { error });
      return reply
        .code(400)
        .send({ error: error instanceof Error ? error.message : 'Invalid request.' });
    }
  });

  server.post('/v1/devices/unregister', async (request, reply) => {
    await authenticateRequest(request, reply, config);
    if (reply.sent) {
      return;
    }

    try {
      const input = parseDeviceUnregisterInput(request.body);
      logDebug('Unregister device request parsed.', {
        requestId: request.id,
        ownerPubkey: input.ownerPubkey,
        deviceId: input.deviceId,
      });
      ensureOwnerMatchesAuth(request as JsonRequest, input.ownerPubkey);
      repository.unregisterDevice(input);
      relayWorker.refresh();
      logDebug('Unregistered device and refreshed relay subscriptions.', {
        requestId: request.id,
        ownerPubkey: input.ownerPubkey,
        deviceId: input.deviceId,
      });
      return { ok: true };
    } catch (error) {
      if (error instanceof Nip98AuthError) {
        return reply.code(401).send({ error: error.message });
      }

      logWarn('Rejected device unregister.', { error });
      return reply
        .code(400)
        .send({ error: error instanceof Error ? error.message : 'Invalid request.' });
    }
  });

  return server;
}
