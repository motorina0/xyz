const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

require('./crypto-hash-polyfill.cjs');

const projectRoot = path.resolve(__dirname, '..');
const quasarEntrypoint = path.resolve(__dirname, 'quasar.cjs');
const capacitorDir = path.resolve(projectRoot, 'src-capacitor');
const androidDir = path.resolve(capacitorDir, 'android');
const localPropertiesPath = path.resolve(androidDir, 'local.properties');
const gradleUserHome = process.env.GRADLE_USER_HOME || path.resolve(projectRoot, '.gradle-android');
const artifactsDir = path.resolve(projectRoot, 'dist/capacitor/android');

const commands = {
  sync: {
    description: 'sync Capacitor Android assets',
    quasarArgs: ['build', '-m', 'capacitor', '-T', 'android', '--skip-pkg'],
    gradleTasks: [],
  },
  'apk-debug': {
    description: 'build a debug APK',
    quasarArgs: ['build', '-m', 'capacitor', '-T', 'android', '-d', '--skip-pkg'],
    gradleTasks: ['assembleDebug'],
  },
  'apk-release': {
    description: 'build a release APK',
    quasarArgs: ['build', '-m', 'capacitor', '-T', 'android', '--skip-pkg'],
    gradleTasks: ['assembleRelease'],
  },
  'aab-release': {
    description: 'build a release AAB',
    quasarArgs: ['build', '-m', 'capacitor', '-T', 'android', '--skip-pkg'],
    gradleTasks: ['bundleRelease'],
  },
  'all-release': {
    description: 'build a release APK and AAB',
    quasarArgs: ['build', '-m', 'capacitor', '-T', 'android', '--skip-pkg'],
    gradleTasks: ['assembleRelease', 'bundleRelease'],
  },
};

const commandName = process.argv[2] || 'all-release';
const command = commands[commandName];

if (!command) {
  const options = Object.keys(commands).join(', ');
  console.error(`Unknown Android build command "${commandName}". Expected one of: ${options}`);
  process.exit(1);
}

if (!fs.existsSync(androidDir)) {
  console.error('Missing src-capacitor/android. Capacitor Android support has not been generated yet.');
  process.exit(1);
}

ensureLocalProperties();

const env = {
  ...process.env,
  GRADLE_USER_HOME: gradleUserHome,
};

const resolvedJavaHome = findJavaHome();
if (resolvedJavaHome && !env.JAVA_HOME) {
  env.JAVA_HOME = resolvedJavaHome;
}

ensureJava21(env);
fs.mkdirSync(gradleUserHome, { recursive: true });

console.log(`Android: ${command.description}`);
run(process.execPath, [quasarEntrypoint, ...command.quasarArgs], projectRoot, env);

if (command.gradleTasks.length > 0) {
  const gradlew = path.resolve(androidDir, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
  run(gradlew, command.gradleTasks, androidDir, env);
  copyArtifacts();
}

function ensureLocalProperties() {
  const sdkDir = findAndroidSdkDir();
  if (!sdkDir) {
    console.error('Android SDK not found. Set ANDROID_HOME or ANDROID_SDK_ROOT before running Android builds.');
    process.exit(1);
  }

  const escapedSdkDir = sdkDir
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:');

  const desiredContent = `sdk.dir=${escapedSdkDir}\n`;
  const currentContent = fs.existsSync(localPropertiesPath)
    ? fs.readFileSync(localPropertiesPath, 'utf8')
    : null;

  if (currentContent === desiredContent) {
    return;
  }

  fs.writeFileSync(localPropertiesPath, desiredContent, 'utf8');
}

function findAndroidSdkDir() {
  const envSdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (envSdk && fs.existsSync(envSdk)) {
    return envSdk;
  }

  const homeDir = process.env.HOME;
  if (!homeDir) {
    return null;
  }

  const macosDefault = path.join(homeDir, 'Library', 'Android', 'sdk');
  return fs.existsSync(macosDefault) ? macosDefault : null;
}

function findJavaHome() {
  const candidates = [
    process.env.JAVA_HOME,
    '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
    '/Applications/Android Studio.app/Contents/jre/Contents/Home',
  ].filter(Boolean);

  return candidates.find(candidate => fs.existsSync(candidate)) || null;
}

function ensureJava21(env) {
  const javaBin = env.JAVA_HOME
    ? path.join(env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
    : 'java';

  const result = spawnSync(javaBin, ['-version'], {
    encoding: 'utf8',
    env,
  });

  if (result.error) {
    console.error('Java was not found. Install JDK 21+ or set JAVA_HOME before running Android builds.');
    process.exit(1);
  }

  const output = `${result.stderr || ''}\n${result.stdout || ''}`;
  const match = output.match(/version "((?:1\.)?\d+)/);
  const firstLine = output.trim().split('\n')[0];

  if (!match) {
    console.error(`Unable to determine the Java version from: ${firstLine}`);
    process.exit(1);
  }

  const majorVersion = Number(match[1].replace('1.', ''));
  if (majorVersion < 21) {
    console.error(`Android builds require JDK 21+. Current Java: ${firstLine}`);
    process.exit(1);
  }
}

function run(bin, args, cwd, env) {
  const result = spawnSync(bin, args, {
    cwd,
    env,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function copyArtifacts() {
  const outputsDir = path.resolve(androidDir, 'app/build/outputs');
  if (!fs.existsSync(outputsDir)) {
    return;
  }

  fs.rmSync(artifactsDir, { force: true, recursive: true });
  fs.mkdirSync(path.dirname(artifactsDir), { recursive: true });
  fs.cpSync(outputsDir, artifactsDir, { recursive: true });

  const artifactPaths = listArtifacts(artifactsDir);
  if (artifactPaths.length > 0) {
    console.log('Android artifacts:');
    artifactPaths.forEach(artifactPath => {
      console.log(`- ${path.relative(projectRoot, artifactPath)}`);
    });
  }
}

function listArtifacts(dir) {
  const found = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...listArtifacts(entryPath));
      continue;
    }

    if (entry.name.endsWith('.apk') || entry.name.endsWith('.aab')) {
      found.push(entryPath);
    }
  }

  return found.sort();
}
