const REDACTED = '[redacted]';

const SENSITIVE_KEYS = new Set([
  'authorization',
  'fcmToken',
  'fcm_token',
  'firebasePrivateKey',
  'privateKey',
  'token',
]);

export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redactSensitive(entry));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    result[key] = SENSITIVE_KEYS.has(key) ? REDACTED : redactSensitive(entry);
  }
  return result;
}

export function logInfo(message: string, details: Record<string, unknown> = {}): void {
  console.info(message, redactSensitive(details));
}

export function logWarn(message: string, details: Record<string, unknown> = {}): void {
  console.warn(message, redactSensitive(details));
}

export function logError(message: string, details: Record<string, unknown> = {}): void {
  console.error(message, redactSensitive(details));
}
