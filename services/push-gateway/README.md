# Push Gateway

TypeScript gateway for Android killed-app push notifications.

The service stores Android FCM tokens, user-defined relay URLs, opaque NIP-17 watched recipient pubkeys, optional notification labels, and notification grouping counters in SQLite. It subscribes to `kind:1059` gift-wrap events with matching `#p` tags and sends FCM notifications grouped by label.

The gateway must not receive user private keys, group keys, chat routes, sender names, or decrypted message content. Notification labels are treated as opaque presentation labels for watched pubkeys.

## Development

```bash
npm install
npm run typecheck
npm run test
npm run dev
```

## Configuration

Copy `.env.example` to `.env` in this directory and set Firebase credentials there or through environment variables. Existing environment variables take precedence over `.env` values. Use escaped newlines in `FIREBASE_PRIVATE_KEY` or provide a value with literal line breaks.

Set `DEBUG=true` for verbose request, device registration, relay subscription, relay event, and FCM delivery logs. Sensitive values such as FCM tokens, authorization headers, and Firebase private keys are redacted.
