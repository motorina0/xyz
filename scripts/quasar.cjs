const path = require('node:path');
const { spawnSync } = require('node:child_process');

require('./crypto-hash-polyfill.cjs');

const quasarEntrypoint = path.resolve(__dirname, '../node_modules/@quasar/app-vite/bin/quasar.js');
const result = spawnSync(process.execPath, [quasarEntrypoint, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
