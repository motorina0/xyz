const { spawnSync } = require('node:child_process');

const relayUrls = process.env.VITE_DEFAULT_APP_RELAYS ?? 'ws://127.0.0.1:7000,ws://127.0.0.1:7001';
const result = spawnSync(
  process.execPath,
  [require.resolve('./quasar.cjs'), 'dev', '--port', '4100', '--hostname', '127.0.0.1'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_DEFAULT_APP_RELAYS: relayUrls,
    },
  }
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
