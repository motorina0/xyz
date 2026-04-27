import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import Fastify from 'fastify';
import { Nip98AuthError, verifyNip98Request } from './auth.js';
import { logWarn } from './logger.js';
import type { RelayWorker } from './relayWorker.js';
import type { PushGatewayRepository } from './repository.js';
import type { GatewayConfig } from './types.js';
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
  } catch (error) {
    if (error instanceof Nip98AuthError) {
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

export function createServer({ config, repository, relayWorker }: ServerDeps): FastifyInstance {
  const server = Fastify({
    logger: false,
    bodyLimit: 64 * 1024,
  });

  server.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    const rawBody = typeof body === 'string' ? body : body.toString('utf8');
    (request as JsonRequest).rawBody = rawBody;
    buildRawBodyJsonParser()(request, rawBody, done);
  });

  server.get('/healthz', async () => ({
    ok: true,
  }));

  server.post('/v1/devices/register', async (request, reply) => {
    await authenticateRequest(request, reply, config);
    if (reply.sent) {
      return;
    }

    try {
      const input = parseDeviceRegistrationInput(request.body);
      ensureOwnerMatchesAuth(request as JsonRequest, input.ownerPubkey);
      const result = repository.registerDevice(input);
      relayWorker.refresh();
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
      ensureOwnerMatchesAuth(request as JsonRequest, input.ownerPubkey);
      const result = repository.registerDevice(input);
      relayWorker.refresh();
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
      ensureOwnerMatchesAuth(request as JsonRequest, input.ownerPubkey);
      repository.unregisterDevice(input);
      relayWorker.refresh();
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
