import { loadConfig } from './config.js';
import { openDatabase } from './database.js';
import { FcmPushProvider } from './fcmProvider.js';
import { isDebugLoggingEnabled, logError, logInfo } from './logger.js';
import { RelayWorker } from './relayWorker.js';
import { PushGatewayRepository } from './repository.js';
import { createServer } from './server.js';

const config = loadConfig();
const database = openDatabase(config.databasePath);
const repository = new PushGatewayRepository(database);
const pushProvider = new FcmPushProvider(config);
const relayWorker = new RelayWorker(config, repository, pushProvider);
const server = createServer({
  config,
  repository,
  relayWorker,
});

try {
  await server.listen({
    port: config.port,
    host: '0.0.0.0',
  });
  relayWorker.start();
  logInfo('Push gateway started.', {
    port: config.port,
    databasePath: config.databasePath,
    publicGatewayBaseUrl: config.publicGatewayBaseUrl,
    debug: isDebugLoggingEnabled(),
  });
} catch (error) {
  logError('Failed to start push gateway.', { error });
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    relayWorker.stop();
    void server.close().finally(() => {
      database.close();
      process.exit(0);
    });
  });
}
