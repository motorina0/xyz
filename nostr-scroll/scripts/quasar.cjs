const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

require('./crypto-hash-polyfill.cjs');

const quasarEntrypoint = path.resolve(
  __dirname,
  '../node_modules/@quasar/app-vite/bin/quasar.js',
);

if (!fs.existsSync(quasarEntrypoint)) {
  console.error('Missing local dependencies for nostr-scroll.');
  console.error('Run `npm install` inside `nostr-scroll` before using this app.');
  process.exit(1);
}

const result = spawnSync(process.execPath, [quasarEntrypoint, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
