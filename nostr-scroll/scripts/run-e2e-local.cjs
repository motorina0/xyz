const { spawn } = require('node:child_process');
const net = require('node:net');

const composeArgs = ['compose', '-f', 'docker-compose.e2e.yml'];
const dockerCommand = process.platform === 'win32' ? 'docker.exe' : 'docker';
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function runCommand(command, args, options = {}) {
  const { allowFailure = false } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0 || allowFailure) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'null'}.`));
    });
  });
}

function waitForTcpPort(host, port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.createConnection({
        host,
        port,
      });

      socket.once('connect', () => {
        socket.end();
        resolve();
      });

      socket.once('error', () => {
        socket.destroy();

        if (Date.now() >= deadline) {
          reject(new Error(`Timed out waiting for ${host}:${port}.`));
          return;
        }

        setTimeout(attempt, 500);
      });
    };

    attempt();
  });
}

async function main() {
  const playwrightArgs = process.argv.slice(2);

  await runCommand(dockerCommand, [...composeArgs, 'down', '-v', '--remove-orphans'], {
    allowFailure: true,
  });
  await runCommand(dockerCommand, [...composeArgs, 'up', '-d']);

  try {
    await waitForTcpPort('127.0.0.1', 7000, 30_000);
    await waitForTcpPort('127.0.0.1', 7001, 30_000);
    await runCommand(npmCommand, ['run', 'test:e2e', '--', ...playwrightArgs]);
  } finally {
    await runCommand(dockerCommand, [...composeArgs, 'down', '-v', '--remove-orphans'], {
      allowFailure: true,
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
