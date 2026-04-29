#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const projectPath = process.argv[2];
const qualityScript = process.argv[3] || 'quality';

if (!projectPath) {
  console.error('Usage: node scripts/run-subproject-quality.cjs <project-path> [quality-script]');
  process.exit(1);
}

const projectDir = path.resolve(projectRoot, projectPath);
const packageJsonPath = path.join(projectDir, 'package.json');

if (!fs.existsSync(projectDir)) {
  console.log(`Skipping ${projectPath}: directory does not exist.`);
  process.exit(0);
}

if (!fs.existsSync(packageJsonPath)) {
  console.log(`Skipping ${projectPath}: package.json does not exist.`);
  process.exit(0);
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

if (!packageJson.scripts || !packageJson.scripts[qualityScript]) {
  console.error(`${projectPath} is missing npm script "${qualityScript}".`);
  process.exit(1);
}

const installCommand = fs.existsSync(path.join(projectDir, 'package-lock.json')) ? 'ci' : 'install';

console.log(`Installing dependencies for ${projectPath} with npm ${installCommand}.`);
run('npm', [installCommand], projectDir);

console.log(`Running ${projectPath}: npm run ${qualityScript}.`);
run('npm', ['run', qualityScript], projectDir);

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
